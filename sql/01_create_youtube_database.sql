-- ============================================================================
-- YouTube Transcript Database Schema - Complete Setup
-- 
-- This creates a fresh, independent database schema specifically for YouTube
-- transcript functionality with 4-dimensional RAG capabilities:
-- 1. FTS (Full-Text Search)
-- 2. Vector Embeddings  
-- 3. Web Search Integration
-- 4. Metadata Search
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- CORE YOUTUBE CONTENT TABLES
-- ============================================================================

-- YouTube channels/creators metadata
CREATE TABLE youtube_channels (
    id TEXT PRIMARY KEY, -- YouTube channel ID (e.g., "UC_x5XG1OV2P6uZZ5FSM9Ttw")
    name TEXT NOT NULL,
    description TEXT,
    custom_url TEXT, -- @channelname
    thumbnail_url TEXT,
    
    -- Channel statistics
    subscriber_count BIGINT,
    video_count INTEGER,
    view_count BIGINT,
    
    -- AI-extracted metadata
    category TEXT,
    topics TEXT[] DEFAULT '{}',
    expertise_areas TEXT[] DEFAULT '{}',
    content_style TEXT, -- educational, entertainment, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_crawled_at TIMESTAMPTZ
);

-- YouTube videos metadata
CREATE TABLE youtube_videos (
    id TEXT PRIMARY KEY, -- YouTube video ID (e.g., "dQw4w9WgXcQ")
    channel_id TEXT NOT NULL REFERENCES youtube_channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    
    -- Video statistics
    duration_seconds INTEGER NOT NULL,
    view_count BIGINT,
    like_count INTEGER,
    comment_count INTEGER,
    
    -- Video metadata
    published_at TIMESTAMPTZ NOT NULL,
    language TEXT,
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Content flags
    has_captions BOOLEAN DEFAULT FALSE,
    has_auto_captions BOOLEAN DEFAULT FALSE,
    is_live BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    
    -- Processing status
    transcript_status TEXT DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed', 'not_available')),
    transcript_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_processed_at TIMESTAMPTZ
);

-- ============================================================================
-- TRANSCRIPT STORAGE TABLES
-- ============================================================================

-- Complete YouTube video transcripts with FTS support
CREATE TABLE youtube_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES youtube_channels(id) ON DELETE CASCADE,
    
    -- Transcript content
    content TEXT NOT NULL, -- Full transcript text
    segment_count INTEGER NOT NULL,
    total_duration NUMERIC(10,3) NOT NULL, -- in seconds
    
    -- Processing metadata
    language TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'text', 'srt', 'vtt', 'fts')),
    source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual', 'community')),
    confidence_score NUMERIC(3,2), -- Average confidence
    
    -- Processing details
    processing_time_ms INTEGER,
    api_version TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one transcript per video
    UNIQUE(video_id)
);

-- Individual transcript segments for granular search
CREATE TABLE youtube_transcript_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transcript_id UUID NOT NULL REFERENCES youtube_transcripts(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL, -- Denormalized for direct access
    
    -- Segment content
    text TEXT NOT NULL,
    start_time NUMERIC(10,3) NOT NULL, -- in seconds
    end_time NUMERIC(10,3) NOT NULL, -- in seconds
    duration NUMERIC(10,3) NOT NULL, -- end_time - start_time
    
    -- Segment metadata
    segment_index INTEGER NOT NULL, -- Order within transcript
    speaker TEXT, -- If speaker identification available
    confidence NUMERIC(3,2), -- Individual segment confidence
    
    -- Enhanced search fields
    keywords TEXT[] DEFAULT '{}', -- Extracted keywords for this segment
    topics TEXT[] DEFAULT '{}', -- AI-extracted topics
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure proper ordering
    UNIQUE(transcript_id, segment_index)
);

-- ============================================================================
-- VECTOR EMBEDDINGS TABLES
-- ============================================================================

-- Vector embeddings for semantic search
CREATE TABLE youtube_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type TEXT NOT NULL CHECK (content_type IN ('transcript_full', 'transcript_chunk', 'video_metadata', 'channel_metadata')),
    content_id TEXT NOT NULL, -- References transcript_id, segment_id, video_id, or channel_id
    
    -- Embedding data
    embedding vector(1536), -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
    model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_version TEXT NOT NULL DEFAULT 'v1',
    
    -- Chunk information (for transcript chunks)
    chunk_index INTEGER,
    chunk_text TEXT,
    chunk_token_count INTEGER,
    
    -- Context metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SEARCH & CACHE TABLES
-- ============================================================================

-- Search query cache for performance
CREATE TABLE youtube_search_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_hash TEXT NOT NULL UNIQUE, -- MD5 hash of normalized query
    query_text TEXT NOT NULL,
    query_type TEXT NOT NULL CHECK (query_type IN ('fts', 'vector', 'hybrid', 'web', 'metadata')),
    
    -- Cached results
    results JSONB NOT NULL,
    result_count INTEGER NOT NULL,
    
    -- Cache metadata
    search_strategy JSONB DEFAULT '{}', -- Which engines were used
    execution_time_ms INTEGER NOT NULL,
    
    -- Cache management
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 1, -- Track cache usage
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Web search cache (Tavily results)
CREATE TABLE youtube_web_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_hash TEXT NOT NULL UNIQUE,
    query_text TEXT NOT NULL,
    
    -- Web search results
    results JSONB NOT NULL, -- Tavily API response
    result_count INTEGER NOT NULL,
    search_provider TEXT NOT NULL DEFAULT 'tavily' CHECK (search_provider IN ('tavily', 'google', 'other')),
    
    -- Cache metadata
    expires_at TIMESTAMPTZ NOT NULL,
    is_fresh BOOLEAN DEFAULT TRUE, -- Whether results are still current
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_refreshed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ANALYTICS & MONITORING TABLES
-- ============================================================================

-- Search analytics and performance monitoring
CREATE TABLE youtube_search_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT, -- User session if available
    
    -- Query information
    query_text TEXT NOT NULL,
    query_type TEXT NOT NULL CHECK (query_type IN ('fts', 'vector', 'hybrid', 'web', 'metadata')),
    query_intent TEXT, -- AI-classified intent
    
    -- Search execution
    engines_used TEXT[] NOT NULL, -- Which search engines were used
    total_results INTEGER NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    
    -- Result interaction
    clicked_results TEXT[] DEFAULT '{}', -- Result IDs that were clicked
    user_satisfaction INTEGER CHECK (user_satisfaction BETWEEN 1 AND 5), -- 1-5 rating if available
    
    -- Performance metrics
    cache_hit BOOLEAN DEFAULT FALSE,
    error_occurred BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Channel indexes
CREATE INDEX idx_youtube_channels_name ON youtube_channels USING GIN (to_tsvector('english', name));
CREATE INDEX idx_youtube_channels_topics ON youtube_channels USING GIN (topics);
CREATE INDEX idx_youtube_channels_updated_at ON youtube_channels (updated_at);

-- Video indexes
CREATE INDEX idx_youtube_videos_channel_id ON youtube_videos (channel_id);
CREATE INDEX idx_youtube_videos_published_at ON youtube_videos (published_at DESC);
CREATE INDEX idx_youtube_videos_title ON youtube_videos USING GIN (to_tsvector('english', title));
CREATE INDEX idx_youtube_videos_description ON youtube_videos USING GIN (to_tsvector('english', description));
CREATE INDEX idx_youtube_videos_tags ON youtube_videos USING GIN (tags);
CREATE INDEX idx_youtube_videos_transcript_status ON youtube_videos (transcript_status);
CREATE INDEX idx_youtube_videos_duration ON youtube_videos (duration_seconds);

-- Transcript indexes
CREATE INDEX idx_youtube_transcripts_video_id ON youtube_transcripts (video_id);
CREATE INDEX idx_youtube_transcripts_channel_id ON youtube_transcripts (channel_id);
CREATE INDEX idx_youtube_transcripts_language ON youtube_transcripts (language);
CREATE INDEX idx_youtube_transcripts_content ON youtube_transcripts USING GIN (to_tsvector('english', content));

-- Segment indexes
CREATE INDEX idx_youtube_transcript_segments_transcript_id ON youtube_transcript_segments (transcript_id);
CREATE INDEX idx_youtube_transcript_segments_video_id ON youtube_transcript_segments (video_id);
CREATE INDEX idx_youtube_transcript_segments_start_time ON youtube_transcript_segments (start_time);
CREATE INDEX idx_youtube_transcript_segments_text ON youtube_transcript_segments USING GIN (to_tsvector('english', text));
CREATE INDEX idx_youtube_transcript_segments_keywords ON youtube_transcript_segments USING GIN (keywords);

-- Embedding indexes
CREATE INDEX idx_youtube_embeddings_content_type ON youtube_embeddings (content_type);
CREATE INDEX idx_youtube_embeddings_content_id ON youtube_embeddings (content_id);
CREATE INDEX idx_youtube_embeddings_vector ON youtube_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Cache indexes
CREATE INDEX idx_youtube_search_cache_query_hash ON youtube_search_cache (query_hash);
CREATE INDEX idx_youtube_search_cache_expires_at ON youtube_search_cache (expires_at);
CREATE INDEX idx_youtube_web_cache_query_hash ON youtube_web_cache (query_hash);
CREATE INDEX idx_youtube_web_cache_expires_at ON youtube_web_cache (expires_at);

-- Analytics indexes
CREATE INDEX idx_youtube_search_analytics_created_at ON youtube_search_analytics (created_at DESC);
CREATE INDEX idx_youtube_search_analytics_query_type ON youtube_search_analytics (query_type);
CREATE INDEX idx_youtube_search_analytics_session_id ON youtube_search_analytics (session_id);

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_youtube_channels_updated_at BEFORE UPDATE ON youtube_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_youtube_videos_updated_at BEFORE UPDATE ON youtube_videos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_youtube_transcripts_updated_at BEFORE UPDATE ON youtube_transcripts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE youtube_channels IS 'YouTube channel metadata and statistics';
COMMENT ON TABLE youtube_videos IS 'YouTube video metadata with processing status';
COMMENT ON TABLE youtube_transcripts IS 'Complete video transcripts with full-text search';
COMMENT ON TABLE youtube_transcript_segments IS 'Individual transcript segments for granular search';
COMMENT ON TABLE youtube_embeddings IS 'Vector embeddings for semantic search capabilities';
COMMENT ON TABLE youtube_search_cache IS 'Query result cache for improved performance';
COMMENT ON TABLE youtube_web_cache IS 'Web search results cache (Tavily, etc.)';
COMMENT ON TABLE youtube_search_analytics IS 'Search analytics and performance monitoring';

COMMENT ON COLUMN youtube_embeddings.embedding IS 'Vector embedding using OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON COLUMN youtube_transcript_segments.start_time IS 'Segment start time in seconds with millisecond precision';
COMMENT ON COLUMN youtube_search_cache.query_hash IS 'MD5 hash of normalized query for efficient cache lookups'; 