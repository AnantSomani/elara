import { NextResponse } from 'next/server'
import { YouTubeSearchService } from '@/lib/services/youtube-search-service'

export async function GET() {
  try {
    const youtubeService = new YouTubeSearchService()
    
    // Get popular podcast-style videos from YouTube
    const popularVideos = await youtubeService.searchPodcasts('podcast', {
      limit: 12, // Show 12 popular videos
      order: 'viewCount' // Sort by view count for popular content
    })

    // Transform to match the expected frontend format
    const transformedPodcasts = popularVideos.map(video => ({
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

    console.log(`🏆 Fetched ${transformedPodcasts.length} popular videos from YouTube`)

    return NextResponse.json({
      success: true,
      podcasts: transformedPodcasts
    })
  } catch (error) {
    console.error('Error fetching popular podcasts:', error)
    
    // Return empty array on error for graceful degradation
    return NextResponse.json({
      success: true,
      podcasts: [],
      error: 'Unable to fetch popular podcasts at this time'
    })
  }
} 