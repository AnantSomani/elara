"""
Main FastAPI Application for YouTube Transcript Service
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import uvicorn

from .models import (
    TranscriptRequest,
    TranscriptResponse,
    HealthResponse,
    ErrorResponse,
    LanguagesResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
    ProcessTranscriptRequest,
    ProcessTranscriptResponse,
    VideoMetadata,
    DatabaseStatsResponse
)
from .services.transcript_service import (
    TranscriptService,
    TranscriptServiceError,
    VideoUnavailableError,
    TranscriptDisabledError,
    NoTranscriptFoundError,
    LanguageNotFoundError,
    RateLimitError
)
from .utils.youtube_utils import extract_video_id, validate_youtube_url
from .database import db_manager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("🚀 YouTube Transcript Service starting up...")
    
    # Initialize database
    db_initialized = await db_manager.initialize()
    if db_initialized:
        logger.info("✅ Database connections established")
    else:
        logger.warning("⚠️ Database initialization failed - running without database features")
    
    yield
    
    # Cleanup database connections
    await db_manager.close()
    logger.info("🛑 YouTube Transcript Service shutting down...")


# Initialize FastAPI app
app = FastAPI(
    title="YouTube Transcript Service",
    description="A FastAPI microservice for fetching YouTube video transcripts",
    version=os.getenv("SERVICE_VERSION", "1.0.0"),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
cors_origins = os.getenv("CORS_ORIGINS", "").split(",")
if cors_origins and cors_origins[0]:  # Only add CORS if origins are specified
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in cors_origins],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )
    logger.info(f"✅ CORS enabled for origins: {cors_origins}")


# Custom exception handlers
@app.exception_handler(TranscriptServiceError)
async def transcript_service_exception_handler(request: Request, exc: TranscriptServiceError):
    """Handle TranscriptService specific errors"""
    error_response = ErrorResponse(
        error=exc.message,
        status_code=exc.status_code,
        path=str(request.url.path),
        details={"video_id": exc.video_id} if exc.video_id else None
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump(mode='json')
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler"""
    error_response = ErrorResponse(
        error=exc.detail,
        status_code=exc.status_code,
        path=str(request.url.path)
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump(mode='json')
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler for unhandled exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    error_response = ErrorResponse(
        error="Internal server error",
        status_code=500,
        path=str(request.url.path)
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response.model_dump(mode='json')
    )


# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    start_time = request.state.start_time = __import__('time').time()
    
    # Log request
    logger.info(f"📥 {request.method} {request.url.path} - Client: {request.client.host if request.client else 'unknown'}")
    
    # Process request
    response = await call_next(request)
    
    # Log response
    process_time = __import__('time').time() - start_time
    logger.info(f"📤 {request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
    
    return response


# Health check endpoint
@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint to verify service status
    """
    return HealthResponse(
        status="healthy",
        service=os.getenv("SERVICE_NAME", "YouTube Transcript Service"),
        version=os.getenv("SERVICE_VERSION", "1.0.0"),
        environment=os.getenv("ENVIRONMENT", "development")
    )


# Service info endpoint
@app.get("/info", tags=["Info"])
async def service_info():
    """
    Get service information and capabilities
    """
    return {
        "service": os.getenv("SERVICE_NAME", "YouTube Transcript Service"),
        "version": os.getenv("SERVICE_VERSION", "1.0.0"),
        "environment": os.getenv("ENVIRONMENT", "development"),
        "features": [
            "YouTube transcript fetching",
            "Multi-language support",
            "Error handling",
            "Rate limiting",
            "Health monitoring"
        ],
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "transcript_fetch": "/transcript/fetch",
            "transcript_languages": "/transcript/languages/{video_id}"
        }
    }


# Transcript endpoints
@app.post("/transcript/fetch", response_model=TranscriptResponse, tags=["Transcript"])
async def fetch_transcript(request: TranscriptRequest):
    """
    Fetch transcript for a YouTube video
    
    - **video_url**: YouTube video URL or video ID
    - **language**: Language code for transcript (optional, defaults to 'en')
    - **format**: Response format (json, text, srt, vtt)
    """
    try:
        logger.info(f"🎯 Fetching transcript for: {request.video_url}")
        
        # Extract and validate video ID
        video_id = extract_video_id(request.video_url)
        if not video_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid YouTube URL or video ID"
            )
        
        # Initialize transcript service
        transcript_service = TranscriptService()
        
        # Fetch transcript
        result = await transcript_service.fetch_transcript(
            video_id=video_id,
            language=request.language,
            format_type=request.format
        )
        
        logger.info(f"✅ Successfully fetched transcript for video: {video_id}")
        return result
        
    except TranscriptServiceError:
        # TranscriptService errors are handled by the custom exception handler
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error fetching transcript: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch transcript: {str(e)}"
        )


@app.get("/transcript/languages/{video_id}", response_model=LanguagesResponse, tags=["Transcript"])
async def get_available_languages(video_id: str):
    """
    Get available transcript languages for a YouTube video
    
    - **video_id**: YouTube video ID
    """
    try:
        logger.info(f"🌍 Getting available languages for: {video_id}")
        
        # Extract and validate video ID (in case full URL is passed)
        clean_video_id = extract_video_id(video_id)
        if not clean_video_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid YouTube video ID"
            )
        
        # Initialize transcript service
        transcript_service = TranscriptService()
        
        # Get available languages
        languages = await transcript_service.get_available_languages(clean_video_id)
        
        logger.info(f"✅ Found {len(languages)} languages for video: {clean_video_id}")
        
        return LanguagesResponse(
            video_id=clean_video_id,
            available_languages=languages
        )
        
    except TranscriptServiceError:
        # TranscriptService errors are handled by the custom exception handler
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error getting languages: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get available languages: {str(e)}"
        )


# Database-enabled endpoints

@app.post("/transcript/process", response_model=ProcessTranscriptResponse, tags=["Database"])
async def process_and_store_transcript(request: ProcessTranscriptRequest):
    """
    Process a YouTube transcript and store it in the database with embeddings
    
    - **video_url**: YouTube video URL or video ID
    - **language**: Language code for transcript
    - **generate_embeddings**: Whether to generate AI embeddings
    - **save_to_database**: Whether to save to database
    """
    import time
    start_time = time.time()
    
    try:
        logger.info(f"🔄 Processing transcript for storage: {request.video_url}")
        
        # Extract video ID
        video_id = extract_video_id(request.video_url)
        if not video_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid YouTube URL or video ID"
            )
        
        # Fetch transcript first
        transcript_service = TranscriptService()
        transcript_result = await transcript_service.fetch_transcript(
            video_id=video_id,
            language=request.language,
            format_type="json"
        )
        
        segments_saved = 0
        embeddings_generated = 0
        transcript_id = None
        
        if request.save_to_database and db_manager.pg_pool:
            # Mock channel data (in real implementation, you'd fetch from YouTube API)
            channel_data = {
                'id': f'channel_{video_id}',  # Placeholder
                'name': 'Unknown Channel',
                'description': '',
                'subscriber_count': 0,
                'video_count': 0,
                'view_count': 0
            }
            
            # Mock video data
            video_data = {
                'id': video_id,
                'channel_id': channel_data['id'],
                'title': f'Video {video_id}',  # Placeholder
                'description': '',
                # published_at will be auto-generated in save_video_metadata if not provided
                'duration_seconds': int(transcript_result.total_duration or 0),
                'view_count': 0,
                'like_count': 0,
                'comment_count': 0,
                'has_captions': True,
                'transcript_status': 'completed',
                'tags': [],
                'category': ''
            }
            
            # Save to database
            logger.info(f"🔧 DEBUG: video_data being sent: {video_data}")
            await db_manager.get_or_create_channel(channel_data)
            await db_manager.save_video_metadata(video_data)
            
            # Save transcript
            transcript_data = {
                'language': request.language,
                'content': ' '.join([seg.text for seg in transcript_result.transcript]),
                'segment_count': len(transcript_result.transcript),
                'total_duration': transcript_result.total_duration
            }
            
            transcript_id = await db_manager.save_transcript(
                video_id, channel_data['id'], transcript_data
            )
            
            # Save segments
            segments_data = [
                {
                    'text': seg.text,
                    'start': seg.start,
                    'end': seg.end,
                    'duration': seg.duration,
                    'keywords': []
                }
                for seg in transcript_result.transcript
            ]
            
            await db_manager.save_transcript_segments(video_id, segments_data)
            segments_saved = len(segments_data)
            
            # Generate embeddings if requested
            if request.generate_embeddings and db_manager.openai_client:
                # Generate embeddings for full transcript
                full_text = transcript_data['content']
                if full_text:
                    embeddings = await db_manager.generate_embeddings(full_text)
                    await db_manager.save_embeddings(
                        transcript_id, 'transcript_full', full_text, embeddings
                    )
                    embeddings_generated += 1
                
                # Generate embeddings for segments (in chunks to avoid rate limits)
                for i, segment in enumerate(segments_data[:10]):  # Limit to first 10 for demo
                    if segment['text']:
                        embeddings = await db_manager.generate_embeddings(segment['text'])
                        await db_manager.save_embeddings(
                            f"{video_id}_seg_{i}", 'transcript_chunk', 
                            segment['text'], embeddings, {'segment_index': i}
                        )
                        embeddings_generated += 1
        
        processing_time = (time.time() - start_time) * 1000
        
        logger.info(f"✅ Processed transcript: {segments_saved} segments, {embeddings_generated} embeddings")
        
        return ProcessTranscriptResponse(
            success=True,
            video_id=video_id,
            transcript_id=transcript_id,
            segments_saved=segments_saved,
            embeddings_generated=embeddings_generated,
            processing_time_ms=processing_time,
            metadata={
                'language': request.language,
                'total_duration': transcript_result.total_duration,
                'segment_count': len(transcript_result.transcript)
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing transcript: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process transcript: {str(e)}"
        )


@app.post("/search", response_model=SearchResponse, tags=["Database"])
async def search_transcripts(request: SearchRequest):
    """
    Search YouTube transcripts using 4-dimensional RAG
    
    - **query**: Search query text
    - **limit**: Maximum number of results (1-50)
    - **strategy**: Search strategy (auto, fts, vector, hybrid, metadata)
    - **filters**: Additional filters
    """
    import time
    start_time = time.time()
    
    try:
        logger.info(f"🔍 Searching transcripts: '{request.query}' (strategy: {request.strategy})")
        
        if not db_manager.pg_pool:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database not available"
            )
        
        # Perform search
        results = await db_manager.search_transcripts(request.query, request.limit)
        
        # Convert to response format
        search_results = []
        for result in results:
            search_results.append(SearchResult(
                id=result.get('id', ''),
                content_type=result.get('content_type', ''),
                content=result.get('content', ''),
                relevance_score=float(result.get('relevance_score', 0)),
                video_id=result.get('video_id', ''),
                channel_id=result.get('channel_id', ''),
                video_title=result.get('video_title', ''),
                channel_name=result.get('channel_name', ''),
                start_time=result.get('start_time'),
                metadata=result.get('metadata', {}),
                search_strategy=result.get('search_strategy', 'auto')
            ))
        
        execution_time = (time.time() - start_time) * 1000
        
        logger.info(f"✅ Search completed: {len(search_results)} results in {execution_time:.1f}ms")
        
        return SearchResponse(
            success=True,
            query=request.query,
            results=search_results,
            total_results=len(search_results),
            search_strategy=request.strategy,
            execution_time_ms=execution_time
        )
        
    except Exception as e:
        logger.error(f"❌ Search error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@app.get("/database/stats", response_model=DatabaseStatsResponse, tags=["Database"])
async def get_database_stats():
    """
    Get database statistics and health information
    """
    try:
        if not db_manager.pg_pool:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database not available"
            )
        
        async with db_manager.pg_pool.acquire() as conn:
            # Get basic counts
            video_count = await conn.fetchval("SELECT COUNT(*) FROM youtube_videos")
            transcript_count = await conn.fetchval("SELECT COUNT(*) FROM youtube_transcripts")
            segment_count = await conn.fetchval("SELECT COUNT(*) FROM youtube_transcript_segments")
            embedding_count = await conn.fetchval("SELECT COUNT(*) FROM youtube_embeddings")
            channel_count = await conn.fetchval("SELECT COUNT(*) FROM youtube_channels")
            
            # Get cache stats
            cache_stats = await conn.fetch("SELECT * FROM get_youtube_cache_stats()")
            cache_data = {row['cache_type']: dict(row) for row in cache_stats}
        
        return DatabaseStatsResponse(
            total_videos=video_count or 0,
            total_transcripts=transcript_count or 0,
            total_segments=segment_count or 0,
            total_embeddings=embedding_count or 0,
            total_channels=channel_count or 0,
            cache_stats=cache_data
        )
        
    except Exception as e:
        logger.error(f"❌ Database stats error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get database stats: {str(e)}"
        )


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """
    Root endpoint with service information
    """
    return {
        "message": "YouTube Transcript Service with 4D RAG",
        "version": os.getenv("SERVICE_VERSION", "1.0.0"),
        "docs": "/docs",
        "health": "/health",
        "features": [
            "YouTube transcript fetching",
            "4-dimensional RAG search",
            "Vector embeddings",
            "Full-text search",
            "Hybrid search",
            "Metadata search"
        ],
        "database_endpoints": {
            "process": "/transcript/process",
            "search": "/search",
            "stats": "/database/stats"
        }
    }


# Run the application
if __name__ == "__main__":
    port = int(os.getenv("PORT", 3001))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"🚀 Starting server on {host}:{port}")
    
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=os.getenv("ENVIRONMENT") == "development",
        log_level=os.getenv("LOG_LEVEL", "info").lower()
    ) 