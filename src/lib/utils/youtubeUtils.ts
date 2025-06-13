/**
 * YouTube URL utilities for video ID extraction and validation
 * Supports all common YouTube URL formats
 */

/**
 * Extract video ID from YouTube URL - supports all formats
 * @param url - YouTube URL in any format
 * @returns Video ID or null if invalid
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,           // Standard: youtube.com/watch?v=ID
    /(?:youtu\.be\/)([^&\n?#]+)/,                      // Short: youtu.be/ID
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,            // Embed: youtube.com/embed/ID
    /(?:m\.youtube\.com\/watch\?v=)([^&\n?#]+)/,       // Mobile: m.youtube.com/watch?v=ID
    /(?:youtube\.com\/v\/)([^&\n?#]+)/,                // Old format: youtube.com/v/ID
    /(?:youtube\.com\/watch\?.*v=)([^&\n?#]+)/,        // With additional params
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Validate YouTube URL format
 * @param url - URL to validate
 * @returns True if valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

/**
 * Normalize YouTube URL to standard watch format
 * @param url - YouTube URL in any format  
 * @returns Standard YouTube watch URL or null if invalid
 */
export function normalizeYouTubeUrl(url: string): string | null {
  const videoId = extractVideoId(url);
  if (!videoId) return null;
  
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Extract video ID from URL or return as-is if already an ID
 * @param input - YouTube URL or video ID
 * @returns Video ID or null if invalid
 */
export function getVideoId(input: string): string | null {
  // If it's already just a video ID (11 characters, alphanumeric + underscore/dash)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }
  
  // Otherwise try to extract from URL
  return extractVideoId(input);
} 