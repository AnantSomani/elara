import { YoutubeTranscript } from 'youtube-transcript'
import type { YouTubeTranscript as IYouTubeTranscript, YouTubeTranscriptResult } from '@/types/youtube-chat'

export class YouTubeTranscriptService {
  private static instance: YouTubeTranscriptService
  private cache: Map<string, YouTubeTranscriptResult> = new Map()
  private readonly CACHE_TTL = 30 * 60 * 1000 // 30 minutes

  static getInstance(): YouTubeTranscriptService {
    if (!YouTubeTranscriptService.instance) {
      YouTubeTranscriptService.instance = new YouTubeTranscriptService()
    }
    return YouTubeTranscriptService.instance
  }

  async fetchTranscript(videoId: string): Promise<YouTubeTranscriptResult | null> {
    try {
      // Check cache first
      const cached = this.cache.get(videoId)
      if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
        console.log(`✅ Using cached transcript for ${videoId}`)
        return cached
      }

      console.log(`🔍 Fetching transcript for video: ${videoId}`)
      
      // Try multiple methods to get transcript
      const transcript = await this.tryMultipleMethods(videoId)
      
      if (transcript && transcript.length > 0) {
        const result: YouTubeTranscriptResult = {
          videoId,
          transcript,
          isAvailable: true,
          fetchedAt: Date.now()
        }
        
        // Cache the result
        this.cache.set(videoId, result)
        console.log(`✅ Successfully fetched transcript for ${videoId} (${transcript.length} segments)`)
        return result
      }

      // No transcript available
      const emptyResult: YouTubeTranscriptResult = {
        videoId,
        transcript: [],
        isAvailable: false,
        fetchedAt: Date.now()
      }
      
      this.cache.set(videoId, emptyResult)
      console.log(`❌ No transcript available for ${videoId}`)
      return emptyResult

    } catch (error) {
      console.error(`❌ Error fetching transcript for ${videoId}:`, error)
      return null
    }
  }

  async checkTranscriptAvailability(videoId: string): Promise<boolean> {
    try {
      const result = await this.fetchTranscript(videoId)
      return result?.isAvailable || false
    } catch (error) {
      console.error(`Error checking transcript availability for ${videoId}:`, error)
      return false
    }
  }

  private async tryMultipleMethods(videoId: string): Promise<IYouTubeTranscript[]> {
    const methods = [
      () => this.fetchWithYouTubeTranscript(videoId),
      () => this.fetchWithYouTubeTranscriptLang(videoId, 'en'),
      () => this.fetchWithYouTubeTranscriptAuto(videoId)
    ]

    for (const method of methods) {
      try {
        const result = await method()
        if (result && result.length > 0) {
          return result
        }
      } catch (error) {
        console.log(`Method failed, trying next...`, error instanceof Error ? error.message : String(error))
        continue
      }
    }

    return []
  }

  private async fetchWithYouTubeTranscript(videoId: string): Promise<IYouTubeTranscript[]> {
    try {
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId)
      return rawTranscript.map(item => ({
        text: item.text,
        start: item.offset / 1000, // Convert to seconds
        duration: item.duration / 1000 // Convert to seconds
      }))
    } catch (error) {
      throw new Error(`YouTube Transcript API failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async fetchWithYouTubeTranscriptLang(videoId: string, lang: string): Promise<IYouTubeTranscript[]> {
    try {
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: lang
      })
      return rawTranscript.map(item => ({
        text: item.text,
        start: item.offset / 1000,
        duration: item.duration / 1000
      }))
    } catch (error) {
      throw new Error(`YouTube Transcript with language failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async fetchWithYouTubeTranscriptAuto(videoId: string): Promise<IYouTubeTranscript[]> {
    try {
      // Try with auto-generated captions
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'en'
      })
      return rawTranscript.map(item => ({
        text: item.text,
        start: item.offset / 1000,
        duration: item.duration / 1000
      }))
    } catch (error) {
      throw new Error(`YouTube auto-generated transcript failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Helper method to get full transcript as text
  getFullTranscriptText(transcript: IYouTubeTranscript[]): string {
    return transcript.map(item => item.text).join(' ')
  }

  // Helper method to search transcript for specific time ranges
  getTranscriptAtTime(transcript: IYouTubeTranscript[], startTime: number, endTime: number): string {
    return transcript
      .filter(item => item.start >= startTime && item.start <= endTime)
      .map(item => item.text)
      .join(' ')
  }

  // Clean up old cache entries
  private cleanupCache(): void {
    const now = Date.now()
    for (const [videoId, result] of this.cache.entries()) {
      if (now - result.fetchedAt > this.CACHE_TTL) {
        this.cache.delete(videoId)
      }
    }
  }

  // Get cache stats (for debugging)
  getCacheStats(): { size: number, entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }
} 