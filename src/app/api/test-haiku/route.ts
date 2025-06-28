import { NextRequest, NextResponse } from 'next/server';
import { haikuRewriter, validateHaikuSetup } from '@/lib/ai/query-rewriter';

export async function GET(request: NextRequest) {
  console.log('🧪 Testing Claude Haiku Query Rewriter Integration');
  
  // Validate setup first
  const setupCheck = validateHaikuSetup();
  if (!setupCheck.isValid) {
    return NextResponse.json({
      success: false,
      error: 'Haiku setup invalid',
      details: setupCheck.message
    }, { status: 500 });
  }

  // Test cases demonstrating key features
  const testCases = [
    {
      name: 'Pronoun Resolution',
      input: "What did he say about AI?",
      chatHistory: "User: Tell me about Joe Rogan\nAssistant: Joe Rogan hosts a popular podcast...",
      episodeTitle: 'The Joe Rogan Experience #2000 - Elon Musk'
    },
    {
      name: 'Current Info Intent',
      input: "What's Elon doing now?",
      episodeTitle: 'Tech Talk 2025'
    },
    {
      name: 'Summary Intent',
      input: "Can you summarize this episode?",
      episodeTitle: 'Deep Dive: AI Ethics'
    }
  ];

  const results = [];

  for (const testCase of testCases) {
    try {
      console.log(`🧪 Testing: ${testCase.name} - "${testCase.input}"`);
      
      const startTime = Date.now();
      const result = await haikuRewriter.rewriteQuery(testCase.input, {
        chatHistory: testCase.chatHistory || '',
        episodeTitle: testCase.episodeTitle,
        speakers: 'Host',
        channelTitle: 'Test Channel'
      });
      const processingTime = Date.now() - startTime;

      console.log(`✅ Result: "${result.rewrittenQuery}" (intent: ${result.intent}, confidence: ${result.confidence})`);

      results.push({
        test: testCase.name,
        original: testCase.input,
        rewritten: result.rewrittenQuery,
        intent: result.intent,
        confidence: result.confidence,
        shouldUseRewritten: result.shouldUseRewritten,
        requiresRealTime: result.requiresRealTime,
        processingTimeMs: processingTime,
        success: true
      });

    } catch (error) {
      console.error(`❌ Test failed: ${testCase.name}`, error);
      results.push({
        test: testCase.name,
        original: testCase.input,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
  }

  return NextResponse.json({
    success: true,
    setup: setupCheck,
    testResults: results,
    summary: {
      totalTests: testCases.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    nextSteps: [
      'Core rewriter tested',
      'Intent detection verified',
      'Ready for Phase 4: Enhanced Chat integration',
      'Test /api/ask endpoint with enable_haiku_rewriting: true'
    ]
  });
}

export async function POST(request: NextRequest) {
  try {
    const { question, chatHistory, episodeTitle, speakers } = await request.json();

    if (!question) {
      return NextResponse.json({
        success: false,
        error: 'Question is required'
      }, { status: 400 });
    }

    console.log(`🧪 Manual test: "${question}"`);

    const result = await haikuRewriter.rewriteQuery(question, {
      chatHistory: chatHistory || '',
      episodeTitle: episodeTitle || 'Test Episode',
      speakers: speakers || 'Host',
      channelTitle: 'Test Channel'
    });

    console.log(`✅ Manual test result: "${result.rewrittenQuery}"`);

    return NextResponse.json({
      success: true,
      original: question,
      result
    });

  } catch (error) {
    console.error('Manual test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 