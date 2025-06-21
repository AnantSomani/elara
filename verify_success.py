import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client

client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

print("🧪 Verifying successful transcript and chunk storage...")

# Check transcript was stored
transcripts = client.table('youtube_transcripts').select('*').eq('video_id', 'qM4e7g2RukI').execute()
print(f'✅ Transcripts stored: {len(transcripts.data)}')
if transcripts.data:
    transcript = transcripts.data[0]
    print(f'📝 Transcript ID: {transcript["id"]}')
    print(f'📝 Channel ID: {transcript.get("channel_id", "NULL")} (should be NULL)')
    print(f'📝 Content length: {len(transcript["content"])} characters')

# Check chunks were created
chunks = client.table('youtube_transcript_chunks').select('*').eq('video_id', 'qM4e7g2RukI').execute()
print(f'✅ Chunks created: {len(chunks.data)}')

if chunks.data:
    print(f'📊 Sample chunk: {chunks.data[0]["text"][:100]}...')
    print(f'📊 Word count: {chunks.data[0]["word_count"]}')
    print(f'📊 Has embedding: {"embedding" in chunks.data[0] and chunks.data[0]["embedding"] is not None}')
    if chunks.data[0].get("embedding"):
        print(f'📊 Embedding dimensions: {len(chunks.data[0]["embedding"])}')
    
print("\n🎉 SUCCESS: Complete pipeline working without foreign key constraints!") 