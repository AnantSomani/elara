"""
Transcript Service for YouTube Video Processing

This service handles the core business logic for fetching and processing
YouTube video transcripts using the youtube-transcript-api library.
"""

import os
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

# YouTube Transcript API imports
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    TooManyRequests,
    CouldNotRetrieveTranscript,
    NotTranslatable,
    TranslationLanguageNotAvailable
)

from ..models import (
    TranscriptResponse,
    TranscriptSegment,
    LanguageInfo,
    LanguagesResponse
)
from ..utils.youtube_utils import extract_video_id, sanitize_video_id

logger = logging.getLogger(__name__)


class TranscriptServiceError(Exception):
    """Base exception for transcript service errors"""
    def __init__(self, message: str, video_id: Optional[str] = None, status_code: int = 500):
        self.message = message
        self.video_id = video_id
        self.status_code = status_code
        super().__init__(self.message)


class VideoUnavailableError(TranscriptServiceError):
    """Raised when video is unavailable or doesn't exist"""
    def __init__(self, video_id: str):
        super().__init__(
            f"Video {video_id} is unavailable or doesn't exist",
            video_id=video_id,
            status_code=404
        )


class TranscriptDisabledError(TranscriptServiceError):
    """Raised when transcripts are disabled for the video"""
    def __init__(self, video_id: str):
        super().__init__(
            f"Transcripts are disabled for video {video_id}",
            video_id=video_id,
            status_code=404
        )


class NoTranscriptFoundError(TranscriptServiceError):
    """Raised when no transcript is available for the video"""
    def __init__(self, video_id: str, language: str):
        super().__init__(
            f"No transcript found for video {video_id} in language '{language}'",
            video_id=video_id,
            status_code=404
        )


class LanguageNotFoundError(TranscriptServiceError):
    """Raised when requested language is not available"""
    def __init__(self, video_id: str, language: str, available_languages: List[str]):
        available = ", ".join(available_languages) if available_languages else "none"
        super().__init__(
            f"Language '{language}' not available for video {video_id}. Available: {available}",
            video_id=video_id,
            status_code=404
        )


class RateLimitError(TranscriptServiceError):
    """Raised when hitting YouTube rate limits"""
    def __init__(self, video_id: str):
        super().__init__(
            f"Rate limit exceeded for video {video_id}. Please try again later.",
            video_id=video_id,
            status_code=429
        )


class TranscriptService:
    """
    Service class for fetching and processing YouTube video transcripts
    """
    
    def __init__(self):
        """Initialize the transcript service"""
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # Verify YouTube Transcript API imports
        try:
            # This will raise ImportError if the package is not properly installed
            YouTubeTranscriptApi
            self.logger.info("✅ YouTube Transcript API successfully imported")
        except ImportError as e:
            self.logger.error(f"❌ Failed to import YouTube Transcript API: {e}")
            raise
        
        self.request_timeout = int(os.getenv("TRANSCRIPT_FETCH_TIMEOUT", 60))
        self.rate_limit_requests = int(os.getenv("RATE_LIMIT_REQUESTS", 100))
        self.rate_limit_window = int(os.getenv("RATE_LIMIT_WINDOW", 60))
        
        self.logger.info("🚀 TranscriptService initialized")
        self.logger.debug(f"Configuration: timeout={self.request_timeout}s, rate_limit={self.rate_limit_requests}/min")
    
    async def fetch_transcript(
        self, 
        video_id: str, 
        language: str = "en", 
        format_type: str = "json"
    ) -> TranscriptResponse:
        """
        Fetch transcript for a YouTube video
        
        Args:
            video_id: YouTube video ID
            language: Language code for transcript (default: 'en')
            format_type: Output format ('json', 'text', 'srt', 'vtt')
            
        Returns:
            TranscriptResponse with transcript data
            
        Raises:
            VideoUnavailableError: If video doesn't exist
            TranscriptDisabledError: If transcripts are disabled
            NoTranscriptFoundError: If no transcript available
            LanguageNotFoundError: If language not available
            RateLimitError: If rate limited
        """
        start_time = time.time()
        
        try:
            self.logger.info(f"🎯 Fetching transcript for video: {video_id}, language: {language}")
            
            # Validate and sanitize video ID
            clean_video_id = sanitize_video_id(video_id)
            if not clean_video_id:
                raise VideoUnavailableError(video_id)
            
            # TODO: Phase 2 - Implement actual transcript fetching
            # For now, return a placeholder response to test the structure
            transcript_segments = await self._fetch_transcript_from_youtube(
                clean_video_id, language
            )
            
            # Format the response
            formatted_transcript = self._format_transcript_segments(transcript_segments)
            
            processing_time = (time.time() - start_time) * 1000  # Convert to ms
            
            response = TranscriptResponse(
                success=True,
                video_id=clean_video_id,
                language=language,
                format=format_type,
                transcript=formatted_transcript,
                metadata={
                    "fetched_at": datetime.utcnow().isoformat(),
                    "source": "youtube-transcript-api",
                    "format": format_type
                },
                processing_time_ms=processing_time
            )
            
            self.logger.info(f"✅ Successfully fetched transcript for {clean_video_id} ({len(formatted_transcript)} segments)")
            return response
            
        except TranscriptServiceError:
            # Re-raise our custom exceptions
            raise
        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            self.logger.error(f"❌ Unexpected error fetching transcript for {video_id}: {e}", exc_info=True)
            raise TranscriptServiceError(
                f"Failed to fetch transcript: {str(e)}",
                video_id=video_id,
                status_code=500
            )
    
    async def get_available_languages(self, video_id: str) -> List[LanguageInfo]:
        """
        Get available transcript languages for a video
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            List of available languages
            
        Raises:
            VideoUnavailableError: If video doesn't exist
            TranscriptDisabledError: If transcripts are disabled
        """
        try:
            self.logger.info(f"🌍 Getting available languages for video: {video_id}")
            
            # Validate and sanitize video ID
            clean_video_id = sanitize_video_id(video_id)
            if not clean_video_id:
                raise VideoUnavailableError(video_id)
            
            # TODO: Phase 2 - Implement actual language detection
            # For now, return placeholder languages
            languages = await self._get_languages_from_youtube(clean_video_id)
            
            self.logger.info(f"✅ Found {len(languages)} languages for video {clean_video_id}")
            return languages
            
        except TranscriptServiceError:
            raise
        except Exception as e:
            self.logger.error(f"❌ Error getting languages for {video_id}: {e}", exc_info=True)
            raise TranscriptServiceError(
                f"Failed to get available languages: {str(e)}",
                video_id=video_id,
                status_code=500
            )
    
    def _format_transcript_segments(self, raw_segments: List[Dict[str, Any]]) -> List[TranscriptSegment]:
        """
        Format raw transcript data into TranscriptSegment objects
        
        Args:
            raw_segments: Raw transcript data from YouTube API
            
        Returns:
            List of formatted TranscriptSegment objects
        """
        try:
            formatted_segments = []
            
            for segment in raw_segments:
                # Handle different possible formats from YouTube API
                text = segment.get('text', '').strip()
                start = float(segment.get('start', 0))
                duration = float(segment.get('duration', 0))
                
                if text:  # Only include segments with actual text
                    formatted_segment = TranscriptSegment(
                        text=text,
                        start=start,
                        duration=duration
                    )
                    formatted_segments.append(formatted_segment)
            
            self.logger.debug(f"Formatted {len(formatted_segments)} transcript segments")
            return formatted_segments
            
        except Exception as e:
            self.logger.error(f"❌ Error formatting transcript segments: {e}", exc_info=True)
            raise TranscriptServiceError(f"Failed to format transcript data: {str(e)}")
    
    async def _fetch_transcript_from_youtube(
        self, 
        video_id: str, 
        language: str
    ) -> List[Dict[str, Any]]:
        """
        Fetch raw transcript data from YouTube (Phase 2 implementation)
        
        Args:
            video_id: Clean YouTube video ID
            language: Language code
            
        Returns:
            Raw transcript data
        """
        # TODO: Phase 2 - Implement actual YouTube API calls
        # This is a placeholder that will be replaced with actual implementation
        
        self.logger.debug(f"🔄 [PLACEHOLDER] Fetching from YouTube API: {video_id}, language: {language}")
        
        # Simulate API delay
        await self._simulate_api_delay()
        
        # Return placeholder data for testing
        return [
            {"text": "Hello and welcome to this video", "start": 0.0, "duration": 3.5},
            {"text": "This is a placeholder transcript", "start": 3.5, "duration": 4.0},
            {"text": "Real implementation coming in Phase 2", "start": 7.5, "duration": 4.5}
        ]
    
    async def _get_languages_from_youtube(self, video_id: str) -> List[LanguageInfo]:
        """
        Get available languages from YouTube (Phase 2 implementation)
        
        Args:
            video_id: Clean YouTube video ID
            
        Returns:
            List of available languages
        """
        # TODO: Phase 2 - Implement actual language detection
        
        self.logger.debug(f"🔄 [PLACEHOLDER] Getting languages from YouTube API: {video_id}")
        
        # Simulate API delay
        await self._simulate_api_delay()
        
        # Return placeholder languages for testing
        return [
            LanguageInfo(code="en", name="English", auto_generated=False),
            LanguageInfo(code="es", name="Spanish", auto_generated=True)
        ]
    
    async def _simulate_api_delay(self):
        """Simulate API response delay for testing"""
        import asyncio
        await asyncio.sleep(0.5)  # 500ms delay to simulate real API
    
    def _handle_youtube_api_error(self, error: Exception, video_id: str) -> TranscriptServiceError:
        """
        Convert YouTube API errors to our custom exceptions (Phase 2)
        
        Args:
            error: Original YouTube API error
            video_id: Video ID that caused the error
            
        Returns:
            Appropriate TranscriptServiceError
        """
        # TODO: Phase 2 - Implement actual error mapping
        error_str = str(error).lower()
        
        if "unavailable" in error_str or "not found" in error_str:
            return VideoUnavailableError(video_id)
        elif "disabled" in error_str:
            return TranscriptDisabledError(video_id)
        elif "transcript" not in error_str:
            return NoTranscriptFoundError(video_id, "unknown")
        elif "rate" in error_str or "limit" in error_str:
            return RateLimitError(video_id)
        else:
            return TranscriptServiceError(f"YouTube API error: {str(error)}", video_id)
    
    def get_service_stats(self) -> Dict[str, Any]:
        """
        Get service statistics and configuration
        
        Returns:
            Dictionary with service stats
        """
        return {
            "service": "TranscriptService",
            "version": "1.0.0",
            "configuration": {
                "request_timeout": self.request_timeout,
                "rate_limit_requests": self.rate_limit_requests,
                "rate_limit_window": self.rate_limit_window
            },
            "supported_formats": ["json", "text", "srt", "vtt"],
            "supported_languages": ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh"],
            "features": [
                "YouTube transcript fetching",
                "Multi-language support",
                "Multiple output formats",
                "Error handling",
                "Rate limiting"
            ]
        } 