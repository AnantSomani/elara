#!/usr/bin/env python3

from app.main_clean import get_transcript_from_supabase, store_transcript_supabase
from youtube_transcript_api import YouTubeTranscriptApi
import requests

def test_functionality():
    print("🧪 Testing Core Functionality")
    print("=" * 50)
    
    # Test 1: Check if we can fetch from YouTube
    print('🎥 Testing YouTube transcript fetch...')
    try:
        transcript = YouTubeTranscriptApi.get_transcript('ZPUtA3W-7_I')
        print(f'✅ YouTube API works: {len(transcript)} segments')
        print(f'   First segment: {transcript[0]["text"][:50]}...')
    except Exception as e:
        print(f'❌ YouTube API error: {e}')
        return False

    # Test 2: Check Supabase connectivity 
    print('\n🔍 Testing Supabase connectivity...')
    try:
        existing = get_transcript_from_supabase('ZPUtA3W-7_I')
        if existing:
            print(f'✅ Found existing transcript in Supabase: {existing["id"]}')
        else:
            print('ℹ️ No existing transcript found')
    except Exception as e:
        print(f'❌ Supabase error: {e}')
        return False

    # Test 3: Try storing a new transcript
    print('\n💾 Testing transcript storage...')
    try:
        # Use a test video ID that won't conflict
        test_video_id = f"test_video_{hash('test') % 10000}"
        test_transcript = [
            {"text": "This is a test transcript", "start": 0.0, "duration": 2.0},
            {"text": "for our FastAPI service", "start": 2.0, "duration": 2.0}
        ]
        
        result = store_transcript_supabase(test_video_id, test_transcript, "test_channel")
        print(f'✅ Storage test successful: {result["id"]}')
        
    except Exception as e:
        print(f'❌ Storage error: {e}')
        return False

    print('\n🎉 All tests passed!')
    return True

if __name__ == "__main__":
    test_functionality() 