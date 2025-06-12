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
from enum import Enum
from dataclasses import dataclass
import uuid
import asyncio
import functools
import random

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


class ErrorSeverity(Enum):
    """Error severity levels for enhanced error handling"""
    LOW = "low"           # Minor issues, automatic retry recommended
    MEDIUM = "medium"     # Service degradation, manual intervention may help
    HIGH = "high"         # Service failure, immediate attention needed
    CRITICAL = "critical" # System-wide impact, urgent escalation required


class ErrorCategory(Enum):
    """Error categories for intelligent error handling"""
    RECOVERABLE = "recoverable"       # Can be retried
    NON_RECOVERABLE = "non_recoverable"  # Should not be retried
    RATE_LIMITED = "rate_limited"     # Needs backoff strategy
    CONFIGURATION = "configuration"   # Setup/config issue
    EXTERNAL = "external"            # Third-party service issue


@dataclass
class ErrorContext:
    """Structured error context for debugging and recovery"""
    video_id: Optional[str] = None
    language: Optional[str] = None
    attempt_number: Optional[int] = None
    api_response_code: Optional[int] = None
    api_response_headers: Optional[Dict[str, str]] = None
    processing_duration_ms: Optional[float] = None
    user_agent: Optional[str] = None
    timestamp: Optional[str] = None
    request_id: Optional[str] = None
    
    def __post_init__(self):
        """Set default values after initialization"""
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()
        if self.request_id is None:
            self.request_id = str(uuid.uuid4())


class EnhancedTranscriptError(Exception):
    """Enhanced transcript error with severity, category, and recovery context"""
    
    def __init__(
        self,
        message: str,
        video_id: Optional[str] = None,
        status_code: int = 500,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        category: ErrorCategory = ErrorCategory.EXTERNAL,
        recovery_suggestions: List[str] = None,
        context: ErrorContext = None,
        original_error: Exception = None
    ):
        super().__init__(message)
        self.message = message
        self.video_id = video_id
        self.status_code = status_code
        self.severity = severity
        self.category = category
        self.recovery_suggestions = recovery_suggestions or []
        self.context = context or ErrorContext(video_id=video_id)
        self.original_error = original_error
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert error to structured dictionary for logging/API responses"""
        return {
            "error": self.message,
            "video_id": self.video_id,
            "status_code": self.status_code,
            "severity": self.severity.value,
            "category": self.category.value,
            "recovery_suggestions": self.recovery_suggestions,
            "context": self.context.__dict__ if self.context else None,
            "original_error": str(self.original_error) if self.original_error else None,
            "error_type": self.__class__.__name__
        }
    
    def is_recoverable(self) -> bool:
        """Check if this error type is recoverable"""
        return self.category in [ErrorCategory.RECOVERABLE, ErrorCategory.RATE_LIMITED]


class EnhancedVideoUnavailableError(EnhancedTranscriptError):
    """Enhanced video unavailable error with specific recovery suggestions"""
    def __init__(self, video_id: str, context: ErrorContext = None):
        super().__init__(
            message=f"Video {video_id} is unavailable or doesn't exist",
            video_id=video_id,
            status_code=404,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.NON_RECOVERABLE,
            recovery_suggestions=[
                "Verify the video ID is correct",
                "Check if the video is public",
                "Ensure the video hasn't been deleted",
                "Try with a different video ID"
            ],
            context=context
        )


class EnhancedTranscriptDisabledError(EnhancedTranscriptError):
    """Enhanced transcript disabled error with specific recovery suggestions"""
    def __init__(self, video_id: str, context: ErrorContext = None):
        super().__init__(
            message=f"Transcripts are disabled for video {video_id}",
            video_id=video_id,
            status_code=404,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.NON_RECOVERABLE,
            recovery_suggestions=[
                "Check if the video has captions enabled",
                "Try a different video with available transcripts",
                "Contact the video owner to enable captions",
                "Use auto-generated captions if available"
            ],
            context=context
        )


class EnhancedRateLimitError(EnhancedTranscriptError):
    """Enhanced rate limit error with intelligent backoff suggestions"""
    def __init__(
        self, 
        video_id: str, 
        retry_after: Optional[int] = None,
        context: ErrorContext = None
    ):
        retry_message = f" Retry after {retry_after} seconds." if retry_after else ""
        super().__init__(
            message=f"Rate limit exceeded for video {video_id}.{retry_message}",
            video_id=video_id,
            status_code=429,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.RATE_LIMITED,
            recovery_suggestions=[
                f"Wait {retry_after or 60} seconds before retrying" if retry_after else "Wait and retry with exponential backoff",
                "Implement client-side rate limiting",
                "Consider using multiple API keys if available",
                "Batch requests to reduce API calls"
            ],
            context=context
        )
        self.retry_after = retry_after


class EnhancedNoTranscriptFoundError(EnhancedTranscriptError):
    """Enhanced no transcript found error with specific recovery suggestions"""
    def __init__(self, video_id: str, language: str, context: ErrorContext = None):
        super().__init__(
            message=f"No transcript found for video {video_id} in language '{language}'",
            video_id=video_id,
            status_code=404,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.RECOVERABLE,
            recovery_suggestions=[
                f"Try with English language instead of '{language}'",
                "Check if auto-generated captions are available",
                "Verify the video has any captions enabled",
                "Try with 'auto' language to get any available transcript"
            ],
            context=context
        )


class EnhancedServiceError(EnhancedTranscriptError):
    """Enhanced service error for external service issues"""
    def __init__(self, video_id: str, original_error: Exception, context: ErrorContext = None):
        super().__init__(
            message=f"Could not retrieve transcript for {video_id}: {str(original_error)}",
            video_id=video_id,
            status_code=503,
            severity=ErrorSeverity.HIGH,
            category=ErrorCategory.RECOVERABLE,
            recovery_suggestions=[
                "Retry the request after a short delay",
                "Check YouTube service status",
                "Verify network connectivity",
                "Try with a different language if applicable"
            ],
            context=context,
            original_error=original_error
        )


# Legacy error classes for backward compatibility
class TranscriptServiceError(EnhancedTranscriptError):
    """Legacy transcript service error - now enhanced"""
    pass


class VideoUnavailableError(EnhancedVideoUnavailableError):
    """Legacy video unavailable error - now enhanced"""
    pass


class TranscriptDisabledError(EnhancedTranscriptDisabledError):
    """Legacy transcript disabled error - now enhanced"""
    pass


class NoTranscriptFoundError(EnhancedNoTranscriptFoundError):
    """Legacy no transcript found error - now enhanced"""
    pass


class LanguageNotFoundError(EnhancedTranscriptError):
    """Legacy language not found error - now enhanced"""
    def __init__(self, video_id: str, language: str, available_languages: List[str], context: ErrorContext = None):
        available = ", ".join(available_languages) if available_languages else "none"
        super().__init__(
            message=f"Language '{language}' not available for video {video_id}. Available: {available}",
            video_id=video_id,
            status_code=404,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.RECOVERABLE,
            recovery_suggestions=[
                f"Try with one of the available languages: {available}" if available_languages else "Check if the video has any transcripts",
                "Use English ('en') as fallback language",
                "Request auto-generated transcript if manual not available"
            ],
            context=context
        )


class RateLimitError(EnhancedRateLimitError):
    """Legacy rate limit error - now enhanced"""
    pass


class BackoffStrategy(Enum):
    """Backoff strategies for retry logic"""
    EXPONENTIAL = "exponential"    # 1s → 2s → 4s → 8s → 16s
    LINEAR = "linear"              # 1s → 2s → 3s → 4s → 5s
    FIXED = "fixed"               # 1s → 1s → 1s → 1s → 1s


@dataclass
class RetryContext:
    """Context information for retry operations"""
    attempt_number: int
    max_attempts: int
    delay_seconds: float
    strategy: BackoffStrategy
    total_elapsed_ms: float
    function_name: str
    start_time: float
    previous_errors: List[Dict[str, Any]] = None
    
    def __post_init__(self):
        """Initialize default values"""
        if self.previous_errors is None:
            self.previous_errors = []


class RetryCalculator:
    """Calculate retry delays with various backoff strategies"""
    
    @staticmethod
    def calculate_delay(
        attempt: int,
        base_delay: float,
        max_delay: float,
        strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL,
        jitter: bool = True
    ) -> float:
        """
        Calculate delay for specific attempt with strategy and jitter
        
        Args:
            attempt: Current attempt number (1-based)
            base_delay: Base delay in seconds
            max_delay: Maximum delay in seconds
            strategy: Backoff strategy to use
            jitter: Whether to add randomness to prevent thundering herd
            
        Returns:
            Calculated delay in seconds
        """
        if strategy == BackoffStrategy.EXPONENTIAL:
            # Exponential: base * 2^(attempt-1)
            delay = base_delay * (2 ** (attempt - 1))
        elif strategy == BackoffStrategy.LINEAR:
            # Linear: base * attempt
            delay = base_delay * attempt
        elif strategy == BackoffStrategy.FIXED:
            # Fixed: always base delay
            delay = base_delay
        else:
            # Default to exponential
            delay = base_delay * (2 ** (attempt - 1))
        
        # Apply maximum delay limit
        delay = min(delay, max_delay)
        
        # Add jitter to prevent thundering herd (±25% randomness)
        if jitter:
            jitter_amount = delay * 0.25
            delay = delay + random.uniform(-jitter_amount, jitter_amount)
            delay = max(0.1, delay)  # Minimum 100ms delay
        
        return round(delay, 3)
    
    @staticmethod
    def calculate_total_max_delay(
        max_attempts: int,
        base_delay: float,
        max_delay: float,
        strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL
    ) -> float:
        """Calculate total maximum delay for all retry attempts"""
        total_delay = 0.0
        for attempt in range(1, max_attempts):  # Don't include last attempt
            delay = RetryCalculator.calculate_delay(
                attempt, base_delay, max_delay, strategy, jitter=False
            )
            total_delay += delay
        return total_delay


def retry_with_backoff(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL,
    jitter: bool = True
):
    """
    Decorator for retrying failed operations with configurable backoff
    
    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        base_delay: Base delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 60.0)
        strategy: Backoff strategy for calculating delays
        jitter: Add randomness to prevent thundering herd (default: True)
        
    Returns:
        Decorated function with retry logic
        
    Example:
        @retry_with_backoff(max_attempts=3, base_delay=1.0)
        async def fetch_data():
            # Function that might fail and need retry
            pass
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            last_exception = None
            
            for attempt in range(1, max_attempts + 1):
                try:
                    # Log attempt (except for first attempt)
                    if attempt > 1:
                        logger.debug(
                            f"🔄 Retry attempt {attempt}/{max_attempts} for {func.__name__}"
                        )
                    
                    # Execute the function
                    result = await func(*args, **kwargs)
                    
                    # Log successful retry if not first attempt
                    if attempt > 1:
                        elapsed_time = (time.time() - start_time) * 1000
                        logger.info(
                            f"✅ Retry successful for {func.__name__} on attempt {attempt}/{max_attempts} "
                            f"after {elapsed_time:.2f}ms"
                        )
                    
                    return result
                    
                except Exception as e:
                    last_exception = e
                    
                    # Log the error for this attempt
                    logger.debug(
                        f"❌ Attempt {attempt}/{max_attempts} failed for {func.__name__}: {str(e)}"
                    )
                    
                    # Don't wait after the last attempt
                    if attempt >= max_attempts:
                        break
                    
                    # Calculate delay for next attempt
                    delay = RetryCalculator.calculate_delay(
                        attempt, base_delay, max_delay, strategy, jitter
                    )
                    
                    # Log retry delay
                    logger.warning(
                        f"🔄 Retrying {func.__name__} in {delay:.2f}s "
                        f"(attempt {attempt + 1}/{max_attempts}, strategy: {strategy.value})"
                    )
                    
                    # Wait before next retry
                    await asyncio.sleep(delay)
            
            # All attempts failed
            total_elapsed = (time.time() - start_time) * 1000
            logger.error(
                f"❌ All retry attempts failed for {func.__name__} after {total_elapsed:.2f}ms"
            )
            
            # Re-raise the last exception
            if last_exception:
                raise last_exception
            else:
                raise Exception(f"All {max_attempts} retry attempts failed")
        
        return wrapper
    return decorator


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
    
    def _create_enhanced_error(
        self,
        original_error: Exception,
        video_id: str,
        language: str = None,
        context: ErrorContext = None
    ) -> EnhancedTranscriptError:
        """
        Create enhanced error with intelligent categorization and recovery suggestions
        
        Args:
            original_error: The original exception from YouTube API
            video_id: YouTube video ID
            language: Requested language (optional)
            context: Error context (optional)
            
        Returns:
            Enhanced error with categorization and recovery suggestions
        """
        if context is None:
            context = ErrorContext(
                video_id=video_id,
                language=language,
                timestamp=datetime.utcnow().isoformat()
            )
        
        # Map YouTube API errors to enhanced errors
        if isinstance(original_error, VideoUnavailable):
            return EnhancedVideoUnavailableError(video_id, context)
            
        elif isinstance(original_error, TranscriptsDisabled):
            return EnhancedTranscriptDisabledError(video_id, context)
        
        elif isinstance(original_error, NoTranscriptFound):
            return EnhancedNoTranscriptFoundError(video_id, language or "unknown", context)
            
        elif isinstance(original_error, TooManyRequests):
            # Try to extract retry-after from error if available
            retry_after = getattr(original_error, 'retry_after', None)
            return EnhancedRateLimitError(video_id, retry_after, context)
            
        elif isinstance(original_error, CouldNotRetrieveTranscript):
            return EnhancedServiceError(video_id, original_error, context)
            
        elif isinstance(original_error, (NotTranslatable, TranslationLanguageNotAvailable)):
            return EnhancedTranscriptError(
                message=f"Translation error for video {video_id}: {str(original_error)}",
                video_id=video_id,
                status_code=404,
                severity=ErrorSeverity.MEDIUM,
                category=ErrorCategory.RECOVERABLE,
                recovery_suggestions=[
                    "Try with the original transcript language",
                    "Check if manual transcripts are available",
                    "Use auto-generated transcript if available",
                    "Verify the target language is supported"
                ],
                context=context,
                original_error=original_error
            )
        
        else:
            # Generic enhanced error for unknown cases
            return EnhancedTranscriptError(
                message=f"Unexpected error: {str(original_error)}",
                video_id=video_id,
                status_code=500,
                severity=ErrorSeverity.HIGH,
                category=ErrorCategory.EXTERNAL,
                recovery_suggestions=[
                    "Retry the request",
                    "Check service logs for details",
                    "Contact support if issue persists",
                    "Verify all dependencies are available"
                ],
                context=context,
                original_error=original_error
            )

    def _log_enhanced_error(self, error: EnhancedTranscriptError):
        """Log enhanced error with structured data for monitoring"""
        log_data = error.to_dict()
        
        # Choose log level based on severity
        if error.severity == ErrorSeverity.CRITICAL:
            self.logger.critical("Critical transcript service error", extra=log_data)
        elif error.severity == ErrorSeverity.HIGH:
            self.logger.error("High severity transcript error", extra=log_data)
        elif error.severity == ErrorSeverity.MEDIUM:
            self.logger.warning("Medium severity transcript error", extra=log_data)
        else:
            self.logger.info("Low severity transcript error", extra=log_data)

    def _create_error_context(
        self,
        video_id: str,
        language: str = None,
        attempt_number: int = None,
        processing_start_time: float = None
    ) -> ErrorContext:
        """Create error context with current request information"""
        context = ErrorContext(
            video_id=video_id,
            language=language,
            attempt_number=attempt_number,
            timestamp=datetime.utcnow().isoformat()
        )
        
        if processing_start_time:
            context.processing_duration_ms = (time.time() - processing_start_time) * 1000
            
        return context

    async def _execute_with_retry(
        self,
        func,
        *args,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL,
        **kwargs
    ):
        """
        Execute function with retry logic and basic error handling
        
        Args:
            func: Function to execute with retry
            *args: Arguments to pass to the function
            max_attempts: Maximum number of attempts (default: 3)
            base_delay: Base delay in seconds (default: 1.0)
            max_delay: Maximum delay in seconds (default: 30.0)
            strategy: Backoff strategy to use
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Result from successful function execution
            
        Raises:
            Last exception if all retry attempts fail
        """
        start_time = time.time()
        last_exception = None
        
        for attempt in range(1, max_attempts + 1):
            try:
                # Log attempt info
                if attempt > 1:
                    self.logger.debug(
                        f"🔄 Retry attempt {attempt}/{max_attempts} for {func.__name__}"
                    )
                
                # Execute the function
                result = await func(*args, **kwargs)
                
                # Log successful retry if not first attempt
                if attempt > 1:
                    elapsed_time = (time.time() - start_time) * 1000
                    self.logger.info(
                        f"✅ Retry successful for {func.__name__} on attempt {attempt}/{max_attempts} "
                        f"after {elapsed_time:.2f}ms",
                        extra={
                            "event": "retry_success",
                            "attempt": attempt,
                            "max_attempts": max_attempts,
                            "elapsed_ms": elapsed_time,
                            "function": func.__name__
                        }
                    )
                
                return result
                
            except Exception as e:
                last_exception = e
                
                # Log the error for this attempt
                self.logger.debug(
                    f"❌ Attempt {attempt}/{max_attempts} failed for {func.__name__}: {str(e)}"
                )
                
                # Don't wait after the last attempt
                if attempt >= max_attempts:
                    break
                
                # Calculate delay for next attempt
                delay = RetryCalculator.calculate_delay(
                    attempt, base_delay, max_delay, strategy, jitter=True
                )
                
                # Log retry attempt with structured data
                self.logger.warning(
                    f"🔄 Retrying {func.__name__} in {delay:.2f}s "
                    f"(attempt {attempt + 1}/{max_attempts})",
                    extra={
                        "event": "retry_attempt",
                        "function": func.__name__,
                        "attempt": attempt,
                        "max_attempts": max_attempts,
                        "delay_seconds": delay,
                        "strategy": strategy.value,
                        "error": str(e),
                        "error_type": type(e).__name__
                    }
                )
                
                # Wait before next retry
                await asyncio.sleep(delay)
        
        # All attempts failed - log final failure
        total_elapsed = (time.time() - start_time) * 1000
        self.logger.error(
            f"❌ All retry attempts failed for {func.__name__} after {total_elapsed:.2f}ms",
            extra={
                "event": "retry_failure",
                "function": func.__name__,
                "total_attempts": max_attempts,
                "total_elapsed_ms": total_elapsed,
                "final_error": str(last_exception),
                "final_error_type": type(last_exception).__name__ if last_exception else "Unknown"
            }
        )
        
        # Re-raise the last exception
        if last_exception:
            raise last_exception
        else:
            raise Exception(f"All {max_attempts} retry attempts failed for {func.__name__}")

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
            EnhancedTranscriptError: Enhanced error with detailed context and recovery suggestions
        """
        start_time = time.time()
        
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
                                    # Create enhanced error context
                                    context = self._create_error_context(video_id, language, processing_start_time=start_time)
                                    raise EnhancedNoTranscriptFoundError(video_id, language, context)
            
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
            
        except EnhancedTranscriptError:
            # Re-raise enhanced errors as-is
            raise
            
        except Exception as original_error:
            # Create enhanced error context
            context = self._create_error_context(video_id, language, processing_start_time=start_time)
            
            # Create and log enhanced error
            enhanced_error = self._create_enhanced_error(original_error, video_id, language, context)
            self._log_enhanced_error(enhanced_error)
            
            raise enhanced_error
    
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
        await asyncio.sleep(0.5)  # 500ms delay to simulate real API
    
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