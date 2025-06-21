import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client

client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

print("🧪 Testing if channel_id can be NULL...")

# Test inserting transcript WITHOUT channel_id
try:
    result = client.table('youtube_transcripts').insert({
        'video_id': 'test_null_channel_456',
        # Intentionally omitting channel_id to test if it can be NULL
        'content': 'Test transcript without channel_id',
        'segment_count': 1,
        'total_duration': 10.0,
        'language': 'en',
        'format': 'json',
        'source': 'auto',
        'confidence_score': 0.95
    }).execute()
    
    print('✅ SUCCESS: channel_id is now optional!')
    print(f'Inserted transcript ID: {result.data[0]["id"]}')
    print(f'channel_id value: {result.data[0].get("channel_id", "NULL")}')
    
    # Clean up test data
    client.table('youtube_transcripts').delete().eq('video_id', 'test_null_channel_456').execute()
    print('🧹 Test data cleaned up')
    
except Exception as e:
    print(f'❌ FAILED: {str(e)}')
    if 'null value in column "channel_id"' in str(e).lower():
        print("⚠️  channel_id still has NOT NULL constraint - migration needed")
    else:
        print("⚠️  Unexpected error occurred") 