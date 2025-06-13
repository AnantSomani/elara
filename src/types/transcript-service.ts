/**
 * TypeScript types for YouTube Transcript Service API
 * 
 * These types match the Pydantic models in the FastAPI backend exactly.
 * Backend models located at: python-transcript-service/app/models.py
 */

/**
 * Individual transcript segment with text, timing, and metadata
 * Matches: TranscriptSegment (backend)
 */
export interface TranscriptSegment {
  /** The transcript text for this segment */
  text: string;
  /** Start time in seconds */
  start: number;
  /** Duration of the segment in seconds */
  duration: number;
  /** End time in seconds (calculated: start + duration) */
  end?: number;
}

/**
 * Information about available transcript languages
 * Matches: LanguageInfo (backend)
 */
export interface LanguageInfo {
  /** Language code (e.g., 'en', 'es', 'fr') */
  code: string;
  /** Human-readable language name */
  name: string;
  /** Whether this is auto-generated captions */
  auto_generated: boolean;
}

/**
 * Request model for fetching YouTube transcripts
 * Matches: TranscriptRequest (backend)
 */
export interface TranscriptRequest {
  /** YouTube video URL or video ID */
  video_url: string;
  /** Language code for the transcript (ISO 639-1) - defaults to 'en' */
  language?: string;
  /** Output format for the transcript - defaults to 'json' */
  format?: 'json' | 'text' | 'srt' | 'vtt' | 'fts';
}

/**
 * Response model for transcript data
 * Matches: TranscriptResponse (backend)
 */
export interface TranscriptResponse {
  /** Whether the request was successful */
  success: boolean;
  /** YouTube video ID */
  video_id: string;
  /** Language of the transcript */
  language: string;
  /** Format of the transcript data */
  format: string;
  /** List of transcript segments */
  transcript: TranscriptSegment[];
  /** Additional metadata */
  metadata: Record<string, any>;
  /** Total duration of the video in seconds */
  total_duration?: number;
  /** Number of transcript segments */
  segment_count: number;
  /** Processing time in milliseconds */
  processing_time_ms?: number;
}

/**
 * Literal type for supported output formats
 */
export type SupportedFormat = 'json' | 'text' | 'srt' | 'vtt' | 'fts';

/**
 * Literal type for supported language codes
 * Currently only English is supported - multi-language support coming in future phases
 */
export type SupportedLanguage = 'en';

/**
 * Response model for health check endpoint
 * Matches: HealthResponse (backend)
 */
export interface HealthResponse {
  /** Service health status */
  status: 'healthy' | 'unhealthy' | 'degraded';
  /** Service name */
  service: string;
  /** Service version */
  version: string;
  /** Environment (development, production, etc.) */
  environment: string;
  /** Health check timestamp (ISO string) */
  timestamp: string;
  /** Service uptime in seconds */
  uptime_seconds?: number;
}

/**
 * Response model for error cases
 * Matches: ErrorResponse (backend)
 */
export interface ErrorResponse {
  /** Error message */
  error: string;
  /** HTTP status code */
  status_code: number;
  /** Request path that caused the error */
  path: string;
  /** Error timestamp (ISO string) */
  timestamp: string;
  /** Additional error details */
  details?: Record<string, any>;
}

/**
 * Response model for available languages endpoint
 * Matches: LanguagesResponse (backend)
 */
export interface LanguagesResponse {
  /** YouTube video ID */
  video_id: string;
  /** List of available languages */
  available_languages: LanguageInfo[];
  /** Number of available languages */
  count: number;
}

/**
 * Literal type for health status values
 */
export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

/**
 * Configuration options for the API client
 */
export interface ApiClientConfig {
  /** Base URL for the transcript service */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Number of retry attempts on failure */
  retryAttempts: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay: number;
  /** Whether to enable exponential backoff for retries */
  exponentialBackoff?: boolean;
  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;
}

/**
 * Options for individual API requests
 */
export interface RequestOptions {
  /** Request timeout in milliseconds (overrides client default) */
  timeout?: number;
  /** Whether to retry on failure (overrides client default) */
  retryOnFailure?: boolean;
  /** AbortSignal for request cancellation */
  abortSignal?: AbortSignal;
  /** Additional headers for the request */
  headers?: Record<string, string>;
}

/**
 * Enhanced error class for transcript service errors
 * Provides structured error information with recovery suggestions
 */
export class TranscriptServiceError extends Error {
  public readonly name = 'TranscriptServiceError';
  
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly details?: Record<string, any>,
    public readonly path?: string,
    public readonly timestamp?: string
  ) {
    super(message);
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TranscriptServiceError);
    }
  }

  /**
   * Create error from API error response
   */
  static fromErrorResponse(response: ErrorResponse): TranscriptServiceError {
    return new TranscriptServiceError(
      response.error,
      response.status_code,
      undefined, // errorCode not provided in backend response
      response.details,
      response.path,
      response.timestamp
    );
  }

  /**
   * Check if error is recoverable (can be retried)
   */
  isRecoverable(): boolean {
    // Rate limit and server errors are generally recoverable
    return this.statusCode === 429 || (this.statusCode >= 500 && this.statusCode < 600);
  }

  /**
   * Get user-friendly error message with recovery suggestions
   */
  getUserMessage(): string {
    switch (this.statusCode) {
      case 400:
        return 'Invalid YouTube URL or request parameters. Please check your input and try again.';
      case 404:
        return 'Video not found or transcript not available. The video may be private or have disabled captions.';
      case 429:
        return 'Rate limit exceeded. Please wait a moment and try again.';
      case 500:
      case 502:
      case 503:
        return 'Service temporarily unavailable. Please try again in a few moments.';
      default:
        return this.message;
    }
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
      path: this.path,
      timestamp: this.timestamp,
      isRecoverable: this.isRecoverable(),
      userMessage: this.getUserMessage()
    };
  }
} 