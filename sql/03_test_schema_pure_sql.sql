-- ============================================================================
-- YouTube Database Schema Test - Pure SQL Version
-- 
-- This script tests the basic functionality of the YouTube database schema
-- using only standard SQL (no psql-specific commands).
-- ============================================================================

-- Test 1: Verify all tables exist
SELECT 
    'TEST 1: Checking YouTube Tables' as test_name,
    expected_tables.tablename,
    CASE WHEN pt.tablename IS NOT NULL THEN 'EXISTS ✅' ELSE 'MISSING ❌' END as status
FROM (
    VALUES 
        ('youtube_channels'),
        ('youtube_videos'), 
        ('youtube_transcripts'),
        ('youtube_transcript_segments'),
        ('youtube_embeddings'),
        ('youtube_search_cache'),
        ('youtube_web_cache'),
        ('youtube_search_analytics')
) AS expected_tables(tablename)
LEFT JOIN pg_tables pt ON pt.tablename = expected_tables.tablename
ORDER BY expected_tables.tablename;

-- Test 2: Insert sample data to test relationships
-- Insert a sample channel
INSERT INTO youtube_channels (
    id, name, description, subscriber_count, video_count, 
    topics, expertise_areas, content_style
) VALUES (
    'UC_test_channel_123',
    'Test Tech Channel',
    'A sample technology channel for testing',
    100000,
    50,
    ARRAY['technology', 'programming', 'tutorials'],
    ARRAY['web development', 'javascript', 'react'],
    'educational'
) ON CONFLICT (id) DO NOTHING;

-- Insert a sample video
INSERT INTO youtube_videos (
    id, channel_id, title, description, duration_seconds,
    published_at, language, category, tags, has_captions,
    transcript_status
) VALUES (
    'test_video_123',
    'UC_test_channel_123',
    'How to Build a RAG System',
    'Learn how to build a 4-dimensional RAG system with YouTube transcripts',
    1800, -- 30 minutes
    NOW() - INTERVAL '1 week',
    'en',
    'Education',
    ARRAY['rag', 'ai', 'tutorial', 'programming'],
    true,
    'completed'
) ON CONFLICT (id) DO NOTHING;

-- Insert a sample transcript
INSERT INTO youtube_transcripts (
    video_id, channel_id, content, segment_count, total_duration,
    language, format, source, confidence_score, processing_time_ms
) VALUES (
    'test_video_123',
    'UC_test_channel_123',
    'Welcome to this tutorial on building RAG systems. Today we will learn about vector embeddings, full-text search, and hybrid approaches.',
    5,
    1800.0,
    'en',
    'json',
    'auto',
    0.95,
    1200
) ON CONFLICT (video_id) DO NOTHING;

-- Insert sample transcript segments
INSERT INTO youtube_transcript_segments (
    transcript_id, video_id, text, start_time, end_time, duration,
    segment_index, confidence, keywords, topics
) 
SELECT 
    t.id,
    'test_video_123',
    segment_data.text,
    segment_data.start_time,
    segment_data.end_time,
    segment_data.duration,
    segment_data.segment_index,
    segment_data.confidence,
    segment_data.keywords,
    segment_data.topics
FROM youtube_transcripts t,
(VALUES 
    ('Welcome to this tutorial on building RAG systems.', 0.0, 3.5, 3.5, 1, 0.98, ARRAY['tutorial', 'RAG'], ARRAY['introduction']),
    ('Today we will learn about vector embeddings.', 3.5, 8.2, 4.7, 2, 0.96, ARRAY['vector', 'embeddings'], ARRAY['machine learning']),
    ('Full-text search is another important component.', 8.2, 12.8, 4.6, 3, 0.94, ARRAY['search', 'text'], ARRAY['information retrieval']),
    ('Hybrid approaches combine multiple techniques.', 12.8, 17.1, 4.3, 4, 0.97, ARRAY['hybrid', 'techniques'], ARRAY['methodology']),
    ('Let us start building our system step by step.', 17.1, 21.5, 4.4, 5, 0.95, ARRAY['building', 'system'], ARRAY['implementation'])
) AS segment_data(text, start_time, end_time, duration, segment_index, confidence, keywords, topics)
WHERE t.video_id = 'test_video_123'
ON CONFLICT (transcript_id, segment_index) DO NOTHING;

-- Test 3: Verify data relationships
SELECT 
    'TEST 2: Data Relationships' as test_name,
    c.name as channel_name,
    v.title as video_title,
    t.segment_count as expected_segments,
    COUNT(ts.id) as actual_segments,
    CASE 
        WHEN t.segment_count = COUNT(ts.id) THEN 'PASS ✅' 
        ELSE 'FAIL ❌' 
    END as relationship_test
FROM youtube_channels c
JOIN youtube_videos v ON c.id = v.channel_id
JOIN youtube_transcripts t ON v.id = t.video_id
LEFT JOIN youtube_transcript_segments ts ON t.id = ts.transcript_id
WHERE c.id = 'UC_test_channel_123'
GROUP BY c.name, v.title, t.segment_count;

-- Test 4: Check if search functions exist
SELECT 
    'TEST 3: Search Functions' as test_name,
    expected_functions.routine_name,
    CASE WHEN r.routine_name IS NOT NULL THEN 'EXISTS ✅' ELSE 'MISSING ❌' END as status
FROM (
    VALUES 
        ('search_youtube_fts'),
        ('match_youtube_embeddings'), 
        ('hybrid_search_youtube'),
        ('search_youtube_metadata'),
        ('route_youtube_query'),
        ('search_youtube_unified')
) AS expected_functions(routine_name)
LEFT JOIN information_schema.routines r ON r.routine_name = expected_functions.routine_name
ORDER BY expected_functions.routine_name;

-- Test 5: Verify indexes exist
SELECT 
    'TEST 4: Database Indexes' as test_name,
    tablename,
    COUNT(*) as index_count,
    CASE 
        WHEN COUNT(*) > 0 THEN 'INDEXED ✅' 
        ELSE 'NO INDEXES ❌' 
    END as index_status
FROM pg_indexes 
WHERE tablename LIKE 'youtube_%'
GROUP BY tablename
ORDER BY tablename;

-- Test 6: Sample data verification
SELECT 
    'TEST 5: Sample Data Count' as test_name,
    'youtube_channels' as table_name,
    COUNT(*) as record_count
FROM youtube_channels
WHERE id = 'UC_test_channel_123'

UNION ALL

SELECT 
    'TEST 5: Sample Data Count' as test_name,
    'youtube_videos' as table_name,
    COUNT(*) as record_count
FROM youtube_videos
WHERE id = 'test_video_123'

UNION ALL

SELECT 
    'TEST 5: Sample Data Count' as test_name,
    'youtube_transcripts' as table_name,
    COUNT(*) as record_count
FROM youtube_transcripts
WHERE video_id = 'test_video_123'

UNION ALL

SELECT 
    'TEST 5: Sample Data Count' as test_name,
    'youtube_transcript_segments' as table_name,
    COUNT(*) as record_count
FROM youtube_transcript_segments
WHERE video_id = 'test_video_123'

ORDER BY table_name;

-- Final summary
SELECT 
    'SUMMARY: YouTube Database Schema Test Complete!' as message,
    'Next: Run sql/02_create_search_functions.sql' as next_step; 