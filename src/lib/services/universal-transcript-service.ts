import { YoutubeTranscript } from 'youtube-transcript'
import { supabaseAdmin } from '@/lib/database/supabase'
import type { YouTubeTranscript, YouTubeTranscriptResult } from '@/types/youtube-chat'
import { YouTubeAudioExtractor } from './youtube-audio-extractor'

interface DeepgramConfig {
  apiKey: string
  model: string
  language: string
  punctuate: boolean
  diarize: boolean
}

interface UniversalTranscriptResult {
  videoId: string
  transcript: YouTubeTranscript[]
  source: 'youtube' | 'deepgram' | 'cache'
  isAvailable: boolean
  cost: number
  processingTime: number
  fetchedAt: number
}

export class UniversalTranscriptService {
  private static instance: UniversalTranscriptService
  private cache: Map<string, UniversalTranscriptResult> = new Map()
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
  private deepgramConfig: DeepgramConfig
  private audioExtractor: YouTubeAudioExtractor

  constructor() {
    this.deepgramConfig = {
      apiKey: process.env.DEEPGRAM_API_KEY || '',
      model: 'nova-2',
      language: 'en',
      punctuate: true,
      diarize: true
    }
    this.audioExtractor = YouTubeAudioExtractor.getInstance()
  }

  static getInstance(): UniversalTranscriptService {
    if (!UniversalTranscriptService.instance) {
      UniversalTranscriptService.instance = new UniversalTranscriptService()
    }
    return UniversalTranscriptService.instance
  }

  /**
   * Main entry point: Get transcript using hybrid approach
   */
  async getTranscript(videoId: string): Promise<UniversalTranscriptResult | null> {
    const startTime = Date.now()
    
    try {
      console.log(`🔍 Getting transcript for video: ${videoId}`)

      // Step 1: Check database cache first
      const cachedResult = await this.checkDatabaseCache(videoId)
      if (cachedResult) {
        console.log(`✅ Found cached transcript for ${videoId}`)
        return {
          ...cachedResult,
          source: 'cache',
          processingTime: Date.now() - startTime
        }
      }

      // Step 2: Try YouTube captions (free)
      console.log(`🎥 Trying YouTube captions for ${videoId}`)
      const youtubeResult = await this.tryYouTubeCaptions(videoId)
      
      if (youtubeResult.isAvailable && youtubeResult.transcript.length > 0) {
        console.log(`✅ Got YouTube captions for ${videoId} (${youtubeResult.transcript.length} segments)`)
        
        const result: UniversalTranscriptResult = {
          videoId,
          transcript: youtubeResult.transcript,
          source: 'youtube',
          isAvailable: true,
          cost: 0.0, // Free!
          processingTime: Date.now() - startTime,
          fetchedAt: Date.now()
        }
        
        // Cache the result in database
        await this.cacheToDatabaseBackground(result)
        return result
      }

      // Step 3: Fallback to Deepgram transcription
      console.log(`🎙️ YouTube captions not available, using Deepgram for ${videoId}`)
      const deepgramResult = await this.transcribeWithDeepgram(videoId)
      
      if (deepgramResult) {
        console.log(`✅ Got Deepgram transcription for ${videoId} (${deepgramResult.transcript.length} segments)`)
        
        const result: UniversalTranscriptResult = {
          videoId,
          transcript: deepgramResult.transcript,
          source: 'deepgram',
          isAvailable: true,
          cost: deepgramResult.cost,
          processingTime: Date.now() - startTime,
          fetchedAt: Date.now()
        }
        
        // Cache the result in database
        await this.cacheToDatabaseBackground(result)
        return result
      }

      // Step 4: No transcript available
      console.log(`❌ No transcript available for ${videoId}`)
      const emptyResult: UniversalTranscriptResult = {
        videoId,
        transcript: [],
        source: 'youtube',
        isAvailable: false,
        cost: 0.0,
        processingTime: Date.now() - startTime,
        fetchedAt: Date.now()
      }
      
      // Cache the negative result to avoid retrying
      await this.cacheToDatabaseBackground(emptyResult)
      return emptyResult

    } catch (error) {
      console.error(`❌ Error getting transcript for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Check if transcript exists in database cache
   */
  private async checkDatabaseCache(videoId: string): Promise<UniversalTranscriptResult | null> {
    try {
      // Check if video exists and has processed embeddings
      const { data: video, error } = await supabaseAdmin()
        .from('youtube_videos')
        .select(`
          id,
          transcript_processed,
          last_processed_at,
          youtube_video_embeddings(count)
        `)
        .eq('id', videoId)
        .single()

      if (error || !video || !video.transcript_processed) {
        return null
      }

      // Get the cached transcript from embeddings
      const { data: embeddings, error: embeddingsError } = await supabaseAdmin()
        .from('youtube_video_embeddings')
        .select('segment_text, segment_start, segment_end, chunk_index')
        .eq('video_id', videoId)
        .order('chunk_index')

      if (embeddingsError || !embeddings || embeddings.length === 0) {
        return null
      }

      // Reconstruct transcript from embeddings
      const transcript: YouTubeTranscript[] = embeddings.map(embedding => ({
        text: embedding.segment_text,
        start: embedding.segment_start,
        duration: embedding.segment_end - embedding.segment_start
      }))

      return {
        videoId,
        transcript,
        source: 'cache',
        isAvailable: true,
        cost: 0.0, // No cost for cached results
        processingTime: 0,
        fetchedAt: Date.parse(video.last_processed_at) || Date.now()
      }

    } catch (error) {
      console.error('Error checking database cache:', error)
      return null
    }
  }

  /**
   * Try to get YouTube captions
   */
  private async tryYouTubeCaptions(videoId: string): Promise<YouTubeTranscriptResult> {
    try {
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId)
      
      if (rawTranscript && rawTranscript.length > 0) {
        const transcript: YouTubeTranscript[] = rawTranscript.map(item => ({
          text: item.text,
          start: item.offset / 1000, // Convert to seconds
          duration: item.duration / 1000 // Convert to seconds
        }))

        return {
          videoId,
          transcript,
          isAvailable: true,
          fetchedAt: Date.now()
        }
      }

      return {
        videoId,
        transcript: [],
        isAvailable: false,
        fetchedAt: Date.now()
      }

    } catch (error) {
      console.log(`YouTube captions failed for ${videoId}:`, error instanceof Error ? error.message : String(error))
      return {
        videoId,
        transcript: [],
        isAvailable: false,
        fetchedAt: Date.now()
      }
    }
  }

  /**
   * Transcribe using Deepgram
   */
  private async transcribeWithDeepgram(videoId: string): Promise<{
    transcript: YouTubeTranscript[]
    cost: number
  } | null> {
    try {
      // Step 1: Get video metadata to calculate costs
      const videoMetadata = await this.getVideoMetadata(videoId)
      if (!videoMetadata) {
        throw new Error('Could not get video metadata')
      }

      // Step 2: Extract audio URL
      const audioUrl = await this.extractAudioUrl(videoId)
      if (!audioUrl) {
        throw new Error('Could not extract audio URL')
      }

      // Step 3: Transcribe with Deepgram
      const transcriptData = await this.callDeepgramAPI(audioUrl, videoMetadata.duration)
      
      // Step 4: Convert to our format
      const transcript: YouTubeTranscript[] = transcriptData.results.channels[0].alternatives[0].words?.map((word: any, index: number) => ({
        text: word.word,
        start: word.start,
        duration: word.end - word.start
      })) || []

      // Step 5: Calculate cost (Deepgram charges $0.0043 per minute)
      const durationMinutes = videoMetadata.duration / 60
      const cost = durationMinutes * 0.0043

      console.log(`💰 Deepgram transcription cost: $${cost.toFixed(4)} for ${durationMinutes.toFixed(1)} minutes`)

      return {
        transcript,
        cost
      }

    } catch (error) {
      console.error(`Deepgram transcription failed for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Extract audio URL from YouTube video
   */
  private async extractAudioUrl(videoId: string): Promise<string | null> {
    try {
      console.log(`🎵 Extracting audio URL for ${videoId}`)
      return await this.audioExtractor.extractAudioUrl(videoId)
    } catch (error) {
      console.error(`Failed to extract audio URL for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Get video metadata for cost calculation
   */
  private async getVideoMetadata(videoId: string): Promise<{ duration: number; title: string } | null> {
    try {
      // Try yt-dlp first (more reliable)
      const metadata = await this.audioExtractor.getVideoMetadata(videoId)
      if (metadata) {
        return {
          duration: metadata.duration,
          title: metadata.title
        }
      }

      // Fallback to YouTube Data API
      const apiKey = process.env.YOUTUBE_API_KEY
      if (!apiKey) {
        console.warn('YouTube API key not configured, using yt-dlp only')
        return null
      }

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,snippet&key=${apiKey}`
      )
      
      const data = await response.json()
      
      if (data.items && data.items.length > 0) {
        const video = data.items[0]
        const duration = this.parseDuration(video.contentDetails.duration) // PT15M33S -> 933 seconds
        
        return {
          duration,
          title: video.snippet.title
        }
      }
      
      return null

    } catch (error) {
      console.error(`Failed to get video metadata for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Parse YouTube duration format (PT15M33S) to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0
    
    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0') 
    const seconds = parseInt(match[3] || '0')
    
    return hours * 3600 + minutes * 60 + seconds
  }

  /**
   * Call Deepgram API for transcription
   */
  private async callDeepgramAPI(audioUrl: string, duration: number): Promise<any> {
    try {
      console.log(`🎙️ Calling Deepgram API for ${duration} second audio`)
      
      const response = await fetch('https://api.deepgram.com/v1/listen', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.deepgramConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: audioUrl,
          model: this.deepgramConfig.model,
          language: this.deepgramConfig.language,
          punctuate: this.deepgramConfig.punctuate,
          diarize: this.deepgramConfig.diarize,
          smart_format: true,
          paragraphs: true,
          utterances: true
        })
      })

      if (!response.ok) {
        throw new Error(`Deepgram API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log(`✅ Deepgram transcription completed`)
      
      return result

    } catch (error) {
      console.error('Deepgram API call failed:', error)
      throw error
    }
  }

  /**
   * Cache transcript result to database (background task)
   */
  private async cacheToDatabaseBackground(result: UniversalTranscriptResult): Promise<void> {
    // Run in background, don't block the main response
    setImmediate(async () => {
      try {
        await this.saveTranscriptToDatabase(result)
      } catch (error) {
        console.error('Background caching failed:', error)
      }
    })
  }

  /**
   * Save transcript to database for permanent caching
   */
  private async saveTranscriptToDatabase(result: UniversalTranscriptResult): Promise<void> {
    try {
      // This would integrate with your existing YouTube embeddings system
      // We'll implement this in the next step
      console.log(`💾 Saving transcript to database for ${result.videoId}`)
      
      // Mark video as processed
      await supabaseAdmin()
        .from('youtube_videos')
        .upsert({
          id: result.videoId,
          transcript_processed: result.isAvailable,
          last_processed_at: new Date().toISOString()
        })

    } catch (error) {
      console.error('Failed to save transcript to database:', error)
    }
  }

  /**
   * Get transcript processing statistics
   */
  async getProcessingStats(): Promise<{
    totalProcessed: number
    youtubeCaptions: number
    deepgramTranscriptions: number
    totalCost: number
    avgCostPerVideo: number
  }> {
    try {
      const { data: videos, error } = await supabaseAdmin()
        .from('youtube_videos')
        .select('transcript_source, transcript_cost')
        .eq('transcript_processed', true)

      if (error || !videos) {
        return {
          totalProcessed: 0,
          youtubeCaptions: 0,
          deepgramTranscriptions: 0,
          totalCost: 0,
          avgCostPerVideo: 0
        }
      }

      const stats = videos.reduce((acc, video) => {
        acc.totalProcessed++
        if (video.transcript_source === 'youtube') acc.youtubeCaptions++
        if (video.transcript_source === 'deepgram') acc.deepgramTranscriptions++
        acc.totalCost += video.transcript_cost || 0
        return acc
      }, {
        totalProcessed: 0,
        youtubeCaptions: 0,
        deepgramTranscriptions: 0,
        totalCost: 0
      })

      return {
        ...stats,
        avgCostPerVideo: stats.totalProcessed > 0 ? stats.totalCost / stats.totalProcessed : 0
      }

    } catch (error) {
      console.error('Error getting processing stats:', error)
      return {
        totalProcessed: 0,
        youtubeCaptions: 0,
        deepgramTranscriptions: 0,
        totalCost: 0,
        avgCostPerVideo: 0
      }
    }
  }
} 