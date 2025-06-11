import { NextRequest, NextResponse } from 'next/server'
import { YouTubeTranscriptService } from '@/lib/services/youtube-real-time-transcript'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'Video ID is required' },
        { status: 400 }
      )
    }

    console.log(`🔍 Checking transcript availability for video: ${videoId}`)

    const transcriptService = YouTubeTranscriptService.getInstance()
    const isAvailable = await transcriptService.checkTranscriptAvailability(videoId)

    console.log(`📋 Transcript availability for ${videoId}: ${isAvailable}`)

    return NextResponse.json({
      success: true,
      available: isAvailable,
      videoId
    })

  } catch (error) {
    console.error('Transcript check API error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check transcript availability',
      available: false,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 