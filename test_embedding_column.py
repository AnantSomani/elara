import os
import requests
from dotenv import load_dotenv
load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json'
}

print("🔍 Testing embedding column in youtube_transcript_chunks table...")

# Test 1: Try to insert a chunk with embedding
test_embedding = [0.1] * 1536  # Mock 1536-dimensional vector

test_chunk_with_embedding = {
    'video_id': 'test_embedding_456',
    'chunk_index': 0,
    'start_time': 0.0,
    'end_time': 800.0,
    'text': 'Test chunk with embedding',
    'word_count': 4,
    'metadata': {
        'total_chunks': 1,
        'video_url': 'https://www.youtube.com/watch?v=test_embedding_456',
        'has_embedding': True
    },
    'embedding': test_embedding
}

print("📤 Testing chunk insertion with embedding...")

try:
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks",
        json=test_chunk_with_embedding,
        headers=headers,
        timeout=30
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code in [200, 201]:
        print("✅ Embedding insertion works!")
        # Clean up
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks?video_id=eq.test_embedding_456",
            headers=headers
        )
        print("🧹 Cleaned up test data")
    else:
        print("❌ Embedding insertion failed")
        
        # Test 2: Try without embedding to see if basic insertion works
        test_chunk_no_embedding = {
            'video_id': 'test_no_embedding_789',
            'chunk_index': 0,
            'start_time': 0.0,
            'end_time': 800.0,
            'text': 'Test chunk without embedding',
            'word_count': 4,
            'metadata': {
                'total_chunks': 1,
                'video_url': 'https://www.youtube.com/watch?v=test_no_embedding_789',
                'has_embedding': False
            }
        }
        
        print("\n📤 Testing chunk insertion WITHOUT embedding...")
        response2 = requests.post(
            f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks",
            json=test_chunk_no_embedding,
            headers=headers,
            timeout=30
        )
        
        print(f"Status Code: {response2.status_code}")
        print(f"Response: {response2.text}")
        
        if response2.status_code in [200, 201]:
            print("✅ Basic insertion works, issue is with embedding column")
            # Clean up
            requests.delete(
                f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks?video_id=eq.test_no_embedding_789",
                headers=headers
            )
        
except Exception as e:
    print(f"❌ Error: {e}") 