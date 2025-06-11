import { YouTubeTranscriptService } from '@/lib/services/youtube-real-time-transcript'
import { SessionBasedCache } from '@/lib/services/session-cache'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { 
  processYouTubeTranscript, 
  searchYouTubeEmbeddings, 
  hasYouTubeEmbeddings 
} from '@/lib/ai/youtube-embeddings'
import type { 
  ProcessedVideo, 
  YouTubeTranscript, 
  YouTubeRAGContext 
} from '@/types/youtube-chat'
import { ProcessingTier } from '@/types/youtube-chat'

export class DemandBasedProcessor {
  private static instance: DemandBasedProcessor
  private transcriptService: YouTubeTranscriptService
  private cache: SessionBasedCache

  static getInstance(): DemandBasedProcessor {
    if (!DemandBasedProcessor.instance) {
      DemandBasedProcessor.instance = new DemandBasedProcessor()
    }
    return DemandBasedProcessor.instance
  }

  constructor() {
    this.transcriptService = YouTubeTranscriptService.getInstance()
    this.cache = SessionBasedCache.getInstance()
  }

  async processForQuestion(
    videoId: string, 
    question: string, 
    videoMetadata: {
      title: string
      channelTitle: string
      duration: string
      description?: string
    }
  ): Promise<ProcessedVideo> {
    console.log(`🔄 Demand-based processing for ${videoId}: "${question}"`)

    // Step 1: Check session cache first
    let processedVideo = await this.cache.getVideoData(videoId)
    
    if (processedVideo) {
      console.log(`✅ Using cached processed video for ${videoId}`)
      return processedVideo
    }

    // Step 2: Determine processing tier based on question and video
    const processingTier = await this.determineProcessingTier(videoId, question, videoMetadata)
    console.log(`📊 Selected processing tier: ${processingTier}`)

    // Step 3: Process according to tier
    switch (processingTier) {
      case ProcessingTier.BASIC:
        processedVideo = await this.basicProcessing(videoId, question, videoMetadata)
        break
      case ProcessingTier.STANDARD:
        processedVideo = await this.standardProcessing(videoId, question, videoMetadata)
        break
      case ProcessingTier.PREMIUM:
        processedVideo = await this.premiumProcessing(videoId, question, videoMetadata)
        break
      default:
        processedVideo = await this.basicProcessing(videoId, question, videoMetadata)
    }

    // Step 4: Cache the result
    await this.cache.set(videoId, processedVideo)
    console.log(`💾 Cached processed video ${videoId} (tier: ${processingTier})`)

    return processedVideo
  }

  async determineProcessingTier(
    videoId: string, 
    question: string, 
    videoMetadata: any
  ): Promise<ProcessingTier> {
    const factors = {
      hasTranscript: false,
      questionComplexity: 0,
      videoDuration: 0,
      channelPopularity: 0
    }

    // Check transcript availability
    factors.hasTranscript = await this.transcriptService.checkTranscriptAvailability(videoId)

    // Analyze question complexity
    factors.questionComplexity = this.analyzeQuestionComplexity(question)

    // Parse video duration (PT3M34S format)
    factors.videoDuration = this.parseDuration(videoMetadata.duration || 'PT0S')

    // Simple channel popularity heuristic (could be enhanced)
    factors.channelPopularity = videoMetadata.viewCount ? Math.min(videoMetadata.viewCount / 1000000, 10) : 1

    console.log(`📊 Processing factors:`, factors)

    // Decision logic
    if (!factors.hasTranscript) {
      return ProcessingTier.BASIC // No transcript = basic tier
    }

    if (factors.questionComplexity >= 7 && factors.videoDuration <= 1800) { // Complex question + short video
      return ProcessingTier.PREMIUM
    }

    if (factors.questionComplexity >= 4 || factors.videoDuration <= 600) { // Medium complexity or short video
      return ProcessingTier.STANDARD
    }

    return ProcessingTier.BASIC
  }

  private analyzeQuestionComplexity(question: string): number {
    const complexityIndicators = {
      // High complexity indicators (3-4 points each)
      'analyze': 4,
      'compare': 4,
      'explain why': 3,
      'what is the relationship': 4,
      'how does this relate': 3,
      'what are the implications': 4,

      // Medium complexity indicators (2-3 points each)
      'explain': 2,
      'describe': 2,
      'tell me about': 2,
      'what do you think': 3,
      'opinion': 2,

      // Low complexity indicators (1 point each)
      'what': 1,
      'who': 1,
      'when': 1,
      'where': 1,
    }

    let score = 0
    const questionLower = question.toLowerCase()

    // Check for complexity indicators
    Object.entries(complexityIndicators).forEach(([indicator, points]) => {
      if (questionLower.includes(indicator)) {
        score += points
      }
    })

    // Additional factors
    if (question.length > 100) score += 2 // Long questions tend to be complex
    if (question.includes('?') && question.split('?').length > 2) score += 2 // Multiple questions
    if (/\b(specific|detailed|thorough)\b/i.test(question)) score += 3 // Requests for detail

    return Math.min(score, 10) // Cap at 10
  }

  private parseDuration(duration: string): number {
    // Convert PT3M34S to seconds
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0

    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')

    return hours * 3600 + minutes * 60 + seconds
  }

  private async basicProcessing(
    videoId: string, 
    question: string, 
    videoMetadata: any
  ): Promise<ProcessedVideo> {
    console.log(`🔹 Basic processing for ${videoId}`)

    return {
      videoId,
      title: videoMetadata.title,
      channelTitle: videoMetadata.channelTitle,
      duration: videoMetadata.duration,
      transcript: null,
      processedContext: `Video: ${videoMetadata.title} by ${videoMetadata.channelTitle}. ${videoMetadata.description || ''}`,
      isProcessed: false,
      processedAt: Date.now(),
      cost: 0.001 // Minimal cost for metadata-only
    }
  }

  private async standardProcessing(
    videoId: string, 
    question: string, 
    videoMetadata: any
  ): Promise<ProcessedVideo> {
    console.log(`🔸 Standard RAG processing for ${videoId}`)

    // Check if embeddings already exist
    const hasEmbeddings = await hasYouTubeEmbeddings(videoId)
    
    if (hasEmbeddings) {
      // Use existing embeddings for semantic search
      console.log(`✅ Found existing embeddings for ${videoId}, using semantic search`)
      
      const relevantSegments = await searchYouTubeEmbeddings(videoId, question, {
        limit: 8,
        threshold: 0.7
      })

      const processedContext = relevantSegments
        .map(segment => `[${Math.floor(segment.segment_start)}s] ${segment.segment_text}`)
        .join('\n\n')

      return {
        videoId,
        title: videoMetadata.title,
        channelTitle: videoMetadata.channelTitle,
        duration: videoMetadata.duration,
        transcript: null, // Not needed when using embeddings
        processedContext,
        isProcessed: true,
        processedAt: Date.now(),
        cost: 0.003 // Much cheaper with existing embeddings
      }
    }

    // First-time processing: fetch transcript and create embeddings
    console.log(`📥 First-time processing for ${videoId}, creating embeddings`)
    
    const transcriptResult = await this.transcriptService.fetchTranscript(videoId)
    
    if (!transcriptResult?.isAvailable) {
      return this.basicProcessing(videoId, question, videoMetadata)
    }

    // Create embeddings for future use
    try {
      await processYouTubeTranscript(videoId, transcriptResult.transcript, {
        videoTitle: videoMetadata.title,
        channelTitle: videoMetadata.channelTitle,
        duration: videoMetadata.duration
      })
      console.log(`✅ Created embeddings for ${videoId}`)
    } catch (embeddingError) {
      console.warn(`⚠️  Failed to create embeddings for ${videoId}, falling back to basic processing:`, embeddingError)
    }

    // Now search the newly created embeddings
    const relevantSegments = await searchYouTubeEmbeddings(videoId, question, {
      limit: 8,
      threshold: 0.7
    })

    const processedContext = relevantSegments.length > 0 
      ? relevantSegments
          .map(segment => `[${Math.floor(segment.segment_start)}s] ${segment.segment_text}`)
          .join('\n\n')
      : `Video: ${videoMetadata.title} by ${videoMetadata.channelTitle}. Transcript available but no relevant segments found for "${question}".`

    return {
      videoId,
      title: videoMetadata.title,
      channelTitle: videoMetadata.channelTitle,
      duration: videoMetadata.duration,
      transcript: transcriptResult.transcript,
      processedContext,
      isProcessed: true,
      processedAt: Date.now(),
      cost: 0.015 // Higher cost for first-time processing (includes embedding creation)
    }
  }

  private async premiumProcessing(
    videoId: string, 
    question: string, 
    videoMetadata: any
  ): Promise<ProcessedVideo> {
    console.log(`🔶 Premium processing for ${videoId}`)

    // Fetch transcript
    const transcriptResult = await this.transcriptService.fetchTranscript(videoId)
    
    if (!transcriptResult?.isAvailable) {
      return this.standardProcessing(videoId, question, videoMetadata)
    }

    // Premium: Full transcript with embeddings
    const fullTranscript = this.transcriptService.getFullTranscriptText(transcriptResult.transcript)
    
    // Extract relevant sections with larger context
    const relevantSections = await this.extractRelevantSections(
      transcriptResult.transcript, 
      question,
      { maxSections: 10, contextWindow: 60 } // Premium limits
    )

    // Generate embeddings for semantic search (premium feature)
    let embeddings: number[][] = []
    try {
      const chunks = this.chunkText(fullTranscript, 512) // Chunk for embeddings
      const embeddingPromises = chunks.slice(0, 3).map(chunk => // Limit to 3 chunks for cost
        generateEmbedding(chunk).catch(() => null)
      )
      const results = await Promise.all(embeddingPromises)
      embeddings = results.filter(e => e !== null) as number[][]
    } catch (error) {
      console.warn('Embedding generation failed, continuing without embeddings:', error)
    }

    const processedContext = `${videoMetadata.title} by ${videoMetadata.channelTitle}\n\nFull transcript: ${fullTranscript}\n\nRelevant sections: ${relevantSections.join(' ')}`

    return {
      videoId,
      title: videoMetadata.title,
      channelTitle: videoMetadata.channelTitle,
      duration: videoMetadata.duration,
      transcript: transcriptResult.transcript,
      processedContext,
      embeddings,
      isProcessed: true,
      processedAt: Date.now(),
      cost: 0.020 // Premium processing cost
    }
  }

  private async extractRelevantSections(
    transcript: YouTubeTranscript[], 
    question: string,
    options: { maxSections: number, contextWindow: number }
  ): Promise<string[]> {
    const questionWords = question.toLowerCase().split(/\s+/).filter(word => word.length > 2)
    const sections: { text: string, relevance: number, start: number }[] = []

    // Simple keyword matching for relevant sections
    for (let i = 0; i < transcript.length; i++) {
      const segment = transcript[i]
      const text = segment.text.toLowerCase()
      
      let relevance = 0
      questionWords.forEach(word => {
        if (text.includes(word)) {
          relevance += 1
        }
      })

      if (relevance > 0) {
        // Include context around relevant segment
        const start = Math.max(0, i - options.contextWindow)
        const end = Math.min(transcript.length, i + options.contextWindow)
        const contextText = transcript.slice(start, end).map(t => t.text).join(' ')
        
        sections.push({
          text: contextText,
          relevance,
          start: segment.start
        })
      }
    }

    // Sort by relevance and return top sections
    return sections
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, options.maxSections)
      .map(section => section.text)
  }

  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = []
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    
    let currentChunk = ''
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = sentence
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence.trim()
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }
    
    return chunks
  }

  // Get processing statistics
  getProcessingStats(): {
    cacheStats: any
    totalVideosProcessed: number
    averageCost: number
  } {
    const cacheStats = this.cache.getStats()
    
    return {
      cacheStats,
      totalVideosProcessed: cacheStats.size,
      averageCost: cacheStats.totalCost / Math.max(cacheStats.size, 1)
    }
  }
} 