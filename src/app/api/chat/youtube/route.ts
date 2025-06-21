import { NextRequest, NextResponse } from 'next/server'

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

    try {
      // Call our new RAG API endpoint
      const ragResponse = await fetch('http://localhost:8001/rag/basic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: question,
          video_id: videoId,
          max_results: 5
        }),
      })

      if (!ragResponse.ok) {
        throw new Error(`RAG API failed: ${ragResponse.status}`)
      }

      const ragData = await ragResponse.json()

      console.log(`✅ YouTube chat response generated for ${videoId} (${ragData.metadata.processing_time_ms}ms)`)

      // Format response for frontend (clean, no source attribution for MVP)
      let responseText = ragData.answer

      return NextResponse.json({
        success: true,
        response: responseText,
        cost: 0.01, // Estimated cost for RAG query
        metadata: {
          videoId,
          hasTranscript: ragData.sources.length > 0,
          processingTier: 'rag',
          confidence: 0.9,
          processingTime: ragData.metadata.processing_time_ms,
          sourceCount: ragData.sources.length
        }
      })

    } catch (ragError) {
      console.error('RAG processing failed, using fallback:', ragError)
      
      // Fallback to simple response
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