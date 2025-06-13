"""
Simplified Pydantic Models for MVP YouTube Transcript System
Based on user's proposed cleaner architecture
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# ==========================================
# Core Transcript Models
# ==========================================

class TranscriptIn(BaseModel):
    """Input model for inserting a transcript"""
    video_id: str = Field(..., description="YouTube video ID")
    transcript_text: str = Field(..., description="Full transcript text")
    summary: Optional[str] = Field(None, description="Optional transcript summary")

class TranscriptOut(BaseModel):
    """Output model for transcript data"""
    video_id: str
    transcript_text: str
    summary: Optional[str]
    created_at: datetime
    updated_at: datetime

# ==========================================
# Video Metadata Models
# ==========================================

class VideoMetadataOut(BaseModel):
    """Output model for video metadata"""
    video_id: str
    title: str
    published_at: Optional[datetime]
    channel_id: Optional[str]
    channel_title: Optional[str]
    duration_seconds: Optional[int]
    thumbnail_url: Optional[str]
    metadata_status: str  # 'placeholder', 'pending', 'complete'
    updated_at: datetime

class VideoMetadataEnrich(BaseModel):
    """Input model for enriching video metadata from YouTube API"""
    video_id: str
    title: Optional[str] = None
    published_at: Optional[datetime] = None
    channel_id: Optional[str] = None
    channel_title: Optional[str] = None
    duration_seconds: Optional[int] = None
    thumbnail_url: Optional[str] = None

# ==========================================
# Search Models
# ==========================================

class SearchQuery(BaseModel):
    """Input model for semantic search"""
    query: str = Field(..., description="Search query text")
    match_threshold: float = Field(0.7, ge=0.0, le=1.0, description="Similarity threshold")
    match_count: int = Field(10, ge=1, le=50, description="Number of results to return")

class SearchResult(BaseModel):
    """Single search result"""
    video_id: str
    title: str
    transcript_text: str
    similarity: float

class SearchResponse(BaseModel):
    """Response model for search results"""
    query: str
    results: List[SearchResult]
    total_found: int
    processing_time_ms: int

# ==========================================
# System Status Models
# ==========================================

class SystemStats(BaseModel):
    """System statistics"""
    total_transcripts: int
    complete_metadata: int
    pending_metadata: int
    placeholder_metadata: int

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    version: str
    environment: str
    database_connected: bool
    stats: Optional[SystemStats] = None

# ==========================================
# API Response Models
# ==========================================

class APIResponse(BaseModel):
    """Generic API response wrapper"""
    success: bool
    message: str
    data: Optional[dict] = None

class ErrorResponse(BaseModel):
    """Error response model"""
    success: bool = False
    error: str
    error_code: Optional[str] = None
    details: Optional[dict] = None

# ==========================================
# Background Job Models
# ==========================================

class MetadataEnrichmentJob(BaseModel):
    """Background job for metadata enrichment"""
    video_id: str
    priority: int = Field(1, ge=1, le=5, description="Job priority (1=highest, 5=lowest)")
    retry_count: int = Field(0, ge=0, description="Number of retry attempts")
    created_at: datetime = Field(default_factory=datetime.now)

class BatchTranscriptInsert(BaseModel):
    """Batch insert model for multiple transcripts"""
    transcripts: List[TranscriptIn]
    enrich_metadata: bool = Field(True, description="Whether to trigger metadata enrichment")

# ==========================================
# Configuration Models
# ==========================================

class YouTubeAPIConfig(BaseModel):
    """YouTube Data API configuration"""
    api_key: str
    quota_limit: int = Field(10000, description="Daily quota limit")
    rate_limit_per_second: float = Field(1.0, description="Rate limit per second")

class OpenAIConfig(BaseModel):
    """OpenAI API configuration"""
    api_key: str
    model: str = Field("text-embedding-3-small", description="Embedding model")
    dimensions: int = Field(1536, description="Embedding dimensions") 