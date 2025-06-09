interface YouTubeUrlResult {
  isValid: boolean
  videoId: string | null
  originalUrl: string
  parsedUrl?: string
  error?: string
  metadata?: {
    timestamp?: number // Start time in seconds
    playlist?: string
    format: 'standard' | 'short' | 'embed' | 'mobile'
  }
}

export class YouTubeUrlParser {
  // All known YouTube URL patterns
  private static readonly patterns = [
    // Standard desktop URLs
    {
      regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:&[^&]*)*(?:#t=(\d+))?/,
      format: 'standard' as const
    },
    // Short URLs (youtu.be)
    {
      regex: /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?[^&]*)?(?:#t=(\d+))?/,
      format: 'short' as const
    },
    // Embed URLs
    {
      regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?[^&]*)?/,
      format: 'embed' as const
    },
    // Mobile URLs
    {
      regex: /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:&[^&]*)*(?:#t=(\d+))?/,
      format: 'mobile' as const
    },
    // Additional patterns for edge cases
    {
      regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/,
      format: 'standard' as const
    }
  ]

  /**
   * Parse a YouTube URL and extract video information
   */
  static parseUrl(url: string): YouTubeUrlResult {
    const trimmedUrl = url.trim()
    
    if (!trimmedUrl) {
      return {
        isValid: false,
        videoId: null,
        originalUrl: url,
        error: 'URL is empty'
      }
    }

    // Try each pattern
    for (const pattern of this.patterns) {
      const match = trimmedUrl.match(pattern.regex)
      
      if (match && match[1]) {
        const videoId = match[1]
        
        // Validate video ID format (11 characters, alphanumeric + _ -)
        if (!this.isValidVideoId(videoId)) {
          continue
        }

        // Extract additional metadata
        const metadata = this.extractMetadata(trimmedUrl, pattern.format)
        
        return {
          isValid: true,
          videoId,
          originalUrl: url,
          parsedUrl: this.normalizeUrl(videoId),
          metadata
        }
      }
    }

    return {
      isValid: false,
      videoId: null,
      originalUrl: url,
      error: 'Invalid YouTube URL format'
    }
  }

  /**
   * Validate video ID format
   */
  private static isValidVideoId(videoId: string): boolean {
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
  }

  /**
   * Extract metadata from URL (timestamp, playlist, etc.)
   */
  private static extractMetadata(url: string, format: 'standard' | 'short' | 'embed' | 'mobile'): YouTubeUrlResult['metadata'] {
    const metadata: YouTubeUrlResult['metadata'] = { format }

    // Extract timestamp (t parameter or #t= fragment)
    const timeMatch = url.match(/[?&#]t=(\d+)/) || url.match(/[?&#]time_continue=(\d+)/)
    if (timeMatch) {
      metadata.timestamp = parseInt(timeMatch[1])
    }

    // Extract playlist ID
    const playlistMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)
    if (playlistMatch) {
      metadata.playlist = playlistMatch[1]
    }

    return metadata
  }

  /**
   * Create a normalized YouTube URL from video ID
   */
  private static normalizeUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`
  }

  /**
   * Quick validation without full parsing
   */
  static isYouTubeUrl(url: string): boolean {
    const domain = /(?:youtube\.com|youtu\.be)/i
    return domain.test(url) && this.parseUrl(url).isValid
  }

  /**
   * Extract just the video ID from a URL
   */
  static extractVideoId(url: string): string | null {
    const result = this.parseUrl(url)
    return result.videoId
  }

  /**
   * Validate a video ID directly
   */
  static validateVideoId(videoId: string): boolean {
    return this.isValidVideoId(videoId)
  }

  /**
   * Get supported URL formats for help text
   */
  static getSupportedFormats(): string[] {
    return [
      'https://www.youtube.com/watch?v=VIDEO_ID',
      'https://youtu.be/VIDEO_ID',
      'https://m.youtube.com/watch?v=VIDEO_ID',
      'https://www.youtube.com/embed/VIDEO_ID'
    ]
  }
}

// Convenience functions for easy importing
export const parseYouTubeUrl = (url: string) => YouTubeUrlParser.parseUrl(url)
export const extractVideoId = (url: string) => YouTubeUrlParser.extractVideoId(url)
export const isYouTubeUrl = (url: string) => YouTubeUrlParser.isYouTubeUrl(url)
export const validateVideoId = (videoId: string) => YouTubeUrlParser.validateVideoId(videoId) 