import { NextRequest, NextResponse } from 'next/server'

interface YouTubeChatRequest {
  question: string
  videoId: string
  sessionId?: string
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
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
    const { question, videoId, sessionId, conversationHistory, context } = body

    if (!question || !videoId) {
      return NextResponse.json(
        { success: false, error: 'Question and videoId are required' },
        { status: 400 }
      )
    }

    console.log(`💬 YouTube chat request for video ${videoId}: "${question}"`)
    if (sessionId) {
      console.log(`💾 Session: ${sessionId}, History: ${conversationHistory?.length || 0} messages`)
    }

    try {
      const ragRequestBody = {
        query: question,
        video_id: videoId,
        ...(sessionId && { session_id: sessionId }),
        ...(conversationHistory && conversationHistory.length > 0 && { 
          conversation_history: conversationHistory 
        }),
        max_results: 5
      }

      console.log(`🧠 Sending to RAG API with memory:`, {
        hasSession: !!sessionId,
        historyLength: conversationHistory?.length || 0
      })

      const ragResponse = await fetch('http://localhost:8001/rag/basic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ragRequestBody),
      })

      if (!ragResponse.ok) {
        throw new Error(`RAG API failed: ${ragResponse.status}`)
      }

      const ragData = await ragResponse.json()

      console.log(`✅ YouTube chat response generated for ${videoId} (${ragData.metadata.processing_time_ms}ms)`)
      
      if (ragData.metadata && ragData.metadata.memory_used) {
        console.log(`💾 Memory context used: ${ragData.metadata.memory_context_length || 0} chars`)
      }

      let responseText = ragData.answer

      return NextResponse.json({
        success: true,
        response: responseText,
        cost: 0.01,
        metadata: {
          videoId,
          sessionId,
          hasTranscript: ragData.sources.length > 0,
          processingTier: 'rag',
          confidence: 0.9,
          processingTime: ragData.metadata.processing_time_ms,
          sourceCount: ragData.sources.length,
          memoryUsed: ragData.metadata?.memory_used || false,
          memoryContextLength: ragData.metadata?.memory_context_length || 0
        }
      })

    } catch (ragError) {
      console.error('RAG processing failed, using fallback:', ragError)
      
      const fallbackResponse = `I'd love to help you with "${question}" about "${context.videoTitle}" by ${context.channelTitle}. I'm having some technical difficulties with the transcript system right now, but I can still discuss general topics about this video.`
      const fallbackCost = 0.001

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