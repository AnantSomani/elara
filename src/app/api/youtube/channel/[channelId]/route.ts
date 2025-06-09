import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const { channelId } = params
    const apiKey = process.env.YOUTUBE_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'YouTube API key not configured' },
        { status: 500 }
      )
    }

    if (!channelId) {
      return NextResponse.json(
        { success: false, error: 'Channel ID is required' },
        { status: 400 }
      )
    }

    // Fetch channel details from YouTube API
    const url = `https://www.googleapis.com/youtube/v3/channels?` + new URLSearchParams({
      part: 'snippet,statistics',
      id: channelId,
      key: apiKey,
    })

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`YouTube API request failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.items || data.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      )
    }

    const channelData = data.items[0]
    const snippet = channelData.snippet
    const statistics = channelData.statistics

    // Transform to our channel format
    const channel = {
      id: channelData.id,
      title: snippet.title,
      description: snippet.description || '',
      subscriberCount: parseInt(statistics.subscriberCount || '0'),
      videoCount: parseInt(statistics.videoCount || '0'),
      publishedAt: snippet.publishedAt,
      thumbnails: {
        default: snippet.thumbnails?.default?.url || '',
        medium: snippet.thumbnails?.medium?.url || '',
        high: snippet.thumbnails?.high?.url || '',
      }
    }

    console.log(`✅ Fetched channel details for: ${channel.title}`)

    return NextResponse.json({
      success: true,
      channel
    })

  } catch (error) {
    console.error('YouTube channel API error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch channel details',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 