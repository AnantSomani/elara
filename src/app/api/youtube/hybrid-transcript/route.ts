import { NextRequest, NextResponse } from 'next/server'
import { UniversalTranscriptService } from '@/lib/services/universal-transcript-service'
import { YouTubeAudioExtractor } from '@/lib/services/youtube-audio-extractor'

interface TranscriptRequest {
  videoId: string
  forceReprocess?: boolean
}

interface TranscriptResponse {
  success: boolean
  data?: {
    videoId: string
    transcript: Array<{
      text: string
      start: number
      duration: number
    }>
    source: 'youtube' | 'deepgram' | 'cache'
    cost: number
    processingTime: number
    totalSegments: number
    wordCount: number
  }
  error?: string
  costs?: {
    thisRequest: number
    todayTotal: number
    monthlyTotal: number
    savings: number
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<TranscriptResponse>> {
  try {
    const body: TranscriptRequest = await request.json()
    const { videoId, forceReprocess = false } = body

    if (!videoId) {
      return NextResponse.json({
        success: false,
        error: 'Video ID is required'
      }, { status: 400 })
    }

    console.log(`🎯 Processing transcript request for video: ${videoId}`)

    // Initialize services
    const universalTranscript = UniversalTranscriptService.getInstance()
    const audioExtractor = YouTubeAudioExtractor.getInstance()

    // Check system availability
    const ytDlpStatus = await audioExtractor.checkYtDlpAvailability()
    if (!ytDlpStatus.available) {
      console.warn('⚠️ yt-dlp not available, Deepgram fallback disabled')
    }

    // Get transcript using hybrid approach
    const result = await universalTranscript.getTranscript(videoId)

    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Failed to process transcript request'
      }, { status: 500 })
    }

    if (!result.isAvailable) {
      return NextResponse.json({
        success: false,
        error: 'No transcript available for this video (captions disabled, extraction failed)'
      }, { status: 404 })
    }

    // Calculate metrics
    const wordCount = result.transcript.reduce((count, segment) => 
      count + segment.text.split(' ').length, 0
    )

    // Get cost analytics
    const stats = await universalTranscript.getProcessingStats()
    const assemblyAISavings = (stats.totalProcessed * 0.69) - stats.totalCost // $0.69 = avg cost for 30min with AssemblyAI

    const response: TranscriptResponse = {
      success: true,
      data: {
        videoId: result.videoId,
        transcript: result.transcript,
        source: result.source,
        cost: result.cost,
        processingTime: result.processingTime,
        totalSegments: result.transcript.length,
        wordCount
      },
      costs: {
        thisRequest: result.cost,
        todayTotal: stats.totalCost, // This would be today's total in production
        monthlyTotal: stats.totalCost, // This would be monthly total in production
        savings: assemblyAISavings
      }
    }

    console.log(`✅ Transcript processed successfully:`, {
      videoId,
      source: result.source,
      cost: result.cost,
      segments: result.transcript.length,
      words: wordCount,
      processingTime: `${result.processingTime}ms`
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ Transcript API error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    const universalTranscript = UniversalTranscriptService.getInstance()
    const audioExtractor = YouTubeAudioExtractor.getInstance()

    // Get yt-dlp status once for both cases
    const ytDlpStatus = await audioExtractor.checkYtDlpAvailability()

    switch (action) {
      case 'stats':
        // Get processing statistics
        const stats = await universalTranscript.getProcessingStats()
        
        return NextResponse.json({
          success: true,
          data: {
            ...stats,
            ytDlpAvailable: ytDlpStatus.available,
            ytDlpVersion: ytDlpStatus.version,
            estimatedSavings: {
              vsAssemblyAI: (stats.totalProcessed * 0.69) - stats.totalCost,
              percentage: stats.totalProcessed > 0 ? 
                ((stats.totalProcessed * 0.69 - stats.totalCost) / (stats.totalProcessed * 0.69)) * 100 : 0
            }
          }
        })

      case 'health':
        // System health check
        const healthCheck = {
          universalTranscript: 'available',
          ytDlp: ytDlpStatus.available ? 'available' : 'unavailable',
          deepgram: process.env.DEEPGRAM_API_KEY ? 'configured' : 'not configured',
          youtube: process.env.YOUTUBE_API_KEY ? 'configured' : 'not configured'
        }

        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            services: healthCheck,
            capabilities: {
              youtubeCaptions: true,
              deepgramTranscription: ytDlpStatus.available && !!process.env.DEEPGRAM_API_KEY,
              fullCoverage: Object.values(healthCheck).every(status => status === 'available' || status === 'configured')
            }
          }
        })

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use ?action=stats or ?action=health'
        }, { status: 400 })
    }

  } catch (error) {
    console.error('❌ API GET error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
} 