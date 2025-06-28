import Anthropic from '@anthropic-ai/sdk';

// Simple, focused interfaces for MVP
export interface QueryRewriteOptions {
  chatHistory?: string | any[];
  episodeTitle?: string;
  speakers?: string;
  channelTitle?: string;
  episodeContext?: {
    episode_id?: string;
    episode_title?: string;
    speakers?: string;
  };
}

export interface RewriteResult {
  rewrittenQuery: string;
  intent: string;
  confidence: number;
  requiresRealTime: boolean;
  shouldUseRewritten: boolean;
  processingTimeMs: number;
}

const HAIKU_SYSTEM_PROMPT = `Rewrite vague queries into clear, standalone questions. Resolve pronouns using context. Detect intent.

CRITICAL: When a question refers to something discussed in the conversation history (using "this", "that", "it", "these"), classify as "episode_content" or "find_quote" - NOT "get_opinion". Sometimes, queries will use this, that, it, these, but they are referring to something that is an external source. In this case, use get_opinion.

ONLY rewrite if the query is actually vague or has pronouns/unclear references. Don't rewrite clear, specific queries.

Intent Classification Rules:

- "summarize": Requests for summaries or overviews
- "fact_check": Questions about current/recent facts that may need verification  
- "compare": Comparing different topics, people, or concepts
- "find_quote": Looking for specific quotes or statements from the episode
- "get_opinion": Asking about someone's personal opinion (only when explicitly asking for opinions)
- "current_info": Questions about what's happening NOW (real-time events)
- "episode_content": Questions about the episode content, including follow-up questions with "this", "that", "it"

CONTEXT AWARENESS: If the question references something from history using pronouns/demonstratives ("this led to", "what did this mean", "thoughts about that"), classify as "episode_content".

Return JSON:
{
  "rewritten_query": "clear query",
  "intent": "intent_type", 
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
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Haiku timeout after 3s')), 3000);
      });
      
      const apiPromise = this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,  // Reduced from 200
        temperature: 0.1,  // Reduced for faster, more focused responses
        system: HAIKU_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const response = await Promise.race([apiPromise, timeoutPromise]);

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
    const { chatHistory = '', episodeTitle = 'Unknown', speakers = 'Unknown', channelTitle = 'Unknown', episodeContext } = options;
    
    // Format chat history
    const formattedHistory = Array.isArray(chatHistory) 
      ? chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')
      : chatHistory;
    
    // Use episodeContext if provided, otherwise fallback to individual options
    const contextTitle = episodeContext?.episode_title || episodeTitle;
    const contextSpeakers = episodeContext?.speakers || speakers;
    
    return `<input>
${userInput}
</input>

<history>
${formattedHistory}
</history>

<context>
Episode: ${contextTitle}
Speakers: ${contextSpeakers}
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
        shouldUseRewritten: parsed.should_use_rewritten && parsed.confidence > 0.7 && this.isRewriteWorthwhile(originalQuery, parsed.rewritten_query),
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

  private isRewriteWorthwhile(original: string, rewritten: string): boolean {
    // Don't rewrite if the queries are very similar
    if (original.length > 50 && rewritten.length / original.length < 1.2) {
      return false;
    }
    
    // Don't rewrite very short queries unless they have clear pronouns
    if (original.length < 10 && !/\b(he|she|it|they|this|that)\b/i.test(original)) {
      return false;
    }
    
    // Always rewrite if it contains pronouns
    if (/\b(he|she|it|they|this|that)\b/i.test(original)) {
      return true;
    }
    
    // Don't rewrite if original is already very specific
    if (original.length > 60 && original.includes('specific') || original.includes('exactly')) {
      return false;
    }
    
    return true;
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