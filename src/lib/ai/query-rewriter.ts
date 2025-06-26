import Anthropic from '@anthropic-ai/sdk';

// Simple, focused interfaces for MVP
export interface QueryRewriteOptions {
  chatHistory?: string;
  episodeTitle?: string;
  speakers?: string;
  channelTitle?: string;
}

export interface RewriteResult {
  rewrittenQuery: string;
  intent: string;
  confidence: number;
  requiresRealTime: boolean;
  shouldUseRewritten: boolean;
  processingTimeMs: number;
}

const HAIKU_SYSTEM_PROMPT = `You are a query optimization assistant for a podcast Q&A system. 

Your job:
1. Rewrite vague/conversational questions into clear, standalone queries
2. Resolve pronouns using chat history and context
3. Detect user intent for smart routing
4. Only rewrite when it genuinely improves the query

Intent types: summarize, fact_check, compare, find_quote, get_opinion, current_info, episode_content

Return JSON only:
{
  "rewritten_query": "improved query text",
  "intent": "intent_category", 
  "confidence": 0.85,
  "requires_real_time": false,
  "should_use_rewritten": true
}`;

export class HaikuQueryRewriter {
  private anthropic: Anthropic;
  
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not found in environment');
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  async rewriteQuery(userInput: string, options: QueryRewriteOptions = {}): Promise<RewriteResult> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildPrompt(userInput, options);
      
      console.log(`🤖 Haiku rewriting: "${userInput}"`);
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        temperature: 0.3,
        system: HAIKU_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      });

      const result = this.parseResponse(response, userInput, startTime);
      
      console.log(`✅ Haiku result:`, {
        original: userInput,
        rewritten: result.rewrittenQuery,
        intent: result.intent,
        confidence: result.confidence,
        useRewritten: result.shouldUseRewritten,
        timeMs: result.processingTimeMs
      });
      
      return result;
      
    } catch (error) {
      console.warn(`⚠️ Haiku rewrite failed, using original query:`, error);
      return this.createFallback(userInput, startTime);
    }
  }

  private buildPrompt(userInput: string, options: QueryRewriteOptions): string {
    const { chatHistory = '', episodeTitle = 'Unknown', speakers = 'Unknown', channelTitle = 'Unknown' } = options;
    
    return `<input>
${userInput}
</input>

<history>
${chatHistory}
</history>

<context>
Episode: ${episodeTitle}
Speakers: ${speakers}
Channel: ${channelTitle}
</context>`;
  }

  private parseResponse(response: any, originalQuery: string, startTime: number): RewriteResult {
    const processingTimeMs = Date.now() - startTime;
    
    try {
      const content = response.content[0].text.trim();
      const parsed = JSON.parse(content);
      
      return {
        rewrittenQuery: parsed.rewritten_query || originalQuery,
        intent: parsed.intent || 'unknown',
        confidence: parsed.confidence || 0.5,
        requiresRealTime: parsed.requires_real_time || false,
        shouldUseRewritten: parsed.should_use_rewritten && parsed.confidence > 0.7,
        processingTimeMs
      };
    } catch (error) {
      console.warn('Failed to parse Haiku JSON response:', error);
      return this.createFallback(originalQuery, startTime);
    }
  }

  private createFallback(originalQuery: string, startTime: number): RewriteResult {
    return {
      rewrittenQuery: originalQuery,
      intent: 'unknown',
      confidence: 0.0,
      requiresRealTime: false,
      shouldUseRewritten: false,
      processingTimeMs: Date.now() - startTime
    };
  }
}

// Export singleton instance
export const haikuRewriter = new HaikuQueryRewriter();

// Validation function for setup checking
export function validateHaikuSetup(): { isValid: boolean; message: string } {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      isValid: false,
      message: 'ANTHROPIC_API_KEY not found. Add it to your .env.local file.'
    };
  }
  
  return {
    isValid: true,
    message: 'Haiku setup is valid'
  };
}

// Test the setup on module load
console.log('🔍 Haiku setup check:', validateHaikuSetup()); 