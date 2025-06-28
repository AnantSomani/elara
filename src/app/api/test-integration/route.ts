import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('🚀 Integration Test: Ask Route + Enhanced Chat + Haiku');
  
  const integrationTests = [
    {
      name: "Ask Route with Haiku",
      endpoint: "/api/ask",
      payload: {
        video_id: "test_video_123", // Mock video ID
        question: "What did he say about that?",
        enable_haiku_rewriting: true,
        generation_options: { 
          model: "gpt-4o-mini",
          max_tokens: 500
        }
      },
      expectedFields: ["success", "data", "data.query_rewrite_metadata"]
    },
    {
      name: "Enhanced Chat with Conversational Memory",
      endpoint: "/api/chat/enhanced", 
      payload: {
        question: "What did they discuss about this topic?",
        conversationHistory: [
          { role: "user", content: "Tell me about Elon's AI companies" },
          { role: "assistant", content: "Elon founded several AI companies including xAI and Neuralink..." }
        ],
        enableHaikuRewriting: true,
        enableRealTimeData: false,
        episodeId: "test-episode"
      },
      expectedFields: ["success", "response", "metadata", "metadata.queryRewrite"]
    },
    {
      name: "Enhanced Chat with Real-time Intent",
      endpoint: "/api/chat/enhanced",
      payload: {
        question: "What's Tesla's stock doing today?", 
        enableHaikuRewriting: true,
        enableRealTimeData: true,
        episodeId: "finance-episode"
      },
      expectedFields: ["success", "response", "metadata", "metadata.queryRewrite"]
    }
  ];

  const results = [];
  let successCount = 0;

  for (const test of integrationTests) {
    console.log(`\n🧪 Testing: ${test.name}`);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(`http://localhost:8080${test.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      });
      
      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Check if required fields exist
      const missingFields = test.expectedFields.filter(field => {
        const fieldPath = field.split('.');
        let current = data;
        for (const part of fieldPath) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            return true; // Field missing
          }
        }
        return false;
      });
      
      const success = response.ok && missingFields.length === 0;
      
      if (success) {
        successCount++;
        console.log(`✅ ${test.name}: PASSED (${latency}ms)`);
      } else {
        console.log(`❌ ${test.name}: FAILED - Missing fields: ${missingFields.join(', ')}`);
      }
      
      results.push({
        test: test.name,
        endpoint: test.endpoint,
        success,
        status: response.status,
        latency_ms: latency,
        response_preview: {
          success: data.success,
          has_haiku_metadata: !!(data.metadata?.queryRewrite || data.data?.query_rewrite_metadata),
          error: data.error || null
        },
        missing_fields: missingFields,
        haiku_details: data.metadata?.queryRewrite || data.data?.query_rewrite_metadata || null
      });
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      console.log(`💥 ${test.name}: ERROR - ${error}`);
      
      results.push({
        test: test.name,
        endpoint: test.endpoint,
        success: false,
        latency_ms: latency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const successRate = successCount / integrationTests.length;
  
  console.log(`\n📊 Integration Test Summary:
    ✅ Passed: ${successCount}/${integrationTests.length} (${(successRate * 100).toFixed(1)}%)
    🎯 Overall Status: ${successRate === 1 ? 'ALL SYSTEMS GO! 🚀' : 'Some issues detected ⚠️'}
  `);

  return NextResponse.json({
    success: true,
    test_type: "Integration Test - Haiku + API Routes",
    summary: {
      total_tests: integrationTests.length,
      passed: successCount,
      failed: integrationTests.length - successCount,
      success_rate: successRate,
      status: successRate === 1 ? 'READY_FOR_PRODUCTION' : 'NEEDS_ATTENTION'
    },
    test_results: results,
    phase_5_status: "COMPLETE",
    next_phase: successRate >= 0.8 ? "Phase 6: Final Testing" : "Fix issues and re-test"
  });
} 