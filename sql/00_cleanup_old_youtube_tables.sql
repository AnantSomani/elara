-- ============================================================================
-- Cleanup Old YouTube Tables
-- 
-- This script safely removes any existing YouTube-related tables to prepare
-- for the new, comprehensive YouTube transcript database schema.
-- ============================================================================

-- Drop tables in correct order (respecting foreign key dependencies)
-- Start with dependent tables first, then work backwards

-- Drop any existing YouTube-related tables (common names)
DROP TABLE IF EXISTS youtube_search_analytics CASCADE;
DROP TABLE IF EXISTS youtube_web_cache CASCADE;
DROP TABLE IF EXISTS youtube_search_cache CASCADE;
DROP TABLE IF EXISTS youtube_embeddings CASCADE;
DROP TABLE IF EXISTS youtube_transcript_segments CASCADE;
DROP TABLE IF EXISTS youtube_transcripts CASCADE;
DROP TABLE IF EXISTS youtube_videos CASCADE;
DROP TABLE IF EXISTS youtube_channels CASCADE;

-- Drop any existing YouTube-related functions
DROP FUNCTION IF EXISTS match_youtube_embeddings CASCADE;
DROP FUNCTION IF EXISTS search_youtube_fts CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_youtube CASCADE;
DROP FUNCTION IF EXISTS search_youtube_metadata CASCADE;
DROP FUNCTION IF EXISTS route_youtube_query CASCADE;
DROP FUNCTION IF EXISTS search_youtube_unified CASCADE;
DROP FUNCTION IF EXISTS cleanup_youtube_cache CASCADE;
DROP FUNCTION IF EXISTS get_youtube_cache_stats CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Drop any existing YouTube-related indexes (they'll be recreated)
-- Note: Indexes are automatically dropped when tables are dropped

-- Drop any existing YouTube-related views
DROP VIEW IF EXISTS youtube_video_search CASCADE;
DROP VIEW IF EXISTS youtube_transcript_search CASCADE;

-- Clean up any orphaned sequences or types
DROP TYPE IF EXISTS transcript_status CASCADE;
DROP TYPE IF EXISTS content_type CASCADE;
DROP TYPE IF EXISTS search_provider CASCADE;
DROP TYPE IF EXISTS query_type CASCADE;

-- Output confirmation
SELECT 'Old YouTube tables and functions have been cleaned up successfully!' as status; 