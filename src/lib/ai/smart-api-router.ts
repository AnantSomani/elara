/**
 * Smart API Router - Intelligent decision making for when to use real-time APIs
 * Prevents unnecessary API calls and optimizes cost/performance
 */

export interface QuestionAnalysis {
  intent: 'factual' | 'opinion' | 'current_status' | 'future_prediction' | 'comparison';
  temporalContext: 'past' | 'present' | 'future' | 'general';
  entities: string[];
  requiresRealTime: boolean;
  confidence: number;
  reasoning: string;
  keywords: TemporalKeywords;
}

export interface TemporalKeywords {
  past: string[];
  present: string[];
  future: string[];
  general: string[];
}

export interface APIDecision {
  useAPI: boolean;
  priority: 'local_only' | 'api_only' | 'hybrid' | 'api_fallback';
  reasoning: string;
  confidence: number;
  estimatedLocalSufficiency: number; // 0-1 score
}

export interface ContentSufficiency {
  hasRelevantContent: boolean;
  confidenceScore: number; // 0-1
  contentSources: string[];
  gaps: string[];
  recommendation: 'sufficient' | 'insufficient' | 'partial';
}

class SmartAPIRouter {
  private readonly temporalKeywords = {
    past: [
      'was', 'were', 'did', 'had', 'used to', 'previously', 'before',
      'discussed', 'talked about', 'mentioned', 'said', 'told',
      'during the podcast', 'in the episode', 'conversation',
      'what does...think', 'opinion', 'believes'
    ],
    present: [
      'now', 'currently', 'today', 'this year', '2025', 'latest',
      'recent', 'doing now', 'up to', 'activities', 'projects',
      'current', 'present', 'at the moment', 'these days'
    ],
    future: [
      'will', 'going to', 'plans', 'future', 'next', 'upcoming',
      'planning', 'intends', 'expects', 'predictions', 'forecast'
    ],
    general: [
      'about', 'regarding', 'concerning', 'generally', 'usually',
      'typically', 'in general', 'overall'
    ]
  };

  private readonly localContentIndicators = [
    'think', 'opinion', 'believes', 'discussed', 'talked about',
    'mentioned', 'said', 'told', 'during', 'conversation',
    'episode', 'podcast', 'interview', 'chat'
  ];

  private readonly realTimeIndicators = [
    'now', 'current', 'currently', 'today', '2025', 'latest',
    'recent', 'doing now', 'activities', 'projects', 'status',
    'up to', 'these days', 'at the moment'
  ];

  /**
   * Main decision function - determines if API call is needed
   */
  async shouldUseAPI(
    question: string, 
    localRAGResults: any[] = [],
    episodeContext?: any
  ): Promise<APIDecision> {
    
    console.log(`🤔 Smart Router analyzing: "${question}"`);
    
    // Step 1: Analyze the question
    const analysis = this.analyzeQuestion(question);
    console.log(`📊 Question analysis:`, analysis);
    
    // Step 2: Assess local content sufficiency
    const sufficiency = this.assessContentSufficiency(question, localRAGResults);
    console.log(`📚 Content sufficiency:`, sufficiency);
    
    // Step 3: Make intelligent decision
    const decision = this.makeAPIDecision(analysis, sufficiency);
    console.log(`🎯 API Decision:`, decision);
    
    return decision;
  }

  /**
   * Enhanced API decision with Haiku intent awareness
   */
  async shouldUseAPIWithIntent(
    question: string,
    detectedIntent: string,
    haikuConfidence: number,
    localRAGResults: any[] = [],
    episodeContext?: any
  ): Promise<APIDecision & { detectedIntent: string }> {
    
    console.log(`🤖 Smart Router with Intent analyzing: "${question}"`);
    console.log(`🧠 Haiku detected intent: ${detectedIntent} (confidence: ${haikuConfidence})`);
    
    // Get base decision from existing logic
    const baseDecision = await this.shouldUseAPI(question, localRAGResults, episodeContext);
    
    // Intent-based overrides (only for high confidence)
    if (haikuConfidence > 0.8) {
      // Force real-time for these intents
      if (['current_info', 'fact_check'].includes(detectedIntent)) {
        console.log(`🔄 Intent override: ${detectedIntent} requires real-time data`);
        return {
          ...baseDecision,
          useAPI: true,
          priority: 'api_only' as const,
          reasoning: `${baseDecision.reasoning} + High-confidence intent: ${detectedIntent}`,
          confidence: Math.max(baseDecision.confidence, 0.8),
          detectedIntent
        };
      }
      
      // Force local-only for these intents
      if (['summarize', 'find_quote', 'get_opinion', 'episode_content'].includes(detectedIntent)) {
        console.log(`🏠 Intent override: ${detectedIntent} should use local content`);
        return {
          ...baseDecision,
          useAPI: false,
          priority: 'local_only' as const,
          reasoning: `${baseDecision.reasoning} + High-confidence local intent: ${detectedIntent}`,
          confidence: Math.max(baseDecision.confidence, 0.8),
          detectedIntent
        };
      }
      
      // Compare intent suggests hybrid approach
      if (detectedIntent === 'compare') {
        console.log(`⚖️ Intent override: ${detectedIntent} may benefit from hybrid approach`);
        return {
          ...baseDecision,
          useAPI: baseDecision.useAPI, // Keep base decision but boost confidence
          priority: 'hybrid' as const,
          reasoning: `${baseDecision.reasoning} + Intent: ${detectedIntent} (comparison may benefit from multiple sources)`,
          confidence: Math.max(baseDecision.confidence, 0.7),
          detectedIntent
        };
      }
    }
    
    // For lower confidence, enhance the reasoning but don't override
    console.log(`📊 Using base router decision with intent context`);
    return { 
      ...baseDecision, 
      reasoning: `${baseDecision.reasoning} + Intent: ${detectedIntent} (confidence: ${haikuConfidence.toFixed(2)})`,
      detectedIntent 
    };
  }

  /**
   * Analyze question to understand intent, temporal context, and requirements
   */
  private analyzeQuestion(question: string): QuestionAnalysis {
    const lowerQuestion = question.toLowerCase();
    
    // Detect temporal context
    const temporalContext = this.detectTemporalContext(lowerQuestion);
    
    // Detect intent
    const intent = this.detectIntent(lowerQuestion);
    
    // Extract entities (people, places, things)
    const entities = this.extractEntities(question);
    
    // Determine if real-time is required based on keywords and context
    const requiresRealTime = this.determineRealTimeRequirement(lowerQuestion, temporalContext, intent);
    
    // Calculate confidence
    const confidence = this.calculateAnalysisConfidence(lowerQuestion, temporalContext, intent);
    
    // Generate reasoning
    const reasoning = this.generateReasoning(intent, temporalContext, requiresRealTime);
    
    // Categorize keywords found
    const keywords = this.categorizeKeywords(lowerQuestion);
    
    return {
      intent,
      temporalContext,
      entities,
      requiresRealTime,
      confidence,
      reasoning,
      keywords
    };
  }

  private detectTemporalContext(question: string): 'past' | 'present' | 'future' | 'general' {
    const presentScore = this.temporalKeywords.present.filter(keyword => 
      question.includes(keyword)
    ).length;
    
    const pastScore = this.temporalKeywords.past.filter(keyword => 
      question.includes(keyword)
    ).length;
    
    const futureScore = this.temporalKeywords.future.filter(keyword => 
      question.includes(keyword)
    ).length;
    
    // Present indicators are strongest
    if (presentScore > 0) return 'present';
    if (futureScore > 0) return 'future';
    if (pastScore > 0) return 'past';
    
    return 'general';
  }

  private detectIntent(question: string): QuestionAnalysis['intent'] {
    // Opinion/belief questions
    if (question.match(/what does .+ think|opinion|believes?|feels?/i)) {
      return 'opinion';
    }
    
    // Current status questions  
    if (question.match(/doing now|current|currently|up to|activities|projects/i)) {
      return 'current_status';
    }
    
    // Future prediction questions
    if (question.match(/will|going to|plans|future|next|upcoming/i)) {
      return 'future_prediction';
    }
    
    // Comparison questions
    if (question.match(/compare|versus|vs|difference|similar/i)) {
      return 'comparison';
    }
    
    // Default to factual
    return 'factual';
  }

  private extractEntities(question: string): string[] {
    const entities: string[] = [];
    
    // Common names/people (basic extraction)
    const peoplePatterns = [
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // "Joe Rogan", "Khabib Nurmagomedov"
      /\bKhabib\b/gi,
      /\bJoe\s+Rogan\b/gi,
      /\bRogan\b/gi
    ];
    
    peoplePatterns.forEach(pattern => {
      const matches = question.match(pattern);
      if (matches) {
        entities.push(...matches);
      }
    });
    
    return [...new Set(entities)]; // Remove duplicates
  }

  private determineRealTimeRequirement(
    question: string, 
    temporalContext: string, 
    intent: string
  ): boolean {
    // Strong real-time indicators
    if (temporalContext === 'present') return true;
    if (temporalContext === 'future') return true;
    
    // Current status always needs real-time
    if (intent === 'current_status') return true;
    
    // Opinion questions about past discussions don't need real-time
    if (intent === 'opinion' && temporalContext === 'past') return false;
    
    // Check for explicit real-time keywords
    const hasRealTimeKeywords = this.realTimeIndicators.some(keyword => 
      question.includes(keyword)
    );
    
    if (hasRealTimeKeywords) return true;
    
    // Check for local content indicators
    const hasLocalContentKeywords = this.localContentIndicators.some(keyword => 
      question.includes(keyword)
    );
    
    if (hasLocalContentKeywords) return false;
    
    // Default based on temporal context
    return temporalContext !== 'past' && temporalContext !== 'general';
  }

  private calculateAnalysisConfidence(
    question: string, 
    temporalContext: string, 
    intent: string
  ): number {
    let confidence = 0.5; // Base confidence
    
    // High confidence indicators
    if (temporalContext === 'present') confidence += 0.3;
    if (temporalContext === 'past') confidence += 0.2;
    if (intent === 'opinion') confidence += 0.2;
    if (intent === 'current_status') confidence += 0.3;
    
    // Explicit keywords boost confidence
    const explicitKeywords = ['think', 'opinion', 'now', 'currently', 'discussed'];
    const keywordMatches = explicitKeywords.filter(keyword => 
      question.toLowerCase().includes(keyword)
    ).length;
    
    confidence += keywordMatches * 0.1;
    
    return Math.min(confidence, 1.0);
  }

  private generateReasoning(
    intent: string, 
    temporalContext: string, 
    requiresRealTime: boolean
  ): string {
    const parts = [];
    
    parts.push(`Intent: ${intent}`);
    parts.push(`Temporal: ${temporalContext}`);
    
    if (requiresRealTime) {
      parts.push("Requires real-time data");
    } else {
      parts.push("Can use local content");
    }
    
    return parts.join(', ');
  }

  private categorizeKeywords(question: string): TemporalKeywords {
    const found: TemporalKeywords = {
      past: [],
      present: [],
      future: [],
      general: []
    };
    
    Object.entries(this.temporalKeywords).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (question.includes(keyword)) {
          found[category as keyof TemporalKeywords].push(keyword);
        }
      });
    });
    
    return found;
  }

  /**
   * Assess if local content is sufficient to answer the question
   */
  private assessContentSufficiency(question: string, localResults: any[]): ContentSufficiency {
    const hasContent = localResults && localResults.length > 0;
    
    if (!hasContent) {
      return {
        hasRelevantContent: false,
        confidenceScore: 0,
        contentSources: [],
        gaps: ['No local content found'],
        recommendation: 'insufficient'
      };
    }
    
    // Simple relevance scoring based on result count and similarity
    const avgSimilarity = localResults.reduce((sum, result) => 
      sum + (result.similarity || 0), 0) / localResults.length;
    
    const confidenceScore = Math.min(avgSimilarity * 1.2, 1.0); // Boost slightly
    
    const contentSources = localResults.map(result => 
      result.content_type || 'transcript'
    );
    
    let recommendation: ContentSufficiency['recommendation'];
    if (confidenceScore >= 0.7) recommendation = 'sufficient';
    else if (confidenceScore >= 0.4) recommendation = 'partial';
    else recommendation = 'insufficient';
    
    return {
      hasRelevantContent: hasContent,
      confidenceScore,
      contentSources,
      gaps: confidenceScore < 0.7 ? ['Low confidence in local content'] : [],
      recommendation
    };
  }

  /**
   * Make the final decision on whether to use API
   */
  private makeAPIDecision(
    analysis: QuestionAnalysis, 
    sufficiency: ContentSufficiency
  ): APIDecision {
    
    // Strong API requirements - Present tense current status
    if (analysis.requiresRealTime && analysis.temporalContext === 'present') {
      return {
        useAPI: true,
        priority: 'api_only',
        reasoning: 'Current status question requires real-time data',
        confidence: 0.9,
        estimatedLocalSufficiency: 0.1
      };
    }

    // Future predictions also need real-time data
    if (analysis.requiresRealTime && analysis.temporalContext === 'future') {
      return {
        useAPI: true,
        priority: 'api_only',
        reasoning: 'Future prediction requires current context and real-time data',
        confidence: 0.8,
        estimatedLocalSufficiency: 0.1
      };
    }
    
    // Opinion questions with good local content
    if (analysis.intent === 'opinion' && sufficiency.recommendation === 'sufficient') {
      return {
        useAPI: false,
        priority: 'local_only',
        reasoning: 'Opinion question with sufficient local content',
        confidence: 0.8,
        estimatedLocalSufficiency: sufficiency.confidenceScore
      };
    }
    
    // Past discussions should use local content
    if (analysis.temporalContext === 'past' && sufficiency.hasRelevantContent) {
      return {
        useAPI: false,
        priority: 'local_only',
        reasoning: 'Past discussion question with available local content',
        confidence: 0.7,
        estimatedLocalSufficiency: sufficiency.confidenceScore
      };
    }
    
    // Low local content + real-time indicators = API
    if (analysis.requiresRealTime && sufficiency.recommendation === 'insufficient') {
      return {
        useAPI: true,
        priority: 'api_only',
        reasoning: 'Real-time requirement with insufficient local content',
        confidence: 0.8,
        estimatedLocalSufficiency: sufficiency.confidenceScore
      };
    }
    
    // Hybrid approach for partial local content + some real-time need
    if (sufficiency.recommendation === 'partial' && analysis.requiresRealTime) {
      return {
        useAPI: true,
        priority: 'hybrid',
        reasoning: 'Partial local content + real-time need = hybrid approach',
        confidence: 0.6,
        estimatedLocalSufficiency: sufficiency.confidenceScore
      };
    }
    
    // Default: prefer local if available
    if (sufficiency.hasRelevantContent) {
      return {
        useAPI: false,
        priority: 'local_only',
        reasoning: 'Sufficient local content available',
        confidence: 0.6,
        estimatedLocalSufficiency: sufficiency.confidenceScore
      };
    }
    
    // Fallback to API
    return {
      useAPI: true,
      priority: 'api_fallback',
      reasoning: 'No sufficient local content, using API as fallback',
      confidence: 0.5,
      estimatedLocalSufficiency: 0.1
    };
  }
}

// Export singleton instance
export const smartAPIRouter = new SmartAPIRouter(); 