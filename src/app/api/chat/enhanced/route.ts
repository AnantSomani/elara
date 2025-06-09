import { NextRequest, NextResponse } from 'next/server';
import { generateEnhancedRAGResponse } from '@/lib/ai/enhanced-rag-engine';
import { analyzeQuestionForRAG } from '@/lib/ai/rag-engine';
import { supabaseAdmin } from '@/lib/database/supabase';
import type { ConversationContext } from '@/types/conversation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      question, 
      episodeId = 'default',
      enableRealTimeData = true,
      maxRealTimeTools = 2,
      hostName = 'AI Assistant'
    } = body;

    if (!question) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    console.log(`🚀 Enhanced RAG request: "${question}"`);
    console.log(`📺 Episode ID: ${episodeId}`);
    console.log(`📡 Real-time data enabled: ${enableRealTimeData}`);

    // Simple conversation context for enhanced RAG
    const context: ConversationContext = {
      episodeId,
      hostId: `host-${episodeId}`,
      currentTimestamp: 0,
      recentTranscription: [],
      conversationHistory: [],
      episodeMetadata: {
        title: 'Enhanced RAG Episode',
        description: 'Episode with real-time data integration',
        duration: 1800,
        publishDate: new Date().toISOString(),
      },
      hostPersonality: {
        id: `host-${episodeId}`,
        name: hostName,
        description: 'AI assistant with access to real-time data and podcast content',
        conversationStyle: {
          tone: 'casual' as const,
          verbosity: 'detailed' as const,
          expertise: ['general', 'current events', 'real-time data'],
          commonPhrases: ['Let me check the latest information', 'Based on current data'],
          personality_traits: ['helpful', 'current', 'informative'],
        },
        knowledge: {
          topics: ['general', 'current events', 'real-time information'],
          recurring_themes: ['accuracy', 'timeliness'],
          opinions: {},
          past_statements: [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    // Analyze question to determine RAG strategy
    const questionAnalysis = analyzeQuestionForRAG(question);
    console.log(`🔍 Question analysis:`, questionAnalysis);

    // Use enhanced RAG with real-time data capabilities
    const response = await generateEnhancedRAGResponse(question, context, {
      maxRelevantChunks: 5,
      similarityThreshold: 0.6,
      includePersonality: questionAnalysis.contentTypes.includes('personality'),
      includeConversationHistory: questionAnalysis.contentTypes.includes('conversation'),
      useSemanticSearch: true,
      enableRealTimeData,
      maxRealTimeTools,
    });

    console.log(`🧠 Enhanced RAG context used:`, {
      transcriptChunks: response.ragContext?.relevantTranscripts?.length || 0,
      personalityData: response.ragContext?.personalityData?.length || 0,
      conversationHistory: response.ragContext?.conversationHistory?.length || 0,
      realTimeDataSources: response.ragContext?.realTimeData?.length || 0,
      realTimeUsed: response.ragContext?.realTimeUsed || false,
    });

    return NextResponse.json({
      success: true,
      response: response.message,
      metadata: {
        confidence: response.confidence,
        responseTime: response.responseTime,
        contextUsed: response.contextUsed,
        personality: response.personality,
        suggestions: response.suggestions,
        episodeId,
        enableRealTimeData,
        ragContext: {
          transcriptChunks: response.ragContext?.relevantTranscripts?.length || 0,
          personalityData: response.ragContext?.personalityData?.length || 0,
          conversationHistory: response.ragContext?.conversationHistory?.length || 0,
          searchQuery: response.ragContext?.searchQuery,
          realTimeDataSources: response.ragContext?.realTimeData?.length || 0,
          realTimeUsed: response.ragContext?.realTimeUsed || false,
          realTimeTools: response.ragContext?.realTimeData?.map(tool => ({
            tool: tool.tool,
            success: tool.success,
            timestamp: tool.timestamp,
          })) || [],
        },
      },
    });

  } catch (error) {
    console.error('Error in enhanced chat API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process enhanced chat request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'PodTalk Enhanced RAG API with Real-Time Data',
    description: 'Enhanced RAG system that combines podcast content with real-time data',
    features: [
      'Real-time sports statistics',
      'Current news and events',
      'Stock market information',
      'Weather data',
      'Podcast content integration',
      'Semantic search across episodes',
    ],
    usage: {
      method: 'POST',
      endpoint: '/api/chat/enhanced',
      body: {
        question: 'Your question (can request current data)',
        episodeId: 'Episode identifier (optional)',
        enableRealTimeData: 'Whether to fetch real-time data (default: true)',
        maxRealTimeTools: 'Maximum real-time tools to use (default: 2)',
        hostName: 'Host name for personality (default: AI Assistant)',
      },
    },
    examples: [
      {
        description: 'Sports stats query',
        request: {
          question: "What are Steph Curry's stats for the 2025 season?",
          episodeId: 'warriors-podcast',
          enableRealTimeData: true
        }
      },
      {
        description: 'Current news query',
        request: {
          question: "What's the latest news about AI developments?",
          enableRealTimeData: true
        }
      },
      {
        description: 'Stock information',
        request: {
          question: "What's Tesla's current stock price?",
          enableRealTimeData: true
        }
      }
    ],
    notes: [
      'Automatically detects when real-time data is needed',
      'Combines podcast content with current information',
      'Supports sports, news, stocks, weather, and general queries',
      'Falls back to podcast content if real-time data is unavailable'
    ]
  });
} 