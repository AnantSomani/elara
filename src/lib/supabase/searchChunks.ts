import { supabaseAdmin } from '@/lib/database/supabase';

export interface SearchResult {
  chunk_text: string;
  chunk_index: number;
  video_id: string;
  rank: number;
  word_count?: number;
}

export interface SearchOptions {
  limit?: number;
  includeWordCount?: boolean;
  minRank?: number;
}

/**
 * Primary FTS search function for transcript chunks
 * @param videoId - YouTube video ID to search within
 * @param query - Search query text
 * @param options - Search options
 * @returns Array of search results with relevance ranking
 */
export async function searchTranscriptChunks(
  videoId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 5, includeWordCount = false, minRank = 0 } = options;

  try {
    console.log(`🔍 FTS searching for: "${query}" in video ${videoId}`);

    // Clean and prepare the query
    const cleanQuery = query.trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    
    if (!cleanQuery) {
      console.warn('Empty query after cleaning');
      return [];
    }

    // Build the select query
    let selectFields = 'chunk_text, chunk_index, video_id';
    if (includeWordCount) {
      selectFields += ', word_count';
    }

    // Use the custom search function from our migration
    const { data, error } = await supabaseAdmin()
      .rpc('search_transcript_chunks', {
        p_video_id: videoId,
        p_query: cleanQuery,
        p_limit: limit
      });

    if (error) {
      console.error('FTS search error:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('No FTS results found');
      return [];
    }

    // Filter by minimum rank if specified and map results
    const results: SearchResult[] = data
      .filter((item: any) => item.rank >= minRank)
      .map((item: any, index: number) => ({
        chunk_text: item.chunk_text,
        chunk_index: item.chunk_index,
        video_id: item.video_id,
        rank: item.rank,
        ...(includeWordCount && { word_count: item.word_count })
      }));

    console.log(`✅ Found ${results.length} FTS results`);
    return results;

  } catch (error) {
    console.error('Error in searchTranscriptChunks:', error);
    return [];
  }
}

/**
 * Fallback search using ILIKE when FTS returns no results
 * @param videoId - YouTube video ID to search within
 * @param query - Search query text
 * @param options - Search options
 * @returns Array of search results
 */
export async function fallbackSearchTranscriptChunks(
  videoId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 5, includeWordCount = false } = options;

  try {
    console.log(`🔄 Fallback searching for: "${query}" in video ${videoId}`);

    // Use the custom fallback search function
    const { data, error } = await supabaseAdmin()
      .rpc('fallback_search_transcript_chunks', {
        p_video_id: videoId,
        p_query: query,
        p_limit: limit
      });

    if (error) {
      console.error('Fallback search error:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('No fallback results found');
      return [];
    }

    // Map results
    const results: SearchResult[] = data.map((item: any) => ({
      chunk_text: item.chunk_text,
      chunk_index: item.chunk_index,
      video_id: item.video_id,
      rank: item.similarity_rank || 0,
      ...(includeWordCount && { word_count: item.word_count })
    }));

    console.log(`✅ Found ${results.length} fallback results`);
    return results;

  } catch (error) {
    console.error('Error in fallbackSearchTranscriptChunks:', error);
    return [];
  }
}

/**
 * Hybrid search that tries FTS first, then falls back to similarity search
 * @param videoId - YouTube video ID to search within
 * @param query - Search query text
 * @param options - Search options
 * @returns Array of search results and search method used
 */
export async function hybridSearchTranscriptChunks(
  videoId: string,
  query: string,
  options: SearchOptions = {}
): Promise<{
  results: SearchResult[];
  searchMethod: 'fts' | 'fallback' | 'fallback_sequential' | 'none';
  totalResults: number;
}> {
  // Try FTS search first
  let results = await searchTranscriptChunks(videoId, query, options);
  
  if (results.length > 0) {
    return {
      results,
      searchMethod: 'fts',
      totalResults: results.length
    };
  }

  // Fall back to similarity search
  results = await fallbackSearchTranscriptChunks(videoId, query, options);
  
  if (results.length > 0) {
    return {
      results,
      searchMethod: 'fallback',
      totalResults: results.length
    };
  }

  // No results found
  return {
    results: [],
    searchMethod: 'none',
    totalResults: 0
  };
}

/**
 * Get all chunks for a video (for context when no search results)
 * @param videoId - YouTube video ID
 * @param limit - Maximum chunks to return
 * @returns Array of chunks in order
 */
export async function getAllChunksForVideo(
  videoId: string,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('transcript_chunks')
      .select('chunk_text, chunk_index, video_id, word_count')
      .eq('video_id', videoId)
      .order('chunk_index', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error getting all chunks:', error);
      return [];
    }

    return (data || []).map((item, index) => ({
      chunk_text: item.chunk_text,
      chunk_index: item.chunk_index,
      video_id: item.video_id,
      rank: index + 1, // Sequential rank
      word_count: item.word_count
    }));

  } catch (error) {
    console.error('Error in getAllChunksForVideo:', error);
    return [];
  }
}

/**
 * Get statistics about search performance for a video
 * @param videoId - YouTube video ID
 * @returns Search statistics
 */
export async function getVideoSearchStats(videoId: string): Promise<{
  totalChunks: number;
  totalWords: number;
  avgWordsPerChunk: number;
  status: string;
}> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('youtube_transcripts')
      .select('total_chunks, word_count, transcript_status')
      .eq('video_id', videoId)
      .single();

    if (error || !data) {
      return {
        totalChunks: 0,
        totalWords: 0,
        avgWordsPerChunk: 0,
        status: 'not_found'
      };
    }

    return {
      totalChunks: data.total_chunks || 0,
      totalWords: data.word_count || 0,
      avgWordsPerChunk: data.total_chunks > 0 ? Math.round((data.word_count || 0) / data.total_chunks) : 0,
      status: data.transcript_status || 'unknown'
    };

  } catch (error) {
    console.error('Error getting video search stats:', error);
    return {
      totalChunks: 0,
      totalWords: 0,
      avgWordsPerChunk: 0,
      status: 'error'
    };
  }
}

/**
 * Search across multiple videos (global search)
 * @param query - Search query text
 * @param options - Search options with video limit
 * @returns Search results across videos
 */
export async function globalSearchTranscriptChunks(
  query: string,
  options: SearchOptions & { maxVideos?: number } = {}
): Promise<{
  results: (SearchResult & { video_title?: string; channel_title?: string })[];
  videosSearched: number;
}> {
  const { limit = 10, maxVideos = 5 } = options;

  try {
    console.log(`🌐 Global searching for: "${query}"`);

    // First, get recent videos that have completed transcripts
    const { data: videos } = await supabaseAdmin()
      .from('youtube_transcripts')
      .select('video_id, title, channel_title')
      .eq('transcript_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(maxVideos);

    if (!videos || videos.length === 0) {
      return { results: [], videosSearched: 0 };
    }

    // Search across all videos
    const allResults: (SearchResult & { video_title?: string; channel_title?: string })[] = [];

    for (const video of videos) {
      const { results } = await hybridSearchTranscriptChunks(
        video.video_id,
        query,
        { limit: Math.ceil(limit / maxVideos) } // Distribute limit across videos
      );

      // Add video metadata to results
      const enrichedResults = results.map(result => ({
        ...result,
        video_title: video.title,
        channel_title: video.channel_title
      }));

      allResults.push(...enrichedResults);
    }

    // Sort by rank and limit results
    const sortedResults = allResults
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, limit);

    console.log(`✅ Found ${sortedResults.length} global results across ${videos.length} videos`);

    return {
      results: sortedResults,
      videosSearched: videos.length
    };

  } catch (error) {
    console.error('Error in globalSearchTranscriptChunks:', error);
    return { results: [], videosSearched: 0 };
  }
} 