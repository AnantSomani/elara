import { NextRequest, NextResponse } from 'next/server';
import { fastAPIClient } from '@/lib/api/fastapi-client';
import { extractVideoId, isValidYouTubeUrl } from '@/lib/utils/youtubeUtils';

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

    console.log(`🎬 Processing video via FastAPI: ${videoId}`);

    // Use FastAPI backend for transcript processing
    try {
      const result = await fastAPIClient.addTranscript(youtube_url);
      
      if (!result.success) {
        console.error(`❌ FastAPI processing failed for ${videoId}:`, result.error);
        return NextResponse.json({
          success: false,
          error: `Transcript processing failed: ${result.error}`,
          data: {
            video_id: videoId,
            processing_time_ms: Date.now() - startTime
          }
        }, { status: 500 });
      }

      const totalProcessingTime = Date.now() - startTime;
      console.log(`🎉 Successfully processed ${videoId} via FastAPI in ${totalProcessingTime}ms`);

      return NextResponse.json({
        success: true,
        message: 'Transcript processed successfully via FastAPI',
        data: {
          video_id: videoId,
          transcript_id: result.data?.transcript_id,
          backend: 'fastapi',
          processing_time_ms: totalProcessingTime,
          source: 'youtube-transcript-api (Python)'
        }
      });

    } catch (error) {
      console.error('❌ FastAPI backend error:', error);
      return NextResponse.json({
        success: false,
        error: 'FastAPI backend unavailable. Please ensure the service is running on localhost:8001',
        details: error instanceof Error ? error.message : 'Unknown error',
        data: {
          video_id: videoId,
          processing_time_ms: Date.now() - startTime
        }
      }, { status: 503 });
    }

  } catch (error) {
    console.error('❌ Submit transcript error:', error);
    
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
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'health') {
    try {
      // Check FastAPI backend health
      const healthCheck = await fastAPIClient.healthCheck();
      
      return NextResponse.json({
        status: 'healthy',
        service: 'elara-transcript-submission',
        backend: healthCheck.success ? 'fastapi-connected' : 'fastapi-disconnected',
        timestamp: new Date().toISOString(),
        version: '2.0.0-fastapi-integrated'
      });
    } catch (error) {
      return NextResponse.json({
        status: 'degraded',
        service: 'elara-transcript-submission',
        backend: 'fastapi-disconnected',
        error: 'FastAPI backend unavailable',
        timestamp: new Date().toISOString(),
        version: '2.0.0-fastapi-integrated'
      }, { status: 503 });
    }
  }

  if (action === 'stats') {
    try {
      // Get FastAPI backend stats
      const healthCheck = await fastAPIClient.healthCheck();
      return NextResponse.json({
        message: 'FastAPI backend stats',
        backend_health: healthCheck
      });
    } catch (error) {
      return NextResponse.json({
        error: 'Could not fetch backend stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 503 });
    }
  }

  return NextResponse.json({
    message: 'Transcript submission API - FastAPI integrated',
    endpoints: {
      submit: 'POST /',
      health: 'GET /?action=health',
      stats: 'GET /?action=stats'
    }
  });
} 