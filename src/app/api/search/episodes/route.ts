import { NextRequest, NextResponse } from 'next/server'
import { YouTubeSearchService } from '@/lib/services/youtube-search-service'

interface EpisodeSearchResult {
  id: string
  title: string
  description: string
  host?: string
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

    // Use YouTube API to search for podcast episodes
    const youtubeService = new YouTubeSearchService()
    const searchResults = await youtubeService.searchPodcasts(searchTerm, {
      limit: 10,
      videoDuration: 'long', // Focus on longer content for podcasts
      order: 'relevance'
    })

    // Transform results to match frontend expectations
    const results: EpisodeSearchResult[] = searchResults.map(video => ({
      id: video.videoId,
      title: video.title,
      description: video.description,
      host: video.channelTitle,
      image: video.thumbnails.medium,
      videoId: video.videoId,
      channelTitle: video.channelTitle,
      channelId: video.channelId,
      duration: video.duration,
      viewCount: video.viewCount,
      publishedAt: video.publishedAt,
    }))

    console.log(`🔍 Episode search for "${searchTerm}" returned ${results.length} episodes from YouTube`)

    return NextResponse.json({
      success: true,
      results,
      query: searchTerm,
      total: results.length,
      source: 'youtube',
      type: 'episodes'
    })
  } catch (error) {
    console.error('Episode search error:', error)
    
    // Return empty results on error for graceful degradation
    return NextResponse.json({
      success: true,
      results: [],
      query: '',
      total: 0,
      error: 'Episode search temporarily unavailable'
    })
  }
} 