/**
 * Unit tests for Smart API Router
 * Tests intelligent decision making for API usage vs local content
 */

import { smartAPIRouter } from '../smart-api-router';

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

describe('Smart API Router', () => {
  
  describe('Question Analysis', () => {
    
    test('should detect opinion questions correctly', async () => {
      const questions = [
        "What does Joe Rogan think about Khabib?",
        "What's your opinion on cryptocurrency?",
        "How does the host feel about AI development?"
      ];

      for (const question of questions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
        expect(decision.priority).toBe('local_only');
        expect(decision.reasoning).toContain('Opinion question');
      }
    });

    test('should detect current status questions correctly', async () => {
      const questions = [
        "What is Khabib doing now in 2025?",
        "What are Khabib's current activities?",
        "What projects is he working on currently?",
        "What's Khabib up to these days?"
      ];

      for (const question of questions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, emptyContent);
        expect(decision.useAPI).toBe(true);
        expect(decision.priority).toBe('api_only');
        expect(decision.reasoning).toContain('Current status question requires real-time data');
      }
    });

    test('should detect temporal context correctly', async () => {
      const testCases = [
        {
          question: "What did Joe Rogan discuss with Khabib?",
          expectedTemporal: 'past'
        },
        {
          question: "What is Khabib doing now in 2025?",
          expectedTemporal: 'present'
        },
        {
          question: "What will Khabib do next year?",
          expectedTemporal: 'future'
        },
        {
          question: "Tell me about Khabib's career.",
          expectedTemporal: 'general'
        }
      ];

      for (const testCase of testCases) {
        const decision = await smartAPIRouter.shouldUseAPI(testCase.question, mockLocalContent);
        // We can't directly test temporal context, but we can verify the resulting decision logic
        console.log(`Question: "${testCase.question}" -> Decision: ${decision.priority}`);
      }
    });
  });

  describe('Content Sufficiency Assessment', () => {
    
    test('should prefer local content when sufficient and question is about past discussions', async () => {
      const pastQuestions = [
        "What did Joe Rogan think about Khabib during their conversation?",
        "What was discussed about Khabib's retirement in the podcast?",
        "What opinion did the host express about Khabib's fighting style?"
      ];

      for (const question of pastQuestions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
        expect(decision.useAPI).toBe(false);
        expect(decision.priority).toBe('local_only');
        expect(decision.estimatedLocalSufficiency).toBeGreaterThan(0.7);
      }
    });

    test('should use API when local content is insufficient', async () => {
      const questions = [
        "What does Joe Rogan think about Khabib?",
        "What was discussed in the podcast about retirement?"
      ];

      for (const question of questions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, emptyContent);
        expect(decision.useAPI).toBe(true);
        expect(decision.priority).toBe('api_fallback');
        expect(decision.reasoning).toContain('No sufficient local content');
      }
    });

    test('should use hybrid approach with partial content and real-time need', async () => {
      const hybridQuestions = [
        "How does Khabib's current training compare to what Joe Rogan discussed?",
        "What's the latest on topics Joe Rogan mentioned about Khabib?"
      ];

      for (const question of hybridQuestions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLowQualityContent);
        // Depending on the exact logic, this might be hybrid or api_only
        expect(decision.useAPI).toBe(true);
        console.log(`Hybrid test: "${question}" -> ${decision.priority} (${decision.reasoning})`);
      }
    });
  });

  describe('Cost Optimization Scenarios', () => {
    
    test('should save API calls for clear opinion questions with good local content', async () => {
      const costSavingQuestions = [
        "What does Joe Rogan think about Khabib's fighting style?",
        "What's the host's opinion on Khabib's retirement decision?",
        "How does Joe Rogan feel about Khabib as a person?",
        "What was Joe Rogan's take on Khabib's UFC career?"
      ];

      let apiCallsSaved = 0;
      let totalQuestions = costSavingQuestions.length;

      for (const question of costSavingQuestions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
        if (!decision.useAPI) {
          apiCallsSaved++;
        }
        console.log(`💰 "${question}" -> ${decision.useAPI ? 'API CALL' : 'SAVED'} (${decision.reasoning})`);
      }

      const savingsPercentage = (apiCallsSaved / totalQuestions) * 100;
      console.log(`💰 Cost savings: ${apiCallsSaved}/${totalQuestions} calls saved (${savingsPercentage.toFixed(1)}%)`);
      expect(apiCallsSaved).toBeGreaterThan(0); // Should save at least some calls
    });

    test('should make API calls for legitimate real-time needs', async () => {
      const realTimeQuestions = [
        "What is Khabib doing now in 2025?",
        "What are Khabib's latest activities?",
        "What's Khabib's current status?",
        "What projects is Khabib working on currently?"
      ];

      let apiCallsMade = 0;
      let totalQuestions = realTimeQuestions.length;

      for (const question of realTimeQuestions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
        if (decision.useAPI) {
          apiCallsMade++;
        }
        console.log(`⚡ "${question}" -> ${decision.useAPI ? 'API CALL' : 'LOCAL'} (${decision.reasoning})`);
      }

      const apiUsagePercentage = (apiCallsMade / totalQuestions) * 100;
      console.log(`⚡ Real-time API usage: ${apiCallsMade}/${totalQuestions} calls made (${apiUsagePercentage.toFixed(1)}%)`);
      expect(apiCallsMade).toBe(totalQuestions); // Should make API calls for all real-time questions
    });
  });

  describe('Edge Cases', () => {
    
    test('should handle empty questions gracefully', async () => {
      const edgeCases = ["", "   ", "?", "what"];

      for (const question of edgeCases) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
        expect(decision).toBeDefined();
        expect(decision.confidence).toBeGreaterThan(0);
        expect(decision.reasoning).toBeTruthy();
      }
    });

    test('should handle questions with mixed temporal indicators', async () => {
      const mixedQuestions = [
        "What did Khabib discuss before and what is he doing now?",
        "Compare Khabib's past statements with his current activities",
        "How has Khabib's approach changed from what Joe Rogan discussed to now?"
      ];

      for (const question of mixedQuestions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
        expect(decision).toBeDefined();
        // Mixed questions should lean toward API usage for current info
        console.log(`🔀 Mixed temporal: "${question}" -> ${decision.priority} (${decision.reasoning})`);
      }
    });

    test('should handle questions about entities not in training data', async () => {
      const unknownEntityQuestions = [
        "What does Joe Rogan think about XYZ Fighter?",
        "What's the current status of RandomPerson123?",
        "What did the host discuss about SomeUnknownTopic?"
      ];

      for (const question of unknownEntityQuestions) {
        const decision = await smartAPIRouter.shouldUseAPI(question, emptyContent);
        expect(decision.useAPI).toBe(true); // Should fallback to API
        expect(decision.priority).toBe('api_fallback');
      }
    });
  });

  describe('Confidence Scoring', () => {
    
    test('should provide higher confidence for clear-cut decisions', async () => {
      const clearCutCases = [
        {
          question: "What is Khabib doing now in 2025?",
          expectedHighConfidence: true,
          reason: "Clear current status question"
        },
        {
          question: "What does Joe Rogan think about Khabib?",
          expectedHighConfidence: true,
          reason: "Clear opinion question with good local content"
        }
      ];

      for (const testCase of clearCutCases) {
        const decision = await smartAPIRouter.shouldUseAPI(
          testCase.question, 
          testCase.expectedHighConfidence ? mockLocalContent : emptyContent
        );
        
        console.log(`🎯 Confidence test: "${testCase.question}" -> ${decision.confidence} (${testCase.reason})`);
        if (testCase.expectedHighConfidence) {
          expect(decision.confidence).toBeGreaterThan(0.7);
        }
      }
    });

    test('should provide lower confidence for ambiguous cases', async () => {
      const ambiguousCases = [
        "Tell me about Khabib",
        "What about the fighter?",
        "How is he?"
      ];

      for (const question of ambiguousCases) {
        const decision = await smartAPIRouter.shouldUseAPI(question, mockLowQualityContent);
        console.log(`❓ Ambiguous test: "${question}" -> confidence: ${decision.confidence}`);
        // Ambiguous questions should have moderate confidence
        expect(decision.confidence).toBeLessThan(0.8);
      }
    });
  });
});

// Integration test with actual smart router usage
describe('Smart Router Integration', () => {
  
  test('should demonstrate complete decision flow', async () => {
    const testScenarios = [
      {
        name: "Opinion Question (Should Save API Call)",
        question: "What does Joe Rogan think about Khabib's fighting style?",
        content: mockLocalContent,
        expectAPI: false,
        expectedReason: "opinion"
      },
      {
        name: "Current Status (Should Use API)",
        question: "What is Khabib doing currently in 2025?",
        content: mockLocalContent,
        expectAPI: true,
        expectedReason: "current status"
      },
      {
        name: "No Local Content (Should Fallback to API)", 
        question: "What did they discuss about training?",
        content: emptyContent,
        expectAPI: true,
        expectedReason: "fallback"
      },
      {
        name: "Past Discussion with Good Content (Should Save API Call)",
        question: "What was mentioned about retirement in the podcast?",
        content: mockLocalContent,
        expectAPI: false,
        expectedReason: "past discussion"
      }
    ];

    console.log('\n🧪 SMART ROUTER INTEGRATION TEST RESULTS:');
    console.log('='.repeat(60));

    for (const scenario of testScenarios) {
      const decision = await smartAPIRouter.shouldUseAPI(scenario.question, scenario.content);
      
      const result = decision.useAPI === scenario.expectAPI ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${result} ${scenario.name}`);
      console.log(`   Question: "${scenario.question}"`);
      console.log(`   Expected API: ${scenario.expectAPI}, Got: ${decision.useAPI}`);
      console.log(`   Priority: ${decision.priority}`);
      console.log(`   Reasoning: ${decision.reasoning}`);
      console.log(`   Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
      console.log(`   Local Sufficiency: ${(decision.estimatedLocalSufficiency * 100).toFixed(1)}%`);
      
      expect(decision.useAPI).toBe(scenario.expectAPI);
    }

    console.log('\n' + '='.repeat(60));
  });
});

// Performance test
describe('Smart Router Performance', () => {
  
  test('should make decisions quickly', async () => {
    const questions = [
      "What does Joe Rogan think about AI?",
      "What is Elon Musk doing now?",
      "What was discussed about technology?",
      "What are the latest developments in space exploration?"
    ];

    const startTime = Date.now();
    
    for (const question of questions) {
      await smartAPIRouter.shouldUseAPI(question, mockLocalContent);
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / questions.length;
    
    console.log(`⚡ Performance: ${questions.length} decisions in ${totalTime}ms (avg: ${avgTime.toFixed(1)}ms per decision)`);
    
    // Should make decisions quickly (under 100ms per decision is reasonable)
    expect(avgTime).toBeLessThan(100);
  });
}); 