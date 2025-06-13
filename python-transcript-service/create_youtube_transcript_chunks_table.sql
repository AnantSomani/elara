-- Create youtube_transcript_chunks table for RAG system
-- This table stores time-based chunks from YouTube transcripts ready for embedding

CREATE TABLE IF NOT EXISTS youtube_transcript_chunks (
    -- Primary key
    chunk_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Foreign key to youtube_videos table
    video_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
    
    -- Chunk identification and ordering
    chunk_index INTEGER NOT NULL,
    
    -- Time boundaries (in seconds)
    start_time DECIMAL(10,2) NOT NULL,
    end_time DECIMAL(10,2) NOT NULL,
    
    -- Content and metadata
    text TEXT NOT NULL, -- The actual chunk content
    word_count INTEGER NOT NULL DEFAULT 0,
    
    -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
    embedding VECTOR(1536),
    
    -- Additional metadata as JSON
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT positive_word_count CHECK (word_count >= 0),
    CONSTRAINT valid_chunk_index CHECK (chunk_index >= 0),
    
    -- Unique constraint to prevent duplicate chunks
    UNIQUE(video_id, chunk_index)
);

-- Create indexes for efficient querying

-- Time-based queries (for temporal search)
CREATE INDEX IF NOT EXISTS idx_youtube_transcript_chunks_time 
ON youtube_transcript_chunks (video_id, start_time, end_time);

-- Chunk ordering
CREATE INDEX IF NOT EXISTS idx_youtube_transcript_chunks_order 
ON youtube_transcript_chunks (video_id, chunk_index);

-- Vector similarity search (ivfflat for approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_youtube_transcript_chunks_embedding 
ON youtube_transcript_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Full-text search on content
CREATE INDEX IF NOT EXISTS idx_youtube_transcript_chunks_text_search 
ON youtube_transcript_chunks USING gin(to_tsvector('english', text));

-- Word count for filtering
CREATE INDEX IF NOT EXISTS idx_youtube_transcript_chunks_word_count 
ON youtube_transcript_chunks (word_count);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_youtube_transcript_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_youtube_transcript_chunks_updated_at
    BEFORE UPDATE ON youtube_transcript_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_youtube_transcript_chunks_updated_at();

-- Add comments for documentation
COMMENT ON TABLE youtube_transcript_chunks IS 'Time-based chunks from YouTube transcripts for RAG system';
COMMENT ON COLUMN youtube_transcript_chunks.video_id IS 'References youtube_videos.id';
COMMENT ON COLUMN youtube_transcript_chunks.chunk_index IS 'Sequential order of chunks within video (0-based)';
COMMENT ON COLUMN youtube_transcript_chunks.start_time IS 'Chunk start time in seconds';
COMMENT ON COLUMN youtube_transcript_chunks.end_time IS 'Chunk end time in seconds';
COMMENT ON COLUMN youtube_transcript_chunks.text IS 'Chunk content text for embedding and search';
COMMENT ON COLUMN youtube_transcript_chunks.word_count IS 'Number of words in chunk for quality metrics';
COMMENT ON COLUMN youtube_transcript_chunks.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN youtube_transcript_chunks.metadata IS 'Additional chunk metadata (duration, segment_count, etc.)';

-- Grant permissions (adjust role name as needed)
-- GRANT ALL ON youtube_transcript_chunks TO your_service_role;
-- GRANT USAGE ON SCHEMA public TO your_service_role; 