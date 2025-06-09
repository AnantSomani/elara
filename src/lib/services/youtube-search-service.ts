interface YouTubeSearchResult {
  id: string
  title: string
  description: string
  channelTitle: string
  channelId: string
  videoId: string
  duration: string
  viewCount?: number
  publishedAt: string
  thumbnails: {
    default: string
    medium: string
    high: string
  }
}

export interface YouTubeChannelResult {
  id: string
  channelId: string
  title: string
  description: string
  subscriberCount?: number
  videoCount?: number
  publishedAt: string
  thumbnails: {
    default: string
    medium: string
    high: string
  }
}

import { searchCache } from './search-cache'

interface SearchOptions {
  limit?: number
  order?: 'relevance' | 'date' | 'viewCount' | 'rating'
  videoDuration?: 'any' | 'short' | 'medium' | 'long'
  type?: 'video' | 'channel' | 'all'
  publishedAfter?: string // ISO 8601 date
}

export class YouTubeSearchService {
  private apiKey: string
  private baseUrl = 'https://www.googleapis.com/youtube/v3'

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || ''
    if (!this.apiKey) {
      throw new Error('YOUTUBE_API_KEY is required')
    }
  }

  /**
   * Search for YouTube videos/podcasts
   */
  async searchVideos(query: string, options: SearchOptions = {}): Promise<YouTubeSearchResult[]> {
    const {
      limit = 10,
      order = 'relevance',
      videoDuration = 'long' // Prefer longer videos for podcast content
    } = options

    // Check cache first
    const cacheKey = `videos:${query}:${JSON.stringify(options)}`
    const cached = searchCache.get(cacheKey)
    if (cached) {
      console.log(`🎯 Cache hit for videos: "${query}"`)
      return cached
    }

    try {
      // Step 1: Search for videos
      const searchUrl = `${this.baseUrl}/search?` + new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: limit.toString(),
        order,
        videoDuration,
        key: this.apiKey,
      })

      const searchResponse = await fetch(searchUrl)
      if (!searchResponse.ok) {
        throw new Error(`YouTube search failed: ${searchResponse.status}`)
      }

      const searchData = await searchResponse.json()
      
      if (!searchData.items || searchData.items.length === 0) {
        return []
      }

      // Step 2: Get video details (duration, view count, etc.)
      const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',')
      const detailsUrl = `${this.baseUrl}/videos?` + new URLSearchParams({
        part: 'contentDetails,statistics',
        id: videoIds,
        key: this.apiKey,
      })

      const detailsResponse = await fetch(detailsUrl)
      const detailsData = await detailsResponse.json()

      // Step 3: Combine search results with details
      const results: YouTubeSearchResult[] = searchData.items.map((item: any, index: number) => {
        const details = detailsData.items?.[index]
        
        return {
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          videoId: item.id.videoId,
          duration: details?.contentDetails?.duration || 'Unknown',
          viewCount: details?.statistics?.viewCount ? parseInt(details.statistics.viewCount) : undefined,
          publishedAt: item.snippet.publishedAt,
          thumbnails: {
            default: item.snippet.thumbnails?.default?.url || '',
            medium: item.snippet.thumbnails?.medium?.url || '',
            high: item.snippet.thumbnails?.high?.url || '',
          }
        }
      })

      console.log(`🔍 YouTube search for "${query}" returned ${results.length} videos`)
      
      // Cache the results
      searchCache.set(cacheKey, results)
      
      return results

    } catch (error) {
      console.error('YouTube search error:', error)
      throw new Error(`YouTube search failed: ${error}`)
    }
  }

  /**
   * Search specifically for podcast content on YouTube
   */
  async searchPodcasts(query: string, options: SearchOptions = {}): Promise<YouTubeSearchResult[]> {
    // Enhance query for podcast content
    const podcastQuery = `${query} podcast OR episode OR interview`
    
    return this.searchVideos(podcastQuery, {
      ...options,
      videoDuration: 'long', // Podcasts are typically long-form
      order: 'relevance'
    })
  }

  /**
   * Search for YouTube channels (podcast shows)
   */
  async searchChannels(query: string, options: SearchOptions = {}): Promise<YouTubeChannelResult[]> {
    const {
      limit = 10,
      order = 'relevance'
    } = options

    // Check cache first
    const cacheKey = `channels:${query}:${JSON.stringify(options)}`
    const cached = searchCache.get(cacheKey)
    if (cached) {
      console.log(`🎯 Cache hit for channels: "${query}"`)
      return cached
    }

    try {
      // Search for channels
      const searchUrl = `${this.baseUrl}/search?` + new URLSearchParams({
        part: 'snippet',
        q: `${query} podcast`,
        type: 'channel',
        maxResults: limit.toString(),
        order,
        key: this.apiKey,
      })

      const searchResponse = await fetch(searchUrl)
      if (!searchResponse.ok) {
        throw new Error(`YouTube channel search failed: ${searchResponse.status}`)
      }

      const searchData = await searchResponse.json()
      
      if (!searchData.items || searchData.items.length === 0) {
        return []
      }

      // Get channel statistics
      const channelIds = searchData.items.map((item: any) => item.id.channelId).join(',')
      const statsUrl = `${this.baseUrl}/channels?` + new URLSearchParams({
        part: 'statistics',
        id: channelIds,
        key: this.apiKey,
      })

      const statsResponse = await fetch(statsUrl)
      const statsData = await statsResponse.json()

      // Combine search results with statistics
      const results: YouTubeChannelResult[] = searchData.items.map((item: any, index: number) => {
        const stats = statsData.items?.[index]
        
        return {
          id: item.id.channelId,
          channelId: item.id.channelId,
          title: item.snippet.title,
          description: item.snippet.description,
          subscriberCount: stats?.statistics?.subscriberCount ? parseInt(stats.statistics.subscriberCount) : undefined,
          videoCount: stats?.statistics?.videoCount ? parseInt(stats.statistics.videoCount) : undefined,
          publishedAt: item.snippet.publishedAt,
          thumbnails: {
            default: item.snippet.thumbnails?.default?.url || '',
            medium: item.snippet.thumbnails?.medium?.url || '',
            high: item.snippet.thumbnails?.high?.url || '',
          }
        }
      })

      console.log(`🔍 YouTube channel search for "${query}" returned ${results.length} channels`)
      
      // Cache the results
      searchCache.set(cacheKey, results)
      
      return results

    } catch (error) {
      console.error('YouTube channel search error:', error)
      throw new Error(`YouTube channel search failed: ${error}`)
    }
  }

  /**
   * Search for episodes (videos) within a specific channel
   */
  async searchChannelEpisodes(channelId: string, options: SearchOptions = {}): Promise<YouTubeSearchResult[]> {
    const {
      limit = 10,
      order = 'date' // Default to recent episodes
    } = options

    try {
      const searchUrl = `${this.baseUrl}/search?` + new URLSearchParams({
        part: 'snippet',
        channelId: channelId,
        type: 'video',
        maxResults: limit.toString(),
        order,
        key: this.apiKey,
      })

      const searchResponse = await fetch(searchUrl)
      if (!searchResponse.ok) {
        throw new Error(`YouTube channel episodes search failed: ${searchResponse.status}`)
      }

      const searchData = await searchResponse.json()
      
      if (!searchData.items || searchData.items.length === 0) {
        return []
      }

      // Get video details
      const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',')
      const detailsUrl = `${this.baseUrl}/videos?` + new URLSearchParams({
        part: 'contentDetails,statistics',
        id: videoIds,
        key: this.apiKey,
      })

      const detailsResponse = await fetch(detailsUrl)
      const detailsData = await detailsResponse.json()

      // Combine results
      const results: YouTubeSearchResult[] = searchData.items.map((item: any, index: number) => {
        const details = detailsData.items?.[index]
        
        return {
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          videoId: item.id.videoId,
          duration: details?.contentDetails?.duration || 'Unknown',
          viewCount: details?.statistics?.viewCount ? parseInt(details.statistics.viewCount) : undefined,
          publishedAt: item.snippet.publishedAt,
          thumbnails: {
            default: item.snippet.thumbnails?.default?.url || '',
            medium: item.snippet.thumbnails?.medium?.url || '',
            high: item.snippet.thumbnails?.high?.url || '',
          }
        }
      })

      console.log(`🔍 Found ${results.length} episodes in channel ${channelId}`)
      return results

    } catch (error) {
      console.error('YouTube channel episodes search error:', error)
      throw new Error(`YouTube channel episodes search failed: ${error}`)
    }
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId: string) {
    try {
      const url = `${this.baseUrl}/channels?` + new URLSearchParams({
        part: 'snippet,statistics',
        id: channelId,
        key: this.apiKey,
      })

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Channel info request failed: ${response.status}`)
      }

      const data = await response.json()
      return data.items?.[0] || null
    } catch (error) {
      console.error('Channel info error:', error)
      return null
    }
  }

  /**
   * Convert YouTube duration format (PT1H2M3S) to readable format
   */
  private formatDuration(duration: string): string {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 'Unknown'

    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  }
} 