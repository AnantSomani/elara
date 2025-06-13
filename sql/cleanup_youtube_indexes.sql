-- ============================================================================
-- Cleanup Remaining YouTube Indexes
-- 
-- This script removes any leftover YouTube indexes that weren't automatically
-- dropped when the tables were manually deleted.
-- ============================================================================

-- Drop all YouTube-related indexes
DROP INDEX IF EXISTS idx_youtube_channels_name;
DROP INDEX IF EXISTS idx_youtube_channels_topics;
DROP INDEX IF EXISTS idx_youtube_channels_updated_at;

DROP INDEX IF EXISTS idx_youtube_videos_channel_id;
DROP INDEX IF EXISTS idx_youtube_videos_published_at;
DROP INDEX IF EXISTS idx_youtube_videos_title;
DROP INDEX IF EXISTS idx_youtube_videos_description;
DROP INDEX IF EXISTS idx_youtube_videos_tags;
DROP INDEX IF EXISTS idx_youtube_videos_transcript_status;
DROP INDEX IF EXISTS idx_youtube_videos_duration;

DROP INDEX IF EXISTS idx_youtube_transcripts_video_id;
DROP INDEX IF EXISTS idx_youtube_transcripts_channel_id;
DROP INDEX IF EXISTS idx_youtube_transcripts_language;
DROP INDEX IF EXISTS idx_youtube_transcripts_content;

DROP INDEX IF EXISTS idx_youtube_transcript_segments_transcript_id;
DROP INDEX IF EXISTS idx_youtube_transcript_segments_video_id;
DROP INDEX IF EXISTS idx_youtube_transcript_segments_start_time;
DROP INDEX IF EXISTS idx_youtube_transcript_segments_text;
DROP INDEX IF EXISTS idx_youtube_transcript_segments_keywords;

DROP INDEX IF EXISTS idx_youtube_embeddings_content_type;
DROP INDEX IF EXISTS idx_youtube_embeddings_content_id;
DROP INDEX IF EXISTS idx_youtube_embeddings_vector;

DROP INDEX IF EXISTS idx_youtube_search_cache_query_hash;
DROP INDEX IF EXISTS idx_youtube_search_cache_expires_at;
DROP INDEX IF EXISTS idx_youtube_web_cache_query_hash;
DROP INDEX IF EXISTS idx_youtube_web_cache_expires_at;

DROP INDEX IF EXISTS idx_youtube_search_analytics_created_at;
DROP INDEX IF EXISTS idx_youtube_search_analytics_query_type;
DROP INDEX IF EXISTS idx_youtube_search_analytics_session_id;

SELECT 'YouTube indexes cleaned up successfully!' as status; 