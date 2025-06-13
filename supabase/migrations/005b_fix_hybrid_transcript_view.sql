-- Migration: 005b_fix_hybrid_transcript_view.sql
-- Fix the transcript_analytics view to properly join with youtube_channels table

-- Drop and recreate the view with correct column references
DROP VIEW IF EXISTS transcript_analytics;

-- Create view for easy transcript analytics (corrected)
CREATE OR REPLACE VIEW transcript_analytics AS
SELECT 
    v.id as video_id,
    v.title,
    c.title as channel_title,
    v.duration_seconds as duration,
    v.transcript_source,
    v.transcript_cost,
    v.transcript_processing_time,
    v.transcript_fetched_at,
    COUNT(e.id) as embedding_chunks,
    SUM(e.word_count) as total_words,
    AVG(e.segment_confidence) as avg_confidence,
    CASE 
        WHEN v.transcript_source = 'youtube' THEN 'Free'
        WHEN v.transcript_cost > 0 THEN '$' || v.transcript_cost::TEXT
        ELSE 'Unknown'
    END as cost_display,
    -- Calculate cost efficiency (words per dollar)
    CASE 
        WHEN v.transcript_cost > 0 THEN (SUM(e.word_count) / v.transcript_cost)::INTEGER
        ELSE NULL
    END as words_per_dollar
FROM youtube_videos v
LEFT JOIN youtube_channels c ON v.channel_id = c.id
LEFT JOIN youtube_video_embeddings e ON v.id = e.video_id
WHERE v.transcript_processed = true
GROUP BY v.id, v.title, c.title, v.duration_seconds, v.transcript_source, 
         v.transcript_cost, v.transcript_processing_time, v.transcript_fetched_at;

-- Fix the processing metrics function to use correct column name
CREATE OR REPLACE FUNCTION get_transcript_processing_metrics()
RETURNS TABLE (
    avg_youtube_processing_time INTEGER,
    avg_deepgram_processing_time INTEGER,
    youtube_success_rate DECIMAL(5,2),
    total_processing_time_saved INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(AVG(transcript_processing_time) FILTER (WHERE transcript_source = 'youtube'), 0)::INTEGER as avg_youtube_processing_time,
        COALESCE(AVG(transcript_processing_time) FILTER (WHERE transcript_source = 'deepgram'), 0)::INTEGER as avg_deepgram_processing_time,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (COUNT(*) FILTER (WHERE transcript_source = 'youtube')::DECIMAL / COUNT(*) * 100)
            ELSE 0
        END as youtube_success_rate,
        -- Estimate time saved vs manual transcription (assume 4x real-time for manual)
        COALESCE(SUM(
            CASE 
                WHEN transcript_source = 'youtube' THEN duration_seconds * 4 - transcript_processing_time
                WHEN transcript_source = 'deepgram' THEN duration_seconds * 4 - transcript_processing_time
                ELSE 0
            END
        ), 0)::INTEGER as total_processing_time_saved
    FROM youtube_videos 
    WHERE transcript_processed = true;
END;
$$;

-- Grant necessary permissions for the analytics
GRANT SELECT ON transcript_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_transcript_processing_metrics() TO authenticated;

-- Add helpful comment
COMMENT ON VIEW transcript_analytics IS 'Comprehensive view combining video metadata with transcript processing analytics (corrected column references)'; 