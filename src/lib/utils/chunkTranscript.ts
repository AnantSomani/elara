export interface TranscriptChunk {
  text: string;
  index: number;
  totalChunks: number;
  wordCount: number;
}

/**
 * Chunks a transcript into smaller pieces optimized for FTS and LLM context windows
 * @param transcript - The raw transcript text
 * @param maxTokens - Maximum tokens per chunk (default: 800)
 * @param overlapTokens - Number of tokens to overlap between chunks (default: 50)
 * @returns Array of transcript chunks
 */
export function chunkTranscript(
  transcript: string,
  maxTokens: number = 800,
  overlapTokens: number = 50
): TranscriptChunk[] {
  // Clean up the transcript
  const cleanedTranscript = transcript
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\t+/g, ' ');

  // Split into sentences for better chunk boundaries
  const sentences = cleanedTranscript
    .split(/[.!?]+/)
    .filter(s => s.trim().length > 0)
    .map(s => s.trim() + '.');

  if (sentences.length === 0) {
    return [];
  }

  const chunks: TranscriptChunk[] = [];
  const maxWords = Math.floor(maxTokens * 0.75); // Rough token-to-word ratio
  const overlapWords = Math.floor(overlapTokens * 0.75);

  let currentChunk = '';
  let currentWordCount = 0;
  let overlapContent = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceWords = sentence.split(/\s+/).filter(w => w.length > 0);
    const sentenceWordCount = sentenceWords.length;

    // Check if adding this sentence would exceed the max words
    if (currentWordCount + sentenceWordCount > maxWords && currentChunk.length > 0) {
      // Finalize current chunk
      const chunkText = (overlapContent + ' ' + currentChunk).trim();
      chunks.push({
        text: chunkText,
        index: chunks.length,
        totalChunks: 0, // Will be set later
        wordCount: chunkText.split(/\s+/).filter(w => w.length > 0).length
      });

      // Prepare overlap content for next chunk
      const chunkSentences = currentChunk.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (chunkSentences.length > 1) {
        // Take last few sentences for overlap
        const overlapSentences = chunkSentences.slice(-Math.min(2, chunkSentences.length - 1));
        overlapContent = overlapSentences.join('. ').trim();
        if (overlapContent && !overlapContent.endsWith('.')) {
          overlapContent += '.';
        }
        
        // Ensure overlap doesn't exceed overlap word limit
        const overlapWordCount = overlapContent.split(/\s+/).filter(w => w.length > 0).length;
        if (overlapWordCount > overlapWords) {
          overlapContent = '';
        }
      } else {
        overlapContent = '';
      }

      // Start new chunk with current sentence
      currentChunk = sentence;
      currentWordCount = sentenceWordCount;
    } else {
      // Add sentence to current chunk
      if (currentChunk.length > 0) {
        currentChunk += ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
      currentWordCount += sentenceWordCount;
    }
  }

  // Add final chunk if there's remaining content
  if (currentChunk.length > 0) {
    const chunkText = (overlapContent + ' ' + currentChunk).trim();
    chunks.push({
      text: chunkText,
      index: chunks.length,
      totalChunks: 0,
      wordCount: chunkText.split(/\s+/).filter(w => w.length > 0).length
    });
  }

  // Set totalChunks for all chunks
  chunks.forEach(chunk => {
    chunk.totalChunks = chunks.length;
  });

  return chunks;
}

/**
 * Estimates token count from word count (rough approximation)
 * @param wordCount - Number of words
 * @returns Estimated token count
 */
export function estimateTokenCount(wordCount: number): number {
  return Math.ceil(wordCount * 1.3); // Rough estimate: 1 word ≈ 1.3 tokens
}

/**
 * Validates chunk quality and suggests optimization
 * @param chunks - Array of transcript chunks
 * @returns Quality metrics and suggestions
 */
export function analyzeChunkQuality(chunks: TranscriptChunk[]): {
  averageWordCount: number;
  minWordCount: number;
  maxWordCount: number;
  totalWordCount: number;
  estimatedTokenCount: number;
  qualityScore: number; // 0-100
  suggestions: string[];
} {
  if (chunks.length === 0) {
    return {
      averageWordCount: 0,
      minWordCount: 0,
      maxWordCount: 0,
      totalWordCount: 0,
      estimatedTokenCount: 0,
      qualityScore: 0,
      suggestions: ['No chunks provided']
    };
  }

  const wordCounts = chunks.map(c => c.wordCount);
  const totalWordCount = wordCounts.reduce((sum, count) => sum + count, 0);
  const averageWordCount = totalWordCount / chunks.length;
  const minWordCount = Math.min(...wordCounts);
  const maxWordCount = Math.max(...wordCounts);
  const estimatedTokenCount = estimateTokenCount(totalWordCount);

  // Calculate quality score based on various factors
  let qualityScore = 100;
  const suggestions: string[] = [];

  // Penalize very small chunks
  if (minWordCount < 50) {
    qualityScore -= 20;
    suggestions.push('Some chunks are very small (< 50 words). Consider increasing content or merging with adjacent chunks.');
  }

  // Penalize very large chunks
  if (maxWordCount > 1000) {
    qualityScore -= 15;
    suggestions.push('Some chunks are very large (> 1000 words). Consider reducing maxTokens parameter.');
  }

  // Penalize high variance in chunk sizes
  const variance = wordCounts.reduce((sum, count) => sum + Math.pow(count - averageWordCount, 2), 0) / chunks.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = standardDeviation / averageWordCount;

  if (coefficientOfVariation > 0.5) {
    qualityScore -= 10;
    suggestions.push('High variance in chunk sizes. Consider adjusting chunking strategy.');
  }

  // Bonus for good chunk count
  if (chunks.length >= 3 && chunks.length <= 20) {
    qualityScore += 5;
  } else if (chunks.length > 50) {
    qualityScore -= 10;
    suggestions.push('Very high number of chunks. Consider increasing chunk size.');
  }

  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return {
    averageWordCount: Math.round(averageWordCount),
    minWordCount,
    maxWordCount,
    totalWordCount,
    estimatedTokenCount,
    qualityScore: Math.round(qualityScore),
    suggestions
  };
} 