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
            format_type: Output format ('json', 'text', 'srt', 'vtt', 'fts')
            
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
            self.logger.info(f"🎯 Fetching transcript for video: {video_id}, language: {language}, format: {format_type}")
            
            # Validate format type
            valid_formats = {"json", "text", "srt", "vtt", "fts"}
            if format_type not in valid_formats:
                raise TranscriptServiceError(
                    f"Invalid format '{format_type}'. Supported formats: {', '.join(valid_formats)}",
                    video_id=video_id,
                    status_code=400
                )
            
            # Validate and sanitize video ID
            clean_video_id = sanitize_video_id(video_id)
            if not clean_video_id:
                raise VideoUnavailableError(video_id)
            
            # Fetch transcript segments from YouTube
            transcript_segments = await self._fetch_transcript_from_youtube(
                clean_video_id, language
            )
            
            # Format the transcript segments
            formatted_transcript = self._format_transcript_segments(transcript_segments)
            
            # Apply format conversion based on requested format
            if format_type == "text":
                formatted_content = self._convert_to_text_format(formatted_transcript)
                content_type = "text/plain"
            elif format_type == "srt":
                formatted_content = self._convert_to_srt_format(formatted_transcript)
                content_type = "application/x-subrip"
            elif format_type == "vtt":
                formatted_content = self._convert_to_vtt_format(formatted_transcript)
                content_type = "text/vtt"
            elif format_type == "fts":
                formatted_content = self._convert_to_fts_format(formatted_transcript)
                content_type = "application/json"
            else:  # json format (default)
                formatted_content = formatted_transcript
                content_type = "application/json"
            
            processing_time = (time.time() - start_time) * 1000  # Convert to ms
            
            # Prepare metadata
            metadata = {
                "fetched_at": datetime.utcnow().isoformat(),
                "source": "youtube-transcript-api",
                "format": format_type,
                "content_type": content_type,
                "processing_time_ms": round(processing_time, 2)
            }
            
            # Add format-specific metadata
            if isinstance(formatted_content, list):
                metadata["segment_count"] = len(formatted_content)
                if formatted_content:
                    metadata["total_duration_seconds"] = round(
                        formatted_content[-1].get("end_seconds", 0) if format_type == "fts" 
                        else formatted_content[-1].start + formatted_content[-1].duration, 2
                    )
            elif isinstance(formatted_content, str):
                metadata["content_length"] = len(formatted_content)
                metadata["line_count"] = formatted_content.count('\n') + 1
            
            response = TranscriptResponse(
                success=True,
                video_id=clean_video_id,
                language=language,
                format=format_type,
                transcript=formatted_content,
                metadata=metadata,
                processing_time_ms=processing_time
            )
            
            self.logger.info(
                f"✅ Successfully processed transcript for {clean_video_id} "
                f"(format: {format_type}, segments: {metadata.get('segment_count', 'N/A')}, "
                f"time: {processing_time:.2f}ms)"
            )
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
        Fetch transcript from YouTube using youtube-transcript-api
        
        Args:
            video_id: YouTube video ID
            language: Requested language code
            
        Returns:
            List of transcript segments with text and timing information
            
        Raises:
            VideoUnavailableError: If video doesn't exist
            TranscriptDisabledError: If transcripts are disabled
            NoTranscriptFoundError: If no transcript available
            LanguageNotFoundError: If language not available
            RateLimitError: If rate limited
        """
        try:
            self.logger.info(f"🎯 Attempting to fetch transcript for video {video_id} in language {language}")
            
            # Get list of available transcripts
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # Try to find the best available transcript
            try:
                # 1. Try manual transcript in requested language
                self.logger.debug(f"Looking for manual transcript in {language}")
                transcript = transcript_list.find_transcript([language])
                self.logger.info(f"✅ Found manual transcript in {language}")
                
            except NoTranscriptFound:
                try:
                    # 2. Try auto-generated transcript in requested language
                    self.logger.debug(f"Looking for auto-generated transcript in {language}")
                    transcript = transcript_list.find_generated_transcript([language])
                    self.logger.info(f"✅ Found auto-generated transcript in {language}")
                    
                except NoTranscriptFound:
                    try:
                        # 3. Try English manual transcript
                        self.logger.debug("Looking for English manual transcript")
                        transcript = transcript_list.find_transcript(['en'])
                        self.logger.info("✅ Found English manual transcript")
                        
                    except NoTranscriptFound:
                        try:
                            # 4. Try English auto-generated transcript
                            self.logger.debug("Looking for English auto-generated transcript")
                            transcript = transcript_list.find_generated_transcript(['en'])
                            self.logger.info("✅ Found English auto-generated transcript")
                            
                        except NoTranscriptFound:
                            # 5. Get any available manual transcript
                            self.logger.debug("Looking for any available manual transcript")
                            available = transcript_list._manually_created_transcripts
                            if available:
                                transcript = list(available.values())[0]
                                self.logger.info(f"✅ Found manual transcript in {transcript.language_code}")
                            else:
                                # 6. Get any available auto-generated transcript
                                self.logger.debug("Looking for any available auto-generated transcript")
                                available = transcript_list._generated_transcripts
                                if available:
                                    transcript = list(available.values())[0]
                                    self.logger.info(f"✅ Found auto-generated transcript in {transcript.language_code}")
                                else:
                                    self.logger.error(f"❌ No transcripts available for video {video_id}")
                                    raise NoTranscriptFoundError(video_id, language)
            
            # Fetch the actual transcript data
            self.logger.debug(f"Fetching transcript data for {video_id}")
            raw_transcript = transcript.fetch()
            
            # Log success with transcript details
            self.logger.info(
                f"✅ Successfully fetched transcript for {video_id} "
                f"(language: {transcript.language_code}, "
                f"type: {'auto-generated' if transcript.is_generated else 'manual'}, "
                f"segments: {len(raw_transcript)})"
            )
            
            return raw_transcript
            
        except VideoUnavailable:
            self.logger.error(f"❌ Video {video_id} is unavailable")
            raise VideoUnavailableError(video_id)
            
        except TranscriptsDisabled:
            self.logger.error(f"❌ Transcripts are disabled for video {video_id}")
            raise TranscriptDisabledError(video_id)
            
        except NoTranscriptFound:
            self.logger.error(f"❌ No transcript found for video {video_id} in language {language}")
            raise NoTranscriptFoundError(video_id, language)
            
        except TooManyRequests:
            self.logger.error(f"❌ Rate limit exceeded for video {video_id}")
            raise RateLimitError(video_id)
            
        except Exception as e:
            self.logger.error(f"❌ Unexpected error fetching transcript for {video_id}: {str(e)}", exc_info=True)
            raise TranscriptServiceError(
                f"Failed to fetch transcript: {str(e)}",
                video_id=video_id,
                status_code=500
            )
    
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

    def _convert_to_text_format(self, segments: List[TranscriptSegment]) -> str:
        """Convert transcript segments to plain text"""
        return "\n".join([segment.text.strip() for segment in segments if segment.text.strip()])

    def _convert_to_srt_format(self, segments: List[TranscriptSegment]) -> str:
        """Convert transcript segments to SRT format"""
        srt_content = []
        for i, segment in enumerate(segments, 1):
            if not segment.text.strip():
                continue
                
            start_time = self._format_srt_timestamp(segment.start)
            end_time = self._format_srt_timestamp(segment.start + segment.duration)
            
            srt_content.extend([
                str(i),
                f"{start_time} --> {end_time}",
                segment.text.strip(),
                ""
            ])
        
        return "\n".join(srt_content)

    def _convert_to_vtt_format(self, segments: List[TranscriptSegment]) -> str:
        """Convert transcript segments to WebVTT format"""
        vtt_content = ["WEBVTT\n"]
        
        for segment in segments:
            if not segment.text.strip():
                continue
                
            start_time = self._format_vtt_timestamp(segment.start)
            end_time = self._format_vtt_timestamp(segment.start + segment.duration)
            
            vtt_content.extend([
                f"{start_time} --> {end_time}",
                segment.text.strip(),
                ""
            ])
        
        return "\n".join(vtt_content)

    def _convert_to_fts_format(self, segments: List[TranscriptSegment]) -> List[Dict[str, Any]]:
        """
        Convert to FTS-optimized structured format for database ingestion and temporal search
        
        Returns:
            List of structured segments optimized for FTS indexing with temporal metadata
        """
        fts_segments = []
        
        for i, segment in enumerate(segments):
            if not segment.text.strip():
                continue
                
            fts_segment = {
                "segment_id": i,
                "text": segment.text.strip(),
                "start_seconds": round(segment.start, 3),
                "end_seconds": round(segment.start + segment.duration, 3),
                "duration_seconds": round(segment.duration, 3),
                "start_timestamp": self._format_readable_timestamp(segment.start),
                "end_timestamp": self._format_readable_timestamp(segment.start + segment.duration),
                "word_count": len(segment.text.split()),
                "char_count": len(segment.text),
                "text_hash": hash(segment.text.strip()),  # For deduplication
                "temporal_context": {
                    "is_intro": segment.start < 120,  # First 2 minutes
                    "is_outro": False,  # Will be calculated after we know total duration
                    "relative_position": 0.0  # Will be calculated after we know total duration
                }
            }
            fts_segments.append(fts_segment)
        
        # Calculate relative positions and outro detection
        if fts_segments:
            total_duration = fts_segments[-1]["end_seconds"]
            outro_threshold = max(total_duration - 120, total_duration * 0.9)  # Last 2 min or 10%
            
            for segment in fts_segments:
                segment["temporal_context"]["relative_position"] = round(
                    segment["start_seconds"] / total_duration, 3
                ) if total_duration > 0 else 0.0
                segment["temporal_context"]["is_outro"] = segment["start_seconds"] >= outro_threshold
        
        return fts_segments

    def _format_srt_timestamp(self, seconds: float) -> str:
        """Format timestamp for SRT format (HH:MM:SS,mmm)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millisecs = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millisecs:03d}"

    def _format_vtt_timestamp(self, seconds: float) -> str:
        """Format timestamp for VTT format (HH:MM:SS.mmm)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millisecs = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millisecs:03d}"

    def _format_readable_timestamp(self, seconds: float) -> str:
        """Format timestamp in human-readable format (MM:SS or HH:MM:SS)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        else:
            return f"{minutes:02d}:{secs:02d}" 