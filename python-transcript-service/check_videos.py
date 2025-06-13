#!/usr/bin/env python3

import requests
import os
from dotenv import load_dotenv

load_dotenv()
load_dotenv('../.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

# Check what videos exist
print("📹 Checking videos in database...")
response = requests.get(f'{SUPABASE_URL}/rest/v1/youtube_videos?select=id,title&limit=10', headers=headers)
if response.status_code == 200:
    videos = response.json()
    print(f'Found {len(videos)} videos:')
    for video in videos:
        print(f'  - {video["id"]}: {video["title"]}')
        
    # Check specifically for our test video
    test_response = requests.get(f'{SUPABASE_URL}/rest/v1/youtube_videos?id=eq.ZPUtA3W-7_I&select=*', headers=headers)
    if test_response.status_code == 200:
        test_videos = test_response.json()
        if test_videos:
            print(f'\n✅ ZPUtA3W-7_I exists: {test_videos[0]["title"]}')
        else:
            print(f'\n❌ ZPUtA3W-7_I NOT found in database')
    else:
        print(f'\n❌ Error checking ZPUtA3W-7_I: {test_response.status_code}')
else:
    print(f'❌ Error: {response.status_code} - {response.text}') 