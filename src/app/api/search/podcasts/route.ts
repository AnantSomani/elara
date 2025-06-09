import { NextRequest, NextResponse } from 'next/server'
import { YouTubeSearchService } from '@/lib/services/youtube-search-service'

interface SearchResult {
  id: string
  title: string
  description: string
  host?: string
  episodeCount?: number
  image?: string
  videoId: string
  channelTitle: string
  channelId: string
  duration: string
  viewCount?: number
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

    // Use YouTube API to search for podcast videos
    const youtubeService = new YouTubeSearchService()
    const searchResults = await youtubeService.searchPodcasts(searchTerm, {
      limit: 10
    })

    // Transform results to match frontend expectations
    const results: SearchResult[] = searchResults.map(video => ({
      id: video.videoId, // Use YouTube video ID as the ID
      title: video.title,
      description: video.description,
      host: video.channelTitle, // Use channel name as host
      episodeCount: undefined, // Not available for individual videos
      image: video.thumbnails.medium, // Use medium thumbnail
      videoId: video.videoId,
      channelTitle: video.channelTitle,
      channelId: video.channelId,
      duration: video.duration,
      viewCount: video.viewCount,
      publishedAt: video.publishedAt,
    }))

    console.log(`🔍 Search for "${searchTerm}" returned ${results.length} videos from YouTube`)

    return NextResponse.json({
      success: true,
      results,
      query: searchTerm,
      total: results.length,
      source: 'youtube',
      type: 'all'
    })
  } catch (error) {
    console.error('Search error:', error)
    
    // If Listen Notes fails, return empty results rather than error
    // This provides graceful degradation
    return NextResponse.json({
      success: true,
      results: [],
      query: '',
      total: 0,
      error: 'Search temporarily unavailable'
    })
  }
} 