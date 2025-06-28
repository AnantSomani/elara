import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('🧪 Testing Enhanced Chat with Haiku integration...');
  
  const testCases = [
    {
      name: "Conversational Memory Test",
      description: "Testing pronoun resolution with conversation history",
      request: {
        question: "What did he say about that?",
        episodeId: "joe-rogan-2000",
        conversationHistory: [
          { role: "user", content: "Tell me about Elon Musk's views on AI" },
          { role: "assistant", content: "Elon Musk has expressed concerns about AI safety..." },
          { role: "user", content: "What about neural networks?" },
          { role: "assistant", content: "He's talked about Neuralink and brain-computer interfaces..." }
        ],
        enableHaikuRewriting: true,
        enableRealTimeData: false
      }
    },
    {
      name: "Real-time Intent Detection",
      description: "Testing current_info intent detection",
      request: {
        question: "What's Elon up to these days?",
        episodeId: "default",
        conversationHistory: [],
        enableHaikuRewriting: true,
        enableRealTimeData: true
      }
    },
    {
      name: "Episode Content Intent",
      description: "Testing episode_content intent with context",
      request: {
        question: "Summarize what we discussed",
        episodeId: "tech-talk-123",
        conversationHistory: [
          { role: "user", content: "What are the latest developments in quantum computing?" },
          { role: "assistant", content: "Recent breakthroughs include IBM's quantum processors..." }
        ],
        enableHaikuRewriting: true,
        enableRealTimeData: false
      }
    }
  ];

  const results = [];
  
  for (const testCase of testCases) {
    console.log(`🧪 Running test: ${testCase.name}`);
    
    try {
      const startTime = Date.now();
      
      const response = await fetch('http://localhost:8080/api/chat/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.request)
      });
      
      const data = await response.json();
      const testTime = Date.now() - startTime;
      
      results.push({
        test: testCase.name,
        description: testCase.description,
        success: response.ok,
        latency_ms: testTime,
        request: testCase.request,
        response: {
          success: data.success,
          query_rewrite: data.metadata?.queryRewrite,
          response_length: data.response?.length || 0,
          real_time_used: data.metadata?.ragContext?.realTimeUsed || false,
          error: data.error || null
        }
      });
      
      console.log(`✅ ${testCase.name}: ${response.ok ? 'PASSED' : 'FAILED'} (${testTime}ms)`);
      
    } catch (error) {
      results.push({
        test: testCase.name,
        description: testCase.description,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      console.log(`❌ ${testCase.name}: FAILED - ${error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const avgLatency = results
    .filter(r => r.latency_ms)
    .reduce((sum, r) => sum + (r.latency_ms || 0), 0) / results.length;

  console.log(`📊 Enhanced Chat + Haiku Test Summary:
    - Tests passed: ${successCount}/${results.length}
    - Average latency: ${avgLatency.toFixed(0)}ms
    - Success rate: ${(successCount/results.length*100).toFixed(0)}%
  `);

  return NextResponse.json({
    success: true,
    summary: {
      total_tests: results.length,
      passed: successCount,
      failed: results.length - successCount,
      success_rate: successCount / results.length,
      average_latency_ms: Math.round(avgLatency)
    },
    test_results: results
  });
} 