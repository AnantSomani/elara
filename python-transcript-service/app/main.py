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
    LanguagesResponse
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
    yield
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


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """
    Root endpoint with service information
    """
    return {
        "message": "YouTube Transcript Service",
        "version": os.getenv("SERVICE_VERSION", "1.0.0"),
        "docs": "/docs",
        "health": "/health"
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