import { generateRAGResponse } from '@/lib/ai/rag-engine'
import { DemandBasedProcessor } from '@/lib/ai/youtube-processor'
import { SessionBasedCache } from '@/lib/services/session-cache'
import type { ConversationContext, AIResponse } from '@/types/conversation'
import type { ProcessedVideo, YouTubeRAGContext } from '@/types/youtube-chat'

export interface ContextSource {
  type: 'podcast' | 'youtube'
  data: any
}

export interface RAGContext {
  source: ContextSource
  processedContent: string
  confidence: number
  cost: number
  metadata: any
}

export interface YouTubeRAGContextResult extends YouTubeRAGContext {
  processedVideo: ProcessedVideo
  relevantSections: string[]
  processingTier: string
}

export class HybridRAGEngine {
  private static instance: HybridRAGEngine
  private youtubeProcessor: DemandBasedProcessor
  private cache: SessionBasedCache

  static getInstance(): HybridRAGEngine {
    if (!HybridRAGEngine.instance) {
      HybridRAGEngine.instance = new HybridRAGEngine()
    }
    return HybridRAGEngine.instance
  }

  constructor() {
    this.youtubeProcessor = DemandBasedProcessor.getInstance()
    this.cache = SessionBasedCache.getInstance()
  }

  async getContextForQuestion(
    question: string, 
    source: ContextSource
  ): Promise<RAGContext> {
    console.log(`🔀 Hybrid RAG processing: ${source.type} source`)

    if (source.type === 'podcast') {
      return await this.getPodcastContext(question, source.data)
    } else if (source.type === 'youtube') {
      return await this.getYouTubeContext(question, source.data)
    }

    throw new Error(`Unsupported source type: ${source.type}`)
  }

  private async getPodcastContext(
    question: string, 
    podcastData: any
  ): Promise<RAGContext> {
    console.log(`🎙️ Processing podcast context for: ${podcastData.episodeId}`)

    try {
      // Use existing podcast RAG system
      const conversationContext: ConversationContext = {
        episodeId: podcastData.episodeId,
        hostId: podcastData.hostId || 'default',
        currentTimestamp: Date.now(),
        recentTranscription: [],
        conversationHistory: [],
        hostPersonality: podcastData.hostPersonality || {
          name: podcastData.host || 'Host',
          style: 'Podcast host style',
          traits: ['knowledgeable', 'engaging'],
          knowledge: {
            topics: [],
            recurring_themes: [],
            opinions: {},
            past_statements: []
          }
        },
        episodeMetadata: {
          title: podcastData.episodeTitle,
          description: podcastData.description || '',
          duration: 3600, // Default duration
          publishDate: new Date().toISOString()
        }
      }

      const ragResponse = await generateRAGResponse(question, conversationContext)

      return {
        source: { type: 'podcast', data: podcastData },
        processedContent: ragResponse.message,
        confidence: ragResponse.confidence,
        cost: 0.005, // Estimated podcast RAG cost
        metadata: {
          episodeId: podcastData.episodeId,
          contextUsed: ragResponse.contextUsed,
          responseTime: ragResponse.responseTime
        }
      }
    } catch (error) {
      console.error('Podcast RAG processing failed:', error)
      
      return {
        source: { type: 'podcast', data: podcastData },
        processedContent: `I can help you discuss this podcast episode: "${podcastData.episodeTitle}" with ${podcastData.host}. What would you like to know?`,
        confidence: 0.3,
        cost: 0.001,
        metadata: { error: 'Fallback response' }
      }
    }
  }

  private async getYouTubeContext(
    question: string, 
    youtubeData: {
      videoId: string
      videoTitle: string
      channelTitle: string
      duration: string
      description?: string
      viewCount?: number
    }
  ): Promise<RAGContext> {
    console.log(`📺 Processing YouTube context for: ${youtubeData.videoId}`)

    try {
      // Use demand-based processor for YouTube videos
      const processedVideo = await this.youtubeProcessor.processForQuestion(
        youtubeData.videoId,
        question,
        {
          title: youtubeData.videoTitle,
          channelTitle: youtubeData.channelTitle,
          duration: youtubeData.duration,
          description: youtubeData.description
        }
      )

      // Generate contextual response
      const contextualResponse = await this.generateYouTubeResponse(
        question,
        processedVideo
      )

      return {
        source: { type: 'youtube', data: youtubeData },
        processedContent: contextualResponse.response,
        confidence: contextualResponse.confidence,
        cost: processedVideo.cost + contextualResponse.cost,
        metadata: {
          videoId: youtubeData.videoId,
          hasTranscript: !!processedVideo.transcript,
          processingTier: processedVideo.isProcessed ? 'standard' : 'basic',
          processedAt: processedVideo.processedAt
        }
      }
    } catch (error) {
      console.error('YouTube RAG processing failed:', error)
      
      return {
        source: { type: 'youtube', data: youtubeData },
        processedContent: `I can help you discuss this YouTube video: "${youtubeData.videoTitle}" by ${youtubeData.channelTitle}. What would you like to know?`,
        confidence: 0.3,
        cost: 0.001,
        metadata: { error: 'Fallback response' }
      }
    }
  }

  private async generateYouTubeResponse(
    question: string,
    processedVideo: ProcessedVideo
  ): Promise<{ response: string, confidence: number, cost: number }> {
    
    if (!processedVideo.transcript) {
      // No transcript available - general response
      const prompt = `
You are Elara, an AI assistant. A user is asking about a YouTube video that doesn't have captions available.

Video: "${processedVideo.title}" by ${processedVideo.channelTitle}
Duration: ${processedVideo.duration}
Question: ${question}

Provide a helpful response explaining that while you can't analyze the video content specifically, you can help with general questions about the topic or channel. Be friendly and offer alternatives.
`

      try {
        const openai = new (await import('openai')).default({
          apiKey: process.env.OPENAI_API_KEY
        })
        
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.7
        })
        
        const response = completion.choices[0]?.message?.content || 
          `I'd love to help with "${question}" about this video, but it doesn't have captions available for analysis.`

        return {
          response,
          confidence: 0.6,
          cost: 0.002
        }
      } catch (error) {
        return {
          response: `I'd love to help you with "${question}" about "${processedVideo.title}" by ${processedVideo.channelTitle}. What specific aspect interests you?`,
          confidence: 0.4,
          cost: 0.001
        }
      }
    }

    // Transcript available - full analysis
    const prompt = `
You are Elara, an AI assistant that helps users understand YouTube videos. You have access to the video transcript.

Video Information:
- Title: ${processedVideo.title}
- Channel: ${processedVideo.channelTitle}
- Duration: ${processedVideo.duration}

Transcript Content:
${processedVideo.processedContext}

User Question: ${question}

Please provide a helpful, accurate response based on the video content. Reference specific parts of the transcript when relevant. Be conversational and engaging, as if you've watched the video yourself.
`

    try {
      const openai = new (await import('openai')).default({
        apiKey: process.env.OPENAI_API_KEY
      })
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.7
      })
      
      const response = completion.choices[0]?.message?.content || 
        `Based on the video "${processedVideo.title}", I can help answer your question about "${question}".`

      return {
        response,
        confidence: 0.8,
        cost: 0.004
      }
    } catch (error) {
      console.error('YouTube response generation failed:', error)
      return {
        response: `I have access to the transcript of "${processedVideo.title}" and can help with "${question}". Could you be more specific about what you'd like to know?`,
        confidence: 0.5,
        cost: 0.001
      }
    }
  }

  async generateResponse(
    question: string, 
    context: RAGContext
  ): Promise<AIResponse> {
    const startTime = Date.now()

    // Response is already generated in the context
    const responseTime = Date.now() - startTime

    return {
      message: context.processedContent,
      confidence: context.confidence,
      responseTime,
      contextUsed: [
        `${context.source.type} content`,
        `Cost: $${context.cost.toFixed(4)}`
      ],
      personality: 'Elara',
      suggestions: this.generateSuggestions(question, context)
    }
  }

  private generateSuggestions(question: string, context: RAGContext): string[] {
    const suggestions: string[] = []

    if (context.source.type === 'youtube') {
      const metadata = context.metadata
      if (metadata.hasTranscript) {
        suggestions.push("Can you tell me more about a specific part?")
        suggestions.push("What's the main takeaway from this video?")
      } else {
        suggestions.push("Can you help with general questions about this topic?")
        suggestions.push("What other videos might cover this subject?")
      }
      suggestions.push("How does this compare to similar content?")
    } else if (context.source.type === 'podcast') {
      suggestions.push("What else was discussed in this episode?")
      suggestions.push("Can you give me a specific example?")
      suggestions.push("How does this relate to other episodes?")
    }

    return suggestions.slice(0, 3)
  }

  // Get hybrid engine statistics
  getHybridStats(): {
    totalQueries: number
    youtubeQueries: number
    podcastQueries: number
    averageCost: number
    cacheEfficiency: number
  } {
    const cacheStats = this.cache.getStats()
    const processingStats = this.youtubeProcessor.getProcessingStats()

    return {
      totalQueries: cacheStats.size + 10, // Estimated total (would track in production)
      youtubeQueries: cacheStats.size,
      podcastQueries: 10, // Estimated (would track in production) 
      averageCost: processingStats.averageCost,
      cacheEfficiency: cacheStats.size > 0 ? 0.75 : 0 // Estimated efficiency
    }
  }
} 