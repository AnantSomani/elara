import { supabaseAdmin } from '@/lib/database/supabase';
import { processEpisodeTranscript, generateEmbedding, storeEmbedding } from './embeddings';
import type { ChunkMetadata } from './embeddings';

/**
 * Initialize RAG system by processing existing episodes
 */
export async function initializeRAGSystem(): Promise<{
  processedEpisodes: number;
  generatedEmbeddings: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processedEpisodes = 0;
  let generatedEmbeddings = 0;

  try {
    console.log('🚀 Initializing RAG system...');

    // 1. Check if vector extension is enabled
    await ensureVectorExtension();

    // 2. Get all episodes that don't have embeddings yet
    const { data: episodes, error: episodesError } = await supabaseAdmin()
      .from('episodes')
      .select('id, title, description, podcast_id')
      .limit(50); // Process in batches

    if (episodesError) {
      errors.push(`Failed to fetch episodes: ${episodesError.message}`);
      return { processedEpisodes, generatedEmbeddings, errors };
    }

    console.log(`📚 Found ${episodes?.length || 0} episodes to process`);

    // 3. Process each episode
    for (const episode of episodes || []) {
      try {
        console.log(`📄 Processing episode: ${episode.title}`);

        // Check if embeddings already exist for this episode
        const { data: existingEmbeddings } = await supabaseAdmin()
          .from('embeddings')
          .select('id')
          .eq('content_id', episode.id)
          .eq('content_type', 'episode');

        if (existingEmbeddings && existingEmbeddings.length > 0) {
          console.log(`⏭️  Skipping ${episode.title} (already processed)`);
          continue;
        }

        // Get transcriptions for this episode
        const { data: transcriptions } = await supabaseAdmin()
          .from('transcriptions')
          .select('text, start_time, end_time')
          .eq('episode_id', episode.id)
          .order('start_time');

        if (transcriptions && transcriptions.length > 0) {
          // Combine transcriptions into full transcript
          const fullTranscript = transcriptions
            .map(t => t.text)
            .join(' ')
            .trim();

          if (fullTranscript.length > 100) {
            const metadata: Omit<ChunkMetadata, 'chunkIndex' | 'totalChunks' | 'type'> = {
              episodeId: episode.id,
              podcastId: episode.podcast_id,
              source: 'initialization',
            };

            const embeddingIds = await processEpisodeTranscript(
              episode.id,
              fullTranscript,
              metadata
            );

            generatedEmbeddings += embeddingIds.length;
            console.log(`✅ Generated ${embeddingIds.length} embeddings for ${episode.title}`);
          }
        }

        // Also create embedding for episode summary
        await createEpisodeSummaryEmbedding(episode);
        generatedEmbeddings++;

        processedEpisodes++;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        const errorMsg = `Failed to process episode ${episode.title}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // 4. Process host personalities
    await processHostPersonalities();

    console.log(`🎉 RAG initialization complete!`);
    console.log(`📊 Processed ${processedEpisodes} episodes`);
    console.log(`🔗 Generated ${generatedEmbeddings} embeddings`);

    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} errors occurred`);
    }

    return { processedEpisodes, generatedEmbeddings, errors };

  } catch (error) {
    const errorMsg = `RAG initialization failed: ${error}`;
    console.error(errorMsg);
    errors.push(errorMsg);
    return { processedEpisodes, generatedEmbeddings, errors };
  }
}

/**
 * Ensure vector extension is properly set up
 */
async function ensureVectorExtension(): Promise<void> {
  try {
    const { error } = await supabaseAdmin().rpc('exec', {
      query: `
        CREATE EXTENSION IF NOT EXISTS vector;
        
        -- Ensure vector indexes exist
        CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
        ON embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        
        CREATE INDEX IF NOT EXISTS idx_host_personalities_embedding 
        ON host_personalities USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 10);
      `
    });

    if (error) {
      console.warn('Could not create vector indexes via RPC, they may already exist');
    }
  } catch (error) {
    console.warn('Vector extension setup warning:', error);
  }
}

/**
 * Create embedding for episode summary
 */
async function createEpisodeSummaryEmbedding(episode: any): Promise<void> {
  const summaryText = `Episode: ${episode.title}. Description: ${episode.description}`;
  
  const metadata: ChunkMetadata = {
    episodeId: episode.id,
    podcastId: episode.podcast_id,
    chunkIndex: 0,
    totalChunks: 1,
    type: 'episode_summary',
    source: 'episode_metadata',
  };

  await storeEmbedding('episode', episode.id, summaryText, metadata);
}

/**
 * Process host personalities for embeddings
 */
async function processHostPersonalities(): Promise<void> {
  try {
    const { data: personalities } = await supabaseAdmin()
      .from('host_personalities')
      .select('*')
      .is('embedding', null);

    for (const personality of personalities || []) {
      const personalityText = [
        `Host: ${personality.name}`,
        `Description: ${personality.description}`,
        `Expertise: ${personality.conversation_style?.expertise?.join(', ') || ''}`,
        `Topics: ${personality.knowledge?.topics?.join(', ') || ''}`,
        `Themes: ${personality.knowledge?.recurring_themes?.join(', ') || ''}`,
      ].join('. ');

      const embedding = await generateEmbedding(personalityText);

      await supabaseAdmin()
        .from('host_personalities')
        .update({ embedding })
        .eq('id', personality.id);

      console.log(`✅ Generated embedding for host: ${personality.name}`);
    }
  } catch (error) {
    console.error('Error processing host personalities:', error);
  }
}

/**
 * Add embeddings for new episode
 */
export async function addEpisodeToRAG(
  episodeId: string,
  transcript: string,
  metadata: {
    title: string;
    description: string;
    podcastId?: string;
    hostId?: string;
  }
): Promise<string[]> {
  try {
    console.log(`📄 Adding episode to RAG: ${metadata.title}`);

    // 1. Create episode summary embedding
    const summaryText = `Episode: ${metadata.title}. Description: ${metadata.description}`;
    const summaryMetadata: ChunkMetadata = {
      episodeId,
      podcastId: metadata.podcastId,
      hostId: metadata.hostId,
      chunkIndex: 0,
      totalChunks: 1,
      type: 'episode_summary',
      source: 'new_episode',
    };

    const summaryEmbeddingId = await storeEmbedding(
      'episode',
      episodeId,
      summaryText,
      summaryMetadata
    );

    // 2. Process transcript if provided
    let transcriptEmbeddings: string[] = [];
    if (transcript && transcript.length > 100) {
      const transcriptMetadata: Omit<ChunkMetadata, 'chunkIndex' | 'totalChunks' | 'type'> = {
        episodeId,
        podcastId: metadata.podcastId,
        hostId: metadata.hostId,
        source: 'new_episode',
      };

      transcriptEmbeddings = await processEpisodeTranscript(
        episodeId,
        transcript,
        transcriptMetadata
      );
    }

    const allEmbeddings = [summaryEmbeddingId, ...transcriptEmbeddings];
    console.log(`✅ Created ${allEmbeddings.length} embeddings for episode`);

    return allEmbeddings;

  } catch (error) {
    console.error('Error adding episode to RAG:', error);
    throw error;
  }
}

/**
 * Update episode embeddings
 */
export async function updateEpisodeRAG(
  episodeId: string,
  newTranscript?: string,
  newMetadata?: {
    title?: string;
    description?: string;
  }
): Promise<void> {
  try {
    console.log(`🔄 Updating RAG for episode: ${episodeId}`);

    // Delete existing embeddings
    await supabaseAdmin()
      .from('embeddings')
      .delete()
      .eq('content_id', episodeId);

    // Re-create embeddings with new data
    if (newTranscript || newMetadata) {
      const { data: episode } = await supabaseAdmin()
        .from('episodes')
        .select('title, description, podcast_id')
        .eq('id', episodeId)
        .single();

      if (episode) {
        await addEpisodeToRAG(episodeId, newTranscript || '', {
          title: newMetadata?.title || episode.title,
          description: newMetadata?.description || episode.description,
          podcastId: episode.podcast_id,
        });
      }
    }

    console.log(`✅ Updated RAG for episode: ${episodeId}`);

  } catch (error) {
    console.error('Error updating episode RAG:', error);
    throw error;
  }
}

/**
 * Get RAG system statistics
 */
export async function getRAGStats(): Promise<{
  totalEmbeddings: number;
  episodeEmbeddings: number;
  transcriptEmbeddings: number;
  personalityEmbeddings: number;
  conversationEmbeddings: number;
  episodesWithEmbeddings: number;
  episodesWithoutEmbeddings: number;
}> {
  try {
    const [
      totalResult,
      episodeResult,
      transcriptResult,
      personalityResult,
      conversationResult,
      episodesWithResult,
      episodesWithoutResult,
    ] = await Promise.all([
      supabaseAdmin().from('embeddings').select('id', { count: 'exact' }),
      supabaseAdmin().from('embeddings').select('id', { count: 'exact' }).eq('content_type', 'episode'),
      supabaseAdmin().from('embeddings').select('id', { count: 'exact' }).eq('content_type', 'transcript'),
      supabaseAdmin().from('embeddings').select('id', { count: 'exact' }).eq('content_type', 'personality'),
      supabaseAdmin().from('embeddings').select('id', { count: 'exact' }).eq('content_type', 'conversation'),
      supabaseAdmin().rpc('count_episodes_with_embeddings'),
      supabaseAdmin().rpc('count_episodes_without_embeddings'),
    ]);

    return {
      totalEmbeddings: totalResult.count || 0,
      episodeEmbeddings: episodeResult.count || 0,
      transcriptEmbeddings: transcriptResult.count || 0,
      personalityEmbeddings: personalityResult.count || 0,
      conversationEmbeddings: conversationResult.count || 0,
      episodesWithEmbeddings: episodesWithResult.data || 0,
      episodesWithoutEmbeddings: episodesWithoutResult.data || 0,
    };

  } catch (error) {
    console.error('Error getting RAG stats:', error);
    return {
      totalEmbeddings: 0,
      episodeEmbeddings: 0,
      transcriptEmbeddings: 0,
      personalityEmbeddings: 0,
      conversationEmbeddings: 0,
      episodesWithEmbeddings: 0,
      episodesWithoutEmbeddings: 0,
    };
  }
}

/**
 * Clean up orphaned embeddings
 */
export async function cleanupRAGSystem(): Promise<{
  deletedEmbeddings: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let deletedEmbeddings = 0;

  try {
    // Find embeddings for episodes that no longer exist
    const { data: orphanedEmbeddings } = await supabaseAdmin().rpc('find_orphaned_embeddings');

    if (orphanedEmbeddings && orphanedEmbeddings.length > 0) {
      const { error } = await supabaseAdmin()
        .from('embeddings')
        .delete()
        .in('id', orphanedEmbeddings.map((e: any) => e.id));

      if (error) {
        errors.push(`Failed to delete orphaned embeddings: ${error.message}`);
      } else {
        deletedEmbeddings = orphanedEmbeddings.length;
      }
    }

    return { deletedEmbeddings, errors };

  } catch (error) {
    errors.push(`Cleanup failed: ${error}`);
    return { deletedEmbeddings, errors };
  }
}

export default {
  initializeRAGSystem,
  addEpisodeToRAG,
  updateEpisodeRAG,
  getRAGStats,
  cleanupRAGSystem,
}; 