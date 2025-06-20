"""
Simplified FastAPI Application for YouTube Transcript MVP
Based on user's proposed cleaner architecture
"""

import os
import time
import logging
import asyncio
import json
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
import requests
import isodate
from datetime import datetime, timezone
import uuid

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from openai import OpenAI
from supabase import create_client, Client
import psycopg2
from urllib.parse import urlparse

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

# OpenAI configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("Missing OpenAI API key. Please check your environment variables.")

# Initialize OpenAI client
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Initialize Supabase client for proper vector handling
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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

def get_postgres_connection():
    """Get direct PostgreSQL connection for vector operations"""
    # Parse Supabase URL to get connection details
    supabase_url = SUPABASE_URL.replace('https://', '')
    
    # Supabase connection details
    # Format: https://PROJECT_ID.supabase.co
    project_id = supabase_url.split('.')[0]
    
    # Get password from environment
    db_password = os.getenv('SUPABASE_DB_PASSWORD')
    if not db_password:
        logger.error("❌ SUPABASE_DB_PASSWORD not found in environment variables")
        raise ValueError("Missing SUPABASE_DB_PASSWORD")
    
    conn_params = {
        'host': f'db.{project_id}.supabase.co',
        'port': '5432',
        'database': 'postgres',
        'user': 'postgres',
        'password': db_password,
    }
    
    logger.info(f"🔗 Connecting to PostgreSQL: {conn_params['host']}")
    return psycopg2.connect(**conn_params)

def insert_chunk_with_vector(chunk_data):
    """Insert chunk with proper vector using direct PostgreSQL connection"""
    try:
        print("🚀 USING POSTGRESQL DIRECT INSERT - NOT SUPABASE!")
        logger.info(f"🔄 Attempting direct PostgreSQL insertion for chunk {chunk_data.get('chunk_index', 'unknown')}")
        
        # Add extensive debugging
        logger.info(f"📊 Environment check:")
        logger.info(f"    SUPABASE_URL: {bool(os.getenv('NEXT_PUBLIC_SUPABASE_URL'))}")
        logger.info(f"    DB_PASSWORD: {bool(os.getenv('SUPABASE_DB_PASSWORD'))}")
        
        conn = get_postgres_connection()
        cursor = conn.cursor()
        
        # Debug the embedding data
        embedding = chunk_data['embedding']
        logger.info(f"📊 Embedding type: {type(embedding)}, length: {len(embedding)}")
        logger.info(f"📊 Chunk data keys: {list(chunk_data.keys())}")
        
        # Test connection first
        cursor.execute("SELECT 1")
        test_result = cursor.fetchone()
        logger.info(f"📊 Connection test result: {test_result}")
        
        # Insert with proper vector casting
        logger.info("📤 Executing INSERT statement...")
        cursor.execute("""
            INSERT INTO youtube_transcript_chunks 
            (video_id, chunk_index, start_time, end_time, text, word_count, metadata, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector(1536))
        """, (
            chunk_data['video_id'],
            chunk_data['chunk_index'],
            chunk_data['start_time'],
            chunk_data['end_time'],
            chunk_data['text'],
            chunk_data['word_count'],
            json.dumps(chunk_data['metadata']) if 'metadata' in chunk_data else '{}',
            embedding  # Pass as list, PostgreSQL will convert
        ))
        
        conn.commit()
        logger.info("📤 INSERT committed successfully")
        
        # Verify the insertion worked (simpler verification without array_length)
        cursor.execute("""
            SELECT chunk_id, pg_typeof(embedding)
            FROM youtube_transcript_chunks 
            WHERE video_id = %s AND chunk_index = %s
        """, (chunk_data['video_id'], chunk_data['chunk_index']))
        
        result = cursor.fetchone()
        if result:
            chunk_id, embedding_type = result
            logger.info(f"✅ Verification: chunk_id={chunk_id}, type={embedding_type}")
        else:
            logger.warning("⚠️ Could not verify insertion - no record found")
        
        cursor.close()
        conn.close()
        logger.info(f"✅ Direct PostgreSQL insertion successful for chunk {chunk_data.get('chunk_index', 'unknown')}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Direct PostgreSQL insertion failed for chunk {chunk_data.get('chunk_index', 'unknown')}: {e}")
        logger.error(f"Error type: {type(e)}")
        logger.error(f"Error details: {str(e)}")
        # Don't return False - raise the exception so we can see what's wrong
        raise e

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
    allow_origins=["http://localhost:3000", "http://localhost:8080", "http://localhost:8081"],
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
        try:
            # Try to get transcript with default language preference
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        except Exception:
            # If English not available, try auto-generated or any available language
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        
        # Combine transcript text
        full_text = " ".join([entry['text'] for entry in transcript_list])
        
        if not full_text.strip():
            raise HTTPException(status_code=404, detail="No transcript found for this video")
        
        # Store transcript in Supabase with simplified approach
        try:
            stored_transcript = store_transcript_supabase(video_id, transcript_list)
            logger.info(f"✅ Transcript stored successfully for video {video_id}")
        except Exception as storage_error:
            logger.warning(f"⚠️ Could not store in database: {storage_error}")
            stored_transcript = {
                "video_id": video_id,
                "content": full_text,
                "segment_count": len(transcript_list),
                "total_duration": sum([segment.get('duration', 0) for segment in transcript_list])
            }
        
        # Create chunks for better search (background task) - this will also create embeddings
        background_tasks.add_task(create_transcript_chunks, video_id, full_text)
        
        return APIResponse(
            success=True,
            message=f"Transcript fetched successfully! Processing {len(transcript_list)} segments into chunks with embeddings.",
            data=stored_transcript
        )
            
    except Exception as e:
        logger.error(f"❌ Error processing YouTube video {request.youtube_url}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process video: {str(e)}")

async def create_transcript_chunks(video_id: str, transcript_text: str):
    """Background task to create searchable chunks and embeddings"""
    try:
        chunks = chunk_text(transcript_text, chunk_size=800, overlap=100)
        logger.info(f"🔄 Creating {len(chunks)} chunks and embeddings for video {video_id}")
        
        chunk_data = []
        for i, chunk in enumerate(chunks):
            try:
                # Create embedding for this chunk
                embedding_response = openai_client.embeddings.create(
                    model="text-embedding-3-small",
                    input=chunk
                )
                embedding = embedding_response.data[0].embedding
                
                # Keep embedding as array - Supabase REST API handles the VECTOR type conversion
                chunk_data.append({
                    'video_id': video_id,
                    'chunk_index': i,
                    'start_time': float(i * 800),  # Ensure DECIMAL format compatibility
                    'end_time': float((i + 1) * 800),  # Ensure DECIMAL format compatibility
                    'text': chunk,
                    'word_count': len(chunk.split()),
                    'metadata': {
                        'total_chunks': len(chunks),
                        'chunk_size': 800,
                        'overlap': 100,
                        'video_url': f'https://www.youtube.com/watch?v={video_id}',
                        'has_embedding': True
                    },
                    'embedding': embedding
                })
                logger.info(f"✅ Created embedding for chunk {i+1}/{len(chunks)}")
                
            except Exception as embedding_error:
                logger.error(f"❌ Error creating embedding for chunk {i}: {embedding_error}")
                # Store chunk without embedding
                chunk_data.append({
                    'video_id': video_id,
                    'chunk_index': i,
                    'start_time': float(i * 800),  # Ensure DECIMAL format compatibility
                    'end_time': float((i + 1) * 800),  # Ensure DECIMAL format compatibility
                    'text': chunk,
                    'word_count': len(chunk.split()),
                    'metadata': {
                        'total_chunks': len(chunks),
                        'chunk_size': 800,
                        'overlap': 100,
                        'video_url': f'https://www.youtube.com/watch?v={video_id}',
                        'has_embedding': False
                    }
                })
        
        # Insert chunks with embeddings using raw SQL for proper vector handling
        try:
            logger.info(f"📤 Attempting to store {len(chunk_data)} chunks for video {video_id}")
            logger.info(f"📊 Sample chunk keys: {list(chunk_data[0].keys()) if chunk_data else 'No chunks'}")
            
            # FORCE PostgreSQL usage - NO FALLBACK to Supabase client
            chunks_with_embeddings = 0
            chunks_without_embeddings = 0
            
            for chunk in chunk_data:
                if 'embedding' in chunk and chunk['embedding'] is not None:
                    # ONLY use direct PostgreSQL insertion for vectors - no fallback
                    logger.info(f"🔄 Processing chunk {chunk['chunk_index']} with embedding...")
                    insert_chunk_with_vector(chunk)  # This will raise exception if it fails
                    chunks_with_embeddings += 1
                    logger.info(f"✅ Chunk {chunk['chunk_index']} inserted successfully with PostgreSQL")
                else:
                    # For chunks without embeddings, we can still use Supabase (no vector involved)
                    chunk_without_embedding = {k: v for k, v in chunk.items() if k != 'embedding'}
                    supabase.table('youtube_transcript_chunks').insert(chunk_without_embedding).execute()
                    chunks_without_embeddings += 1
                    logger.info(f"✅ Chunk {chunk['chunk_index']} inserted without embedding")
            
            logger.info(f"🎉 Successfully stored {len(chunk_data)} chunks for video {video_id}")
            logger.info(f"📊 Chunks with embeddings: {chunks_with_embeddings}")
            logger.info(f"📊 Chunks without embeddings: {chunks_without_embeddings}")
                
        except Exception as chunk_error:
            logger.error(f"❌ Exception storing chunks: {chunk_error}")
            logger.error(f"❌ Error type: {type(chunk_error)}")
            logger.error(f"❌ Error details: {str(chunk_error)}")
            raise chunk_error  # Re-raise so we can see the actual problem
            
    except Exception as e:
        logger.error(f"❌ Error creating chunks and embeddings for {video_id}: {e}")

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

def store_transcript_supabase(video_id: str, transcript_data: List[Dict]) -> Dict[str, Any]:
    """Store transcript in Supabase - simplified version without metadata dependencies"""
    
    # Calculate metrics from transcript data
    total_content = " ".join([segment.get('text', '') for segment in transcript_data])
    total_duration = sum([segment.get('duration', 0) for segment in transcript_data])
    segment_count = len(transcript_data)
    
    try:
        # Prepare simplified transcript payload - no channel_id required
        payload = {
            "video_id": video_id,
            "content": total_content[:50000] if len(total_content) > 50000 else total_content,
            "segment_count": segment_count,
            "total_duration": round(float(total_duration), 2),
            "language": "en",
            "format": "json",
            "source": "auto",
            "confidence_score": 0.95
        }
        
        # Insert directly into youtube_transcripts table
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
            logger.error(f"❌ Supabase error: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to store in Supabase: {response.status_code} - {response.text[:200]}"
            )
            
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Network error storing transcript: {e}")
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