import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/database/supabase';

// Lazy OpenAI client initialization
let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 200; // Overlap between chunks

export interface EmbeddingResult {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  similarity?: number;
}

export interface ChunkMetadata {
  episodeId: string;
  podcastId?: string;
  hostId?: string;
  startTime?: number;
  endTime?: number;
  chunkIndex: number;
  totalChunks: number;
  type: 'transcript' | 'episode_summary' | 'host_statement' | 'conversation';
  source: string;
  topics?: string[];
}

/**
 * Generate embeddings for text content
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' ').trim(),
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map(text => text.replace(/\n/g, ' ').trim()),
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    throw new Error('Failed to generate batch embeddings');
  }
}

/**
 * Chunk large text into smaller, overlapping segments
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to end chunks at sentence boundaries
    if (end < text.length) {
      const lastSentenceEnd = chunk.lastIndexOf('. ');
      const lastQuestionEnd = chunk.lastIndexOf('? ');
      const lastExclamationEnd = chunk.lastIndexOf('! ');
      
      const sentenceEnd = Math.max(lastSentenceEnd, lastQuestionEnd, lastExclamationEnd);
      
      if (sentenceEnd > chunkSize * 0.7) {
        chunk = chunk.slice(0, sentenceEnd + 2);
        start = start + sentenceEnd + 2;
      } else {
        start = end - overlap;
      }
    } else {
      start = end;
    }

    chunks.push(chunk.trim());
  }

  return chunks.filter(chunk => chunk.length > 50); // Filter out very short chunks
}

/**
 * Store embeddings in the database
 */
export async function storeEmbedding(
  contentType: 'episode' | 'transcript' | 'personality' | 'conversation',
  contentId: string,
  content: string,
  metadata: ChunkMetadata
): Promise<string> {
  try {
    const embedding = await generateEmbedding(content);

    const { data, error } = await supabaseAdmin()
      .from('embeddings')
      .insert({
        content_type: contentType,
        content_id: contentId,
        embedding,
        metadata: {
          ...metadata,
          content,
          contentLength: content.length,
          createdAt: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error('Error storing embedding:', error);
    throw error;
  }
}

/**
 * Process and store episode transcript embeddings
 */
export async function processEpisodeTranscript(
  episodeId: string,
  transcript: string,
  metadata: Omit<ChunkMetadata, 'chunkIndex' | 'totalChunks' | 'type'>
): Promise<string[]> {
  try {
    const chunks = chunkText(transcript);
    const embeddingIds: string[] = [];

    // Generate embeddings in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await generateEmbeddingsBatch(batch);

      // Store each embedding
      for (let j = 0; j < batch.length; j++) {
        const chunkMetadata: ChunkMetadata = {
          ...metadata,
          episodeId,
          chunkIndex: i + j,
          totalChunks: chunks.length,
          type: 'transcript',
          source: 'episode_transcript',
        };

        const { data, error } = await supabaseAdmin()
          .from('embeddings')
          .insert({
            content_type: 'transcript',
            content_id: `${episodeId}_chunk_${i + j}`,
            embedding: embeddings[j],
            metadata: {
              ...chunkMetadata,
              content: batch[j],
              contentLength: batch[j].length,
              createdAt: new Date().toISOString(),
            },
          })
          .select('id')
          .single();

        if (error) throw error;
        embeddingIds.push(data.id);
      }

      // Rate limiting delay
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return embeddingIds;
  } catch (error) {
    console.error('Error processing episode transcript:', error);
    throw error;
  }
}

/**
 * Semantic search using vector similarity
 */
export async function semanticSearch(
  query: string,
  options: {
    contentTypes?: ('episode' | 'transcript' | 'personality' | 'conversation')[];
    episodeId?: string;
    hostId?: string;
    limit?: number;
    threshold?: number;
  } = {}
): Promise<EmbeddingResult[]> {
  try {
    const {
      contentTypes = ['transcript'],
      episodeId,
      hostId,
      limit = 10,
      threshold = 0.7,
    } = options;

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    const allResults: EmbeddingResult[] = [];

    // Search in transcript_embeddings table if transcript content is requested
    if (contentTypes.includes('transcript')) {
      try {
        let transcriptQuery = supabaseAdmin()
          .from('transcript_embeddings')
          .select('id, episode_id, segment_text, segment_start, segment_end, confidence, speaker')
          .order('id'); // We'll order by similarity after rpc call
        
        if (episodeId) {
          transcriptQuery = transcriptQuery.eq('episode_id', episodeId);
        }

        // Use RPC for vector similarity search on transcript_embeddings
        const { data: transcriptData, error: transcriptError } = await supabaseAdmin().rpc(
          'match_transcript_embeddings',
          {
            query_embedding: queryEmbedding,
            match_threshold: Math.min(threshold, 0.5), // Lower threshold for transcripts
            match_count: limit,
            filter_episode_id: episodeId || null
          }
        );

        if (!transcriptError && transcriptData) {
          allResults.push(
            ...transcriptData.map((row: any) => ({
              id: row.id,
              content: row.segment_text,
              embedding: [], // Don't return the embedding vector
              metadata: {
                episodeId: row.episode_id,
                startTime: row.segment_start,
                endTime: row.segment_end,
                confidence: row.confidence,
                speaker: row.speaker,
                type: 'transcript',
                source: 'transcript_embeddings',
                content: row.segment_text,
                contentLength: row.segment_text?.length || 0,
              },
              similarity: row.similarity,
            }))
          );
        } else {
          console.log('No transcript embeddings found or RPC error:', transcriptError);
        }
      } catch (transcriptErr) {
        console.warn('Error searching transcript embeddings:', transcriptErr);
      }
    }

    // Search in legacy embeddings table for other content types
    const legacyContentTypes = contentTypes.filter(type => type !== 'transcript');
    if (legacyContentTypes.length > 0) {
      // Build the SQL query for vector similarity search in embeddings table
      let sql = `
        SELECT 
          id,
          content_type,
          content_id,
          metadata,
          1 - (embedding <=> $1::vector) as similarity
        FROM embeddings
        WHERE 1 - (embedding <=> $1::vector) > $2
      `;

      const params: any[] = [JSON.stringify(queryEmbedding), threshold];
      let paramCount = 2;

      if (legacyContentTypes.length > 0) {
        paramCount++;
        sql += ` AND content_type = ANY($${paramCount})`;
        params.push(legacyContentTypes);
      }

      if (episodeId) {
        paramCount++;
        sql += ` AND metadata->>'episodeId' = $${paramCount}`;
        params.push(episodeId);
      }

      if (hostId) {
        paramCount++;
        sql += ` AND metadata->>'hostId' = $${paramCount}`;
        params.push(hostId);
      }

      sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramCount + 1}`;
      params.push(limit);

      try {
        const { data, error } = await supabaseAdmin().rpc('execute_sql', {
          query: sql,
          params,
        });

        if (!error && data) {
          allResults.push(
            ...data.map((row: any) => ({
              id: row.id,
              content: row.metadata.content,
              embedding: [], // Don't return the embedding vector
              metadata: row.metadata,
              similarity: row.similarity,
            }))
          );
        }
      } catch (legacyErr) {
        console.warn('Error searching legacy embeddings:', legacyErr);
      }
    }

    // If no results from vector search, try fallback search
    if (allResults.length === 0) {
      console.log('No vector search results, trying fallback text search');
      return await fallbackTextSearch(query, options);
    }

    // Sort all results by similarity and limit
    allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    return allResults.slice(0, limit);

  } catch (error) {
    console.error('Error in semantic search:', error);
    return await fallbackTextSearch(query, options);
  }
}

/**
 * Fallback text search when vector search fails
 */
async function fallbackTextSearch(
  query: string,
  options: {
    contentTypes?: string[];
    episodeId?: string;
    limit?: number;
  }
): Promise<EmbeddingResult[]> {
  try {
    let queryBuilder = supabaseAdmin()
      .from('embeddings')
      .select('id, content_type, content_id, metadata')
      .order('created_at', { ascending: false });

    if (options.contentTypes) {
      queryBuilder = queryBuilder.in('content_type', options.contentTypes);
    }

    if (options.episodeId) {
      queryBuilder = queryBuilder.eq('metadata->>episodeId', options.episodeId);
    }

    if (options.limit) {
      queryBuilder = queryBuilder.limit(options.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) throw error;

    // Simple text matching
    return (data || [])
      .filter(item => 
        item.metadata.content?.toLowerCase().includes(query.toLowerCase())
      )
      .map(item => ({
        id: item.id,
        content: item.metadata.content,
        embedding: [],
        metadata: item.metadata,
        similarity: 0.5, // Default similarity for text search
      }));
  } catch (error) {
    console.error('Error in fallback text search:', error);
    return [];
  }
}

/**
 * Get relevant context for a conversation
 */
export async function getRelevantContext(
  query: string,
  episodeId: string,
  options: {
    includePersonality?: boolean;
    includeConversationHistory?: boolean;
    maxChunks?: number;
  } = {}
): Promise<{
  transcriptChunks: EmbeddingResult[];
  personalityData?: EmbeddingResult[];
  conversationHistory?: EmbeddingResult[];
}> {
  const { includePersonality = true, includeConversationHistory = true, maxChunks = 5 } = options;

  const results = await Promise.allSettled([
    // Get relevant transcript chunks
    semanticSearch(query, {
      contentTypes: ['transcript'],
      episodeId,
      limit: maxChunks,
      threshold: 0.6,
    }),

    // Get host personality information if requested
    includePersonality ? semanticSearch(query, {
      contentTypes: ['personality'],
      limit: 2,
      threshold: 0.5,
    }) : Promise.resolve([]),

    // Get relevant conversation history if requested
    includeConversationHistory ? semanticSearch(query, {
      contentTypes: ['conversation'],
      episodeId,
      limit: 3,
      threshold: 0.6,
    }) : Promise.resolve([]),
  ]);

  return {
    transcriptChunks: results[0].status === 'fulfilled' ? results[0].value : [],
    personalityData: results[1].status === 'fulfilled' ? results[1].value : undefined,
    conversationHistory: results[2].status === 'fulfilled' ? results[2].value : undefined,
  };
}

/**
 * Update existing embeddings when content changes
 */
export async function updateEmbedding(
  embeddingId: string,
  newContent: string,
  newMetadata?: Record<string, any>
): Promise<void> {
  try {
    const embedding = await generateEmbedding(newContent);

    const updateData: any = { embedding };

    if (newMetadata) {
      updateData.metadata = {
        ...newMetadata,
        content: newContent,
        contentLength: newContent.length,
        updatedAt: new Date().toISOString(),
      };
    }

    const { error } = await supabaseAdmin()
      .from('embeddings')
      .update(updateData)
      .eq('id', embeddingId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating embedding:', error);
    throw error;
  }
}

/**
 * Delete embeddings by content ID
 */
export async function deleteEmbeddings(contentId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('embeddings')
      .delete()
      .eq('content_id', contentId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting embeddings:', error);
    throw error;
  }
} 