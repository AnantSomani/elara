-- Create transcript_embeddings table for storing podcast transcript segments with vector embeddings
CREATE TABLE IF NOT EXISTS transcript_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  segment_text TEXT NOT NULL,
  segment_start REAL NOT NULL, -- start time in seconds
  segment_end REAL NOT NULL,   -- end time in seconds
  embedding VECTOR(1536),      -- OpenAI text-embedding-3-small produces 1536-dimensional vectors
  confidence REAL DEFAULT 0.0,
  speaker TEXT,                -- speaker label from AssemblyAI
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_episode_id 
ON transcript_embeddings(episode_id);

CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_segment_start 
ON transcript_embeddings(segment_start);

-- Create vector similarity search index (for semantic search)
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_embedding 
ON transcript_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Enable RLS (Row Level Security) to match your existing setup
ALTER TABLE transcript_embeddings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy to allow all operations (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on transcript_embeddings" 
ON transcript_embeddings FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Grant necessary permissions
GRANT ALL ON transcript_embeddings TO authenticated;
GRANT ALL ON transcript_embeddings TO anon; 