import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client

client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

print("🗑️ Deleting existing data for video qM4e7g2RukI...")

# Delete existing chunks for the video
chunks_result = client.table('youtube_transcript_chunks').delete().eq('video_id', 'qM4e7g2RukI').execute()
print(f'🗑️ Deleted {len(chunks_result.data)} existing chunks')

# Delete the transcript so we can reprocess it
transcript_result = client.table('youtube_transcripts').delete().eq('video_id', 'qM4e7g2RukI').execute()
print(f'🗑️ Deleted {len(transcript_result.data)} existing transcripts')

print('✅ Ready to reprocess with embedding fix!') 