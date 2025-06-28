import { NextRequest, NextResponse } from 'next/server';
import { haikuRewriter } from '@/lib/ai/query-rewriter';

interface TestCase {
  name: string;
  category: string;
  description: string;
  input: {
    query: string;
    options?: any;
  };
  expectedBehavior: {
    shouldRewrite?: boolean;
    expectedIntent?: string;
    minConfidence?: number;
    shouldContain?: string[];
  };
}

export async function POST(request: NextRequest) {
  console.log('🧪 Phase 5: Comprehensive Haiku Validation Testing...');
  
  const testCases: TestCase[] = [
    // Category 1: Pronoun Resolution
    {
      name: "Basic Pronoun Resolution",
      category: "Pronoun Resolution",
      description: "Test basic he/she pronoun resolution with context",
      input: {
        query: "What did he say about AI?",
        options: {
          episodeContext: {
            episode_title: "Joe Rogan Experience #2000 - Elon Musk",
            speakers: "Joe Rogan, Elon Musk"
          }
        }
      },
      expectedBehavior: {
        shouldRewrite: true,
        expectedIntent: "episode_content", // More accurate than fact_check for episode-specific queries
        minConfidence: 0.8,
        shouldContain: ["Elon Musk", "AI"]
      }
    },
    
    // Category 2: Intent Detection
    {
      name: "Current Info Detection",
      category: "Intent Detection", 
      description: "Test detection of current_info intent",
      input: {
        query: "What's Tesla's stock price today?"
      },
      expectedBehavior: {
        shouldRewrite: true,
        expectedIntent: "current_info",
        minConfidence: 0.8
      }
    },
    {
      name: "Summarize Intent",
      category: "Intent Detection",
      description: "Test detection of summarize intent", 
      input: {
        query: "Can you summarize this episode for me?"
      },
      expectedBehavior: {
        shouldRewrite: true,
        expectedIntent: "summarize",
        minConfidence: 0.8
      }
    },
    
    // Category 3: Edge Cases
    {
      name: "Very Short Query",
      category: "Edge Cases",
      description: "Test handling of very short queries",
      input: {
        query: "AI?"
      },
      expectedBehavior: {
        shouldRewrite: false,
        minConfidence: 0.0
      }
    },
    {
      name: "Already Clear Query", 
      category: "Edge Cases",
      description: "Test that clear queries aren't unnecessarily rewritten",
      input: {
        query: "What are Elon Musk's specific views on artificial general intelligence safety measures?"
      },
      expectedBehavior: {
        shouldRewrite: false
      }
    }
  ];

  const results: any[] = [];
  let totalLatency = 0;
  let successCount = 0;
  let errorCount = 0;

  console.log(`🚀 Running ${testCases.length} validation tests...`);

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    
    const startTime = Date.now();
    
    try {
      const result = await haikuRewriter.rewriteQuery(
        testCase.input.query, 
        testCase.input.options || {}
      );
      
      const latency = Date.now() - startTime;
      totalLatency += latency;
      
      // Validate results against expected behavior
      const validation = validateResult(result, testCase.expectedBehavior);
      
      if (validation.passed) {
        successCount++;
        console.log(`✅ ${testCase.name}: PASSED (${latency}ms)`);
      } else {
        console.log(`❌ ${testCase.name}: FAILED - ${validation.reason}`);
      }
      
      results.push({
        test: testCase.name,
        category: testCase.category,
        success: validation.passed,
        latency_ms: latency,
        result: {
          original: testCase.input.query,
          rewritten: result.rewrittenQuery,
          intent: result.intent,
          confidence: result.confidence,
          used_rewritten: result.shouldUseRewritten
        },
        validation: validation
      });
      
    } catch (error) {
      errorCount++;
      const latency = Date.now() - startTime;
      totalLatency += latency;
      
      console.log(`💥 ${testCase.name}: ERROR - ${error}`);
      
      results.push({
        test: testCase.name,
        category: testCase.category,
        success: false,
        latency_ms: latency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const avgLatency = totalLatency / testCases.length;
  const successRate = successCount / testCases.length;

  console.log(`\n📊 Phase 5 Validation Summary:
    ✅ Passed: ${successCount}/${testCases.length} (${(successRate * 100).toFixed(1)}%)
    ❌ Failed: ${testCases.length - successCount - errorCount}
    💥 Errors: ${errorCount}
    ⚡ Avg Latency: ${avgLatency.toFixed(0)}ms
  `);

  return NextResponse.json({
    success: true,
    phase: "Phase 5: Basic Testing & Validation",
    summary: {
      total_tests: testCases.length,
      passed: successCount,
      failed: testCases.length - successCount - errorCount,
      errors: errorCount,
      success_rate: successRate,
      average_latency_ms: Math.round(avgLatency)
    },
    detailed_results: results
  });
}

function validateResult(result: any, expected: any): { passed: boolean; reason: string } {
  // Check if should rewrite
  if (expected.shouldRewrite !== undefined) {
    const shouldRewrite = result.shouldUseRewritten;
    if (shouldRewrite !== expected.shouldRewrite) {
      return {
        passed: false,
        reason: `Expected shouldRewrite=${expected.shouldRewrite}, got ${shouldRewrite}`
      };
    }
  }
  
  // Check intent
  if (expected.expectedIntent && result.shouldUseRewritten) {
    if (result.intent !== expected.expectedIntent) {
      return {
        passed: false,
        reason: `Expected intent='${expected.expectedIntent}', got '${result.intent}'`
      };
    }
  }
  
  // Check confidence
  if (expected.minConfidence !== undefined) {
    if (result.confidence < expected.minConfidence) {
      return {
        passed: false,
        reason: `Expected confidence >= ${expected.minConfidence}, got ${result.confidence}`
      };
    }
  }
  
  // Check contains
  if (expected.shouldContain && result.shouldUseRewritten) {
    for (const term of expected.shouldContain) {
      if (!result.rewrittenQuery.toLowerCase().includes(term.toLowerCase())) {
        return {
          passed: false,
          reason: `Expected rewritten query to contain '${term}'`
        };
      }
    }
  }
  
  return {
    passed: true,
    reason: 'All checks passed'
  };
} 