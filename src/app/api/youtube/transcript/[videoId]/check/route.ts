import { NextRequest, NextResponse } from 'next/server'

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

    // Call our Python backend service to process the video
    const backendResponse = await fetch('http://localhost:8001/transcripts/from-youtube/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        youtube_url: `https://www.youtube.com/watch?v=${videoId}`
      })
    })

    if (backendResponse.ok) {
      const data = await backendResponse.json()
      console.log(`✅ Backend processed video: ${data.message}`)
      
      return NextResponse.json({
        success: true,
        available: data.success,
        videoId,
        message: data.message
      })
    } else {
      const errorData = await backendResponse.json()
      console.error(`❌ Backend error: ${errorData.detail}`)
      
      return NextResponse.json({
        success: true,
        available: false,
        videoId,
        error: errorData.detail
      })
    }

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