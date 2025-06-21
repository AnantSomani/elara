-- Remove foreign key constraint from youtube_transcript_chunks table
-- This allows us to store chunks without requiring video records in youtube_videos table

ALTER TABLE youtube_transcript_chunks DROP CONSTRAINT youtube_transcript_chunks_video_id_fkey; 