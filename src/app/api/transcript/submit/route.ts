import { NextRequest, NextResponse } from 'next/server';
import { YouTubeTranscriptService } from '@/lib/services/youtube-real-time-transcript';
import { extractVideoId, isValidYouTubeUrl } from '@/lib/utils/youtubeUtils';
import { chunkTranscript, analyzeChunkQuality } from '@/lib/utils/chunkTranscript';
import { insertTranscriptChunks, updateTranscriptStatus, transcriptExists } from '@/lib/supabase/insertChunks';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { youtube_url, force_reprocess = false } = body;
    
    // Validate input
    if (!youtube_url) {
      return NextResponse.json(
        { success: false, error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    if (!isValidYouTubeUrl(youtube_url)) {
      return NextResponse.json(
        { success: false, error: 'Invalid YouTube URL format' },
        { status: 400 }
      );
    }

    // Extract video ID from URL
    const videoId = extractVideoId(youtube_url);
    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'Could not extract video ID from URL' },
        { status: 400 }
      );
    }

    console.log(`🎬 Processing video: ${videoId}`);

    // Check if transcript already exists (unless forced reprocessing)
    if (!force_reprocess) {
      const existingTranscript = await transcriptExists(videoId);
      if (existingTranscript.exists && existingTranscript.status === 'completed') {
        console.log(`✅ Transcript already exists for ${videoId}`);
        return NextResponse.json({
          success: true,
          message: 'Transcript already exists',
          data: {
            video_id: videoId,
            status: 'already_exists',
            total_chunks: existingTranscript.totalChunks,
            processing_time_ms: 0
          }
        });
      }
    }

    // Update status to processing
    await updateTranscriptStatus(videoId, 'processing');

    // Initialize YouTube transcript service
    const transcriptService = YouTubeTranscriptService.getInstance();
    
    try {
      console.log(`🔄 Fetching transcript from YouTube Direct API for ${videoId}...`);
      
      // Fetch transcript from YouTube Direct API
      const fetchStartTime = Date.now();
      const result = await transcriptService.fetchTranscript(videoId);
      const transcriptFetchTime = Date.now() - fetchStartTime;
      
      if (!result || !result.isAvailable || !result.transcript || result.transcript.length === 0) {
        const errorMsg = 'No transcript available for this video (captions may be disabled)';
        console.error(`❌ YouTube transcript failed for ${videoId}:`, errorMsg);
        await updateTranscriptStatus(videoId, 'failed', errorMsg);
        
        return NextResponse.json({
          success: false,
          error: `YouTube transcript extraction failed: ${errorMsg}`,
          data: {
            video_id: videoId,
            processing_time_ms: transcriptFetchTime
          }
        }, { status: 500 });
      }

      // Convert transcript segments to full text
      const transcriptText = transcriptService.getFullTranscriptText(result.transcript);
      console.log(`✅ Transcript fetched (${transcriptText.length} chars)`);

      // Chunk the transcript
      console.log('📄 Chunking transcript...');
      const chunks = chunkTranscript(transcriptText);
      
      if (chunks.length === 0) {
        await updateTranscriptStatus(videoId, 'failed', 'No chunks generated from transcript');
        return NextResponse.json({
          success: false,
          error: 'Failed to generate chunks from transcript'
        }, { status: 500 });
      }

      // Analyze chunk quality
      const chunkAnalysis = analyzeChunkQuality(chunks);
      console.log(`📊 Chunk analysis - Quality: ${chunkAnalysis.qualityScore}%, Chunks: ${chunks.length}, Words: ${chunkAnalysis.totalWordCount}`);

      // Get video metadata (basic implementation - can be enhanced)
      const metadata = await getVideoMetadata(videoId);
      
      // Insert chunks into database
      console.log('💾 Inserting chunks into database...');
      const insertResult = await insertTranscriptChunks(
        videoId,
        youtube_url,
        chunks,
        {
          ...metadata,
          processingTime: transcriptFetchTime
        }
      );

      if (!insertResult.success) {
        console.error(`❌ Database insertion failed for ${videoId}:`, insertResult.error);
        await updateTranscriptStatus(videoId, 'failed', insertResult.error);
        
        return NextResponse.json({
          success: false,
          error: `Database insertion failed: ${insertResult.error}`
        }, { status: 500 });
      }

      const totalProcessingTime = Date.now() - startTime;
      console.log(`🎉 Successfully processed ${videoId} in ${totalProcessingTime}ms`);

      return NextResponse.json({
        success: true,
        message: 'Transcript processed successfully',
        data: {
          video_id: videoId,
          chunks_created: chunks.length,
          total_words: chunkAnalysis.totalWordCount,
          estimated_tokens: chunkAnalysis.estimatedTokenCount,
          quality_score: chunkAnalysis.qualityScore,
          chunk_analysis: {
            avg_words_per_chunk: chunkAnalysis.averageWordCount,
            min_words: chunkAnalysis.minWordCount,
            max_words: chunkAnalysis.maxWordCount,
            suggestions: chunkAnalysis.suggestions
          },
          processing_time_ms: totalProcessingTime,
          youtube_api_time_ms: transcriptFetchTime,
          metadata: metadata
        }
      });

    } catch (error) {
      console.error('❌ YouTube transcript service error:', error);
      await updateTranscriptStatus(videoId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error; // Re-throw to be caught by outer try-catch
    }

  } catch (error) {
    console.error('❌ Submit transcript error:', error);
    
    // Try to extract video ID for status update
    try {
      const body = await request.json();
      const videoId = extractVideoId(body.youtube_url);
      if (videoId) {
        await updateTranscriptStatus(
          videoId, 
          'failed', 
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    } catch (e) {
      // Ignore errors in error handling
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Get basic video metadata - can be enhanced with YouTube API
 * @param videoId - YouTube video ID
 * @returns Basic metadata
 */
async function getVideoMetadata(videoId: string): Promise<{
  title?: string;
  channelTitle?: string;
  durationSeconds?: number;
}> {
  try {
    // This is a placeholder implementation
    // In a real implementation, you would use YouTube Data API:
    /*
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const video = data.items[0];
      return {
        title: video.snippet.title,
        channelTitle: video.snippet.channelTitle,
        durationSeconds: parseDuration(video.contentDetails.duration)
      };
    }
    */
    
    // For now, return empty metadata
    return {};
    
  } catch (error) {
    console.warn('Could not fetch video metadata:', error);
    return {};
  }
}

/**
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'health') {
    return NextResponse.json({
      status: 'healthy',
      service: 'tactiq-transcript-submission',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }

  if (action === 'stats') {
    try {
      // Get system stats (you could call your database function here)
      return NextResponse.json({
        message: 'Stats endpoint - implement database stats query',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to get stats' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: 'Invalid action. Use ?action=health or ?action=stats' },
    { status: 400 }
  );
} 