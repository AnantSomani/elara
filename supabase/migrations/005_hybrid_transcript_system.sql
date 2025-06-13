-- Migration: 005_hybrid_transcript_system.sql
-- Add columns to support YouTube + Deepgram hybrid transcription system

-- Add transcript source tracking to youtube_videos
ALTER TABLE youtube_videos 
ADD COLUMN IF NOT EXISTS transcript_source TEXT CHECK (transcript_source IN ('youtube', 'deepgram', 'cache')),
ADD COLUMN IF NOT EXISTS transcript_cost DECIMAL(10,6) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS transcript_processing_time INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS transcript_fetched_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing videos to have default values
UPDATE youtube_videos 
SET transcript_source = 'youtube', 
    transcript_cost = 0.0,
    transcript_processing_time = 0,
    transcript_fetched_at = NOW()
WHERE transcript_processed = true AND transcript_source IS NULL;

-- Create index for faster lookups by transcript source
CREATE INDEX IF NOT EXISTS idx_youtube_videos_transcript_source 
ON youtube_videos(transcript_source);

-- Create index for cost analysis queries
CREATE INDEX IF NOT EXISTS idx_youtube_videos_transcript_cost 
ON youtube_videos(transcript_cost) 
WHERE transcript_cost > 0;

-- Add metadata columns to youtube_video_embeddings for better tracking
ALTER TABLE youtube_video_embeddings 
ADD COLUMN IF NOT EXISTS transcript_source TEXT CHECK (transcript_source IN ('youtube', 'deepgram')),
ADD COLUMN IF NOT EXISTS segment_confidence DECIMAL(4,3),
ADD COLUMN IF NOT EXISTS word_count INTEGER;

-- Create function to calculate total transcript costs
CREATE OR REPLACE FUNCTION get_transcript_costs_summary()
RETURNS TABLE (
    total_videos INTEGER,
    youtube_captions INTEGER,
    deepgram_transcriptions INTEGER,
    total_cost DECIMAL(10,6),
    avg_cost_per_video DECIMAL(10,6),
    cost_savings_vs_assemblyai DECIMAL(10,6)
) 
LANGUAGE plpgsql
AS $$
DECLARE
    assemblyai_rate DECIMAL(10,6) := 1.38; -- $1.38 per hour
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_videos,
        COUNT(*) FILTER (WHERE transcript_source = 'youtube')::INTEGER as youtube_captions,
        COUNT(*) FILTER (WHERE transcript_source = 'deepgram')::INTEGER as deepgram_transcriptions,
        COALESCE(SUM(transcript_cost), 0) as total_cost,
        CASE 
            WHEN COUNT(*) > 0 THEN COALESCE(SUM(transcript_cost), 0) / COUNT(*)
            ELSE 0
        END as avg_cost_per_video,
        -- Calculate savings vs AssemblyAI (assuming 30min avg video length)
        CASE 
            WHEN COUNT(*) > 0 THEN (COUNT(*) * (assemblyai_rate * 0.5)) - COALESCE(SUM(transcript_cost), 0)
            ELSE 0
        END as cost_savings_vs_assemblyai
    FROM youtube_videos 
    WHERE transcript_processed = true;
END;
$$;

-- Create function to get processing efficiency metrics
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

-- Create table for tracking daily transcript usage and costs
CREATE TABLE IF NOT EXISTS daily_transcript_usage (
    date DATE PRIMARY KEY,
    youtube_captions_count INTEGER DEFAULT 0,
    deepgram_transcriptions_count INTEGER DEFAULT 0,
    total_cost DECIMAL(10,6) DEFAULT 0.0,
    total_processing_time INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create function to update daily usage stats
CREATE OR REPLACE FUNCTION update_daily_transcript_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO daily_transcript_usage (date, youtube_captions_count, deepgram_transcriptions_count, total_cost, total_processing_time)
    VALUES (
        CURRENT_DATE,
        CASE WHEN NEW.transcript_source = 'youtube' THEN 1 ELSE 0 END,
        CASE WHEN NEW.transcript_source = 'deepgram' THEN 1 ELSE 0 END,
        COALESCE(NEW.transcript_cost, 0),
        COALESCE(NEW.transcript_processing_time, 0)
    )
    ON CONFLICT (date) 
    DO UPDATE SET
        youtube_captions_count = daily_transcript_usage.youtube_captions_count + 
            CASE WHEN NEW.transcript_source = 'youtube' THEN 1 ELSE 0 END,
        deepgram_transcriptions_count = daily_transcript_usage.deepgram_transcriptions_count + 
            CASE WHEN NEW.transcript_source = 'deepgram' THEN 1 ELSE 0 END,
        total_cost = daily_transcript_usage.total_cost + COALESCE(NEW.transcript_cost, 0),
        total_processing_time = daily_transcript_usage.total_processing_time + COALESCE(NEW.transcript_processing_time, 0),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;

-- Create trigger to automatically update daily usage stats
DROP TRIGGER IF EXISTS trigger_update_daily_transcript_usage ON youtube_videos;
CREATE TRIGGER trigger_update_daily_transcript_usage
    AFTER INSERT OR UPDATE OF transcript_processed, transcript_source, transcript_cost
    ON youtube_videos
    FOR EACH ROW
    WHEN (NEW.transcript_processed = true)
    EXECUTE FUNCTION update_daily_transcript_usage();

-- Create indexes for better performance on daily usage queries
CREATE INDEX IF NOT EXISTS idx_daily_transcript_usage_date 
ON daily_transcript_usage(date DESC);

-- Create view for easy transcript analytics
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

-- Grant necessary permissions for the analytics
GRANT SELECT ON transcript_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_transcript_costs_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION get_transcript_processing_metrics() TO authenticated;

-- Add helpful comments
COMMENT ON COLUMN youtube_videos.transcript_source IS 'Source of transcript: youtube (free captions), deepgram (paid transcription), or cache (previously processed)';
COMMENT ON COLUMN youtube_videos.transcript_cost IS 'Cost in USD for transcript processing (0 for YouTube captions)';
COMMENT ON COLUMN youtube_videos.transcript_processing_time IS 'Processing time in milliseconds';
COMMENT ON TABLE daily_transcript_usage IS 'Daily aggregated statistics for transcript usage and costs';
COMMENT ON VIEW transcript_analytics IS 'Comprehensive view combining video metadata with transcript processing analytics'; 