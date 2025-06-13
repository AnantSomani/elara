#!/usr/bin/env python3

import os
import requests
import uuid
from youtube_transcript_api import YouTubeTranscriptApi
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv('../.env.local')

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def create_video_record(video_id: str, title: str = "Test Video", channel_id: str = "UC_test_channel"):
    """Create a video record in youtube_videos table"""
    
    video_payload = {
        "id": video_id,
        "channel_id": channel_id,
        "title": title,
        "description": "Test video for transcript processing",
        "duration_seconds": 3600,
        "published_at": "2025-06-13T00:00:00+00:00",  # Required field
        "language": "en",
        "category": "Technology",
        "has_captions": True,
        "has_auto_captions": True,
        "is_live": False,
        "is_private": False,
        "transcript_status": "pending"
    }
    
    try:
        # Use upsert to handle existing records
        upsert_headers = SUPABASE_HEADERS.copy()
        upsert_headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
        
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/youtube_videos",
            json=video_payload,
            headers=upsert_headers,
            timeout=30
        )
        
        print(f"🔍 Video creation response: {response.status_code}")
        print(f"📄 Response body: {response.text[:200]}...")
        
        if response.status_code in [200, 201]:
            print(f"✅ Video record created: {video_id}")
            return True
        elif response.status_code == 409:
            print(f"ℹ️ Video record already exists: {video_id}")
            return True
        elif "duplicate key" in response.text.lower() or "already exists" in response.text.lower():
            print(f"ℹ️ Video record already exists (duplicate): {video_id}")
            return True
        else:
            print(f"❌ Video creation failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error creating video record: {e}")
        return False

def create_transcript_record(video_id: str, transcript_data: list, channel_id: str = "UC_test_channel"):
    """Create transcript record in youtube_transcripts table"""
    
    # Calculate metrics
    total_content = " ".join([segment.get('text', '') for segment in transcript_data])
    total_duration = sum([segment.get('duration', 0) for segment in transcript_data])
    segment_count = len(transcript_data)
    
    # Prepare payload matching your schema
    payload = {
        "id": str(uuid.uuid4()),
        "video_id": video_id,
        "channel_id": channel_id,
        "content": total_content,
        "segment_count": segment_count,
        "total_duration": total_duration,
        "language": "en",
        "format": "json",
        "source": "auto",  # Match existing schema constraint
        "confidence_score": 0.95,
        "processing_time_ms": None,
        "api_version": "3.0.0"
    }
    
    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts",
            json=payload,
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ Transcript stored: {result[0]['id'] if isinstance(result, list) else payload['id']}")
            return result[0] if isinstance(result, list) else payload
        else:
            print(f"❌ Transcript storage failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error storing transcript: {e}")
        return None

def test_complete_workflow():
    """Test the complete workflow: Video -> Transcript -> Storage"""
    
    print("🧪 Testing Complete YouTube → Supabase Workflow")
    print("=" * 60)
    
    # Step 1: Fetch real YouTube transcript
    video_id = "ZPUtA3W-7_I"  # Our known working video
    
    print(f"🎥 Step 1: Fetching transcript for video {video_id}...")
    try:
        transcript_data = YouTubeTranscriptApi.get_transcript(video_id)
        print(f"✅ Retrieved {len(transcript_data)} segments")
        print(f"   Duration: {sum(seg.get('duration', 0) for seg in transcript_data):.1f} seconds")
        print(f"   First segment: {transcript_data[0]['text'][:50]}...")
    except Exception as e:
        print(f"❌ YouTube fetch failed: {e}")
        return False
    
    # Step 2: Create video record
    print(f"\n📝 Step 2: Creating video record...")
    if not create_video_record(video_id, "PM Modi Interview - Test Video", "UC_test_channel_123"):
        return False
    
    # Step 2.5: Verify video record exists
    print(f"🔍 Step 2.5: Verifying video record exists...")
    try:
        verify_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_videos?id=eq.{video_id}&select=id,title",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        if verify_response.status_code == 200:
            videos = verify_response.json()
            if videos:
                print(f"✅ Video verified: {videos[0]['title']}")
            else:
                print(f"❌ Video {video_id} not found after creation!")
                return False
        else:
            print(f"❌ Video verification failed: {verify_response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Video verification error: {e}")
        return False
    
    # Step 3: Store transcript
    print(f"\n💾 Step 3: Storing transcript...")
    result = create_transcript_record(video_id, transcript_data, "UC_test_channel_123")
    if not result:
        return False
    
    # Step 4: Verify storage
    print(f"\n🔍 Step 4: Verifying storage...")
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?video_id=eq.{video_id}&select=*",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        
        if response.status_code == 200:
            results = response.json()
            if results:
                stored = results[0]
                print(f"✅ Verification successful!")
                print(f"   Record ID: {stored['id']}")
                print(f"   Content length: {len(stored['content'])} characters")
                print(f"   Segments: {stored['segment_count']}")
                print(f"   Duration: {stored['total_duration']:.1f} seconds")
                return True
            else:
                print("❌ No records found after storage")
                return False
        else:
            print(f"❌ Verification failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Verification error: {e}")
        return False

if __name__ == "__main__":
    success = test_complete_workflow()
    if success:
        print("\n🎉 Complete workflow test PASSED!")
        print("✅ Your YouTube → Supabase integration is working perfectly!")
    else:
        print("\n❌ Workflow test FAILED!")
        print("🔧 Check the errors above for debugging information.") 