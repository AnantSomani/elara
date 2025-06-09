/**
 * Enhanced RAG Engine with Real-Time Data Integration
 * Extends the existing RAG system to include real-time data fetching
 */

import OpenAI from 'openai';
import { getRelevantContext, semanticSearch, EmbeddingResult } from './embeddings';
import { supabaseAdmin } from '@/lib/database/supabase';
import { 
  realTimeTools, 
  needsRealTimeData, 
  ToolResult,
  getSportsStats,
  getCurrentNews,
  getStockInfo,
  getWeatherInfo,
  getGeneralRealTimeInfo,
  intelligentRealTimeDetection,
  getEnhancedRealTimeData
} from './real-time-tools';
import { smartAPIRouter, APIDecision } from './smart-api-router';
import type { ConversationContext, HostPersonality, AIResponse } from '@/types/conversation';

// Lazy OpenAI client initialization
let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

const DEFAULT_MODEL = 'gpt-4';
const MAX_TOKENS = 1000; // Increased for real-time content
const TEMPERATURE = 0.7;

interface EnhancedRAGOptions {
  maxRelevantChunks?: number;
  similarityThreshold?: number;
  includePersonality?: boolean;
  includeConversationHistory?: boolean;
  useSemanticSearch?: boolean;
  enhancedContext?: boolean;
  enableRealTimeData?: boolean;
  maxRealTimeTools?: number;
}

interface EnhancedRAGContext {
  relevantTranscripts: EmbeddingResult[];
  personalityData?: EmbeddingResult[];
  conversationHistory?: EmbeddingResult[];
  episodeContext?: any;
  guestContext?: any;
  hostContext?: HostPersonality;
  searchQuery: string;
  episodeId: string;
  contextWeights: {
    episode: number;
    guest: number;
    host: number;
    transcript: number;
  };
  realTimeData?: ToolResult[];
  realTimeUsed?: boolean;
  smartRouterDecision?: APIDecision | null;
}

/**
 * Enhanced RAG response generation with real-time data integration
 */
export async function generateEnhancedRAGResponse(
  question: string,
  context: ConversationContext,
  options: EnhancedRAGOptions = {}
): Promise<AIResponse & { ragContext: EnhancedRAGContext }> {
  const startTime = Date.now();
  
  try {
    const {
      maxRelevantChunks = 5,
      similarityThreshold = 0.6,
      includePersonality = true,
      includeConversationHistory = true,
      useSemanticSearch = true,
      enhancedContext = true,
      enableRealTimeData = true,
      maxRealTimeTools = 2,
    } = options;

    console.log(`🚀 Enhanced RAG processing: "${question}"`);

    // Step 1: Always retrieve local RAG context first
    const localRAGContext = await retrieveEnhancedContext(
      question,
      context,
      {
        maxRelevantChunks,
        similarityThreshold,
        includePersonality,
        includeConversationHistory,
        useSemanticSearch,
        enhancedContext,
      },
      [] // No real-time data yet
    );

    console.log(`📚 Local RAG results: ${localRAGContext.relevantTranscripts.length} transcripts found`);

    // Step 2: Use smart router to decide if real-time API is needed
    let apiDecision: APIDecision | null = null;
    let realTimeData: ToolResult[] = [];
    let realTimeUsed = false;

    if (enableRealTimeData) {
      apiDecision = await smartAPIRouter.shouldUseAPI(
        question,
        localRAGContext.relevantTranscripts,
        context
      );

      console.log(`🤖 Smart Router Decision:`, {
        useAPI: apiDecision.useAPI,
        priority: apiDecision.priority,
        reasoning: apiDecision.reasoning,
        confidence: apiDecision.confidence
      });

      if (apiDecision.useAPI) {
        console.log(`⚡ Fetching real-time data as recommended by smart router`);
        
        try {
          // Use intelligent real-time detection for any industry
          const intelligentAnalysis = await intelligentRealTimeDetection(question, context.episodeMetadata);
          
          console.log(`🤖 Intelligent Analysis:`, {
            needsRealTime: intelligentAnalysis.needsRealTime,
            category: intelligentAnalysis.category,
            entities: intelligentAnalysis.entities,
            strategy: intelligentAnalysis.searchStrategy,
            confidence: intelligentAnalysis.confidence
          });

          if (intelligentAnalysis.needsRealTime && intelligentAnalysis.confidence > 0.5) {
            // Use enhanced multi-source data fetching
            realTimeData = await getEnhancedRealTimeData(intelligentAnalysis);
            realTimeUsed = true;
            
            console.log(`✅ Retrieved ${realTimeData.length} real-time data sources using intelligent analysis`);
          } else {
            console.log(`🏠 Intelligent analysis suggests local content is sufficient (confidence: ${intelligentAnalysis.confidence})`);
          }
        } catch (error) {
          console.warn('Intelligent real-time analysis failed, falling back to pattern matching:', error);
          
          // Fallback to original pattern matching
          const realTimeAnalysis = needsRealTimeData(question);
          if (realTimeAnalysis.needsRealTime) {
            realTimeData = await fetchRealTimeData(question, realTimeAnalysis, maxRealTimeTools);
            realTimeUsed = true;
          }
        }
      } else {
        console.log(`🏠 Using local content only as recommended by smart router`);
        console.log(`💰 API call saved! Reason: ${apiDecision.reasoning}`);
      }
    }

    // Step 3: Re-retrieve context with real-time data if available
    const ragContext = await retrieveEnhancedContext(
      question,
      context,
      {
        maxRelevantChunks,
        similarityThreshold,
        includePersonality,
        includeConversationHistory,
        useSemanticSearch,
        enhancedContext,
      },
      realTimeData
    );

    // Step 4: Build enhanced prompt with smart routing info
    const systemPrompt = buildEnhancedSystemPrompt(context.hostPersonality, ragContext, apiDecision);
    const userPrompt = buildEnhancedUserPrompt(question, ragContext);

    console.log(`📝 System prompt length: ${systemPrompt.length} chars`);
    console.log(`📝 User prompt length: ${userPrompt.length} chars`);

    // Step 5: Generate response
    const completion = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      stream: false,
    }) as OpenAI.Chat.Completions.ChatCompletion;

    const responseMessage = completion.choices[0]?.message?.content || 
      'I apologize, but I cannot generate a response right now.';
    const responseTime = Date.now() - startTime;

    // Step 6: Calculate enhanced confidence with smart routing consideration
    const confidence = calculateEnhancedConfidence(completion, ragContext, apiDecision);

    const suggestions = generateEnhancedSuggestions(question, ragContext);

    return {
      message: responseMessage,
      confidence,
      responseTime,
      contextUsed: extractEnhancedContextUsed(ragContext, apiDecision),
      personality: context.hostPersonality?.name || 'Default',
      suggestions,
      ragContext: {
        ...ragContext,
        realTimeData,
        realTimeUsed,
        smartRouterDecision: apiDecision,
      },
    };

  } catch (error) {
    console.error('Error generating enhanced RAG response:', error);
    
    const fallbackContext: EnhancedRAGContext = {
      relevantTranscripts: [],
      searchQuery: question,
      episodeId: context.episodeId || '',
      contextWeights: {
        episode: 0,
        guest: 0,
        host: 0,
        transcript: 0,
      },
      realTimeData: [],
      realTimeUsed: false,
      smartRouterDecision: null,
    };

    return {
      message: 'I apologize, but I encountered an error while processing your question. Please try again.',
      confidence: 0,
      responseTime: Date.now() - startTime,
      contextUsed: [],
      personality: 'Error',
      ragContext: fallbackContext,
    };
  }
}

/**
 * Fetch real-time data based on query analysis
 */
async function fetchRealTimeData(
  question: string, 
  analysis: ReturnType<typeof needsRealTimeData>,
  maxTools: number
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  
  try {
    switch (analysis.category) {
      case 'sports':
        if (analysis.entities.length > 0) {
          const player = analysis.entities.find(e => 
            ['curry', 'lebron', 'durant', 'giannis', 'luka', 'tatum', 'jokic', 'embiid'].includes(e.toLowerCase())
          );
          const team = analysis.entities.find(e => 
            ['warriors', 'lakers', 'celtics', 'nuggets', 'heat', 'bucks', 'nets', 'suns'].includes(e.toLowerCase())
          );
          
          if (player) {
            const sportsData = await getSportsStats(player, team);
            results.push(sportsData);
          }
        }
        break;

      case 'news':
        const topic = analysis.entities.length > 0 ? analysis.entities[0] : 'general news';
        const newsData = await getCurrentNews(topic);
        results.push(newsData);
        break;

      case 'stocks':
        if (analysis.entities.length > 0) {
          const symbol = analysis.entities[0];
          const stockData = await getStockInfo(symbol);
          results.push(stockData);
        }
        break;

      case 'weather':
        const location = analysis.entities.length > 0 ? analysis.entities[0] : 'general weather';
        const weatherData = await getWeatherInfo(location);
        results.push(weatherData);
        break;

      case 'general':
      default:
        const generalData = await getGeneralRealTimeInfo(question);
        results.push(generalData);
        break;
    }

    // Limit to maxTools
    return results.slice(0, maxTools);

  } catch (error) {
    console.error('Error fetching real-time data:', error);
    return [];
  }
}

/**
 * Enhanced context retrieval including real-time data
 */
async function retrieveEnhancedContext(
  question: string,
  context: ConversationContext,
  options: any,
  realTimeData: ToolResult[]
): Promise<EnhancedRAGContext> {
  const episodeId = context.episodeId;

  try {
    // Get regular RAG context
    const searchResults = await semanticSearch(question, {
      contentTypes: ['transcript', 'episode', 'personality'],
      episodeId,
      limit: options.maxRelevantChunks,
      threshold: options.similarityThreshold,
    });

    // Enhance with real-time data in context weights
    const contextWeights = {
      episode: 0.3,
      guest: 0.2,
      host: 0.2,
      transcript: 0.3,
    };

    // If we have real-time data, adjust weights to prioritize it
    if (realTimeData.length > 0) {
      contextWeights.episode = 0.2; // Reduce episode weight
      contextWeights.transcript = 0.2; // Reduce transcript weight
      // Real-time data will be given high priority in prompt construction
    }

    return {
      relevantTranscripts: searchResults || [],
      personalityData: [], 
      conversationHistory: [],
      episodeContext: null,
      guestContext: null,
      hostContext: context.hostPersonality,
      searchQuery: question,
      episodeId: episodeId || '',
      contextWeights,
      realTimeData,
      realTimeUsed: realTimeData.length > 0,
    };

  } catch (error) {
    console.error('Error retrieving enhanced context:', error);
    
    return {
      relevantTranscripts: [],
      searchQuery: question,
      episodeId: episodeId || '',
      contextWeights: {
        episode: 0.25,
        guest: 0.25,
        host: 0.25,
        transcript: 0.25,
      },
      realTimeData,
      realTimeUsed: realTimeData.length > 0,
    };
  }
}

/**
 * Build enhanced system prompt including real-time data guidance
 */
function buildEnhancedSystemPrompt(hostPersonality?: HostPersonality, ragContext?: EnhancedRAGContext, apiDecision?: APIDecision | null): string {
  const hostName = hostPersonality?.name || 'the host';
  
  let prompt = `You are Elara, a knowledgeable podcast assistant with access to both podcast content AND current real-time information.

ELARA'S PERSONALITY & EXPERTISE:
- You're an expert podcast analyst who helps listeners understand episodes
- You're enthusiastic about podcasting and genuinely excited to help people explore content
- You can reference both past podcast discussions AND current events/data
- You discuss hosts and guests in third person while providing your own insights

RESPONSE CAPABILITIES:
- Draw from podcast episodes and conversations
- Integrate current, real-time information when relevant
- Blend historical podcast context with up-to-date facts
- Maintain your friendly, knowledgeable voice while being informative
- Provide analysis about the host (${hostName}) and their style`;

  // Enhanced prompt with real-time guidance
  if (ragContext?.realTimeData && ragContext.realTimeData.length > 0) {
    prompt += `\n\n## REAL-TIME DATA INTEGRATION
You have access to current real-time information. When users ask about current events, recent developments, or "what's happening now," prioritize this real-time data while maintaining your podcast assistant perspective.

Real-time data sources: ${ragContext.realTimeData.length}
Real-time tools used: ${ragContext.realTimeData.map(tool => tool.tool).join(', ')}

Balance this current information with podcast content to provide comprehensive, up-to-date responses.`;
  }

  // Smart routing information
  if (apiDecision) {
    prompt += `\n\n## CONTENT STRATEGY
Smart routing decision: ${apiDecision.priority.toUpperCase()}
Reasoning: ${apiDecision.reasoning}
Content confidence: ${(apiDecision.estimatedLocalSufficiency * 100).toFixed(0)}%

${apiDecision.useAPI ? 
  'You have access to both podcast content AND current real-time data. Blend both appropriately.' :
  'You are using podcast content only. Focus on discussions, insights, and analysis of the show.'
}`;
  }

  prompt += `\n\n## RESPONSE GUIDELINES
- Stay in character as Elara, the podcast assistant
- Reference specific podcast content when relevant
- Discuss the host (${hostName}) and guests in third person while providing analysis
- If using real-time data, clearly integrate it with podcast context
- Be honest about the recency and source of information
- Maintain your enthusiastic but professional voice and perspective`;

  return prompt;
}

/**
 * Build enhanced user prompt with real-time data context
 */
function buildEnhancedUserPrompt(question: string, ragContext: EnhancedRAGContext): string {
  let prompt = '';

  // Add real-time data first if available
  if (ragContext.realTimeData && ragContext.realTimeData.length > 0) {
    prompt += `CURRENT REAL-TIME INFORMATION:\n\n`;
    
    ragContext.realTimeData.forEach((toolResult, index) => {
      if (toolResult.success && toolResult.data) {
        prompt += `[${toolResult.tool.toUpperCase()}] Retrieved: ${toolResult.timestamp}\n`;
        prompt += `Query: ${toolResult.query}\n`;
        
        if (toolResult.data.searchResults) {
          prompt += `Current Information: ${JSON.stringify(toolResult.data.searchResults, null, 2)}\n`;
        } else {
          prompt += `Data: ${JSON.stringify(toolResult.data, null, 2)}\n`;
        }
        prompt += `\n`;
      }
    });
    
    prompt += `---\n\n`;
  }

  // Add podcast context
  if (ragContext.relevantTranscripts.length > 0) {
    prompt += `RELEVANT PODCAST CONTENT:\n\n`;
    
    ragContext.relevantTranscripts.forEach((chunk, index) => {
      const similarity = chunk.similarity ? `(${(chunk.similarity * 100).toFixed(0)}% relevant)` : '';
      const timestamp = chunk.metadata.startTime ? 
        `[${Math.floor(chunk.metadata.startTime / 60)}:${String(Math.floor(chunk.metadata.startTime % 60)).padStart(2, '0')}]` : 
        `[Section ${index + 1}]`;
      
      prompt += `${timestamp} ${similarity}\n"${chunk.content}"\n\n`;
    });
    
    prompt += `---\n\n`;
  }

  // Add the question with context about available data
  prompt += `LISTENER'S QUESTION: ${question}\n\n`;

  if (ragContext.realTimeUsed) {
    prompt += `RESPONSE GUIDANCE: You have both podcast content and current real-time information available. `;
    prompt += `Please provide a comprehensive response that combines relevant podcast insights with up-to-date information. `;
    prompt += `If the question asks for current/latest information, prioritize the real-time data while incorporating relevant podcast context.`;
  } else {
    prompt += `RESPONSE GUIDANCE: Base your response on the podcast content provided. `;
    prompt += `If the question asks for very current information that you don't have, acknowledge this limitation.`;
  }

  return prompt;
}

/**
 * Calculate enhanced confidence including real-time data quality
 */
function calculateEnhancedConfidence(
  completion: OpenAI.Chat.Completions.ChatCompletion | null,
  ragContext: EnhancedRAGContext,
  apiDecision?: APIDecision | null
): number {
  let confidence = 0.5; // Base confidence

  // Boost for podcast content quality
  if (ragContext.relevantTranscripts.length > 0) {
    const avgSimilarity = ragContext.relevantTranscripts.reduce(
      (sum, chunk) => sum + (chunk.similarity || 0),
      0
    ) / ragContext.relevantTranscripts.length;
    
    confidence += avgSimilarity * 0.25; // Max boost of 0.25
  }

  // Boost for real-time data availability
  if (ragContext.realTimeUsed && ragContext.realTimeData) {
    const successfulTools = ragContext.realTimeData.filter(tool => tool.success).length;
    confidence += (successfulTools / Math.max(ragContext.realTimeData.length, 1)) * 0.2; // Max boost of 0.2
  }

  // Boost for personality data
  if (ragContext.personalityData && ragContext.personalityData.length > 0) {
    confidence += 0.05;
  }

  return Math.min(Math.max(confidence, 0), 1); // Clamp between 0 and 1
}

/**
 * Generate enhanced suggestions including real-time capabilities
 */
function generateEnhancedSuggestions(question: string, ragContext: EnhancedRAGContext): string[] {
  const suggestions = [];
  
  if (ragContext.realTimeUsed) {
    suggestions.push("Ask about current trends in this topic");
    suggestions.push("Compare this to recent developments");
  }
  
  if (ragContext.relevantTranscripts.length > 0) {
    suggestions.push("Tell me more about this from the podcast");
    suggestions.push("What else was discussed on this topic?");
  }
  
  suggestions.push("How does this relate to other episodes?");
  
  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Extract context used for metadata
 */
function extractEnhancedContextUsed(ragContext: EnhancedRAGContext, apiDecision?: APIDecision | null): string[] {
  const contextUsed = [];
  
  if (ragContext.relevantTranscripts.length > 0) {
    contextUsed.push(`${ragContext.relevantTranscripts.length} podcast segments`);
  }
  
  if (ragContext.realTimeData && ragContext.realTimeData.length > 0) {
    const successfulTools = ragContext.realTimeData.filter(tool => tool.success);
    contextUsed.push(`${successfulTools.length} real-time data sources`);
  }
  
  if (ragContext.personalityData && ragContext.personalityData.length > 0) {
    contextUsed.push('host personality data');
  }
  
  if (apiDecision) {
    contextUsed.push(`API Decision: ${apiDecision.useAPI ? 'Used' : 'Not Used'}`);
    contextUsed.push(`API Priority: ${apiDecision.priority}`);
    contextUsed.push(`API Reasoning: ${apiDecision.reasoning}`);
    contextUsed.push(`API Confidence: ${apiDecision.confidence}`);
  }
  
  return contextUsed;
} 