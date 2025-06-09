-- Create RPC function for transcript embedding similarity search
CREATE OR REPLACE FUNCTION match_transcript_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_episode_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  episode_id uuid,
  segment_text text,
  segment_start real,
  segment_end real,
  confidence real,
  speaker text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    episode_id,
    segment_text,
    segment_start,
    segment_end,
    confidence,
    speaker,
    1 - (embedding <=> query_embedding) AS similarity
  FROM transcript_embeddings
  WHERE 
    (filter_episode_id IS NULL OR episode_id = filter_episode_id)
    AND (1 - (embedding <=> query_embedding)) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$; 