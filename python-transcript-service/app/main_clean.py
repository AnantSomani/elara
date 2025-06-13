from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import os
import requests
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv('../.env.local')

app = FastAPI(title="YouTube Transcript Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase configuration
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase configuration. Please check your environment variables.")

# Headers for Supabase REST API
SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# Pydantic models matching your actual Supabase schema
class TranscriptSegment(BaseModel):
    text: str
    start: float
    duration: float

class TranscriptResponse(BaseModel):
    id: str
    video_id: str
    channel_id: str
    content: str
    segment_count: int
    total_duration: float
    language: str
    format: str
    source: str
    confidence_score: float
    processing_time_ms: Optional[int] = None
    api_version: Optional[str] = None
    created_at: str
    updated_at: str

class TranscriptRequest(BaseModel):
    video_id: str
    language: Optional[str] = None

def create_video_record_if_needed(video_id: str, channel_id: str = "UC_test_channel_123") -> bool:
    """Create video record if it doesn't exist"""
    
    # Check if video already exists
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_videos?id=eq.{video_id}&select=id",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        if response.status_code == 200 and response.json():
            return True  # Already exists
    except:
        pass
    
    # Create video record
    video_payload = {
        "id": video_id,
        "channel_id": channel_id,
        "title": f"YouTube Video {video_id}",
        "description": "Auto-created for transcript processing",
        "duration_seconds": 0,
        "published_at": "2025-06-13T00:00:00+00:00",
        "language": "en",
        "category": "Technology",
        "has_captions": True,
        "has_auto_captions": True,
        "is_live": False,
        "is_private": False,
        "transcript_status": "processing"
    }
    
    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/youtube_videos",
            json=video_payload,
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        return response.status_code in [200, 201]
    except:
        return False

def store_transcript_supabase(video_id: str, transcript_data: List[Dict], channel_id: str = "UC_test_channel_123") -> Dict[str, Any]:
    """Store transcript in Supabase using direct REST API calls"""
    
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
        "language": "en",  # Default, could be detected
        "format": "json",
        "source": "auto",  # Match existing schema constraint
        "confidence_score": 0.95,  # Default confidence
        "processing_time_ms": None,
        "api_version": "3.0.0"
    }
    
    try:
        # Insert into youtube_transcripts table
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts",
            json=payload,
            headers=SUPABASE_HEADERS,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            if isinstance(result, list) and len(result) > 0:
                return result[0]
            return payload
        else:
            print(f"❌ Supabase error: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to store in Supabase: {response.status_code} - {response.text[:200]}"
            )
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error storing transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")

def get_transcript_from_supabase(video_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve transcript from Supabase using REST API"""
    
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?video_id=eq.{video_id}&select=*",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        
        if response.status_code == 200:
            results = response.json()
            if results and len(results) > 0:
                return results[0]  # Return the first match
            
        return None
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error retrieving transcript: {e}")
        return None

@app.get("/")
async def root():
    return {
        "message": "YouTube Transcript Service", 
        "version": "1.0.0",
        "supabase_connected": bool(SUPABASE_URL and SUPABASE_KEY),
        "endpoints": [
            "GET /transcript/{video_id}",
            "POST /transcript",
            "GET /health"
        ]
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    
    # Test Supabase connection
    supabase_status = "disconnected"
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?select=id&limit=1",
            headers=SUPABASE_HEADERS,
            timeout=5
        )
        if response.status_code == 200:
            supabase_status = "connected"
    except:
        pass
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "supabase": supabase_status,
        "youtube_api": "available"
    }

@app.get("/transcript/{video_id}")
async def get_transcript(video_id: str, language: str = None):
    """Get transcript for a YouTube video"""
    
    try:
        print(f"🎥 Processing video: {video_id}")
        
        # First, check if we already have this transcript in Supabase
        existing_transcript = get_transcript_from_supabase(video_id)
        if existing_transcript:
            print(f"✅ Found existing transcript in Supabase")
            return {
                "video_id": video_id,
                "source": "supabase_cache",
                "transcript": existing_transcript
            }
        
        # Fetch transcript from YouTube
        print(f"🔍 Fetching transcript from YouTube...")
        
        if language:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=[language])
        else:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        
        print(f"✅ Retrieved {len(transcript_list)} transcript segments")
        
        # Ensure video record exists
        print(f"📝 Ensuring video record exists...")
        if not create_video_record_if_needed(video_id):
            raise HTTPException(status_code=500, detail="Failed to create video record")
        
        # Store in Supabase
        print(f"💾 Storing transcript in Supabase...")
        stored_transcript = store_transcript_supabase(video_id, transcript_list)
        
        return {
            "video_id": video_id,
            "source": "youtube_fresh",
            "transcript": stored_transcript,
            "segment_count": len(transcript_list),
            "total_characters": len(stored_transcript.get("content", ""))
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error processing video {video_id}: {error_msg}")
        
        # Provide helpful error messages
        if "Could not retrieve" in error_msg:
            raise HTTPException(
                status_code=404, 
                detail=f"No transcript available for video {video_id}. The video may not have captions enabled."
            )
        elif "disabled" in error_msg.lower():
            raise HTTPException(
                status_code=403,
                detail=f"Transcript is disabled for video {video_id}"
            )
        else:
            raise HTTPException(status_code=500, detail=f"Failed to process transcript: {error_msg}")

@app.post("/transcript")
async def create_transcript(request: TranscriptRequest):
    """Create/fetch transcript for a video"""
    return await get_transcript(request.video_id, request.language)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 