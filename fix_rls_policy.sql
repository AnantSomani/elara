-- Fix RLS policy for transcript_embeddings table
-- The current policy is too restrictive, let's make it more permissive for the API

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow all operations on transcript_embeddings" ON transcript_embeddings;

-- Create a more permissive policy that works with the service role
CREATE POLICY "Enable all operations for transcript_embeddings" 
ON transcript_embeddings FOR ALL 
USING (true) 
WITH CHECK (true);

-- Alternative: If you want to disable RLS entirely for this table (simpler approach)
-- ALTER TABLE transcript_embeddings DISABLE ROW LEVEL SECURITY; 