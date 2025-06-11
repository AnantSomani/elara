import { NextRequest, NextResponse } from 'next/server'
import { HybridRAGEngine } from '@/lib/ai/hybrid-rag-engine'
import { CostMonitor } from '@/lib/monitoring/cost-monitor'
import type { ProcessedVideo } from '@/types/youtube-chat'

interface YouTubeChatRequest {
  question: string
  videoId: string
  context: {
    videoTitle: string
    channelTitle: string
    duration: string
    assistant: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: YouTubeChatRequest = await request.json()
    const { question, videoId, context } = body

    if (!question || !videoId) {
      return NextResponse.json(
        { success: false, error: 'Question and videoId are required' },
        { status: 400 }
      )
    }

    console.log(`💬 YouTube chat request for video ${videoId}: "${question}"`)

    // Initialize services
    const hybridRAG = HybridRAGEngine.getInstance()
    const costMonitor = CostMonitor.getInstance()

    try {
      // Use hybrid RAG engine for processing
      const ragContext = await hybridRAG.getContextForQuestion(question, {
        type: 'youtube',
        data: {
          videoId,
          videoTitle: context.videoTitle,
          channelTitle: context.channelTitle,
          duration: context.duration,
                     description: undefined
        }
      })

      // Generate AI response using hybrid engine
      const aiResponse = await hybridRAG.generateResponse(question, ragContext)

      // Track costs
      await costMonitor.trackOperation(
        'youtube-chat',
        ragContext.cost,
        'youtube',
        { videoId, hasTranscript: ragContext.metadata.hasTranscript }
      )

      console.log(`✅ YouTube chat response generated for ${videoId} (cost: $${ragContext.cost.toFixed(4)})`)

      return NextResponse.json({
        success: true,
        response: aiResponse.message,
        cost: ragContext.cost,
        metadata: {
          videoId,
          hasTranscript: ragContext.metadata.hasTranscript,
          processingTier: ragContext.metadata.processingTier,
          confidence: ragContext.confidence,
          suggestions: aiResponse.suggestions,
          costSavingMode: costMonitor.isCostSavingMode()
        }
      })

    } catch (ragError) {
      console.error('Hybrid RAG processing failed, using fallback:', ragError)
      
      // Fallback to simple response
      const fallbackResponse = `I'd love to help you with "${question}" about "${context.videoTitle}" by ${context.channelTitle}. Let me see what I can find about this video.`
      const fallbackCost = 0.001

      await costMonitor.trackOperation('youtube-chat-fallback', fallbackCost, 'youtube')

      return NextResponse.json({
        success: true,
        response: fallbackResponse,
        cost: fallbackCost,
        metadata: {
          videoId,
          hasTranscript: false,
          processingTier: 'fallback',
          confidence: 0.3
        }
      })
    }

  } catch (error) {
    console.error('YouTube chat API error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process chat request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 