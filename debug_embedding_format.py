import os
import requests
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()
load_dotenv('.env.local')

# Get environment variables
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

# Prepare headers
headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json'
}

print("🔍 Debugging embedding format in database...")

# Get chunk for our specific test video to examine the embedding
response = requests.get(
    f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks?select=chunk_id,video_id,text,embedding&video_id=eq.qM4e7g2RukI&limit=1",
    headers=headers,
    timeout=10
)

if response.status_code == 200:
    data = response.json()
    if data:
        chunk = data[0]
        embedding = chunk.get('embedding')
        
        print(f"📊 Chunk ID: {chunk['chunk_id']}")
        print(f"📊 Video ID: {chunk['video_id']}")
        print(f"📊 Text preview: {chunk['text'][:50]}...")
        
        if embedding:
            print(f"📊 Embedding type: {type(embedding)}")
            print(f"📊 Embedding length: {len(embedding) if hasattr(embedding, '__len__') else 'No length'}")
            
            if isinstance(embedding, list):
                print("🚨 PROBLEM: Embedding stored as JSON list (not VECTOR type)")
                print(f"📊 First 5 values: {embedding[:5]}")
                print(f"📊 All values are numbers: {all(isinstance(x, (int, float)) for x in embedding[:10])}")
            elif isinstance(embedding, str):
                print("🚨 PROBLEM: Embedding stored as string")
                print(f"📊 String preview: {embedding[:100]}...")
            else:
                print(f"🚨 UNKNOWN: Embedding stored as {type(embedding)}")
        else:
            print("❌ No embedding found in chunk")
    else:
        print("❌ No chunks found")
else:
    print(f"❌ Error fetching chunk: {response.status_code} - {response.text}") 