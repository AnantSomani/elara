import OpenAI from 'openai';
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

// Default conversation parameters
const DEFAULT_MODEL = 'gpt-4';
const MAX_TOKENS = 500;
const TEMPERATURE = 0.7;

interface ChatCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Generate AI response with host personality and context awareness
 */
export async function generateAIResponse(
  question: string,
  context: ConversationContext,
  options: ChatCompletionOptions = {}
): Promise<AIResponse> {
  const startTime = Date.now();
  
  try {
    const systemPrompt = buildSystemPrompt(context.hostPersonality);
    const contextPrompt = buildContextPrompt(context);
    const userPrompt = `${contextPrompt}\n\nUser question: ${question}`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: options.model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: options.maxTokens || MAX_TOKENS,
      temperature: options.temperature || TEMPERATURE,
      stream: false,
    }) as OpenAI.Chat.Completions.ChatCompletion;

    const responseMessage = completion.choices[0]?.message?.content || 'I apologize, but I cannot generate a response right now.';
    const responseTime = Date.now() - startTime;

    return {
      message: responseMessage,
      confidence: calculateConfidence(completion),
      responseTime,
      contextUsed: extractContextUsed(context),
      personality: context.hostPersonality?.name || 'Default',
      suggestions: generateFollowUpSuggestions(question, context),
    };
  } catch (error) {
    console.error('Error generating AI response:', error);
    return {
      message: 'I apologize, but I encountered an error while processing your question. Please try again.',
      confidence: 0,
      responseTime: Date.now() - startTime,
      contextUsed: [],
      personality: 'Error',
    };
  }
}

/**
 * Stream AI response for real-time updates
 */
export async function* streamAIResponse(
  question: string,
  context: ConversationContext,
  options: ChatCompletionOptions = {}
): AsyncGenerator<string, AIResponse, unknown> {
  const startTime = Date.now();
  
  try {
    const systemPrompt = buildSystemPrompt(context.hostPersonality);
    const contextPrompt = buildContextPrompt(context);
    const userPrompt = `${contextPrompt}\n\nUser question: ${question}`;

    const stream = await getOpenAIClient().chat.completions.create({
      model: options.model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: options.maxTokens || MAX_TOKENS,
      temperature: options.temperature || TEMPERATURE,
      stream: true,
    });

    let fullResponse = '';
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        yield content;
      }
    }

    const responseTime = Date.now() - startTime;
    
    return {
      message: fullResponse,
      confidence: 0.8, // Default confidence for streaming
      responseTime,
      contextUsed: extractContextUsed(context),
      personality: context.hostPersonality?.name || 'Default',
      suggestions: generateFollowUpSuggestions(question, context),
    };
  } catch (error) {
    console.error('Error streaming AI response:', error);
    yield 'I apologize, but I encountered an error while processing your question.';
    
    return {
      message: 'Error occurred during streaming',
      confidence: 0,
      responseTime: Date.now() - startTime,
      contextUsed: [],
      personality: 'Error',
    };
  }
}

/**
 * Build system prompt with host personality
 */
function buildSystemPrompt(hostPersonality?: HostPersonality): string {
  if (!hostPersonality) {
    return `You are a helpful AI assistant that answers questions about podcast episodes. 
    Provide clear, concise, and accurate responses based on the context provided.`;
  }

  const { conversationStyle, knowledge } = hostPersonality;
  
  return `You are ${hostPersonality.name}, the podcast host. Respond as if you are the actual host having a conversation with a listener.

PERSONALITY:
- Name: ${hostPersonality.name}
- Description: ${hostPersonality.description}
- Tone: ${conversationStyle.tone}
- Communication style: ${conversationStyle.verbosity}
- Expertise areas: ${conversationStyle.expertise.join(', ')}

BEHAVIORAL GUIDELINES:
- Use a ${conversationStyle.tone} tone throughout the conversation
- Be ${conversationStyle.verbosity} in your responses
- Draw from your expertise in: ${conversationStyle.expertise.join(', ')}
- Reference your past opinions and statements when relevant
- Use common phrases you're known for: ${conversationStyle.commonPhrases.join(', ')}
- Embody these personality traits: ${conversationStyle.personality_traits.join(', ')}

KNOWLEDGE BASE:
- Your main topics: ${knowledge.topics.join(', ')}
- Recurring themes you discuss: ${knowledge.recurring_themes.join(', ')}

Remember: You are not an AI assistant - you are ${hostPersonality.name}. Respond as the host would, with their voice, opinions, and personality.`;
}

/**
 * Build context prompt from conversation context
 */
function buildContextPrompt(context: ConversationContext): string {
  const { episodeMetadata, recentTranscription, conversationHistory } = context;
  
  let prompt = `CURRENT EPISODE CONTEXT:
Title: ${episodeMetadata.title}
Description: ${episodeMetadata.description}
Current timestamp: ${Math.floor(context.currentTimestamp / 60)}:${String(Math.floor(context.currentTimestamp % 60)).padStart(2, '0')}

`;

  // Add recent transcription
  if (recentTranscription.length > 0) {
    prompt += `RECENT AUDIO TRANSCRIPT (what was just said):\n`;
    recentTranscription.slice(-5).forEach(segment => {
      const time = `${Math.floor(segment.startTime / 60)}:${String(Math.floor(segment.startTime % 60)).padStart(2, '0')}`;
      prompt += `[${time}] ${segment.text}\n`;
    });
    prompt += '\n';
  }

  // Add conversation history
  if (conversationHistory.length > 0) {
    prompt += `RECENT CONVERSATION:\n`;
    conversationHistory.slice(-3).forEach(message => {
      if (message.type === 'user') {
        prompt += `Listener: ${message.content}\n`;
      } else if (message.type === 'ai') {
        prompt += `You: ${message.content}\n`;
      }
    });
    prompt += '\n';
  }

  return prompt;
}

/**
 * Calculate confidence score based on completion
 */
function calculateConfidence(completion: OpenAI.Chat.Completions.ChatCompletion): number {
  // This is a simplified confidence calculation
  // In production, you might use more sophisticated metrics
  const choice = completion.choices[0];
  
  if (!choice) return 0;
  
  // Base confidence on finish reason and usage
  let confidence = 0.8;
  
  if (choice.finish_reason === 'stop') {
    confidence = 0.9;
  } else if (choice.finish_reason === 'length') {
    confidence = 0.7;
  }
  
  return confidence;
}

/**
 * Extract what context was used for the response
 */
function extractContextUsed(context: ConversationContext): string[] {
  const used = ['current_episode'];
  
  if (context.recentTranscription.length > 0) {
    used.push('recent_transcript');
  }
  
  if (context.conversationHistory.length > 0) {
    used.push('conversation_history');
  }
  
  if (context.hostPersonality) {
    used.push('host_personality');
  }
  
  return used;
}

/**
 * Generate follow-up question suggestions
 */
function generateFollowUpSuggestions(question: string, context: ConversationContext): string[] {
  // This could be enhanced with more sophisticated logic
  const suggestions = [];
  
  if (question.toLowerCase().includes('what') || question.toLowerCase().includes('explain')) {
    suggestions.push('Can you give me an example?');
    suggestions.push('How does this relate to other topics you\'ve discussed?');
  }
  
  if (question.toLowerCase().includes('how')) {
    suggestions.push('What are the challenges with this approach?');
    suggestions.push('Have you seen this work in practice?');
  }
  
  if (question.toLowerCase().includes('why')) {
    suggestions.push('What\'s your personal experience with this?');
    suggestions.push('How has your thinking on this evolved?');
  }
  
  // Add episode-specific suggestions
  if (context.episodeMetadata.title) {
    suggestions.push(`What else should I know about ${context.episodeMetadata.title}?`);
  }
  
  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

export default getOpenAIClient; 