import { NextRequest, NextResponse } from 'next/server'
import { YouTubeUrlParser } from '@/lib/utils/youtube-url-parser'

interface ParseUrlRequest {
  url: string
}

interface ParseUrlResponse {
  success: boolean
  result?: {
    isValid: boolean
    videoId: string | null
    originalUrl: string
    parsedUrl?: string
    metadata?: {
      timestamp?: number
      playlist?: string
      format: 'standard' | 'short' | 'embed' | 'mobile'
    }
  }
  error?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<ParseUrlResponse>> {
  try {
    const body: ParseUrlRequest = await request.json()
    
    // Validate request body
    if (!body || typeof body.url !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Invalid request body. Expected { url: string }'
      }, { status: 400 })
    }

    const { url } = body
    
    // Basic security check - ensure URL length is reasonable
    if (url.length > 2048) {
      return NextResponse.json({
        success: false,
        error: 'URL too long. Maximum length is 2048 characters'
      }, { status: 400 })
    }

    // Parse the URL using our service
    const result = YouTubeUrlParser.parseUrl(url)
    
    // Log for analytics (be careful with PII in production)
    console.log(`🔍 URL parse request: ${result.isValid ? '✅' : '❌'} ${url.substring(0, 100)}...`)

    // Additional validation: if we have a video ID, verify it's not obviously malicious
    if (result.videoId && !YouTubeUrlParser.validateVideoId(result.videoId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid video ID format detected'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      result
    })

  } catch (error) {
    console.error('YouTube URL parse error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to parse URL. Please check the format and try again.'
    }, { status: 500 })
  }
}

// GET endpoint for quick validation without body
export async function GET(request: NextRequest): Promise<NextResponse<ParseUrlResponse>> {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')
    
    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'Missing url parameter'
      }, { status: 400 })
    }

    // Reuse POST logic
    const result = YouTubeUrlParser.parseUrl(url)
    
    return NextResponse.json({
      success: true,
      result
    })

  } catch (error) {
    console.error('YouTube URL parse error (GET):', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to parse URL'
    }, { status: 500 })
  }
} 