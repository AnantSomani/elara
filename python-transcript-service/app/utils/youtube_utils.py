"""
YouTube Utilities for URL validation and video ID extraction

This module provides utility functions for working with YouTube URLs and video IDs,
supporting all common YouTube URL formats.
"""

import re
from typing import Optional, Dict, List
from urllib.parse import urlparse, parse_qs
import logging

logger = logging.getLogger(__name__)

# YouTube URL patterns for different formats
YOUTUBE_URL_PATTERNS = [
    # Standard YouTube URLs
    r'(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
    r'(?:https?://)?(?:www\.)?youtube\.com/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})',
    
    # Short URLs
    r'(?:https?://)?(?:www\.)?youtu\.be/([a-zA-Z0-9_-]{11})',
    
    # Embed URLs
    r'(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]{11})',
    
    # Mobile URLs
    r'(?:https?://)?(?:m\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
    r'(?:https?://)?(?:m\.)?youtube\.com/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})',
    
    # YouTube Music URLs
    r'(?:https?://)?music\.youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
    
    # Gaming URLs
    r'(?:https?://)?gaming\.youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
]

# Video ID pattern (11 characters, alphanumeric plus _ and -)
VIDEO_ID_PATTERN = r'^[a-zA-Z0-9_-]{11}$'


def extract_video_id(url: str) -> Optional[str]:
    """
    Extract video ID from YouTube URL or return the ID if already provided
    
    Args:
        url: YouTube URL or video ID
        
    Returns:
        Video ID if valid, None otherwise
        
    Examples:
        >>> extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        'dQw4w9WgXcQ'
        >>> extract_video_id("dQw4w9WgXcQ")
        'dQw4w9WgXcQ'
        >>> extract_video_id("https://youtu.be/dQw4w9WgXcQ")
        'dQw4w9WgXcQ'
    """
    if not url or not isinstance(url, str):
        logger.warning(f"Invalid input for video ID extraction: {url}")
        return None
    
    # Clean the input
    url = url.strip()
    
    # Check if it's already a video ID
    if re.match(VIDEO_ID_PATTERN, url):
        logger.debug(f"Input is already a video ID: {url}")
        return url
    
    # Try each pattern to extract video ID
    for pattern in YOUTUBE_URL_PATTERNS:
        match = re.search(pattern, url, re.IGNORECASE)
        if match:
            video_id = match.group(1)
            logger.debug(f"Extracted video ID '{video_id}' from URL: {url}")
            return video_id
    
    # Try parsing as URL with query parameters
    try:
        parsed = urlparse(url)
        if parsed.netloc in ['youtube.com', 'www.youtube.com', 'm.youtube.com']:
            query_params = parse_qs(parsed.query)
            if 'v' in query_params:
                video_id = query_params['v'][0]
                if re.match(VIDEO_ID_PATTERN, video_id):
                    logger.debug(f"Extracted video ID '{video_id}' from query params: {url}")
                    return video_id
    except Exception as e:
        logger.debug(f"Failed to parse URL {url}: {e}")
    
    logger.warning(f"Could not extract video ID from: {url}")
    return None


def validate_youtube_url(url: str) -> bool:
    """
    Validate if a string is a valid YouTube URL or video ID
    
    Args:
        url: String to validate
        
    Returns:
        True if valid YouTube URL or video ID, False otherwise
        
    Examples:
        >>> validate_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        True
        >>> validate_youtube_url("dQw4w9WgXcQ")
        True
        >>> validate_youtube_url("invalid-url")
        False
    """
    if not url or not isinstance(url, str):
        return False
    
    # Check if we can extract a valid video ID
    video_id = extract_video_id(url)
    return video_id is not None


def sanitize_video_id(video_id: str) -> Optional[str]:
    """
    Sanitize and validate a video ID
    
    Args:
        video_id: Video ID to sanitize
        
    Returns:
        Sanitized video ID if valid, None otherwise
        
    Examples:
        >>> sanitize_video_id("dQw4w9WgXcQ")
        'dQw4w9WgXcQ'
        >>> sanitize_video_id("  dQw4w9WgXcQ  ")
        'dQw4w9WgXcQ'
        >>> sanitize_video_id("invalid")
        None
    """
    if not video_id or not isinstance(video_id, str):
        return None
    
    # Clean whitespace
    video_id = video_id.strip()
    
    # Validate format
    if re.match(VIDEO_ID_PATTERN, video_id):
        return video_id
    
    return None


def get_youtube_url_info(url: str) -> Dict[str, Optional[str]]:
    """
    Extract comprehensive information from a YouTube URL
    
    Args:
        url: YouTube URL to analyze
        
    Returns:
        Dictionary containing URL information
        
    Example:
        >>> get_youtube_url_info("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")
        {
            'video_id': 'dQw4w9WgXcQ',
            'timestamp': '30s',
            'playlist_id': None,
            'url_type': 'standard'
        }
    """
    info = {
        'video_id': None,
        'timestamp': None,
        'playlist_id': None,
        'url_type': None,
        'original_url': url
    }
    
    if not url or not isinstance(url, str):
        return info
    
    # Extract video ID
    info['video_id'] = extract_video_id(url)
    
    if not info['video_id']:
        return info
    
    # Determine URL type
    url_lower = url.lower()
    if 'youtu.be' in url_lower:
        info['url_type'] = 'short'
    elif 'embed' in url_lower:
        info['url_type'] = 'embed'
    elif 'm.youtube.com' in url_lower:
        info['url_type'] = 'mobile'
    elif 'music.youtube.com' in url_lower:
        info['url_type'] = 'music'
    elif 'gaming.youtube.com' in url_lower:
        info['url_type'] = 'gaming'
    elif 'youtube.com' in url_lower:
        info['url_type'] = 'standard'
    else:
        info['url_type'] = 'unknown'
    
    # Extract additional parameters
    try:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        # Extract timestamp
        if 't' in query_params:
            info['timestamp'] = query_params['t'][0]
        
        # Extract playlist ID
        if 'list' in query_params:
            info['playlist_id'] = query_params['list'][0]
            
    except Exception as e:
        logger.debug(f"Failed to parse additional URL parameters: {e}")
    
    return info


def is_valid_video_id(video_id: str) -> bool:
    """
    Check if a string is a valid YouTube video ID format
    
    Args:
        video_id: String to check
        
    Returns:
        True if valid video ID format, False otherwise
        
    Examples:
        >>> is_valid_video_id("dQw4w9WgXcQ")
        True
        >>> is_valid_video_id("invalid")
        False
        >>> is_valid_video_id("toolong12345")
        False
    """
    if not video_id or not isinstance(video_id, str):
        return False
    
    return bool(re.match(VIDEO_ID_PATTERN, video_id))


def normalize_youtube_url(url: str) -> Optional[str]:
    """
    Normalize a YouTube URL to standard format
    
    Args:
        url: YouTube URL or video ID to normalize
        
    Returns:
        Normalized YouTube URL or None if invalid
        
    Examples:
        >>> normalize_youtube_url("https://youtu.be/dQw4w9WgXcQ")
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        >>> normalize_youtube_url("dQw4w9WgXcQ")
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    """
    video_id = extract_video_id(url)
    if not video_id:
        return None
    
    return f"https://www.youtube.com/watch?v={video_id}"


def get_supported_url_formats() -> List[str]:
    """
    Get list of supported YouTube URL formats
    
    Returns:
        List of example URL formats supported
    """
    return [
        "https://www.youtube.com/watch?v=VIDEO_ID",
        "https://youtube.com/watch?v=VIDEO_ID",
        "https://youtu.be/VIDEO_ID",
        "https://www.youtube.com/embed/VIDEO_ID",
        "https://m.youtube.com/watch?v=VIDEO_ID",
        "https://music.youtube.com/watch?v=VIDEO_ID",
        "https://gaming.youtube.com/watch?v=VIDEO_ID",
        "VIDEO_ID (direct video ID)"
    ]


def batch_extract_video_ids(urls: List[str]) -> Dict[str, Optional[str]]:
    """
    Extract video IDs from multiple URLs
    
    Args:
        urls: List of URLs to process
        
    Returns:
        Dictionary mapping original URLs to extracted video IDs
        
    Example:
        >>> batch_extract_video_ids([
        ...     "https://youtu.be/dQw4w9WgXcQ",
        ...     "invalid-url",
        ...     "jNQXAC9IVRw"
        ... ])
        {
            'https://youtu.be/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
            'invalid-url': None,
            'jNQXAC9IVRw': 'jNQXAC9IVRw'
        }
    """
    return {url: extract_video_id(url) for url in urls}


# Validate all patterns work correctly
def _test_patterns():
    """Test function to validate URL patterns (for development/testing)"""
    test_urls = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        "dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
    ]
    
    for url in test_urls:
        video_id = extract_video_id(url)
        print(f"URL: {url} -> Video ID: {video_id}")


if __name__ == "__main__":
    # Run tests if called directly
    _test_patterns() 