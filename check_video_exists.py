import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv('.env.local')

# Get environment variables (using the same names as main app)
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

print(f"🔗 Using Supabase URL: {SUPABASE_URL}")

# Prepare headers
headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json'
}

# Check if video exists in youtube_videos table
print("🔍 Checking if video qM4e7g2RukI exists in youtube_videos table...")
response = requests.get(
    f"{SUPABASE_URL}/rest/v1/youtube_videos?id=eq.qM4e7g2RukI&select=*",
    headers=headers,
    timeout=10
)

print(f"📤 Response status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print(f'✅ Videos found: {len(data)}')
    if data:
        print(f'📊 Video data: {data[0]}')
    else:
        print('❌ No video found in youtube_videos table - this is the foreign key constraint problem!')
        print("💡 We need to either:")
        print("   1. Create the video record first, OR")
        print("   2. Remove the foreign key constraint from youtube_transcript_chunks")
else:
    print(f"❌ Error checking video: {response.status_code} - {response.text}") 