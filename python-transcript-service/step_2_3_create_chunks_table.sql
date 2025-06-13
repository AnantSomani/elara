-- Step 2.3-2.5: Create transcript_chunks table with indexes and constraints
-- Execute this in Supabase SQL Editor

-- First, let's validate our approach by checking existing schema
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('youtube_videos', 'youtube_transcripts')
ORDER BY table_name, ordinal_position;

-- Check existing foreign key relationships
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN ('youtube_transcripts', 'youtube_videos');

-- Now create the transcript_chunks table
CREATE TABLE IF NOT EXISTS transcript_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI ada-002 embedding dimension
    word_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint to youtube_videos
ALTER TABLE transcript_chunks 
ADD CONSTRAINT fk_transcript_chunks_video_id 
FOREIGN KEY (video_id) REFERENCES youtube_videos(id) ON DELETE CASCADE;

-- Add unique constraint for video_id + chunk_index
ALTER TABLE transcript_chunks 
ADD CONSTRAINT uk_transcript_chunks_video_chunk 
UNIQUE (video_id, chunk_index);

-- Add check constraints for data validation
ALTER TABLE transcript_chunks 
ADD CONSTRAINT chk_transcript_chunks_time_order 
CHECK (start_time < end_time);

ALTER TABLE transcript_chunks 
ADD CONSTRAINT chk_transcript_chunks_positive_times 
CHECK (start_time >= 0 AND end_time >= 0);

ALTER TABLE transcript_chunks 
ADD CONSTRAINT chk_transcript_chunks_positive_chunk_index 
CHECK (chunk_index >= 0);

-- Create indexes for performance

-- Vector similarity search index (primary for semantic search)
CREATE INDEX IF NOT EXISTS ix_transcript_chunks_embedding_cosine 
ON transcript_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Time-based queries index (for temporal context in 4D search)
CREATE INDEX IF NOT EXISTS ix_transcript_chunks_video_time 
ON transcript_chunks (video_id, start_time, end_time);

-- Video-based lookups index (for fast video filtering)
CREATE INDEX IF NOT EXISTS ix_transcript_chunks_video_id 
ON transcript_chunks (video_id);

-- Chunk ordering index (for sequential chunk retrieval)
CREATE INDEX IF NOT EXISTS ix_transcript_chunks_video_chunk_order 
ON transcript_chunks (video_id, chunk_index);

-- Verify table creation
\d transcript_chunks;

-- Check constraints were added correctly
SELECT 
    constraint_name, 
    constraint_type,
    check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'transcript_chunks';

-- Check indexes were created
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'transcript_chunks';

-- Test basic functionality with a sample insert and vector operation
-- (This will help validate everything is working)

-- Insert a test record (using existing video)
INSERT INTO transcript_chunks (
    video_id, 
    chunk_index, 
    start_time, 
    end_time, 
    content,
    word_count
) VALUES (
    'test_video_123',  -- Using existing video from your schema check
    0,
    0.0,
    45.0,
    'This is a test chunk for validating our schema setup. It contains some sample content that would normally come from a YouTube transcript.',
    26
);

-- Test vector insertion and similarity search
UPDATE transcript_chunks 
SET embedding = array_fill(0.1, ARRAY[1536])::vector
WHERE video_id = 'test_video_123' AND chunk_index = 0;

-- Test vector similarity query
SELECT 
    video_id, 
    chunk_index,
    start_time,
    end_time,
    embedding <-> array_fill(0.1, ARRAY[1536])::vector as similarity_distance
FROM transcript_chunks 
WHERE video_id = 'test_video_123'
ORDER BY similarity_distance 
LIMIT 5;

-- Clean up test data
DELETE FROM transcript_chunks WHERE video_id = 'test_video_123' AND chunk_index = 0;

-- Final verification - show table is ready
SELECT 
    'transcript_chunks table created successfully!' as status,
    COUNT(*) as current_chunk_count
FROM transcript_chunks; 