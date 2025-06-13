import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface VideoMetadata {
  title?: string;
  channelTitle?: string;
  durationSeconds?: number;
}

export interface GenerateAnswerResult {
  answer: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  contextLength: number;
}

export interface GenerateAnswerOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  includeChunkInfo?: boolean;
}

/**
 * Generates an answer using OpenAI based on transcript context
 * @param context - Combined transcript chunks as context
 * @param question - User's question
 * @param videoMetadata - Optional video metadata for context
 * @param options - Generation options
 * @returns Generated answer with usage statistics
 */
export async function generateAnswer(
  context: string,
  question: string,
  videoMetadata?: VideoMetadata,
  options: GenerateAnswerOptions = {}
): Promise<GenerateAnswerResult> {
  const {
    model = 'gpt-4o-mini', // Cost-effective option
    maxTokens = 1000,
    temperature = 0.7,
    includeChunkInfo = false
  } = options;

  // Build the system prompt
  const systemPrompt = buildSystemPrompt(videoMetadata, includeChunkInfo);
  
  // Build the user prompt with context and question
  const userPrompt = buildUserPrompt(context, question, videoMetadata);

  try {
    console.log(`🤖 Generating answer with ${model} (context: ${context.length} chars)`);
    
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature,
      stream: false
    });

    const answer = completion.choices[0].message.content || 'Unable to generate answer';
    
    console.log(`✅ Generated answer (${answer.length} chars, ${completion.usage?.total_tokens} tokens)`);

    return {
      answer,
      usage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
      },
      model,
      contextLength: context.length
    };

  } catch (error) {
    console.error('❌ OpenAI error:', error);
    
    // Handle rate limiting with exponential backoff
    if (error instanceof Error && error.message.includes('rate_limit')) {
      console.log('⏳ Rate limited, implementing fallback...');
      return generateFallbackAnswer(question, videoMetadata);
    }
    
    throw new Error(`Failed to generate answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Streams an answer using OpenAI for real-time responses
 * @param context - Combined transcript chunks as context
 * @param question - User's question
 * @param videoMetadata - Optional video metadata
 * @param options - Generation options
 * @returns Async generator yielding text chunks
 */
export async function* streamAnswer(
  context: string,
  question: string,
  videoMetadata?: VideoMetadata,
  options: GenerateAnswerOptions = {}
): AsyncGenerator<string, GenerateAnswerResult, unknown> {
  const {
    model = 'gpt-4o-mini',
    maxTokens = 1000,
    temperature = 0.7,
    includeChunkInfo = false
  } = options;

  const systemPrompt = buildSystemPrompt(videoMetadata, includeChunkInfo);
  const userPrompt = buildUserPrompt(context, question, videoMetadata);

  try {
    console.log(`🌊 Streaming answer with ${model}`);
    
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature,
      stream: true
    });

    let fullAnswer = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAnswer += content;
        yield content;
      }
      
      // Track usage if available
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens || 0,
          completionTokens: chunk.usage.completion_tokens || 0,
          totalTokens: chunk.usage.total_tokens || 0
        };
      }
    }

    return {
      answer: fullAnswer,
      usage,
      model,
      contextLength: context.length
    };

  } catch (error) {
    console.error('❌ OpenAI streaming error:', error);
    throw new Error(`Failed to stream answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Builds the system prompt for the AI assistant
 */
function buildSystemPrompt(videoMetadata?: VideoMetadata, includeChunkInfo?: boolean): string {
  let prompt = `You are an intelligent podcast and video assistant. Your job is to answer questions about video content based on provided transcript excerpts.

CORE INSTRUCTIONS:
- Answer based ONLY on the transcript content provided
- Be accurate, helpful, and concise
- If the answer isn't in the transcript, clearly state this
- Use relevant quotes when they strengthen your answer
- Maintain a conversational but informative tone
- Focus on being useful to someone who wants to understand the content`;

  if (includeChunkInfo) {
    prompt += `\n- The transcript is provided in chunks - consider the context across chunks`;
  }

  prompt += `\n\nIMPORTANT: Do not make up information that isn't in the transcript. If you're unsure, say so.`;

  return prompt;
}

/**
 * Builds the user prompt with context and question
 */
function buildUserPrompt(
  context: string,
  question: string,
  videoMetadata?: VideoMetadata
): string {
  let prompt = '';

  // Add video metadata if available
  if (videoMetadata?.title) {
    prompt += `Video: ${videoMetadata.title}\n`;
  }
  if (videoMetadata?.channelTitle) {
    prompt += `Channel: ${videoMetadata.channelTitle}\n`;
  }
  if (videoMetadata?.durationSeconds) {
    const minutes = Math.floor(videoMetadata.durationSeconds / 60);
    prompt += `Duration: ${minutes} minutes\n`;
  }
  if (prompt.length > 0) {
    prompt += '\n';
  }

  // Add transcript context
  prompt += `TRANSCRIPT EXCERPTS:\n${context}\n\n`;
  
  // Add the question
  prompt += `QUESTION: ${question}\n\n`;
  
  prompt += `Please answer the question based on the transcript content above.`;

  return prompt;
}

/**
 * Generates a fallback answer when OpenAI is unavailable
 */
function generateFallbackAnswer(
  question: string,
  videoMetadata?: VideoMetadata
): GenerateAnswerResult {
  const fallbackAnswer = `I apologize, but I'm currently unable to process your question "${question}" due to high demand. ${
    videoMetadata?.title ? `For the video "${videoMetadata.title}", ` : ''
  }Please try again in a few moments. In the meantime, you might want to search for specific keywords or phrases that relate to your question.`;

  return {
    answer: fallbackAnswer,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    },
    model: 'fallback',
    contextLength: 0
  };
}

/**
 * Estimates the cost of generating an answer
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @param model - Model used
 * @returns Estimated cost in USD
 */
export function estimateAnswerCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): number {
  // Pricing as of 2024 (adjust as needed)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15 / 1000000, output: 0.60 / 1000000 }, // $0.15/$0.60 per 1M tokens
    'gpt-4o': { input: 5.00 / 1000000, output: 15.00 / 1000000 }, // $5/$15 per 1M tokens
    'gpt-3.5-turbo': { input: 3.00 / 1000000, output: 6.00 / 1000000 } // $3/$6 per 1M tokens
  };

  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
  
  return (promptTokens * modelPricing.input) + (completionTokens * modelPricing.output);
}

/**
 * Validates context length for the model
 * @param context - Context string
 * @param model - Model name
 * @returns Validation result
 */
export function validateContextLength(context: string, model: string): {
  isValid: boolean;
  estimatedTokens: number;
  maxTokens: number;
  suggestion?: string;
} {
  // Rough token estimation (1 token ≈ 0.75 words)
  const estimatedTokens = Math.ceil(context.split(/\s+/).length * 1.33);
  
  // Model context limits
  const contextLimits: Record<string, number> = {
    'gpt-4o-mini': 128000,
    'gpt-4o': 128000,
    'gpt-3.5-turbo': 16000
  };

  const maxTokens = contextLimits[model] || 16000;
  const isValid = estimatedTokens < (maxTokens * 0.8); // Use 80% of limit for safety

  let suggestion: string | undefined;
  if (!isValid) {
    suggestion = `Context too long (${estimatedTokens} tokens). Consider using fewer or smaller chunks.`;
  }

  return {
    isValid,
    estimatedTokens,
    maxTokens,
    suggestion
  };
} 