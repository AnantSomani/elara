import os
import requests
from dotenv import load_dotenv
load_dotenv('.env.local')

# Test direct insertion into transcript_chunks table
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json'
}

# Test data - simple chunk without embedding first
test_chunk = {
    'video_id': 'test_debug_123',
    'video_url': 'https://www.youtube.com/watch?v=test_debug_123',
    'chunk_index': 0,
    'chunk_text': 'This is a test chunk for debugging',
    'total_chunks': 1,
    'word_count': 7
}

print("🧪 Testing direct chunk insertion...")

try:
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/transcript_chunks",
        json=test_chunk,
        headers=headers,
        timeout=30
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code in [200, 201]:
        print("✅ Direct chunk insertion works!")
        # Clean up
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/transcript_chunks?video_id=eq.test_debug_123",
            headers=headers
        )
        print("🧹 Cleaned up test data")
    else:
        print("❌ Direct chunk insertion failed")
        
except Exception as e:
    print(f"❌ Error: {e}") 