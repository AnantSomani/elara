"""
Simplified FastAPI Application for YouTube Transcript MVP
Based on user's proposed cleaner architecture
"""

import os
import time
import logging
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional
import requests
import isodate

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import asyncpg

from .models_simplified import (
    TranscriptIn, TranscriptOut, VideoMetadataOut, VideoMetadataEnrich,
    SearchQuery, SearchResult, SearchResponse, SystemStats, HealthResponse,
    APIResponse, ErrorResponse, MetadataEnrichmentJob, BatchTranscriptInsert
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection pool
db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global db_pool
    
    # Initialize database connection pool
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        try:
            db_pool = await asyncpg.create_pool(database_url, min_size=1, max_size=10)
            logger.info("✅ Database connection pool created")
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            db_pool = None
    
    yield
    
    # Cleanup
    if db_pool:
        await db_pool.close()
        logger.info("🛑 Database connection pool closed")

# Initialize FastAPI app
app = FastAPI(
    title="YouTube Transcript Service - Simplified MVP",
    description="Clean, focused API for YouTube transcript storage and search",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Dependency to get database connection
async def get_db():
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database not available")
    async with db_pool.acquire() as connection:
        yield connection

# ==========================================
# Health and Status Endpoints
# ==========================================

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check(db: asyncpg.Connection = Depends(get_db)):
    """Health check with database connectivity and basic stats"""
    try:
        # Test database connection and get stats
        row = await db.fetchrow("SELECT get_transcripts_stats()")
        stats_data = row[0] if row else None
        
        stats = SystemStats(
            total_transcripts=stats_data.get('total_transcripts', 0) if stats_data else 0,
            complete_metadata=stats_data.get('complete_metadata', 0) if stats_data else 0,
            pending_metadata=stats_data.get('pending_metadata', 0) if stats_data else 0,
            placeholder_metadata=stats_data.get('placeholder_metadata', 0) if stats_data else 0
        ) if stats_data else None
        
        return HealthResponse(
            status="healthy",
            service="YouTube Transcript Service - MVP",
            version="2.0.0",
            environment=os.getenv("ENVIRONMENT", "development"),
            database_connected=True,
            stats=stats
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            service="YouTube Transcript Service - MVP",
            version="2.0.0",
            environment=os.getenv("ENVIRONMENT", "development"),
            database_connected=False
        )

# ==========================================
# Core Transcript Endpoints
# ==========================================

@app.post("/transcripts/", response_model=APIResponse, tags=["Transcripts"])
async def insert_transcript(
    data: TranscriptIn,
    background_tasks: BackgroundTasks,
    db: asyncpg.Connection = Depends(get_db)
):
    """Insert a transcript and create placeholder metadata"""
    try:
        # Insert transcript
        await db.execute("""
            INSERT INTO transcripts (video_id, transcript_text, summary)
            VALUES ($1, $2, $3)
            ON CONFLICT (video_id) DO UPDATE SET
                transcript_text = EXCLUDED.transcript_text,
                summary = EXCLUDED.summary,
                updated_at = NOW()
        """, data.video_id, data.transcript_text, data.summary)
        
        # Insert placeholder metadata
        await db.execute("""
            INSERT INTO videos_metadata (video_id, metadata_status)
            VALUES ($1, 'placeholder')
            ON CONFLICT (video_id) DO NOTHING
        """, data.video_id)
        
        # Schedule metadata enrichment in background
        background_tasks.add_task(enrich_metadata_background, data.video_id)
        
        return APIResponse(
            success=True,
            message="Transcript inserted successfully",
            data={"video_id": data.video_id}
        )
        
    except Exception as e:
        logger.error(f"Failed to insert transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to insert transcript: {str(e)}")

@app.get("/transcripts/{video_id}", response_model=TranscriptOut, tags=["Transcripts"])
async def get_transcript(video_id: str, db: asyncpg.Connection = Depends(get_db)):
    """Get a specific transcript by video ID"""
    try:
        row = await db.fetchrow("""
            SELECT video_id, transcript_text, summary, created_at, updated_at
            FROM transcripts
            WHERE video_id = $1
        """, video_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Transcript not found")
        
        return TranscriptOut(**dict(row))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get transcript: {str(e)}")

@app.post("/search", response_model=SearchResponse, tags=["Search"])
async def search_transcripts(
    query: SearchQuery,
    db: asyncpg.Connection = Depends(get_db)
):
    """Semantic search across transcripts using embeddings"""
    start_time = time.time()
    
    try:
        # For MVP, we'll implement basic text search first
        # TODO: Replace with actual embedding search
        rows = await db.fetch("""
            SELECT t.video_id, COALESCE(m.title, 'TBD') as title, t.transcript_text,
                   0.8 as similarity  -- Placeholder similarity score
            FROM transcripts t
            LEFT JOIN videos_metadata m ON t.video_id = m.video_id
            WHERE t.transcript_text ILIKE $1
            ORDER BY t.created_at DESC
            LIMIT $2
        """, f"%{query.query}%", query.match_count)
        
        results = [SearchResult(**dict(row)) for row in rows]
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return SearchResponse(
            query=query.query,
            results=results,
            total_found=len(results),
            processing_time_ms=processing_time_ms
        )
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ==========================================
# Metadata Endpoints
# ==========================================

@app.get("/metadata/{video_id}", response_model=VideoMetadataOut, tags=["Metadata"])
async def get_video_metadata(video_id: str, db: asyncpg.Connection = Depends(get_db)):
    """Get video metadata"""
    try:
        row = await db.fetchrow("""
            SELECT video_id, title, published_at, channel_id, channel_title,
                   duration_seconds, thumbnail_url, metadata_status, updated_at
            FROM videos_metadata
            WHERE video_id = $1
        """, video_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Metadata not found")
        
        return VideoMetadataOut(**dict(row))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get metadata: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get metadata: {str(e)}")

@app.get("/metadata-status", response_model=dict, tags=["Metadata"])
async def get_metadata_status(db: asyncpg.Connection = Depends(get_db)):
    """Get metadata status counts for monitoring"""
    try:
        rows = await db.fetch("""
            SELECT metadata_status, COUNT(*) as count
            FROM videos_metadata
            GROUP BY metadata_status
        """)
        
        return {row["metadata_status"]: row["count"] for row in rows}
        
    except Exception as e:
        logger.error(f"Failed to get metadata status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get metadata status: {str(e)}")

# ==========================================
# Background Tasks
# ==========================================

async def enrich_metadata_background(video_id: str):
    """Background task to enrich video metadata from YouTube API"""
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        logger.warning(f"No YouTube API key, skipping metadata enrichment for {video_id}")
        return
    
    try:
        # Update status to pending
        async with db_pool.acquire() as db:
            await db.execute("""
                UPDATE videos_metadata 
                SET metadata_status = 'pending', updated_at = NOW()
                WHERE video_id = $1
            """, video_id)
        
        # Call YouTube Data API
        url = f"https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "snippet,contentDetails",
            "id": video_id,
            "key": api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("items"):
            logger.warning(f"No YouTube data found for video {video_id}")
            return
        
        video = data["items"][0]
        snippet = video["snippet"]
        duration = video["contentDetails"]["duration"]
        
        # Parse ISO 8601 duration
        duration_seconds = int(isodate.parse_duration(duration).total_seconds())
        
        # Update metadata in database
        async with db_pool.acquire() as db:
            await db.execute("""
                UPDATE videos_metadata
                SET title = $1, published_at = $2, channel_id = $3, channel_title = $4,
                    duration_seconds = $5, thumbnail_url = $6, metadata_status = 'complete',
                    updated_at = NOW()
                WHERE video_id = $7
            """, 
                snippet["title"],
                snippet["publishedAt"],
                snippet["channelId"],
                snippet["channelTitle"],
                duration_seconds,
                snippet["thumbnails"]["default"]["url"],
                video_id
            )
        
        logger.info(f"✅ Enriched metadata for video {video_id}: {snippet['title']}")
        
    except Exception as e:
        logger.error(f"❌ Failed to enrich metadata for {video_id}: {e}")
        
        # Update status to failed
        try:
            async with db_pool.acquire() as db:
                await db.execute("""
                    UPDATE videos_metadata 
                    SET metadata_status = 'placeholder', updated_at = NOW()
                    WHERE video_id = $1
                """, video_id)
        except Exception as db_error:
            logger.error(f"Failed to update failed status: {db_error}")

# ==========================================
# Batch Operations
# ==========================================

@app.post("/transcripts/batch", response_model=APIResponse, tags=["Transcripts"])
async def batch_insert_transcripts(
    batch: BatchTranscriptInsert,
    background_tasks: BackgroundTasks,
    db: asyncpg.Connection = Depends(get_db)
):
    """Insert multiple transcripts at once"""
    try:
        inserted_count = 0
        
        for transcript in batch.transcripts:
            # Insert transcript
            await db.execute("""
                INSERT INTO transcripts (video_id, transcript_text, summary)
                VALUES ($1, $2, $3)
                ON CONFLICT (video_id) DO UPDATE SET
                    transcript_text = EXCLUDED.transcript_text,
                    summary = EXCLUDED.summary,
                    updated_at = NOW()
            """, transcript.video_id, transcript.transcript_text, transcript.summary)
            
            # Insert placeholder metadata
            await db.execute("""
                INSERT INTO videos_metadata (video_id, metadata_status)
                VALUES ($1, 'placeholder')
                ON CONFLICT (video_id) DO NOTHING
            """, transcript.video_id)
            
            # Schedule metadata enrichment
            if batch.enrich_metadata:
                background_tasks.add_task(enrich_metadata_background, transcript.video_id)
            
            inserted_count += 1
        
        return APIResponse(
            success=True,
            message=f"Batch inserted {inserted_count} transcripts",
            data={"inserted_count": inserted_count}
        )
        
    except Exception as e:
        logger.error(f"Batch insert failed: {e}")
        raise HTTPException(status_code=500, detail=f"Batch insert failed: {str(e)}")

# ==========================================
# Root endpoint
# ==========================================

@app.get("/", tags=["Root"])
async def root():
    """API root endpoint"""
    return {
        "service": "YouTube Transcript Service - Simplified MVP",
        "version": "2.0.0",
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