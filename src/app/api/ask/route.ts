import { NextRequest, NextResponse } from 'next/server';
import { hybridSearchTranscriptChunks, getAllChunksForVideo, getVideoSearchStats } from '@/lib/supabase/searchChunks';
import { generateAnswer, estimateAnswerCost, validateContextLength } from '@/lib/openai/generateAnswer';
import { supabaseAdmin } from '@/lib/database/supabase';
import { haikuRewriter } from '@/lib/ai/query-rewriter';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { 
      video_id, 
      question,
      search_options = {},
      generation_options = {},
      include_context = false,
      enable_haiku_rewriting = true  // New option
    } = body;
    
    // Validate input
    if (!video_id || !question) {
      return NextResponse.json(
        { success: false, error: 'video_id and question are required' },
        { status: 400 }
      );
    }

    if (question.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Question must be at least 3 characters long' },
        { status: 400 }
      );
    }

    console.log(`❓ Processing question for video ${video_id}: "${question}"`);

    // Get video stats first
    const videoStats = await getVideoSearchStats(video_id);
    
    if (videoStats.status === 'not_found') {
      return NextResponse.json({
        success: false,
        error: 'Video transcript not found. Please submit the video for transcription first.',
        suggestion: 'Use /api/transcript/submit to process this video'
      }, { status: 404 });
    }

    if (videoStats.status !== 'completed') {
      return NextResponse.json({
        success: false,
        error: `Video transcript is not ready. Current status: ${videoStats.status}`,
        video_stats: videoStats
      }, { status: 400 });
    }

    // Get video metadata for better context
    const videoMetadata = await getVideoMetadata(video_id);
    let finalQuestion = question;
    let rewriteMetadata = null;

    // HAIKU QUERY REWRITING (MVP)
    if (enable_haiku_rewriting) {
      try {
        console.log('🤖 Rewriting query with Haiku...');
        
        const rewriteResult = await haikuRewriter.rewriteQuery(question, {
          episodeTitle: videoMetadata?.title,
          channelTitle: videoMetadata?.channel_title,
          speakers: extractSpeakersFromTitle(videoMetadata?.title) // Simple extraction
        });

        if (rewriteResult.shouldUseRewritten) {
          finalQuestion = rewriteResult.rewrittenQuery;
          console.log(`📝 Using rewritten query: "${finalQuestion}"`);
        }

        rewriteMetadata = {
          original: question,
          rewritten: rewriteResult.rewrittenQuery,
          intent: rewriteResult.intent,
          confidence: rewriteResult.confidence,
          used_rewritten: rewriteResult.shouldUseRewritten,
          processing_time_ms: rewriteResult.processingTimeMs
        };
      } catch (error) {
        console.warn('Haiku rewriting failed, continuing with original query:', error);
      }
    }

    // Search transcript chunks using hybrid approach (now with potentially rewritten query)
    console.log('🔍 Searching transcript chunks...');
    const searchResult = await hybridSearchTranscriptChunks(
      video_id,
      finalQuestion,  // ← This is now potentially rewritten
      {
        limit: search_options.limit || 5,
        includeWordCount: true,
        minRank: search_options.min_rank || 0
      }
    );

    let context = '';
    let searchMethod = searchResult.searchMethod;
    let chunksUsed = searchResult.results.length;

    if (searchResult.results.length === 0) {
      console.log('🔄 No search results, using first chunks as context');
      // Fallback: Use first few chunks as context
      const fallbackChunks = await getAllChunksForVideo(video_id, 3);
      context = fallbackChunks.map(chunk => chunk.chunk_text).join('\n\n');
      searchMethod = 'fallback_sequential';
      chunksUsed = fallbackChunks.length;
    } else {
      // Combine search results as context
      context = searchResult.results
        .map(result => result.chunk_text)
        .join('\n\n');
    }

    if (!context || context.trim().length < 50) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient transcript content available for this video',
        video_stats: videoStats
      }, { status: 400 });
    }

    // Validate context length for the model
    const contextValidation = validateContextLength(context, generation_options.model || 'gpt-4o-mini');
    
    if (!contextValidation.isValid) {
      console.warn('⚠️ Context too long, truncating...');
      // Truncate context to fit model limits
      const maxChars = Math.floor(contextValidation.maxTokens * 0.6 * 0.75); // Conservative estimate
      context = context.substring(0, maxChars) + '...';
    }

    console.log(`📝 Generated context: ${context.length} chars from ${chunksUsed} chunks`);

    // Generate answer using OpenAI
    console.log('🤖 Generating answer...');
    const answerResult = await generateAnswer(
      context,
      question,
      {
        title: videoMetadata?.title,
        channelTitle: videoMetadata?.channel_title,
        durationSeconds: videoMetadata?.duration_seconds
      },
      {
        model: generation_options.model || 'gpt-4o-mini',
        maxTokens: generation_options.max_tokens || 1000,
        temperature: generation_options.temperature || 0.7,
        includeChunkInfo: true
      }
    );

    // Calculate costs
    const estimatedCost = estimateAnswerCost(
      answerResult.usage.promptTokens,
      answerResult.usage.completionTokens,
      answerResult.model
    );

    const totalProcessingTime = Date.now() - startTime;

    console.log(`✅ Generated answer in ${totalProcessingTime}ms (${answerResult.usage.totalTokens} tokens, ~$${estimatedCost.toFixed(6)})`);

    // Prepare response (enhanced with rewrite metadata)
    const response: any = {
      success: true,
      data: {
        answer: answerResult.answer,
        video_id,
        question: finalQuestion,  // Return the final question used
        original_question: question,  // Keep original for reference
        search_metadata: {
          method: searchMethod,
          chunks_searched: chunksUsed,
          total_results: searchResult.totalResults,
          context_length: context.length,
          context_validation: {
            estimated_tokens: contextValidation.estimatedTokens,
            is_valid: contextValidation.isValid,
            suggestion: contextValidation.suggestion
          }
        },
        generation_metadata: {
          model: answerResult.model,
          usage: answerResult.usage,
          estimated_cost_usd: estimatedCost,
          processing_time_ms: totalProcessingTime
        },
        query_rewrite_metadata: rewriteMetadata,  // ← New field
        video_metadata: {
          ...videoMetadata,
          ...videoStats
        }
      }
    };

    // Include context in response if requested
    if (include_context) {
      response.data.context_chunks = searchResult.results.map(result => ({
        text: result.chunk_text,
        chunk_index: result.chunk_index,
        rank: result.rank,
        word_count: result.word_count
      }));
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Ask endpoint error:', error);
    
    const totalProcessingTime = Date.now() - startTime;
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process question',
        details: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: totalProcessingTime
      },
      { status: 500 }
    );
  }
}

/**
 * Get video metadata from youtube_transcripts table
 */
async function getVideoMetadata(videoId: string): Promise<{
  title?: string;
  channel_title?: string;
  duration_seconds?: number;
  transcript_source?: string;
  created_at?: string;
} | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('youtube_transcripts')
      .select('title, channel_title, duration_seconds, transcript_source, created_at')
      .eq('video_id', videoId)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Could not fetch video metadata:', error);
    return null;
  }
}

/**
 * Helper function to extract speakers from title (simple version)
 */
function extractSpeakersFromTitle(title?: string): string {
  if (!title) return 'Unknown';
  
  // Simple patterns to extract names
  const patterns = [
    /with ([A-Z][a-z]+ [A-Z][a-z]+)/,
    /ft\.? ([A-Z][a-z]+ [A-Z][a-z]+)/,
    /featuring ([A-Z][a-z]+ [A-Z][a-z]+)/,
    /([A-Z][a-z]+ [A-Z][a-z]+) - /,
    /([A-Z][a-z]+ [A-Z][a-z]+):/
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }
  
  return 'Host';
}

/**
 * GET endpoint for health checks and stats
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const videoId = url.searchParams.get('video_id');

  if (action === 'health') {
    return NextResponse.json({
      status: 'healthy',
      service: 'tactiq-ask-questions',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }

  if (action === 'video_stats' && videoId) {
    try {
      const stats = await getVideoSearchStats(videoId);
      const metadata = await getVideoMetadata(videoId);
      
      return NextResponse.json({
        success: true,
        video_id: videoId,
        stats,
        metadata
      });
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to get video stats',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  }

  if (action === 'system_stats') {
    try {
      // Get overall system statistics
      const { data, error } = await supabaseAdmin()
        .rpc('get_tactiq_system_stats');

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        system_stats: data[0], // Function returns array with single object
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to get system stats',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { 
      error: 'Invalid action. Use ?action=health, ?action=video_stats&video_id=ID, or ?action=system_stats' 
    },
    { status: 400 }
  );
}

/**
 * OPTIONS endpoint for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 