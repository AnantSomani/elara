"""
Simplified Pydantic Models for MVP YouTube Transcript System
Based on user's proposed cleaner architecture
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
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
    data: Optional[Dict[str, Any]] = None
    count: Optional[int] = None

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

class YouTubeURLRequest(BaseModel):
    youtube_url: str = Field(..., description="YouTube video URL")
    
class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    limit: int = Field(10, description="Maximum number of results", ge=1, le=50)

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
# RAG Models (Phase 1 + Phase 2 Memory)
# ==========================================

class ConversationMessage(BaseModel):
    """Individual message in conversation history"""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")

class RAGRequest(BaseModel):
    """Request model for RAG queries with conversation memory support"""
    query: str = Field(..., description="User question or query", min_length=1, max_length=1000)
    video_id: Optional[str] = Field(None, description="Optional filter by specific video ID")
    top_k: int = Field(5, description="Number of relevant chunks to retrieve", ge=1, le=20)
    # 🧠 Phase 2.3: Add session parameters for memory
    session_id: Optional[str] = Field(None, description="Session ID for conversation memory")
    conversation_history: Optional[List[ConversationMessage]] = Field(None, description="Previous conversation messages")

class RAGSourceDocument(BaseModel):
    """Source document information in RAG response"""
    text: str = Field(..., description="Excerpt from the source chunk")
    video_id: Optional[str] = Field(None, description="Video ID this chunk belongs to")
    start_time: Optional[float] = Field(None, description="Start time in seconds")
    end_time: Optional[float] = Field(None, description="End time in seconds")
    chunk_index: Optional[int] = Field(None, description="Index of this chunk in the video")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

class RAGMetadata(BaseModel):
    """Metadata about the RAG processing"""
    processing_time_ms: int = Field(..., description="Processing time in milliseconds")
    source_count: int = Field(..., description="Number of source documents retrieved")
    video_id: Optional[str] = Field(None, description="Video ID filter used")
    retrieval_method: str = Field(..., description="Type of retrieval used (semantic, hybrid, etc.)")
    request_id: str = Field(..., description="Unique request identifier")
    error: Optional[str] = Field(None, description="Error message if query failed")
    pipeline_attribution: Optional[Dict[str, Any]] = Field(None, description="RAG pipeline attribution details")
    # 🧠 Phase 2.3: Add memory metadata
    memory_used: Optional[bool] = Field(None, description="Whether conversation memory was used")
    memory_context_length: Optional[int] = Field(None, description="Length of memory context in characters")
    session_id: Optional[str] = Field(None, description="Session ID used for memory")

class RAGResponse(BaseModel):
    """Response model for RAG queries"""
    answer: str = Field(..., description="Generated answer based on retrieved context")
    sources: List[RAGSourceDocument] = Field(default_factory=list, description="Source documents used")
    metadata: RAGMetadata = Field(..., description="Processing metadata")

class RAGTestResponse(BaseModel):
    """Response model for RAG system testing"""
    success: bool = Field(..., description="Whether the test was successful")
    document_count: Optional[int] = Field(None, description="Number of documents found")
    sample_docs: Optional[List[Dict[str, Any]]] = Field(None, description="Sample documents for debugging")
    error: Optional[str] = Field(None, description="Error message if test failed") 