"""
Simplified FastAPI Application for YouTube Transcript MVP
Based on user's proposed cleaner architecture
"""

import os
import time
import logging
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
import requests
import isodate
from datetime import datetime, timezone
import uuid

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi

# We'll define models inline instead of importing from models_simplified

# Load environment variables
load_dotenv()
load_dotenv('../.env.local')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# ==========================================
# Data Models
# ==========================================

class YouTubeURLRequest(BaseModel):
    youtube_url: str = Field(..., description="YouTube video URL")
    
class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    limit: int = Field(10, description="Maximum number of results", ge=1, le=50)

class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    count: Optional[int] = None

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

# ==========================================
# Utility Functions
# ==========================================

def extract_video_id(youtube_url: str) -> str:
    """Extract video ID from YouTube URL"""
    import re
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'youtube\.com\/v\/([^&\n?#]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, youtube_url)
        if match:
            return match.group(1)
    
    raise ValueError(f"Could not extract video ID from URL: {youtube_url}")

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
    """Split text into overlapping chunks"""
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:])
            break
        
        # Find a good break point (sentence ending)
        while end > start + chunk_size // 2 and text[end] not in '.!?':
            end -= 1
        
        chunks.append(text[start:end])
        start = end - overlap
    
    return chunks

# ==========================================
# Core Endpoints
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("🚀 YouTube Transcript Service starting up...")
    
    # Test Supabase connection
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?select=id&limit=1",
            headers=SUPABASE_HEADERS,
            timeout=5
        )
        if response.status_code == 200:
            logger.info("✅ Supabase connection successful")
    except Exception as e:
        logger.error(f"❌ Supabase connection failed: {e}")
    
    yield
    
    logger.info("🔒 YouTube Transcript Service shutting down...")

# Initialize FastAPI app
app = FastAPI(
    title="YouTube Transcript Service", 
    version="1.0.0",
    description="Fetch and store YouTube transcripts with Supabase integration",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Health Check
# ==========================================

@app.get("/health", response_model=APIResponse, tags=["Health"])
async def health_check():
    """Health check endpoint"""
    try:
        # Test Supabase connection
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?select=id&limit=1",
            headers=SUPABASE_HEADERS,
            timeout=5
        )
        
        if response.status_code == 200:
            return APIResponse(
                success=True,
                message="Service healthy",
                data={
                    "status": "healthy",
                    "database_connected": True,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
        else:
            return APIResponse(
                success=False,
                message="Service unhealthy",
                data={"status": "unhealthy", "database_connected": False}
            )
    except Exception as e:
        return APIResponse(
            success=False,
            message=f"Health check failed: {str(e)}",
            data={"status": "unhealthy", "database_connected": False}
        )

# ==========================================
# YouTube Transcript Endpoints
# ==========================================

@app.post("/transcripts/from-youtube/", response_model=APIResponse, tags=["Transcripts"])
async def fetch_and_store_youtube_transcript(
    request: YouTubeURLRequest,
    background_tasks: BackgroundTasks
):
    """Fetch transcript from YouTube and store in Supabase"""
    try:
        # Extract video ID
        video_id = extract_video_id(request.youtube_url)
        
        # Check if transcript already exists
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?video_id=eq.{video_id}&select=id",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        if response.status_code == 200 and response.json():
            return APIResponse(
                success=True,
                message=f"Transcript already exists for video {video_id}",
                data={"transcript_id": video_id, "action": "skipped"}
            )
        
        # Fetch transcript from YouTube
        logger.info(f"Fetching transcript for video: {video_id}")
        if language := request.youtube_url.split('&')[0].split('=')[-1]:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=[language])
        else:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        
        # Combine transcript text
        full_text = " ".join([entry['text'] for entry in transcript_list])
        
        if not full_text.strip():
            raise HTTPException(status_code=404, detail="No transcript found for this video")
        
        # Store transcript in Supabase
        stored_transcript = store_transcript_supabase(video_id, transcript_list)
        
        if stored_transcript:
            logger.info(f"✅ Transcript stored successfully for video {video_id}")
            
            # Create chunks for better search (background task)
            background_tasks.add_task(create_transcript_chunks, video_id, full_text)
            
            return APIResponse(
                success=True,
                message="Transcript fetched and stored successfully",
                data=stored_transcript
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to store transcript")
            
    except Exception as e:
        logger.error(f"❌ Error processing YouTube video {request.youtube_url}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process video: {str(e)}")

async def create_transcript_chunks(video_id: str, transcript_text: str):
    """Background task to create searchable chunks"""
    try:
        chunks = chunk_text(transcript_text, chunk_size=800, overlap=100)
        
        chunk_data = []
        for i, chunk in enumerate(chunks):
            chunk_data.append({
                'transcript_id': video_id,
                'chunk_index': i,
                'content': chunk,
                'word_count': len(chunk.split())
            })
        
        # Insert chunks if table exists
        try:
            response = requests.post(
                f"{SUPABASE_URL}/rest/v1/transcript_chunks",
                json=chunk_data,
                headers=SUPABASE_HEADERS,
                timeout=30
            )
            if response.status_code == 200:
                logger.info(f"✅ Created {len(chunks)} chunks for video {video_id}")
            else:
                logger.warning(f"⚠️ Could not create chunks (table may not exist): {response.status_code} - {response.text}")
        except Exception as chunk_error:
            logger.warning(f"⚠️ Could not create chunks: {chunk_error}")
            
    except Exception as e:
        logger.error(f"❌ Error creating chunks for {video_id}: {e}")

# ==========================================
# Search Endpoints  
# ==========================================

@app.post("/search", response_model=APIResponse, tags=["Search"])
async def search_transcripts(request: SearchRequest):
    """Search through stored transcripts"""
    try:
        # Simple text search in Supabase
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?select=*&transcript_text=ilike.{request.query}&limit={request.limit}",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        
        results = []
        for item in response.json():
            # Calculate simple relevance score based on query occurrence
            content = item['transcript_text']
            query_lower = request.query.lower()
            content_lower = content.lower()
            
            # Count occurrences
            occurrences = content_lower.count(query_lower)
            relevance_score = min(occurrences / 10.0, 1.0)  # Normalize to 0-1
            
            # Extract excerpt around first match
            first_match = content_lower.find(query_lower)
            if first_match >= 0:
                start = max(0, first_match - 100)
                end = min(len(content), first_match + 200)
                excerpt = content[start:end]
                if start > 0:
                    excerpt = "..." + excerpt
                if end < len(content):
                    excerpt = excerpt + "..."
            else:
                excerpt = content[:200] + "..." if len(content) > 200 else content
            
            results.append({
                "transcript_id": item['transcript_id'],
                "video_id": item['video_id'],
                "youtube_url": item['youtube_url'],
                "content": excerpt,
                "relevance_score": round(relevance_score, 2)
            })
        
        # Sort by relevance
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        
        return APIResponse(
            success=True,
            message=f"Found {len(results)} matching transcripts",
            data=results,
            count=len(results)
        )
        
    except Exception as e:
        logger.error(f"❌ Search error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ==========================================
# Transcript Management Endpoints
# ==========================================

@app.get("/transcripts/{transcript_id}", response_model=APIResponse, tags=["Transcripts"])
async def get_transcript(transcript_id: str):
    """Get a specific transcript by ID"""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?transcript_id=eq.{transcript_id}&select=*",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        
        if not response.json():
            raise HTTPException(status_code=404, detail="Transcript not found")
        
        transcript = response.json()[0]
        return APIResponse(
            success=True,
            message="Transcript retrieved successfully",
            data=transcript
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error retrieving transcript {transcript_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transcript: {str(e)}")

@app.get("/transcripts", response_model=APIResponse, tags=["Transcripts"])
async def list_transcripts(limit: int = Query(10, ge=1, le=100)):
    """List all stored transcripts"""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/youtube_transcripts?select=*&limit={limit}",
            headers=SUPABASE_HEADERS,
            timeout=10
        )
        
        return APIResponse(
            success=True,
            message=f"Retrieved {len(response.json())} transcripts",
            data=response.json(),
            count=len(response.json())
        )
    except Exception as e:
        logger.error(f"❌ Error listing transcripts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list transcripts: {str(e)}")

# ==========================================
# Root endpoint
# ==========================================

@app.get("/", tags=["Root"])
async def root():
    """API root endpoint"""
    return {
        "service": "YouTube Transcript Service - Simplified MVP",
        "version": "1.0.0",
        "description": "Clean, focused API for transcript storage and search",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "transcripts": "/transcripts/",
            "search": "/search",
            "metadata": "/metadata/{video_id}",
            "status": "/metadata-status"
        }
    }

def store_transcript_supabase(video_id: str, transcript_data: List[Dict], channel_id: str = "unknown") -> Dict[str, Any]:
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
        "source": "youtube-transcript-api",
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 