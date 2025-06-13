import { supabaseAdmin } from '@/lib/database/supabase';
import { TranscriptChunk } from '@/lib/utils/chunkTranscript';

export interface VideoMetadata {
  title?: string;
  channelTitle?: string;
  durationSeconds?: number;
  processingTime: number;
}

export interface InsertChunksResult {
  success: boolean;
  error?: string;
  chunksInserted?: number;
  videoMetadata?: any;
}

/**
 * Inserts transcript chunks and video metadata into Supabase
 * @param videoId - YouTube video ID
 * @param videoUrl - Full YouTube URL
 * @param chunks - Array of transcript chunks
 * @param metadata - Video metadata and processing info
 * @returns Result of the insertion operation
 */
export async function insertTranscriptChunks(
  videoId: string,
  videoUrl: string,
  chunks: TranscriptChunk[],
  metadata: VideoMetadata
): Promise<InsertChunksResult> {
  try {
    console.log(`📊 Inserting ${chunks.length} chunks for video ${videoId}`);

    // First, check if this video already exists
    const { data: existingVideo } = await supabaseAdmin()
      .from('youtube_transcripts')
      .select('video_id, transcript_status')
      .eq('video_id', videoId)
      .single();

    // If video is already completed, we might want to skip
    if (existingVideo && existingVideo.transcript_status === 'completed') {
      console.log(`⚠️ Video ${videoId} already has completed transcript`);
      // Optionally, you could choose to update instead of skip
      // For now, we'll return success but indicate it was already processed
    }

    // Insert or update video metadata
    const videoData = {
      video_id: videoId,
      video_url: videoUrl,
      title: metadata.title || null,
      channel_title: metadata.channelTitle || null,
      duration_seconds: metadata.durationSeconds || null,
      transcript_status: 'completed',
      transcript_source: 'tactiq',
      total_chunks: chunks.length,
      word_count: chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
      processing_time_ms: metadata.processingTime,
      retry_count: 0,
      error_message: null,
      updated_at: new Date().toISOString()
    };

    console.log('💾 Inserting video metadata...');
    const { error: videoError, data: videoResult } = await supabaseAdmin()
      .from('youtube_transcripts')
      .upsert(videoData, { onConflict: 'video_id' })
      .select()
      .single();

    if (videoError) {
      console.error('❌ Video metadata insertion failed:', videoError);
      throw new Error(`Failed to insert video metadata: ${videoError.message}`);
    }

    // Delete existing chunks for this video (in case of re-processing)
    console.log('🗑️ Cleaning up existing chunks...');
    const { error: deleteError } = await supabaseAdmin()
      .from('transcript_chunks')
      .delete()
      .eq('video_id', videoId);

    if (deleteError) {
      console.warn('⚠️ Warning: Could not delete existing chunks:', deleteError);
      // Continue anyway, as this might just mean no existing chunks
    }

    // Prepare chunk data for insertion
    const chunkData = chunks.map(chunk => ({
      video_id: videoId,
      video_url: videoUrl,
      chunk_text: chunk.text,
      chunk_index: chunk.index,
      total_chunks: chunk.totalChunks,
      word_count: chunk.wordCount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Insert chunks in batches to avoid hitting size limits
    const batchSize = 100;
    let totalInserted = 0;

    for (let i = 0; i < chunkData.length; i += batchSize) {
      const batch = chunkData.slice(i, i + batchSize);
      console.log(`📦 Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunkData.length / batchSize)} (${batch.length} chunks)`);

      const { error: chunksError } = await supabaseAdmin()
        .from('transcript_chunks')
        .insert(batch);

      if (chunksError) {
        console.error('❌ Chunk insertion failed:', chunksError);
        throw new Error(`Failed to insert chunk batch: ${chunksError.message}`);
      }

      totalInserted += batch.length;
    }

    console.log(`✅ Successfully inserted ${totalInserted} chunks for video ${videoId}`);

    return {
      success: true,
      chunksInserted: totalInserted,
      videoMetadata: videoResult
    };

  } catch (error) {
    console.error('❌ Error inserting transcript chunks:', error);
    
    // Try to update video status to failed
    try {
      await supabaseAdmin()
        .from('youtube_transcripts')
        .upsert({
          video_id: videoId,
          video_url: videoUrl,
          transcript_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date().toISOString()
        }, { onConflict: 'video_id' });
    } catch (updateError) {
      console.error('Failed to update video status to failed:', updateError);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Updates the processing status of a video transcript
 * @param videoId - YouTube video ID
 * @param status - New status
 * @param errorMessage - Optional error message
 * @returns Success boolean
 */
export async function updateTranscriptStatus(
  videoId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errorMessage?: string
): Promise<boolean> {
  try {
    const updateData: any = {
      video_id: videoId,
      transcript_status: status,
      updated_at: new Date().toISOString()
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (status === 'failed') {
      updateData.retry_count = Math.max(0, (await getRetryCount(videoId)) + 1);
    }

    const { error } = await supabaseAdmin()
      .from('youtube_transcripts')
      .upsert(updateData, { onConflict: 'video_id' });

    if (error) {
      console.error('Error updating transcript status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating transcript status:', error);
    return false;
  }
}

/**
 * Gets the current retry count for a video
 * @param videoId - YouTube video ID
 * @returns Current retry count
 */
async function getRetryCount(videoId: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin()
      .from('youtube_transcripts')
      .select('retry_count')
      .eq('video_id', videoId)
      .single();

    return data?.retry_count || 0;
  } catch {
    return 0;
  }
}

/**
 * Checks if a video transcript already exists and is completed
 * @param videoId - YouTube video ID
 * @returns Boolean indicating if transcript exists
 */
export async function transcriptExists(videoId: string): Promise<{
  exists: boolean;
  status?: string;
  totalChunks?: number;
}> {
  try {
    const { data } = await supabaseAdmin()
      .from('youtube_transcripts')
      .select('transcript_status, total_chunks')
      .eq('video_id', videoId)
      .single();

    if (!data) {
      return { exists: false };
    }

    return {
      exists: true,
      status: data.transcript_status,
      totalChunks: data.total_chunks
    };
  } catch {
    return { exists: false };
  }
} 