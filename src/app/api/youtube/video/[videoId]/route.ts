import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params
    const apiKey = process.env.YOUTUBE_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'YouTube API key not configured' },
        { status: 500 }
      )
    }

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'Video ID is required' },
        { status: 400 }
      )
    }

    // Fetch video details from YouTube API
    const url = `https://www.googleapis.com/youtube/v3/videos?` + new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: videoId,
      key: apiKey,
    })

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`YouTube API request failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.items || data.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      )
    }

    const videoData = data.items[0]
    const snippet = videoData.snippet
    const contentDetails = videoData.contentDetails
    const statistics = videoData.statistics

    // Transform to our video format
    const video = {
      id: videoData.id,
      title: snippet.title,
      description: snippet.description || '',
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
      duration: contentDetails.duration,
      viewCount: parseInt(statistics.viewCount || '0'),
      publishedAt: snippet.publishedAt,
      thumbnails: {
        default: snippet.thumbnails?.default?.url || '',
        medium: snippet.thumbnails?.medium?.url || '',
        high: snippet.thumbnails?.high?.url || '',
        maxres: snippet.thumbnails?.maxres?.url || '',
      },
      tags: snippet.tags || []
    }

    console.log(`✅ Fetched video details for: ${video.title}`)

    return NextResponse.json({
      success: true,
      video
    })

  } catch (error) {
    console.error('YouTube video API error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch video details',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 