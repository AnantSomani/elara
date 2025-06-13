-- Step 2.3-2.5: Create transcript_chunks table (Supabase SQL Editor Compatible)
-- Execute this in Supabase SQL Editor

-- Check if transcript_chunks table already exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transcript_chunks')
        THEN 'transcript_chunks table already exists - skipping creation'
        ELSE 'transcript_chunks table does not exist - will create'
    END as table_status;

-- Only create table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transcript_chunks') THEN
        CREATE TABLE transcript_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            video_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL,
            content TEXT NOT NULL,
            embedding VECTOR(1536),
            word_count INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE 'transcript_chunks table created successfully';
    ELSE
        RAISE NOTICE 'transcript_chunks table already exists - skipping creation';
    END IF;
END $$;

-- Add constraints only if they don't exist
DO $$
BEGIN
    -- Foreign key constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_transcript_chunks_video_id' 
        AND table_name = 'transcript_chunks'
    ) THEN
        ALTER TABLE transcript_chunks 
        ADD CONSTRAINT fk_transcript_chunks_video_id 
        FOREIGN KEY (video_id) REFERENCES youtube_videos(id) ON DELETE CASCADE;
        RAISE NOTICE 'Foreign key constraint added';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists';
    END IF;

    -- Unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'uk_transcript_chunks_video_chunk' 
        AND table_name = 'transcript_chunks'
    ) THEN
        ALTER TABLE transcript_chunks 
        ADD CONSTRAINT uk_transcript_chunks_video_chunk 
        UNIQUE (video_id, chunk_index);
        RAISE NOTICE 'Unique constraint added';
    ELSE
        RAISE NOTICE 'Unique constraint already exists';
    END IF;

    -- Check constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_transcript_chunks_time_order'
    ) THEN
        ALTER TABLE transcript_chunks 
        ADD CONSTRAINT chk_transcript_chunks_time_order 
        CHECK (start_time < end_time);
        RAISE NOTICE 'Time order check constraint added';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_transcript_chunks_positive_times'
    ) THEN
        ALTER TABLE transcript_chunks 
        ADD CONSTRAINT chk_transcript_chunks_positive_times 
        CHECK (start_time >= 0 AND end_time >= 0);
        RAISE NOTICE 'Positive times check constraint added';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_transcript_chunks_positive_chunk_index'
    ) THEN
        ALTER TABLE transcript_chunks 
        ADD CONSTRAINT chk_transcript_chunks_positive_chunk_index 
        CHECK (chunk_index >= 0);
        RAISE NOTICE 'Positive chunk index check constraint added';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adding constraints: %', SQLERRM;
END $$;

-- Create indexes only if they don't exist
DO $$
BEGIN
    -- Vector similarity search index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_transcript_chunks_embedding_cosine') THEN
        CREATE INDEX ix_transcript_chunks_embedding_cosine 
        ON transcript_chunks 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        RAISE NOTICE 'Vector similarity index created';
    ELSE
        RAISE NOTICE 'Vector similarity index already exists';
    END IF;

    -- Time-based queries index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_transcript_chunks_video_time') THEN
        CREATE INDEX ix_transcript_chunks_video_time 
        ON transcript_chunks (video_id, start_time, end_time);
        RAISE NOTICE 'Time-based index created';
    END IF;

    -- Video-based lookups index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_transcript_chunks_video_id') THEN
        CREATE INDEX ix_transcript_chunks_video_id 
        ON transcript_chunks (video_id);
        RAISE NOTICE 'Video lookup index created';
    END IF;

    -- Chunk ordering index
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_transcript_chunks_video_chunk_order') THEN
        CREATE INDEX ix_transcript_chunks_video_chunk_order 
        ON transcript_chunks (video_id, chunk_index);
        RAISE NOTICE 'Chunk ordering index created';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating indexes: %', SQLERRM;
END $$;

-- Test basic functionality
DO $$
DECLARE
    test_video_exists BOOLEAN;
BEGIN
    -- Check if test video exists
    SELECT EXISTS(SELECT 1 FROM youtube_videos WHERE id = 'test_video_123') INTO test_video_exists;
    
    IF test_video_exists THEN
        -- Clean up any existing test data first
        DELETE FROM transcript_chunks WHERE video_id = 'test_video_123' AND chunk_index = 999;
        
        -- Insert test record
        INSERT INTO transcript_chunks (
            video_id, 
            chunk_index, 
            start_time, 
            end_time, 
            content,
            word_count
        ) VALUES (
            'test_video_123',
            999,
            0.0,
            45.0,
            'Test chunk for schema validation',
            6
        );

        -- Test vector operations
        UPDATE transcript_chunks 
        SET embedding = array_fill(0.1, ARRAY[1536])::vector
        WHERE video_id = 'test_video_123' AND chunk_index = 999;

        -- Clean up test data
        DELETE FROM transcript_chunks WHERE video_id = 'test_video_123' AND chunk_index = 999;
        
        RAISE NOTICE 'Vector operations test completed successfully';
    ELSE
        RAISE NOTICE 'Test video not found - skipping vector operations test';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        DELETE FROM transcript_chunks WHERE video_id = 'test_video_123' AND chunk_index = 999;
        RAISE NOTICE 'Vector test error (cleaned up): %', SQLERRM;
END $$;

-- Final verification
SELECT 
    'transcript_chunks table setup completed!' as status,
    COUNT(*) as current_chunk_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'Table is empty and ready for data'
        ELSE CONCAT('Table has ', COUNT(*), ' existing chunks')
    END as table_state
FROM transcript_chunks;

-- Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'transcript_chunks'
ORDER BY ordinal_position; 