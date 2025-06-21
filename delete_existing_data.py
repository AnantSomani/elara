import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client

client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

print("🗑️ Cleaning up existing data for video qM4e7g2RukI...")

# Delete existing chunks for the video
result = client.table('transcript_chunks').delete().eq('video_id', 'qM4e7g2RukI').execute()
print(f'🗑️ Deleted {len(result.data)} existing chunks')

# Also delete the transcript so we can reprocess it
result2 = client.table('youtube_transcripts').delete().eq('video_id', 'qM4e7g2RukI').execute()
print(f'🗑️ Deleted {len(result2.data)} existing transcripts')

print('✅ Ready to reprocess with embedding fix') 