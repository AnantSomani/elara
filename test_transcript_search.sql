-- Test transcript embeddings table
SELECT 
  id,
  episode_id,
  LEFT(segment_text, 100) as text_preview,
  segment_start,
  segment_end,
  confidence,
  speaker
FROM transcript_embeddings 
ORDER BY created_at DESC 
LIMIT 10;

-- Count total embeddings
SELECT COUNT(*) as total_embeddings FROM transcript_embeddings;

-- Count embeddings per episode
SELECT 
  episode_id,
  COUNT(*) as embedding_count,
  MIN(segment_start) as first_segment,
  MAX(segment_end) as last_segment
FROM transcript_embeddings 
GROUP BY episode_id 
ORDER BY embedding_count DESC; 