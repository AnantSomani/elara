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

    // Search for videos from this channel
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?` + new URLSearchParams({
      part: 'snippet',
      channelId: channelId,
      type: 'video',
      order: 'date',
      maxResults: '12',
      key: apiKey,
    })

    const searchResponse = await fetch(searchUrl)
    if (!searchResponse.ok) {
      throw new Error(`YouTube search API request failed: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    
    if (!searchData.items || searchData.items.length === 0) {
      return NextResponse.json({
        success: true,
        videos: []
      })
    }

    // Get video IDs for detailed information
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',')
    
    // Fetch detailed video information
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?` + new URLSearchParams({
      part: 'contentDetails,statistics',
      id: videoIds,
      key: apiKey,
    })

    const detailsResponse = await fetch(detailsUrl)
    const detailsData = await detailsResponse.json()

    // Combine search results with video details
    const videos = searchData.items.map((item: any, index: number) => {
      const details = detailsData.items?.[index]
      
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description || '',
        duration: details?.contentDetails?.duration || 'Unknown',
        viewCount: parseInt(details?.statistics?.viewCount || '0'),
        publishedAt: item.snippet.publishedAt,
        thumbnails: {
          default: item.snippet.thumbnails?.default?.url || '',
          medium: item.snippet.thumbnails?.medium?.url || '',
          high: item.snippet.thumbnails?.high?.url || '',
        }
      }
    })

    console.log(`✅ Fetched ${videos.length} videos for channel ${channelId}`)

    return NextResponse.json({
      success: true,
      videos
    })

  } catch (error) {
    console.error('YouTube channel videos API error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch channel videos',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 