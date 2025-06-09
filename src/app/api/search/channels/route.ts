import { NextRequest, NextResponse } from 'next/server'
import { YouTubeSearchService, YouTubeChannelResult } from '@/lib/services/youtube-search-service'

interface ChannelSearchResult {
  id: string
  title: string
  description: string
  subscriberCount?: number
  videoCount?: number
  image?: string
  channelId: string
  publishedAt: string
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameter' },
        { status: 400 }
      )
    }

    const searchTerm = query.toLowerCase().trim()

    // Use YouTube API to search for podcast channels
    const youtubeService = new YouTubeSearchService()
    const searchResults = await youtubeService.searchChannels(searchTerm, {
      limit: 10
    })

    // Transform results to match frontend expectations
    const results: ChannelSearchResult[] = searchResults.map(channel => ({
      id: channel.channelId,
      title: channel.title,
      description: channel.description,
      subscriberCount: channel.subscriberCount,
      videoCount: channel.videoCount,
      image: channel.thumbnails.medium,
      channelId: channel.channelId,
      publishedAt: channel.publishedAt,
    }))

    console.log(`🔍 Channel search for "${searchTerm}" returned ${results.length} channels from YouTube`)

    return NextResponse.json({
      success: true,
      results,
      query: searchTerm,
      total: results.length,
      source: 'youtube',
      type: 'channels'
    })
  } catch (error) {
    console.error('Channel search error:', error)
    
    // Return empty results on error for graceful degradation
    return NextResponse.json({
      success: true,
      results: [],
      query: '',
      total: 0,
      error: 'Channel search temporarily unavailable'
    })
  }
} 