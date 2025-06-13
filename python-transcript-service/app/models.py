"""
Pydantic models for YouTube Transcript Service API

These models define the structure and validation for API requests and responses.
"""

from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import ConfigDict
from pydantic import BaseModel, Field, validator, HttpUrl
import re


class TranscriptSegment(BaseModel):
    """
    Individual transcript segment with text, timing, and metadata
    """
    text: str = Field(..., description="The transcript text for this segment")
    start: float = Field(..., description="Start time in seconds")
    duration: float = Field(..., description="Duration of the segment in seconds")
    end: Optional[float] = Field(None, description="End time in seconds (calculated)")
    
    def __init__(self, **data):
        super().__init__(**data)
        # Calculate end time if not provided
        if self.end is None:
            self.end = self.start + self.duration


class LanguageInfo(BaseModel):
    """
    Information about available transcript languages
    """
    code: str = Field(..., description="Language code (e.g., 'en', 'es', 'fr')")
    name: str = Field(..., description="Human-readable language name")
    auto_generated: bool = Field(..., description="Whether this is auto-generated captions")


class TranscriptRequest(BaseModel):
    """
    Request model for fetching YouTube transcripts
    """
    video_url: str = Field(
        ..., 
        description="YouTube video URL or video ID",
        example="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    )
    language: str = Field(
        default="en",
        description="Language code for the transcript (ISO 639-1)",
        example="en"
    )
    format: Literal["json", "text", "srt", "vtt"] = Field(
        default="json",
        description="Output format for the transcript"
    )
    
    @validator('video_url')
    def validate_video_url(cls, v):
        """Validate that the video_url is a valid YouTube URL or video ID"""
        if not v:
            raise ValueError("video_url cannot be empty")
        
        # Check if it's a video ID (11 characters, alphanumeric and some symbols)
        video_id_pattern = r'^[a-zA-Z0-9_-]{11}$'
        if re.match(video_id_pattern, v):
            return v
        
        # Check if it's a valid YouTube URL
        youtube_patterns = [
            r'(?:youtube\.com/watch\?v=)([a-zA-Z0-9_-]{11})',
            r'(?:youtu\.be/)([a-zA-Z0-9_-]{11})',
            r'(?:youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
            r'(?:m\.youtube\.com/watch\?v=)([a-zA-Z0-9_-]{11})'
        ]
        
        for pattern in youtube_patterns:
            if re.search(pattern, v):
                return v
        
        raise ValueError("Invalid YouTube URL or video ID format")
    
    @validator('language')
    def validate_language(cls, v):
        """Validate language code format"""
        if not re.match(r'^[a-z]{2}(-[A-Z]{2})?$', v):
            # Allow common language codes
            if v.lower() in ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi']:
                return v.lower()
            raise ValueError("Language code must be in ISO 639-1 format (e.g., 'en', 'es', 'fr')")
        return v.lower()


class TranscriptResponse(BaseModel):
    """
    Response model for transcript data
    """
    success: bool = Field(..., description="Whether the request was successful")
    video_id: str = Field(..., description="YouTube video ID")
    language: str = Field(..., description="Language of the transcript")
    format: str = Field(..., description="Format of the transcript data")
    transcript: List[TranscriptSegment] = Field(..., description="List of transcript segments")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    total_duration: Optional[float] = Field(None, description="Total duration of the video in seconds")
    segment_count: int = Field(..., description="Number of transcript segments")
    processing_time_ms: Optional[float] = Field(None, description="Processing time in milliseconds")
    
    def __init__(self, **data):
        super().__init__(**data)
        # Calculate segment count if not provided
        if 'segment_count' not in data:
            self.segment_count = len(self.transcript)
        
        # Calculate total duration if not provided
        if self.total_duration is None and self.transcript:
            last_segment = max(self.transcript, key=lambda x: x.start + x.duration)
            self.total_duration = last_segment.start + last_segment.duration


class HealthResponse(BaseModel):
    """
    Response model for health check endpoint
    """
    status: Literal["healthy", "unhealthy", "degraded"] = Field(..., description="Service health status")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")
    environment: str = Field(..., description="Environment (development, production, etc.)")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Health check timestamp")
    uptime_seconds: Optional[float] = Field(None, description="Service uptime in seconds")
    
    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        },
        json_schema_extra={
            "example": {
                "status": "healthy",
                "service": "YouTube Transcript Service", 
                "version": "1.0.0",
                "environment": "development",
                "timestamp": "2024-01-15T10:30:00Z",
                "uptime_seconds": 3600.0
            }
        }
    )


class ErrorResponse(BaseModel):
    """
    Response model for error cases
    """
    error: str = Field(..., description="Error message")
    status_code: int = Field(..., description="HTTP status code")
    path: str = Field(..., description="Request path that caused the error")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    
    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        },
        json_schema_extra={
            "example": {
                "error": "Invalid YouTube URL or video ID",
                "status_code": 400,
                "path": "/transcript/fetch",
                "timestamp": "2024-01-15T10:30:00Z",
                "details": {
                    "provided_url": "invalid-url",
                    "expected_format": "https://youtube.com/watch?v=VIDEO_ID"
                }
            }
        }
    )


class LanguagesResponse(BaseModel):
    """
    Response model for available languages endpoint
    """
    video_id: str = Field(..., description="YouTube video ID")
    available_languages: List[LanguageInfo] = Field(..., description="List of available languages")
    count: int = Field(..., description="Number of available languages")
    
    def __init__(self, **data):
        super().__init__(**data)
        # Auto-calculate count if not provided
        if 'count' not in data:
            self.count = len(self.available_languages)


# Additional utility models

class TranscriptStats(BaseModel):
    """
    Statistics about a transcript
    """
    total_words: int = Field(..., description="Total number of words")
    total_characters: int = Field(..., description="Total number of characters")
    average_words_per_segment: float = Field(..., description="Average words per segment")
    reading_time_minutes: float = Field(..., description="Estimated reading time in minutes")


# Database-related models

class SearchRequest(BaseModel):
    """
    Request model for searching YouTube transcripts
    """
    query: str = Field(..., description="Search query", example="machine learning tutorial")
    limit: int = Field(default=10, ge=1, le=50, description="Maximum number of results")
    strategy: Literal["auto", "fts", "vector", "hybrid", "metadata"] = Field(
        default="auto", 
        description="Search strategy to use"
    )
    filters: Optional[Dict[str, Any]] = Field(
        default=None, 
        description="Additional filters (channel_ids, duration, etc.)"
    )


class SearchResult(BaseModel):
    """
    Individual search result
    """
    id: str = Field(..., description="Result ID")
    content_type: str = Field(..., description="Type of content (segment, transcript, video)")
    content: str = Field(..., description="Content text")
    relevance_score: float = Field(..., description="Relevance score (0-1)")
    video_id: str = Field(..., description="YouTube video ID")
    channel_id: str = Field(..., description="YouTube channel ID")
    video_title: str = Field(..., description="Video title")
    channel_name: str = Field(..., description="Channel name")
    start_time: Optional[float] = Field(None, description="Start time for segments")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    search_strategy: str = Field(..., description="Search strategy used")


class SearchResponse(BaseModel):
    """
    Response model for search results
    """
    success: bool = Field(..., description="Whether the search was successful")
    query: str = Field(..., description="Original search query")
    results: List[SearchResult] = Field(..., description="Search results")
    total_results: int = Field(..., description="Total number of results")
    search_strategy: str = Field(..., description="Search strategy used")
    execution_time_ms: float = Field(..., description="Search execution time in milliseconds")
    
    def __init__(self, **data):
        super().__init__(**data)
        if 'total_results' not in data:
            self.total_results = len(self.results)


class ProcessTranscriptRequest(BaseModel):
    """
    Request to process and store a transcript with embeddings
    """
    video_url: str = Field(..., description="YouTube video URL or ID")
    language: str = Field(default="en", description="Transcript language")
    generate_embeddings: bool = Field(default=True, description="Whether to generate embeddings")
    save_to_database: bool = Field(default=True, description="Whether to save to database")


class ProcessTranscriptResponse(BaseModel):
    """
    Response for transcript processing
    """
    success: bool = Field(..., description="Whether processing was successful")
    video_id: str = Field(..., description="YouTube video ID")
    transcript_id: Optional[str] = Field(None, description="Database transcript ID")
    segments_saved: int = Field(..., description="Number of segments saved")
    embeddings_generated: int = Field(..., description="Number of embeddings generated")
    processing_time_ms: float = Field(..., description="Total processing time")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class VideoMetadata(BaseModel):
    """
    YouTube video metadata
    """
    id: str = Field(..., description="Video ID")
    title: str = Field(..., description="Video title")
    description: Optional[str] = Field(None, description="Video description")
    channel_id: str = Field(..., description="Channel ID")
    channel_name: str = Field(..., description="Channel name")
    published_at: Optional[datetime] = Field(None, description="Publication date")
    duration_seconds: int = Field(..., description="Video duration in seconds")
    view_count: Optional[int] = Field(None, description="View count")
    like_count: Optional[int] = Field(None, description="Like count")
    comment_count: Optional[int] = Field(None, description="Comment count")
    has_captions: bool = Field(..., description="Whether video has captions")
    transcript_status: str = Field(..., description="Transcript processing status")
    tags: List[str] = Field(default_factory=list, description="Video tags")
    category: Optional[str] = Field(None, description="Video category")


class DatabaseStatsResponse(BaseModel):
    """
    Database statistics response
    """
    total_videos: int = Field(..., description="Total videos in database")
    total_transcripts: int = Field(..., description="Total transcripts in database")
    total_segments: int = Field(..., description="Total transcript segments")
    total_embeddings: int = Field(..., description="Total embeddings stored")
    total_channels: int = Field(..., description="Total channels in database")
    cache_stats: Dict[str, Any] = Field(default_factory=dict, description="Cache statistics")
    last_updated: datetime = Field(default_factory=datetime.utcnow, description="Last update time") 