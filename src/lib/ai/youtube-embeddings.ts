import { generateEmbedding, generateEmbeddingsBatch, chunkText } from './embeddings';
import { supabaseAdmin } from '@/lib/database/supabase';
import type { YouTubeTranscript } from '@/types/youtube-chat';

export interface YouTubeEmbeddingMetadata {
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  duration: string;
  chunkIndex: number;
  totalChunks: number;
  startTime?: number;
  endTime?: number;
  speaker?: string;
  source: string;
}

/**
 * Process YouTube video transcript and create embeddings
 * Similar to processEpisodeTranscript but for YouTube content
 */
export async function processYouTubeTranscript(
  videoId: string,
  transcript: YouTubeTranscript[],
  metadata: {
    videoTitle: string;
    channelTitle: string;
    duration: string;
    channelId?: string;
  }
): Promise<string[]> {
  try {
    console.log(`🎬 Processing YouTube transcript for ${videoId}: "${metadata.videoTitle}"`);

    // Check if embeddings already exist
    const { data: existingEmbeddings } = await supabaseAdmin()
      .from('youtube_video_embeddings')
      .select('id')
      .eq('video_id', videoId);

    if (existingEmbeddings && existingEmbeddings.length > 0) {
      console.log(`⏭️  Embeddings already exist for ${videoId}, skipping processing`);
      return existingEmbeddings.map(e => e.id);
    }

    // Convert transcript segments to full text
    const fullTranscript = transcript.map(segment => segment.text).join(' ');
    
    // Chunk the transcript
    const chunks = chunkText(fullTranscript, 1000, 200); // Same chunking as podcasts
    const embeddingIds: string[] = [];

    console.log(`📝 Created ${chunks.length} chunks for ${videoId}`);

    // First, ensure video exists in database (we'll add this logic later)
    // For now, we assume the video data is handled elsewhere

    // Generate embeddings in batches
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      try {
        const embeddings = await generateEmbeddingsBatch(batch);

        // Store each embedding with metadata
        for (let j = 0; j < batch.length; j++) {
          const chunkIndex = i + j;
          const chunk = batch[j];

          // Find corresponding timestamp from original transcript
          const { startTime, endTime, speaker } = findChunkTimestamp(
            chunk, 
            transcript, 
            chunkIndex, 
            chunks.length
          );

          const { data, error } = await supabaseAdmin()
            .from('youtube_video_embeddings')
            .insert({
              video_id: videoId,
              segment_text: chunk,
              segment_start: startTime,
              segment_end: endTime,
              embedding: embeddings[j],
              confidence: 0.8, // Default confidence for YouTube transcripts
              speaker: speaker,
              chunk_index: chunkIndex,
              total_chunks: chunks.length
            })
            .select('id')
            .single();

          if (error) {
            console.error(`Error storing embedding for chunk ${chunkIndex}:`, error);
            throw error;
          }

          embeddingIds.push(data.id);
        }

        console.log(`✅ Stored embeddings for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);

        // Rate limiting delay
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (batchError) {
        console.error(`Error processing batch starting at index ${i}:`, batchError);
        throw batchError;
      }
    }

    console.log(`🎯 Successfully created ${embeddingIds.length} embeddings for ${videoId}`);
    return embeddingIds;

  } catch (error) {
    console.error('Error processing YouTube transcript:', error);
    throw error;
  }
}

/**
 * Find timestamp information for a text chunk
 */
function findChunkTimestamp(
  chunk: string,
  transcript: YouTubeTranscript[],
  chunkIndex: number,
  totalChunks: number
): { startTime: number; endTime: number; speaker?: string } {
  // Simple approach: estimate based on chunk position
  const estimatedProgress = chunkIndex / totalChunks;
  const totalDuration = transcript.length > 0 ? 
    transcript[transcript.length - 1].start + transcript[transcript.length - 1].duration : 
    3600; // Default 1 hour if unknown

  const estimatedStart = estimatedProgress * totalDuration;
  const chunkDuration = totalDuration / totalChunks;

  // Try to find actual timestamps by matching chunk text to transcript segments
  let actualStart = estimatedStart;
  let actualEnd = estimatedStart + chunkDuration;
  let speaker: string | undefined;

  // Look for first few words of chunk in transcript
  const chunkWords = chunk.split(' ').slice(0, 5).join(' ').toLowerCase();
  
  for (let i = 0; i < transcript.length; i++) {
    const segment = transcript[i];
    if (segment.text.toLowerCase().includes(chunkWords)) {
      actualStart = segment.start;
      // Find end by looking ahead
      for (let j = i; j < transcript.length && j < i + 10; j++) {
        if (chunk.toLowerCase().includes(transcript[j].text.toLowerCase())) {
          actualEnd = transcript[j].start + transcript[j].duration;
        }
      }
      break;
    }
  }

  return {
    startTime: actualStart,
    endTime: actualEnd,
    speaker: speaker
  };
}

/**
 * Search YouTube video embeddings for relevant content
 */
export async function searchYouTubeEmbeddings(
  videoId: string,
  question: string,
  options: {
    limit?: number;
    threshold?: number;
  } = {}
): Promise<Array<{
  segment_text: string;
  segment_start: number;
  segment_end: number;
  similarity: number;
  confidence: number;
  speaker?: string;
}>> {
  try {
    const { limit = 10, threshold = 0.7 } = options;

    // Generate embedding for the question
    const queryEmbedding = await generateEmbedding(question);

    // Search using the database function
    const { data, error } = await supabaseAdmin().rpc(
      'search_youtube_video_embeddings',
      {
        query_embedding: queryEmbedding,
        target_video_id: videoId,
        match_threshold: threshold,
        match_count: limit
      }
    );

    if (error) {
      console.error('Error searching YouTube embeddings:', error);
      throw error;
    }

    console.log(`🔍 Found ${data?.length || 0} relevant segments for "${question}" in ${videoId}`);
    return data || [];

  } catch (error) {
    console.error('Error in YouTube embedding search:', error);
    return [];
  }
}

/**
 * Check if YouTube video has embeddings
 */
export async function hasYouTubeEmbeddings(videoId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('youtube_video_embeddings')
      .select('id')
      .eq('video_id', videoId)
      .limit(1);

    if (error) throw error;
    return (data?.length || 0) > 0;

  } catch (error) {
    console.error('Error checking YouTube embeddings:', error);
    return false;
  }
}

/**
 * Delete YouTube video embeddings (for cleanup/reprocessing)
 */
export async function deleteYouTubeEmbeddings(videoId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('youtube_video_embeddings')
      .delete()
      .eq('video_id', videoId);

    if (error) throw error;
    console.log(`🗑️  Deleted embeddings for YouTube video ${videoId}`);

  } catch (error) {
    console.error('Error deleting YouTube embeddings:', error);
    throw error;
  }
}

/**
 * Get YouTube embedding stats
 */
export async function getYouTubeEmbeddingStats(): Promise<{
  totalVideos: number;
  totalEmbeddings: number;
  avgEmbeddingsPerVideo: number;
}> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('youtube_video_embeddings')
      .select('video_id');

    if (error) throw error;

    const totalEmbeddings = data?.length || 0;
    const uniqueVideos = new Set(data?.map(row => row.video_id) || []).size;
    const avgEmbeddingsPerVideo = uniqueVideos > 0 ? totalEmbeddings / uniqueVideos : 0;

    return {
      totalVideos: uniqueVideos,
      totalEmbeddings,
      avgEmbeddingsPerVideo: Math.round(avgEmbeddingsPerVideo * 100) / 100
    };

  } catch (error) {
    console.error('Error getting YouTube embedding stats:', error);
    return { totalVideos: 0, totalEmbeddings: 0, avgEmbeddingsPerVideo: 0 };
  }
} 