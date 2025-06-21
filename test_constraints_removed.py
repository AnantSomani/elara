import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client

client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

print("🧪 Testing if both foreign key constraints were removed...")

# Test inserting transcript with non-existent video_id and channel_id
try:
    result = client.table('youtube_transcripts').insert({
        'video_id': 'test_no_constraints_789',
        'channel_id': 'test_nonexistent_channel_789',
        'content': 'Test after both FK removals',
        'segment_count': 1,
        'total_duration': 10.0,
        'language': 'en',
        'format': 'json',
        'source': 'auto',
        'confidence_score': 0.95
    }).execute()
    
    print('✅ SUCCESS: Both foreign key constraints removed!')
    print(f'Inserted transcript ID: {result.data[0]["id"]}')
    
    # Clean up test data
    client.table('youtube_transcripts').delete().eq('video_id', 'test_no_constraints_789').execute()
    print('🧹 Test data cleaned up')
    
except Exception as e:
    print(f'❌ FAILED: {str(e)}')
    print("⚠️  One or both foreign key constraints still exist") 