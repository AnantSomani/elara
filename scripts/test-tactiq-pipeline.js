#!/usr/bin/env node

/**
 * Test script for Tactiq + FTS Pipeline
 * Tests the complete workflow: URL submission -> processing -> asking questions
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test configuration
const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll (short video for testing)
const TEST_QUESTIONS = [
  'What is this video about?',
  'Who is the main person in this video?',
  'What song is being performed?'
];

async function testTactiqPipeline() {
  console.log('🧪 Testing Tactiq + FTS Pipeline\n');
  
  try {
    // Step 1: Test health endpoints
    console.log('1️⃣ Testing health endpoints...');
    await testHealthEndpoints();
    
    // Step 2: Submit video for transcription
    console.log('\n2️⃣ Submitting video for transcription...');
    const submitResult = await submitVideo(TEST_VIDEO_URL);
    const videoId = submitResult.data.video_id;
    
    // Step 3: Wait a moment and check video stats
    console.log('\n3️⃣ Checking video processing stats...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await checkVideoStats(videoId);
    
    // Step 4: Test asking questions
    console.log('\n4️⃣ Testing question answering...');
    for (const question of TEST_QUESTIONS) {
      await askQuestion(videoId, question);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between questions
    }
    
    // Step 5: Test system stats
    console.log('\n5️⃣ Getting system statistics...');
    await getSystemStats();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

async function testHealthEndpoints() {
  // Test transcript submission health
  const submitHealth = await axios.get(`${BASE_URL}/api/transcript/submit?action=health`);
  console.log('   ✅ Transcript submission service:', submitHealth.data.status);
  
  // Test ask endpoint health
  const askHealth = await axios.get(`${BASE_URL}/api/ask?action=health`);
  console.log('   ✅ Ask questions service:', askHealth.data.status);
}

async function submitVideo(youtubeUrl) {
  console.log(`   📹 Submitting: ${youtubeUrl}`);
  
  const response = await axios.post(`${BASE_URL}/api/transcript/submit`, {
    youtube_url: youtubeUrl,
    force_reprocess: false
  });
  
  if (response.data.success) {
    const data = response.data.data;
    console.log(`   ✅ Video processed successfully!`);
    console.log(`      Video ID: ${data.video_id}`);
    console.log(`      Chunks created: ${data.chunks_created}`);
    console.log(`      Total words: ${data.total_words}`);
    console.log(`      Quality score: ${data.quality_score}%`);
    console.log(`      Processing time: ${data.processing_time_ms}ms`);
    
    if (data.chunk_analysis.suggestions.length > 0) {
      console.log(`      Suggestions: ${data.chunk_analysis.suggestions.join(', ')}`);
    }
  } else {
    throw new Error(`Video submission failed: ${response.data.error}`);
  }
  
  return response.data;
}

async function checkVideoStats(videoId) {
  console.log(`   📊 Getting stats for video: ${videoId}`);
  
  const response = await axios.get(`${BASE_URL}/api/ask?action=video_stats&video_id=${videoId}`);
  
  if (response.data.success) {
    const stats = response.data.stats;
    const metadata = response.data.metadata;
    
    console.log(`   ✅ Video stats retrieved:`);
    console.log(`      Status: ${stats.status}`);
    console.log(`      Total chunks: ${stats.totalChunks}`);
    console.log(`      Total words: ${stats.totalWords}`);
    console.log(`      Avg words per chunk: ${stats.avgWordsPerChunk}`);
    
    if (metadata) {
      console.log(`      Source: ${metadata.transcript_source}`);
      if (metadata.title) console.log(`      Title: ${metadata.title}`);
    }
  } else {
    console.warn(`   ⚠️ Could not get video stats: ${response.data.error}`);
  }
}

async function askQuestion(videoId, question) {
  console.log(`   ❓ Asking: "${question}"`);
  
  const response = await axios.post(`${BASE_URL}/api/ask`, {
    video_id: videoId,
    question: question,
    search_options: {
      limit: 5
    },
    generation_options: {
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.7
    },
    include_context: false
  });
  
  if (response.data.success) {
    const data = response.data.data;
    console.log(`   ✅ Answer generated:`);
    console.log(`      ${data.answer.substring(0, 200)}${data.answer.length > 200 ? '...' : ''}`);
    console.log(`      Search method: ${data.search_metadata.method}`);
    console.log(`      Chunks used: ${data.search_metadata.chunks_searched}`);
    console.log(`      Context length: ${data.search_metadata.context_length} chars`);
    console.log(`      Model: ${data.generation_metadata.model}`);
    console.log(`      Tokens: ${data.generation_metadata.usage.totalTokens}`);
    console.log(`      Cost: ~$${data.generation_metadata.estimated_cost_usd.toFixed(6)}`);
    console.log(`      Time: ${data.generation_metadata.processing_time_ms}ms`);
  } else {
    console.error(`   ❌ Question failed: ${response.data.error}`);
  }
  
  console.log(''); // Empty line for readability
}

async function getSystemStats() {
  const response = await axios.get(`${BASE_URL}/api/ask?action=system_stats`);
  
  if (response.data.success) {
    const stats = response.data.system_stats;
    console.log(`   ✅ System statistics:`);
    console.log(`      Total videos: ${stats.total_videos}`);
    console.log(`      Completed: ${stats.completed_videos}`);
    console.log(`      Failed: ${stats.failed_videos}`);
    console.log(`      Success rate: ${stats.success_rate?.toFixed(1)}%`);
    console.log(`      Total chunks: ${stats.total_chunks}`);
    console.log(`      Total words: ${stats.total_words?.toLocaleString()}`);
    console.log(`      Avg processing time: ${stats.avg_processing_time_ms?.toFixed(0)}ms`);
    console.log(`      Avg chunks per video: ${stats.avg_chunks_per_video?.toFixed(1)}`);
  } else {
    console.warn(`   ⚠️ Could not get system stats: ${response.data.error}`);
  }
}

// Add error handling for axios
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Cannot connect to server. Is the development server running?');
      console.error('   Run: npm run dev');
      process.exit(1);
    }
    return Promise.reject(error);
  }
);

// Run the test
if (require.main === module) {
  testTactiqPipeline().catch(error => {
    console.error('Test script error:', error);
    process.exit(1);
  });
} 