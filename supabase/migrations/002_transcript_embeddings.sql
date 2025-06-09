-- Create transcript_embeddings table for storing transcript segments and their embeddings
CREATE TABLE IF NOT EXISTS transcript_embeddings (
  id BIGSERIAL PRIMARY KEY,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  segment_text TEXT NOT NULL,
  segment_start REAL NOT NULL, -- Start time in seconds
  segment_end REAL NOT NULL,   -- End time in seconds
  embedding VECTOR(1536) NOT NULL, -- OpenAI text-embedding-3-small dimensions
  confidence REAL DEFAULT 0.8,
  speaker TEXT, -- Speaker label if available
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_episode_id ON transcript_embeddings(episode_id);
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_segment_time ON transcript_embeddings(segment_start, segment_end);
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_confidence ON transcript_embeddings(confidence);

-- Create vector similarity search index for embeddings
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_vector 
ON transcript_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Add audio_url column to episodes table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'episodes' AND column_name = 'audio_url'
  ) THEN
    ALTER TABLE episodes ADD COLUMN audio_url TEXT;
  END IF;
END $$;

-- Add guid column to episodes table if it doesn't exist (for RSS feed processing)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'episodes' AND column_name = 'guid'
  ) THEN
    ALTER TABLE episodes ADD COLUMN guid TEXT UNIQUE;
  END IF;
END $$;

-- Add episode and season numbers if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'episodes' AND column_name = 'episode_number'
  ) THEN
    ALTER TABLE episodes ADD COLUMN episode_number INTEGER;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'episodes' AND column_name = 'season_number'
  ) THEN
    ALTER TABLE episodes ADD COLUMN season_number INTEGER;
  END IF;
END $$;

-- Add missing columns to episodes table
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS listen_notes_id TEXT UNIQUE;

-- Create function for transcript similarity search
CREATE OR REPLACE FUNCTION search_transcript_embeddings(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  episode_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  episode_id UUID,
  episode_title TEXT,
  segment_text TEXT,
  segment_start REAL,
  segment_end REAL,
  similarity FLOAT,
  confidence REAL,
  speaker TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    te.episode_id,
    e.title as episode_title,
    te.segment_text,
    te.segment_start,
    te.segment_end,
    1 - (te.embedding <=> query_embedding) as similarity,
    te.confidence,
    te.speaker
  FROM transcript_embeddings te
  JOIN episodes e ON te.episode_id = e.id
  WHERE 
    (1 - (te.embedding <=> query_embedding)) > match_threshold
    AND (episode_filter IS NULL OR te.episode_id = episode_filter)
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function for hybrid search (episode metadata + transcript content)
CREATE OR REPLACE FUNCTION hybrid_search_transcripts(
  query_embedding VECTOR(1536),
  query_text TEXT DEFAULT '',
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  episode_id UUID,
  episode_title TEXT,
  episode_description TEXT,
  segment_text TEXT,
  segment_start REAL,
  segment_end REAL,
  similarity FLOAT,
  confidence REAL,
  speaker TEXT,
  source TEXT -- 'transcript' or 'metadata'
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  -- Transcript content search
  SELECT 
    te.episode_id,
    e.title as episode_title,
    e.description as episode_description,
    te.segment_text,
    te.segment_start,
    te.segment_end,
    1 - (te.embedding <=> query_embedding) as similarity,
    te.confidence,
    te.speaker,
    'transcript'::TEXT as source
  FROM transcript_embeddings te
  JOIN episodes e ON te.episode_id = e.id
  WHERE 
    (1 - (te.embedding <=> query_embedding)) > match_threshold
    AND (query_text = '' OR te.segment_text ILIKE '%' || query_text || '%')
  
  UNION ALL
  
  -- Episode metadata search (if embeddings table exists)
  SELECT 
    ee.episode_id,
    e.title as episode_title,
    e.description as episode_description,
    ee.content as segment_text,
    0::REAL as segment_start,
    0::REAL as segment_end,
    1 - (ee.embedding <=> query_embedding) as similarity,
    0.9::REAL as confidence,
    NULL::TEXT as speaker,
    'metadata'::TEXT as source
  FROM episode_embeddings ee
  JOIN episodes e ON ee.episode_id = e.id
  WHERE 
    (1 - (ee.embedding <=> query_embedding)) > match_threshold
    AND (query_text = '' OR ee.content ILIKE '%' || query_text || '%')
  
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Update function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for transcript_embeddings
CREATE TRIGGER update_transcript_embeddings_updated_at 
  BEFORE UPDATE ON transcript_embeddings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 