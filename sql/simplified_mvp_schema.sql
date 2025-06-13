-- Simplified MVP Schema for YouTube Transcript System
-- Based on user's proposed cleaner architecture

-- ==========================================
-- STEP 1: Core transcript storage (simplified)
-- ==========================================

CREATE TABLE IF NOT EXISTS transcripts (
  video_id TEXT PRIMARY KEY,
  transcript_text TEXT NOT NULL,
  summary TEXT,
  embedding VECTOR(1536), -- OpenAI embeddings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- STEP 2: Video metadata (optional, lazy-loaded)
-- ==========================================

CREATE TABLE IF NOT EXISTS videos_metadata (
  video_id TEXT PRIMARY KEY REFERENCES transcripts(video_id) ON DELETE CASCADE,
  title TEXT DEFAULT 'TBD',
  published_at TIMESTAMP DEFAULT NOW(),
  channel_id TEXT,
  channel_title TEXT,
  duration_seconds INT,
  thumbnail_url TEXT,
  metadata_status TEXT CHECK (metadata_status IN ('placeholder', 'pending', 'complete')) DEFAULT 'placeholder',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- STEP 3: Create indexes for performance
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metadata_status ON videos_metadata(metadata_status);
CREATE INDEX IF NOT EXISTS idx_metadata_channel ON videos_metadata(channel_id);

-- Vector similarity search index
CREATE INDEX IF NOT EXISTS idx_transcripts_embedding 
ON transcripts USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- ==========================================
-- STEP 4: Simple search function
-- ==========================================

CREATE OR REPLACE FUNCTION search_transcripts_simple(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  video_id TEXT,
  title TEXT,
  transcript_text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.video_id,
    COALESCE(m.title, 'TBD') as title,
    t.transcript_text,
    1 - (t.embedding <=> query_embedding) as similarity
  FROM transcripts t
  LEFT JOIN videos_metadata m ON t.video_id = m.video_id
  WHERE (1 - (t.embedding <=> query_embedding)) > match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ==========================================
-- STEP 5: YouTube Data API enrichment function
-- ==========================================

CREATE OR REPLACE FUNCTION enrich_video_metadata(
  p_video_id TEXT,
  p_title TEXT DEFAULT NULL,
  p_published_at TIMESTAMP DEFAULT NULL,
  p_channel_id TEXT DEFAULT NULL,
  p_channel_title TEXT DEFAULT NULL,
  p_duration_seconds INT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE videos_metadata
  SET 
    title = COALESCE(p_title, title),
    published_at = COALESCE(p_published_at, published_at),
    channel_id = COALESCE(p_channel_id, channel_id),
    channel_title = COALESCE(p_channel_title, channel_title),
    duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
    thumbnail_url = COALESCE(p_thumbnail_url, thumbnail_url),
    metadata_status = 'complete',
    updated_at = NOW()
  WHERE video_id = p_video_id;
  
  -- If no rows were updated, the video doesn't exist
  RETURN FOUND;
END;
$$;

-- ==========================================
-- STEP 6: Health check function
-- ==========================================

CREATE OR REPLACE FUNCTION get_transcripts_stats()
RETURNS TABLE (
  total_transcripts INT,
  complete_metadata INT,
  pending_metadata INT,
  placeholder_metadata INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INT as total_transcripts,
    COUNT(*) FILTER (WHERE m.metadata_status = 'complete')::INT as complete_metadata,
    COUNT(*) FILTER (WHERE m.metadata_status = 'pending')::INT as pending_metadata,
    COUNT(*) FILTER (WHERE m.metadata_status = 'placeholder')::INT as placeholder_metadata
  FROM transcripts t
  LEFT JOIN videos_metadata m ON t.video_id = m.video_id;
END;
$$;

-- ==========================================
-- STEP 7: Enable RLS and basic permissions
-- ==========================================

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos_metadata ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data
CREATE POLICY "Allow read access to transcripts" ON transcripts FOR SELECT USING (TRUE);
CREATE POLICY "Allow read access to videos_metadata" ON videos_metadata FOR SELECT USING (TRUE);

-- Allow service role full access
CREATE POLICY "Service role full access to transcripts" ON transcripts FOR ALL USING (TRUE);
CREATE POLICY "Service role full access to videos_metadata" ON videos_metadata FOR ALL USING (TRUE);

-- Grant permissions
GRANT SELECT ON transcripts TO authenticated;
GRANT SELECT ON videos_metadata TO authenticated;
GRANT EXECUTE ON FUNCTION search_transcripts_simple TO authenticated;
GRANT EXECUTE ON FUNCTION get_transcripts_stats TO authenticated;

-- Comments for clarity
COMMENT ON TABLE transcripts IS 'Core transcript storage with vector embeddings for semantic search';
COMMENT ON TABLE videos_metadata IS 'Optional YouTube metadata, lazily populated from YouTube Data API';
COMMENT ON COLUMN videos_metadata.metadata_status IS 'placeholder: basic stub, pending: being fetched, complete: full metadata available'; 