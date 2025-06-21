-- ==========================================
-- 1. Check current column type
-- ==========================================
SELECT 
    column_name, 
    data_type, 
    udt_name,
    character_maximum_length,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'youtube_transcript_chunks' 
  AND column_name = 'embedding';

-- ==========================================
-- 2. Check what type our actual data is
-- ==========================================
SELECT 
    pg_typeof(embedding) as current_type,
    length(embedding::text) as string_length,
    left(embedding::text, 100) as preview
FROM youtube_transcript_chunks 
LIMIT 1;

-- ==========================================
-- 3. Fix the column type if it's wrong
-- ==========================================
-- IMPORTANT: This will only work if the column currently contains 
-- string representations of arrays like "[0.1,0.2,0.3,...]"

-- First, let's see if we can convert existing data
SELECT 
    id,
    -- Try to parse the string as an array
    (embedding::text)::vector as converted_embedding
FROM youtube_transcript_chunks 
LIMIT 1;

-- If the above works, we can alter the column:
-- ALTER TABLE youtube_transcript_chunks 
--   ALTER COLUMN embedding TYPE vector(1536) 
--   USING (embedding::text)::vector;

-- ==========================================
-- 4. Verify the fix worked
-- ==========================================
-- After running the ALTER, check the type again:
-- SELECT pg_typeof(embedding) FROM youtube_transcript_chunks LIMIT 1;

-- ==========================================
-- 5. Test vector operations work
-- ==========================================
-- This should work if embeddings are proper vectors:
-- SELECT 
--     id,
--     embedding <-> ARRAY[0.034299243,-0.009013729,0.0010877541]::vector as cosine_distance
-- FROM youtube_transcript_chunks 
-- LIMIT 3; 