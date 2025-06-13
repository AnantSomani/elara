-- Migration: 006_tactiq_fts_system.sql
-- Tactiq + Full-Text Search (FTS) Integration for Elara
-- Creates tables for web-scraped transcripts with PostgreSQL FTS

-- ==========================================
-- STEP 1: Create transcript_chunks table with FTS
-- ==========================================

-- Main table for storing chunked transcript content with FTS
CREATE TABLE IF NOT EXISTS transcript_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  -- Generated TSVECTOR column for full-text search
  tsv_text TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED
);

-- Create GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS tsv_text_idx ON transcript_chunks USING GIN(tsv_text);

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_video_id ON transcript_chunks(video_id);
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_chunk_index ON transcript_chunks(video_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_created_at ON transcript_chunks(created_at DESC);

-- ==========================================
-- STEP 2: Create youtube_transcripts metadata table
-- ==========================================

-- Store YouTube video metadata and processing status
CREATE TABLE IF NOT EXISTS youtube_transcripts (
  video_id TEXT PRIMARY KEY,
  video_url TEXT NOT NULL,
  title TEXT,
  channel_title TEXT,
  duration_seconds INTEGER,
  transcript_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  transcript_source VARCHAR(20) DEFAULT 'tactiq', -- 'tactiq', 'fallback'
  total_chunks INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  processing_time_ms INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  -- Constraints
  CONSTRAINT chk_transcript_status CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT chk_transcript_source CHECK (transcript_source IN ('tactiq', 'fallback', 'hybrid'))
);

-- Indexes for youtube_transcripts
CREATE INDEX IF NOT EXISTS idx_youtube_transcripts_status ON youtube_transcripts(transcript_status);
CREATE INDEX IF NOT EXISTS idx_youtube_transcripts_source ON youtube_transcripts(transcript_source);
CREATE INDEX IF NOT EXISTS idx_youtube_transcripts_created_at ON youtube_transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_transcripts_processing_time ON youtube_transcripts(processing_time_ms);

-- ==========================================
-- STEP 3: FTS Search Function
-- ==========================================

-- Function to search transcript chunks with ranking
CREATE OR REPLACE FUNCTION search_transcript_chunks(
  p_video_id TEXT,
  p_query TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_text TEXT,
  chunk_index INTEGER,
  video_id TEXT,
  rank REAL
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.chunk_text,
    tc.chunk_index,
    tc.video_id,
    ts_rank_cd(tc.tsv_text, plainto_tsquery('english', p_query)) as rank
  FROM transcript_chunks tc
  WHERE tc.video_id = p_video_id
    AND tc.tsv_text @@ plainto_tsquery('english', p_query)
  ORDER BY ts_rank_cd(tc.tsv_text, plainto_tsquery('english', p_query)) DESC
  LIMIT p_limit;
END;
$$;

-- ==========================================
-- STEP 4: Fallback similarity search function
-- ==========================================

-- Function for fallback search when FTS returns no results
CREATE OR REPLACE FUNCTION fallback_search_transcript_chunks(
  p_video_id TEXT,
  p_query TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_text TEXT,
  chunk_index INTEGER,
  video_id TEXT,
  similarity_rank INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.chunk_text,
    tc.chunk_index,
    tc.video_id,
    ROW_NUMBER() OVER (ORDER BY tc.chunk_index)::INTEGER as similarity_rank
  FROM transcript_chunks tc
  WHERE tc.video_id = p_video_id
    AND tc.chunk_text ILIKE '%' || p_query || '%'
  ORDER BY tc.chunk_index
  LIMIT p_limit;
END;
$$;

-- ==========================================
-- STEP 5: Analytics and monitoring functions
-- ==========================================

-- Function to get Tactiq system stats
CREATE OR REPLACE FUNCTION get_tactiq_system_stats()
RETURNS TABLE (
  total_videos INTEGER,
  completed_videos INTEGER,
  failed_videos INTEGER,
  pending_videos INTEGER,
  total_chunks INTEGER,
  total_words BIGINT,
  avg_processing_time_ms NUMERIC,
  avg_chunks_per_video NUMERIC,
  success_rate NUMERIC
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_videos,
    COUNT(*) FILTER (WHERE transcript_status = 'completed')::INTEGER as completed_videos,
    COUNT(*) FILTER (WHERE transcript_status = 'failed')::INTEGER as failed_videos,
    COUNT(*) FILTER (WHERE transcript_status = 'pending')::INTEGER as pending_videos,
    COALESCE(SUM(total_chunks), 0)::INTEGER as total_chunks,
    COALESCE(SUM(word_count), 0)::BIGINT as total_words,
    COALESCE(AVG(processing_time_ms), 0)::NUMERIC as avg_processing_time_ms,
    CASE 
      WHEN COUNT(*) FILTER (WHERE transcript_status = 'completed') > 0 
      THEN COALESCE(AVG(total_chunks) FILTER (WHERE transcript_status = 'completed'), 0)
      ELSE 0
    END::NUMERIC as avg_chunks_per_video,
    CASE 
      WHEN COUNT(*) > 0 
      THEN (COUNT(*) FILTER (WHERE transcript_status = 'completed')::NUMERIC / COUNT(*) * 100)
      ELSE 0
    END::NUMERIC as success_rate
  FROM youtube_transcripts;
END;
$$;

-- ==========================================
-- STEP 6: Update triggers for timestamp management
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS trigger_transcript_chunks_updated_at ON transcript_chunks;
CREATE TRIGGER trigger_transcript_chunks_updated_at
  BEFORE UPDATE ON transcript_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_youtube_transcripts_updated_at ON youtube_transcripts;
CREATE TRIGGER trigger_youtube_transcripts_updated_at
  BEFORE UPDATE ON youtube_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- STEP 7: Create analytics view
-- ==========================================

-- View for easy analytics and monitoring
CREATE OR REPLACE VIEW tactiq_analytics AS
SELECT 
  yt.video_id,
  yt.title,
  yt.channel_title,
  yt.duration_seconds,
  yt.transcript_status,
  yt.transcript_source,
  yt.total_chunks,
  yt.word_count,
  yt.processing_time_ms,
  yt.retry_count,
  yt.created_at,
  yt.updated_at,
  CASE 
    WHEN yt.transcript_status = 'completed' THEN 'Success'
    WHEN yt.transcript_status = 'failed' THEN 'Failed'
    WHEN yt.transcript_status = 'processing' THEN 'In Progress'
    ELSE 'Pending'
  END as status_display,
  CASE 
    WHEN yt.duration_seconds > 0 AND yt.processing_time_ms > 0 
    THEN ROUND((yt.processing_time_ms::DECIMAL / 1000) / yt.duration_seconds, 2)
    ELSE NULL
  END as processing_efficiency_ratio,
  CASE 
    WHEN yt.word_count > 0 AND yt.total_chunks > 0
    THEN ROUND(yt.word_count::DECIMAL / yt.total_chunks, 0)
    ELSE NULL
  END as avg_words_per_chunk
FROM youtube_transcripts yt
ORDER BY yt.created_at DESC;

-- ==========================================
-- STEP 8: Row Level Security (RLS) setup
-- ==========================================

-- Enable RLS on tables (adjust based on your auth needs)
ALTER TABLE transcript_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_transcripts ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (customize based on your auth system)
-- Allow read access to authenticated users
CREATE POLICY "Allow read access to transcript_chunks" ON transcript_chunks
  FOR SELECT USING (TRUE);

CREATE POLICY "Allow read access to youtube_transcripts" ON youtube_transcripts
  FOR SELECT USING (TRUE);

-- Allow service role to manage all data
CREATE POLICY "Allow service role full access to transcript_chunks" ON transcript_chunks
  FOR ALL USING (TRUE);

CREATE POLICY "Allow service role full access to youtube_transcripts" ON youtube_transcripts
  FOR ALL USING (TRUE);

-- ==========================================
-- STEP 9: Performance optimization
-- ==========================================

-- Enable pg_stat_statements for query performance monitoring (if available)
-- This helps monitor FTS query performance
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

COMMENT ON TABLE transcript_chunks IS 'Stores chunked transcript content from Tactiq web scraping with full-text search capabilities';
COMMENT ON TABLE youtube_transcripts IS 'Metadata and processing status for YouTube videos processed through Tactiq pipeline';
COMMENT ON FUNCTION search_transcript_chunks IS 'Primary FTS function for searching transcript chunks with relevance ranking';
COMMENT ON FUNCTION fallback_search_transcript_chunks IS 'Fallback search using ILIKE when FTS returns no results';
COMMENT ON FUNCTION get_tactiq_system_stats IS 'Returns comprehensive statistics about the Tactiq transcript processing system'; 