-- YouTube System Database Schema
-- Separate from podcast/Listen Notes system for clean separation

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. YouTube Channels Table (equivalent to podcasts table)
CREATE TABLE IF NOT EXISTS youtube_channels (
  id TEXT PRIMARY KEY, -- YouTube Channel ID
  title TEXT NOT NULL,
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  custom_url TEXT, -- @channelname
  thumbnail_url TEXT,
  country TEXT,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  videos_cached_count INTEGER DEFAULT 0
);

-- 2. YouTube Videos Table (equivalent to episodes table)
CREATE TABLE IF NOT EXISTS youtube_videos (
  id TEXT PRIMARY KEY, -- YouTube Video ID
  channel_id TEXT NOT NULL REFERENCES youtube_channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  duration_seconds INTEGER,
  duration_formatted TEXT, -- "PT15M33S" format
  published_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  category_id TEXT,
  language TEXT,
  captions_available BOOLEAN DEFAULT FALSE,
  transcript_processed BOOLEAN DEFAULT FALSE,
  embedding_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_processed_at TIMESTAMPTZ
);

-- 3. YouTube Video Embeddings Table (equivalent to transcript_embeddings)
CREATE TABLE IF NOT EXISTS youtube_video_embeddings (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  segment_text TEXT NOT NULL,
  segment_start REAL NOT NULL, -- Start time in seconds
  segment_end REAL NOT NULL,   -- End time in seconds
  embedding VECTOR(1536) NOT NULL, -- OpenAI text-embedding-3-small dimensions
  confidence REAL DEFAULT 0.8,
  speaker TEXT, -- Speaker detection if available
  chunk_index INTEGER NOT NULL, -- Order of this chunk in the video
  total_chunks INTEGER NOT NULL, -- Total chunks for this video
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. YouTube Chat Sessions Table (for user interactions)
CREATE TABLE IF NOT EXISTS youtube_chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE,
  user_id UUID, -- Optional: link to auth.users if you have user auth
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  total_cost DECIMAL(10,6) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. YouTube Chat Messages Table (conversation history)
CREATE TABLE IF NOT EXISTS youtube_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES youtube_chat_sessions(id) ON DELETE CASCADE,
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp_reference REAL, -- Video timestamp if message references specific time
  cost DECIMAL(10,6) DEFAULT 0.00,
  confidence REAL DEFAULT 0.0,
  processing_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_youtube_channels_title ON youtube_channels(title);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_last_accessed ON youtube_channels(last_accessed_at);

CREATE INDEX IF NOT EXISTS idx_youtube_videos_channel ON youtube_videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_published ON youtube_videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_embedding_status ON youtube_videos(embedding_status);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_captions ON youtube_videos(captions_available);

CREATE INDEX IF NOT EXISTS idx_youtube_embeddings_video ON youtube_video_embeddings(video_id);
CREATE INDEX IF NOT EXISTS idx_youtube_embeddings_time ON youtube_video_embeddings(segment_start, segment_end);
CREATE INDEX IF NOT EXISTS idx_youtube_embeddings_chunk ON youtube_video_embeddings(video_id, chunk_index);

-- Vector similarity search index for YouTube embeddings
CREATE INDEX IF NOT EXISTS idx_youtube_embeddings_vector 
ON youtube_video_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_youtube_chat_sessions_video ON youtube_chat_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_youtube_chat_sessions_token ON youtube_chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_youtube_chat_sessions_start_time ON youtube_chat_sessions(start_time DESC);

CREATE INDEX IF NOT EXISTS idx_youtube_chat_messages_session ON youtube_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_youtube_chat_messages_created ON youtube_chat_messages(created_at DESC);

-- Enable Row Level Security
ALTER TABLE youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_video_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_chat_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access (adjust based on your needs)
CREATE POLICY "Allow all operations on youtube_channels" 
ON youtube_channels FOR ALL 
TO authenticated, anon
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all operations on youtube_videos" 
ON youtube_videos FOR ALL 
TO authenticated, anon
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all operations on youtube_video_embeddings" 
ON youtube_video_embeddings FOR ALL 
TO authenticated, anon
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all operations on youtube_chat_sessions" 
ON youtube_chat_sessions FOR ALL 
TO authenticated, anon
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all operations on youtube_chat_messages" 
ON youtube_chat_messages FOR ALL 
TO authenticated, anon
USING (true) 
WITH CHECK (true);

-- YouTube-specific search functions

-- Function to search YouTube video embeddings
CREATE OR REPLACE FUNCTION search_youtube_video_embeddings(
  query_embedding VECTOR(1536),
  target_video_id TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  video_id TEXT,
  video_title TEXT,
  segment_text TEXT,
  segment_start REAL,
  segment_end REAL,
  similarity FLOAT,
  confidence REAL,
  speaker TEXT,
  chunk_index INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ye.video_id,
    yv.title as video_title,
    ye.segment_text,
    ye.segment_start,
    ye.segment_end,
    1 - (ye.embedding <=> query_embedding) as similarity,
    ye.confidence,
    ye.speaker,
    ye.chunk_index
  FROM youtube_video_embeddings ye
  JOIN youtube_videos yv ON ye.video_id = yv.id
  WHERE 
    ye.video_id = target_video_id
    AND (1 - (ye.embedding <=> query_embedding)) > match_threshold
  ORDER BY ye.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search across all YouTube videos by channel
CREATE OR REPLACE FUNCTION search_youtube_channel_embeddings(
  query_embedding VECTOR(1536),
  target_channel_id TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  video_id TEXT,
  video_title TEXT,
  channel_title TEXT,
  segment_text TEXT,
  segment_start REAL,
  segment_end REAL,
  similarity FLOAT,
  confidence REAL,
  published_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ye.video_id,
    yv.title as video_title,
    yc.title as channel_title,
    ye.segment_text,
    ye.segment_start,
    ye.segment_end,
    1 - (ye.embedding <=> query_embedding) as similarity,
    ye.confidence,
    yv.published_at
  FROM youtube_video_embeddings ye
  JOIN youtube_videos yv ON ye.video_id = yv.id
  JOIN youtube_channels yc ON yv.channel_id = yc.id
  WHERE 
    yv.channel_id = target_channel_id
    AND (1 - (ye.embedding <=> query_embedding)) > match_threshold
  ORDER BY ye.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get YouTube video processing stats
CREATE OR REPLACE FUNCTION get_youtube_video_stats(target_video_id TEXT)
RETURNS TABLE (
  video_id TEXT,
  title TEXT,
  duration_seconds INTEGER,
  captions_available BOOLEAN,
  embedding_status TEXT,
  embedding_count INTEGER,
  total_chunks INTEGER,
  last_processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    yv.id as video_id,
    yv.title,
    yv.duration_seconds,
    yv.captions_available,
    yv.embedding_status,
    COUNT(ye.id)::INTEGER as embedding_count,
    COALESCE(MAX(ye.total_chunks), 0)::INTEGER as total_chunks,
    yv.last_processed_at
  FROM youtube_videos yv
  LEFT JOIN youtube_video_embeddings ye ON yv.id = ye.video_id
  WHERE yv.id = target_video_id
  GROUP BY yv.id, yv.title, yv.duration_seconds, yv.captions_available, 
           yv.embedding_status, yv.last_processed_at;
END;
$$;

-- Update functions for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_youtube()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating timestamps
CREATE TRIGGER update_youtube_channels_updated_at 
  BEFORE UPDATE ON youtube_channels 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_youtube();

CREATE TRIGGER update_youtube_videos_updated_at 
  BEFORE UPDATE ON youtube_videos 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_youtube();

CREATE TRIGGER update_youtube_video_embeddings_updated_at 
  BEFORE UPDATE ON youtube_video_embeddings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_youtube();

CREATE TRIGGER update_youtube_chat_sessions_updated_at 
  BEFORE UPDATE ON youtube_chat_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_youtube();

-- Grant necessary permissions
GRANT ALL ON youtube_channels TO authenticated, anon;
GRANT ALL ON youtube_videos TO authenticated, anon;
GRANT ALL ON youtube_video_embeddings TO authenticated, anon;
GRANT ALL ON youtube_chat_sessions TO authenticated, anon;
GRANT ALL ON youtube_chat_messages TO authenticated, anon;

GRANT USAGE ON SEQUENCE youtube_video_embeddings_id_seq TO authenticated, anon;

GRANT EXECUTE ON FUNCTION search_youtube_video_embeddings(VECTOR(1536), TEXT, FLOAT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_youtube_channel_embeddings(VECTOR(1536), TEXT, FLOAT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_youtube_video_stats(TEXT) TO authenticated, anon; 