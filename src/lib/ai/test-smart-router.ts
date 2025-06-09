/**
 * Simple test runner for Smart API Router
 * Run with: npx tsx src/lib/ai/test-smart-router.ts
 */

import { smartAPIRouter } from './smart-api-router';

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`❌ ASSERTION FAILED: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertContains(text: string, substring: string, message: string) {
  if (!text.includes(substring)) {
    throw new Error(`❌ ASSERTION FAILED: ${message}\n  Expected "${text}" to contain "${substring}"`);
  }
}

// Mock data for testing
const mockLocalContent = [
  {
    content: "Joe Rogan discussed Khabib's fighting style and retirement decision during their podcast conversation.",
    similarity: 0.85,
    content_type: 'transcript',
    metadata: { episode_id: 'joe-rogan-khabib' }
  },
  {
    content: "Khabib talked about his father's influence and his promise to his mother about retirement.",
    similarity: 0.78,
    content_type: 'transcript',
    metadata: { episode_id: 'joe-rogan-khabib' }
  }
];

const mockLowQualityContent = [
  {
    content: "Some unrelated content about MMA in general.",
    similarity: 0.35,
    content_type: 'transcript',
    metadata: { episode_id: 'random-episode' }
  }
];

const emptyContent: any[] = [];

// Test suite
async function runTests() {
  console.log('🧪 SMART API ROUTER TEST SUITE');
  console.log('='.repeat(50));
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  // Helper function to run a test
  async function runTest(testName: string, testFunction: () => Promise<void>) {
    totalTests++;
    try {
      console.log(`\n🔬 Testing: ${testName}`);
      await testFunction();
      console.log(`✅ PASSED: ${testName}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Error: ${error instanceof Error ? error.message : error}`);
      failedTests++;
    }
  }

  // Test 1: Opinion Questions Should Use Local Content
  await runTest('Opinion questions should prefer local content', async () => {
    const question = "What does Joe Rogan think about Khabib?";
    const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
    
    assertEqual(decision.useAPI, false, 'Should not use API for opinion question with local content');
    assertEqual(decision.priority, 'local_only', 'Should prioritize local content');
    assertContains(decision.reasoning.toLowerCase(), 'opinion', 'Reasoning should mention opinion');
    
    console.log(`   📊 Decision: ${decision.priority} (${decision.reasoning})`);
    console.log(`   📊 Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
  });

  // Test 2: Current Status Questions Should Use API
  await runTest('Current status questions should use API', async () => {
    const question = "What is Khabib doing now in 2025?";
    const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
    
    assertEqual(decision.useAPI, true, 'Should use API for current status question');
    assertEqual(decision.priority, 'api_only', 'Should prioritize API for current info');
    assertContains(decision.reasoning.toLowerCase(), 'current', 'Reasoning should mention current status');
    
    console.log(`   📊 Decision: ${decision.priority} (${decision.reasoning})`);
    console.log(`   📊 Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
  });

  // Test 3: No Local Content Should Fallback to API
  await runTest('No local content should fallback to API', async () => {
    const question = "What does Joe Rogan think about Khabib?";
    const decision = await smartAPIRouter.shouldUseAPI(question, emptyContent);
    
    assertEqual(decision.useAPI, true, 'Should use API when no local content');
    assertEqual(decision.priority, 'api_fallback', 'Should use API as fallback');
    assertContains(decision.reasoning.toLowerCase(), 'no sufficient local content', 'Should mention lack of local content');
    
    console.log(`   📊 Decision: ${decision.priority} (${decision.reasoning})`);
    console.log(`   📊 Local Sufficiency: ${(decision.estimatedLocalSufficiency * 100).toFixed(1)}%`);
  });

  // Test 4: Past Discussion Questions with Good Content
  await runTest('Past discussions should use local content', async () => {
    const question = "What was discussed about retirement in the podcast?";
    const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
    
    assertEqual(decision.useAPI, false, 'Past discussions should use local content');
    assert(decision.estimatedLocalSufficiency > 0.7, 'Should have high local content confidence');
    
    console.log(`   📊 Decision: ${decision.priority} (${decision.reasoning})`);
    console.log(`   📊 Local Sufficiency: ${(decision.estimatedLocalSufficiency * 100).toFixed(1)}%`);
  });

  // Test 5: Cost Savings Simulation
  await runTest('Cost optimization simulation', async () => {
    const questions = [
      { q: "What does Joe Rogan think about Khabib's fighting style?", shouldSave: true },
      { q: "What's the host's opinion on Khabib's retirement?", shouldSave: true },
      { q: "What is Khabib doing now in 2025?", shouldSave: false },
      { q: "What are Khabib's current activities?", shouldSave: false }
    ];

    let saved = 0;
    let total = questions.length;

    for (const test of questions) {
      const decision = await smartAPIRouter.shouldUseAPI(test.q, mockLocalContent);
      const actualSaved = !decision.useAPI;
      
      if (actualSaved === test.shouldSave) {
        if (actualSaved) saved++;
      } else {
        throw new Error(`Question "${test.q}" - Expected saved: ${test.shouldSave}, Got: ${actualSaved}`);
      }
      
      console.log(`   ${actualSaved ? '💰 SAVED' : '⚡ API'}: "${test.q}"`);
    }

    const savingsRate = (saved / total) * 100;
    console.log(`   📊 Savings Rate: ${saved}/${total} (${savingsRate.toFixed(1)}%)`);
    assert(saved >= 2, 'Should save at least 2 out of 4 test questions');
  });

  // Test 6: Temporal Context Detection
  await runTest('Temporal context detection', async () => {
    const temporalTests = [
      { question: "What did Joe Rogan discuss with Khabib?", shouldUseAPI: false, context: "past" },
      { question: "What is Khabib doing currently?", shouldUseAPI: true, context: "present" },
      { question: "What will Khabib do next year?", shouldUseAPI: true, context: "future" }
    ];

    for (const test of temporalTests) {
      const decision = await smartAPIRouter.shouldUseAPI(test.question, mockLocalContent);
      
      console.log(`   🕐 "${test.question}" -> ${decision.useAPI ? 'API' : 'LOCAL'} (${test.context})`);
      
      if (test.shouldUseAPI) {
        assert(decision.useAPI, `Question "${test.question}" should use API for ${test.context} context`);
      } else {
        assert(!decision.useAPI, `Question "${test.question}" should use local for ${test.context} context`);
      }
    }
  });

  // Test 7: Edge Cases
  await runTest('Edge cases handling', async () => {
    const edgeCases = ["", "   ", "?", "what", "tell me"];

    for (const question of edgeCases) {
      const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
      
      assert(decision !== undefined, 'Should return a decision for edge case');
      assert(decision.confidence > 0, 'Should have some confidence');
      assert(decision.reasoning.length > 0, 'Should provide reasoning');
      
      console.log(`   🔧 Edge case "${question}" -> ${decision.priority} (confidence: ${decision.confidence.toFixed(2)})`);
    }
  });

  // Test 8: Performance Test
  await runTest('Performance benchmark', async () => {
    const questions = [
      "What does Joe Rogan think about AI?",
      "What is Elon Musk doing now?",
      "What was discussed about technology?",
      "What are the latest developments in space?"
    ];

    const startTime = Date.now();
    
    for (const question of questions) {
      await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / questions.length;
    
    console.log(`   ⚡ Performance: ${questions.length} decisions in ${totalTime}ms (avg: ${avgTime.toFixed(1)}ms)`);
    assert(avgTime < 100, 'Average decision time should be under 100ms');
  });

  // Test Results Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${totalTests}`);
  console.log(`🎯 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Smart API Router is working correctly.');
    console.log('💰 The router is ready to save you API costs!');
  } else {
    console.log(`\n⚠️  ${failedTests} test(s) failed. Please review the smart router logic.`);
    process.exit(1);
  }
}

// Integration Test Demo
async function demonstrateSmartRouting() {
  console.log('\n🎭 SMART ROUTING DEMONSTRATION');
  console.log('='.repeat(50));

  const demoScenarios = [
    {
      name: "Opinion Question (Should Save Money)",
      question: "What does Joe Rogan think about Khabib's fighting style?",
      content: mockLocalContent
    },
    {
      name: "Current Status (Needs Real-Time Data)",
      question: "What is Khabib doing currently in 2025?",
      content: mockLocalContent
    },
    {
      name: "No Local Content (Must Use API)",
      question: "What did they discuss about training methods?",
      content: emptyContent
    },
    {
      name: "Mixed Question (Past + Present)",
      question: "How has Khabib's approach changed from what Joe discussed to now?",
      content: mockLocalContent
    }
  ];

  for (const scenario of demoScenarios) {
    console.log(`\n📋 ${scenario.name}`);
    console.log(`   Question: "${scenario.question}"`);
    
    const decision = await smartAPIRouter.shouldUseAPI(scenario.question, scenario.content);
    
    console.log(`   🤖 Decision: ${decision.useAPI ? '⚡ USE API' : '🏠 USE LOCAL'}`);
    console.log(`   🎯 Priority: ${decision.priority}`);
    console.log(`   💭 Reasoning: ${decision.reasoning}`);
    console.log(`   📊 Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    console.log(`   📈 Local Sufficiency: ${(decision.estimatedLocalSufficiency * 100).toFixed(1)}%`);
    
    if (!decision.useAPI) {
      console.log(`   💰 COST SAVED: This would save a Tavily/Google API call!`);
    }
  }
}

// Run all tests
async function main() {
  try {
    await runTests();
    await demonstrateSmartRouting();
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

export { runTests, demonstrateSmartRouting }; 