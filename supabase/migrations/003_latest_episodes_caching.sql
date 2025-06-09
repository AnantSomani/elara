-- Migration for latest episodes caching system
-- Only the 3 latest episodes of each podcast will have AI chat enabled

-- Add columns to track AI chat eligibility and caching status
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_ai_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS last_cached_at TIMESTAMPTZ;

-- Add column to track when podcast was last accessed (for caching trigger)
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS episodes_cached_count INTEGER DEFAULT 0;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_episodes_pub_date_desc ON episodes(podcast_id, pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_ai_enabled ON episodes(is_ai_enabled);
CREATE INDEX IF NOT EXISTS idx_episodes_transcription_status ON episodes(transcription_status);
CREATE INDEX IF NOT EXISTS idx_podcasts_last_accessed ON podcasts(last_accessed_at);

-- Function to update AI-enabled status for the 3 latest episodes of a podcast
CREATE OR REPLACE FUNCTION update_latest_episodes_ai_status(target_podcast_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    -- First, disable AI for all episodes of this podcast
    UPDATE episodes 
    SET is_ai_enabled = FALSE 
    WHERE podcast_id = target_podcast_id;
    
    -- Then enable AI for the 3 latest episodes
    UPDATE episodes 
    SET 
        is_ai_enabled = TRUE,
        transcription_status = CASE 
            WHEN transcription_status = 'completed' THEN 'completed'
            ELSE 'queued'
        END
    WHERE id IN (
        SELECT id 
        FROM episodes 
        WHERE podcast_id = target_podcast_id 
        ORDER BY pub_date DESC 
        LIMIT 3
    );
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Update podcast's last accessed time and cached count
    UPDATE podcasts 
    SET 
        last_accessed_at = NOW(),
        episodes_cached_count = (
            SELECT COUNT(*) 
            FROM episodes 
            WHERE podcast_id = target_podcast_id 
            AND is_ai_enabled = TRUE
        )
    WHERE id = target_podcast_id;
    
    RETURN updated_count;
END;
$$;

-- Function to get episodes with AI chat availability info
CREATE OR REPLACE FUNCTION get_podcast_episodes_with_ai_status(target_podcast_id UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    audio_url TEXT,
    duration INTEGER,
    pub_date TIMESTAMPTZ,
    is_ai_enabled BOOLEAN,
    transcription_status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.title,
        e.description,
        e.audio_url,
        e.duration,
        e.pub_date,
        e.is_ai_enabled,
        e.transcription_status,
        e.created_at
    FROM episodes e
    WHERE e.podcast_id = target_podcast_id
    ORDER BY e.pub_date DESC;
END;
$$;

-- Create trigger to automatically update AI status when new episodes are added
CREATE OR REPLACE FUNCTION trigger_update_ai_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update AI status for the podcast when a new episode is added
    PERFORM update_latest_episodes_ai_status(NEW.podcast_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER after_episode_insert
    AFTER INSERT ON episodes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_ai_status();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_latest_episodes_ai_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_podcast_episodes_with_ai_status(UUID) TO authenticated; 