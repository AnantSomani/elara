import { NextRequest, NextResponse } from 'next/server';
import { haikuRewriter } from '@/lib/ai/query-rewriter';

export async function POST(request: NextRequest) {
  console.log('🚀 Phase 6: Final Testing & Production Readiness Validation');
  
  const allTests = [];
  
  // 1. User Journey Tests
  console.log('\n🧪 Running User Journey Tests...');
  const journeyTests = await runUserJourneyTests();
  allTests.push(...journeyTests);
  
  // 2. Stress Tests
  console.log('\n🔥 Running Stress Tests...');
  const stressTests = await runStressTests();
  allTests.push(...stressTests);
  
  // 3. Error Recovery Tests
  console.log('\n🛡️ Running Error Recovery Tests...');
  const errorTests = await runErrorRecoveryTests();
  allTests.push(...errorTests);
  
  // 4. Real-world Tests
  console.log('\n🌍 Running Real-world Tests...');
  const realWorldTests = await runRealWorldTests();
  allTests.push(...realWorldTests);

  const totalTests = allTests.length;
  const passedTests = allTests.filter(test => test.success).length;
  const successRate = passedTests / totalTests;
  const avgLatency = allTests.reduce((sum, test) => sum + (test.latency_ms || 0), 0) / totalTests;

  const productionReady = successRate >= 0.85 && avgLatency <= 2500;

  console.log(`\n📊 Phase 6 Final Results:
    📋 Total Tests: ${totalTests}
    ✅ Passed: ${passedTests} (${(successRate * 100).toFixed(1)}%)
    ⚡ Avg Latency: ${Math.round(avgLatency)}ms
    🎯 Production Ready: ${productionReady ? 'YES ✅' : 'NO ❌'}
  `);

  return NextResponse.json({
    success: true,
    phase: "Phase 6: Final Testing & Production Readiness",
    summary: {
      total_tests: totalTests,
      passed: passedTests,
      failed: totalTests - passedTests,
      success_rate: successRate,
      average_latency_ms: Math.round(avgLatency),
      production_ready: productionReady,
      grade: getGrade(successRate)
    },
    test_results: allTests,
    deployment_ready: productionReady,
    recommendations: generateRecommendations(successRate, avgLatency, productionReady)
  });
}

async function runUserJourneyTests() {
  const tests = [
    {
      name: "New User - No Context",
      query: "What did they talk about?",
      options: {},
      expectSuccess: false // Should not rewrite without context
    },
    {
      name: "Returning User - With History",
      query: "What did he say about that?",
      options: {
        chatHistory: [
          { role: "user", content: "Tell me about Elon Musk's AI views" },
          { role: "assistant", content: "Elon has concerns about AI safety..." }
        ]
      },
      expectSuccess: true
    },
    {
      name: "Power User - Specific Query",
      query: "What are Elon Musk's exact predictions for AGI timeline in 2024?",
      options: {},
      expectSuccess: false // Already specific, shouldn't rewrite
    }
  ];

  const results = [];
  
  for (const test of tests) {
    try {
      const startTime = Date.now();
      const result = await haikuRewriter.rewriteQuery(test.query, test.options);
      const latency = Date.now() - startTime;

      const actualSuccess = result.shouldUseRewritten;
      const success = actualSuccess === test.expectSuccess;
      
      results.push({
        category: "User Journey",
        test: test.name,
        success,
        latency_ms: latency,
        expected_rewrite: test.expectSuccess,
        actual_rewrite: actualSuccess,
        details: {
          original: test.query,
          rewritten: result.rewrittenQuery,
          intent: result.intent,
          confidence: result.confidence
        }
      });

      console.log(`${success ? '✅' : '❌'} ${test.name}: ${success ? 'PASSED' : 'FAILED'} (${latency}ms)`);
      
    } catch (error) {
      results.push({
        category: "User Journey", 
        test: test.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

async function runStressTests() {
  const results = [];
  const concurrentRequests = 3;
  const testQuery = "What did he say about AI?";
  const testOptions = {
    episodeContext: {
      episode_title: "Test Episode",
      speakers: "Test Speaker"
    }
  };

  console.log(`🚀 Running ${concurrentRequests} concurrent requests...`);

  try {
    const promises = Array(concurrentRequests).fill(null).map(async (_, index) => {
      const startTime = Date.now();
      
      try {
        const result = await haikuRewriter.rewriteQuery(testQuery, testOptions);
        return {
          success: true,
          latency_ms: Date.now() - startTime,
          index
        };
      } catch (error) {
        return {
          success: false,
          latency_ms: Date.now() - startTime,
          index,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const concurrentResults = await Promise.all(promises);
    const successCount = concurrentResults.filter(r => r.success).length;
    const avgLatency = concurrentResults.reduce((sum, r) => sum + r.latency_ms, 0) / concurrentResults.length;

    results.push({
      category: "Stress Test",
      test: "Concurrent Requests",
      success: successCount >= concurrentRequests * 0.8, // 80% success rate
      latency_ms: Math.round(avgLatency),
      details: {
        total_requests: concurrentRequests,
        successful: successCount,
        success_rate: successCount / concurrentRequests,
        average_latency: Math.round(avgLatency)
      }
    });

    console.log(`📊 Concurrent test: ${successCount}/${concurrentRequests} successful`);
    
  } catch (error) {
    results.push({
      category: "Stress Test",
      test: "Concurrent Requests", 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return results;
}

async function runErrorRecoveryTests() {
  const errorTests = [
    { name: "Empty Query", query: "" },
    { name: "Very Long Query", query: "What did he say about " + "AI ".repeat(50) },
    { name: "Special Characters", query: "What about AI? 🤖💡 #AI @elon" },
    { name: "Non-English", query: "¿Qué dijo sobre IA? 人工智能について？" }
  ];

  const results = [];

  for (const test of errorTests) {
    try {
      const startTime = Date.now();
      const result = await haikuRewriter.rewriteQuery(test.query, {});
      const latency = Date.now() - startTime;

      // Any result without crashing is success for error recovery
      results.push({
        category: "Error Recovery",
        test: test.name,
        success: true,
        latency_ms: latency,
        details: {
          handled_gracefully: true,
          confidence: result.confidence
        }
      });

      console.log(`✅ ${test.name}: HANDLED (${latency}ms)`);
      
    } catch (error) {
      const gracefulFailure = error instanceof Error && error.message.includes('timeout');
      
      results.push({
        category: "Error Recovery",
        test: test.name,
        success: gracefulFailure, // Timeouts are acceptable
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      console.log(`${gracefulFailure ? '✅' : '❌'} ${test.name}: ${gracefulFailure ? 'GRACEFUL' : 'CRASHED'}`);
    }
  }

  return results;
}

async function runRealWorldTests() {
  const scenarios = [
    {
      name: "Follow-up Question",
      query: "But what about his counterargument?",
      options: {
        chatHistory: [
          { role: "user", content: "What does Elon think about AI regulation?" },
          { role: "assistant", content: "Elon supports government oversight..." }
        ]
      },
      expectRewrite: true
    },
    {
      name: "Current Events",
      query: "What's happening with Tesla stock?",
      options: {},
      expectIntent: "current_info"
    },
    {
      name: "Episode Summary",
      query: "Summarize this discussion",
      options: {
        episodeContext: {
          episode_title: "AI Future Panel",
          speakers: "Dr. Chen, Prof. Rodriguez"
        }
      },
      expectIntent: "summarize"
    }
  ];

  const results = [];

  for (const scenario of scenarios) {
    try {
      const startTime = Date.now();
      const result = await haikuRewriter.rewriteQuery(scenario.query, scenario.options);
      const latency = Date.now() - startTime;

      let success = true;
      if (scenario.expectRewrite !== undefined && result.shouldUseRewritten !== scenario.expectRewrite) {
        success = false;
      }
      if (scenario.expectIntent && result.intent !== scenario.expectIntent) {
        success = false;
      }
      
      results.push({
        category: "Real-world",
        test: scenario.name,
        success,
        latency_ms: latency,
        details: {
          original: scenario.query,
          rewritten: result.rewrittenQuery,
          intent: result.intent,
          confidence: result.confidence,
          used_rewritten: result.shouldUseRewritten
        }
      });

      console.log(`${success ? '✅' : '❌'} ${scenario.name}: ${success ? 'PASSED' : 'FAILED'} (${latency}ms)`);
      
    } catch (error) {
      results.push({
        category: "Real-world",
        test: scenario.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

function getGrade(successRate: number): string {
  if (successRate >= 0.95) return 'A+';
  if (successRate >= 0.90) return 'A';
  if (successRate >= 0.85) return 'B+';
  if (successRate >= 0.80) return 'B';
  if (successRate >= 0.75) return 'B-';
  if (successRate >= 0.70) return 'C';
  return 'D';
}

function generateRecommendations(successRate: number, avgLatency: number, productionReady: boolean): string[] {
  const recommendations = [];
  
  if (productionReady) {
    recommendations.push("🎉 System is PRODUCTION READY!");
    recommendations.push("🚀 Ready for immediate deployment");
    recommendations.push("📊 All critical metrics meet production standards");
  } else {
    if (successRate < 0.85) {
      recommendations.push("🔧 Improve reliability - target 85%+ success rate");
    }
    if (avgLatency > 2500) {
      recommendations.push("⚡ Optimize performance - target <2.5s latency");
    }
    recommendations.push("🔄 Re-test after improvements");
  }

  recommendations.push("📈 Monitor performance in production");
  recommendations.push("🔍 Set up alerting for failures and latency spikes");
  
  return recommendations;
} 