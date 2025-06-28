import { NextRequest, NextResponse } from 'next/server';
import { haikuRewriter } from '@/lib/ai/query-rewriter';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { query, iterations = 5 } = body;
  
  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  console.log(`🚀 Speed testing Haiku: ${iterations} iterations for "${query}"`);
  
  const results = [];
  const overallStart = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    try {
      const result = await haikuRewriter.rewriteQuery(query, {
        episodeTitle: "The Joe Rogan Experience #2000 - Elon Musk"
      });
      
      const latency = Date.now() - start;
      
      results.push({
        iteration: i + 1,
        latency_ms: latency,
        success: true,
        rewritten: result.rewrittenQuery,
        intent: result.intent,
        confidence: result.confidence
      });
      
      console.log(`✅ Iteration ${i + 1}: ${latency}ms`);
      
    } catch (error) {
      const latency = Date.now() - start;
      results.push({
        iteration: i + 1,
        latency_ms: latency,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      console.log(`❌ Iteration ${i + 1}: Failed in ${latency}ms`);
    }
  }
  
  const totalTime = Date.now() - overallStart;
  const successfulResults = results.filter(r => r.success);
  const avgLatency = successfulResults.length > 0 
    ? successfulResults.reduce((sum, r) => sum + r.latency_ms, 0) / successfulResults.length
    : 0;
  
  const minLatency = successfulResults.length > 0 
    ? Math.min(...successfulResults.map(r => r.latency_ms))
    : 0;
    
  const maxLatency = successfulResults.length > 0 
    ? Math.max(...successfulResults.map(r => r.latency_ms))
    : 0;

  console.log(`📊 Speed Test Complete:
    - Total time: ${totalTime}ms
    - Average latency: ${avgLatency.toFixed(0)}ms
    - Min/Max: ${minLatency}ms/${maxLatency}ms
    - Success rate: ${successfulResults.length}/${iterations} (${(successfulResults.length/iterations*100).toFixed(0)}%)
  `);

  return NextResponse.json({
    success: true,
    query,
    iterations,
    total_time_ms: totalTime,
    average_latency_ms: Math.round(avgLatency),
    min_latency_ms: minLatency,
    max_latency_ms: maxLatency,
    success_rate: successfulResults.length / iterations,
    results
  });
} 