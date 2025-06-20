/**
 * TypeScript API Client for YouTube Transcript Service
 * 
 * This client communicates with the FastAPI backend service to fetch
 * YouTube video transcripts with full error handling and retry logic.
 * 
 * Backend service: python-transcript-service/
 */

import {
  ApiClientConfig,
  RequestOptions,
  TranscriptServiceError,
  ErrorResponse,
  HealthResponse,
  TranscriptRequest,
  TranscriptResponse,
  LanguageInfo,
  LanguagesResponse,
  SupportedFormat,
  SupportedLanguage
} from '../../types/transcript-service';

/**
 * Default configuration for the API client
 */
const DEFAULT_CONFIG: ApiClientConfig = {
      baseUrl: 'http://localhost:6000',
  timeout: 30000,        // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000,      // 1 second
  exponentialBackoff: true,
  maxRetryDelay: 10000   // 10 seconds max
};

/**
 * YouTube Transcript Service API Client
 * 
 * Provides a TypeScript interface to the FastAPI backend service
 * with full error handling, retry logic, and type safety.
 */
export class TranscriptApiClient {
  private readonly config: ApiClientConfig;

  constructor(customConfig?: Partial<ApiClientConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      baseUrl: process.env.NEXT_PUBLIC_TRANSCRIPT_SERVICE_URL || DEFAULT_CONFIG.baseUrl,
      ...customConfig
    };

    // Validate configuration
    this.validateConfig();
  }

  /**
   * Get the current client configuration
   */
  getConfig(): Readonly<ApiClientConfig> {
    return { ...this.config };
  }

  /**
   * Validate the client configuration
   * @private
   */
  private validateConfig(): void {
    if (!this.config.baseUrl) {
      throw new Error('TranscriptApiClient: baseUrl is required');
    }

    if (this.config.timeout <= 0) {
      throw new Error('TranscriptApiClient: timeout must be positive');
    }

    if (this.config.retryAttempts < 0) {
      throw new Error('TranscriptApiClient: retryAttempts must be non-negative');
    }

    if (this.config.retryDelay < 0) {
      throw new Error('TranscriptApiClient: retryDelay must be non-negative');
    }

    // Ensure baseUrl doesn't end with trailing slash
    if (this.config.baseUrl.endsWith('/')) {
      this.config.baseUrl = this.config.baseUrl.slice(0, -1);
    }
  }

  /**
   * Make an HTTP request to the API
   * @private
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    requestOptions?: RequestOptions
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const timeout = requestOptions?.timeout || this.config.timeout;
    const retryOnFailure = requestOptions?.retryOnFailure !== false;

    // Prepare request configuration
    const requestConfig: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
        ...requestOptions?.headers
      },
      signal: requestOptions?.abortSignal
    };

    // Execute request with retry logic
    if (retryOnFailure && this.config.retryAttempts > 0) {
      return this.makeRequestWithRetry<T>(url, requestConfig, timeout);
    } else {
      return this.executeSingleRequest<T>(url, requestConfig, timeout);
    }
  }

  /**
   * Execute a single HTTP request without retry
   * @private
   */
  private async executeSingleRequest<T>(
    url: string,
    requestConfig: RequestInit,
    timeout: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Merge abort signals if both exist
      if (requestConfig.signal) {
        const existingSignal = requestConfig.signal;
        if (existingSignal.aborted) {
          throw new Error('Request was aborted');
        }
        
        // Listen for existing signal abort
        existingSignal.addEventListener('abort', () => controller.abort());
      }

      const response = await fetch(url, {
        ...requestConfig,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response, url);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      throw this.transformError(errorObj, url);
    }
  }

  /**
   * Execute HTTP request with retry logic
   * @private
   */
  private async makeRequestWithRetry<T>(
    url: string,
    requestConfig: RequestInit,
    timeout: number
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.executeSingleRequest<T>(url, requestConfig, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on last attempt
        if (attempt === this.config.retryAttempts) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(attempt);
        console.warn(`Request failed (attempt ${attempt + 1}/${this.config.retryAttempts + 1}), retrying in ${delay}ms:`, error);

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Handle error responses from the API
   * @private
   */
  private async handleErrorResponse(response: Response, url: string): Promise<never> {
    try {
      const errorData: ErrorResponse = await response.json();
      throw TranscriptServiceError.fromErrorResponse(errorData);
    } catch (jsonError) {
      // If response is not JSON, create generic error
      throw new TranscriptServiceError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        undefined,
        { url, originalError: jsonError }
      );
    }
  }

  /**
   * Transform generic errors into TranscriptServiceError
   * @private
   */
  private transformError(error: Error, url: string): TranscriptServiceError {
    if (error instanceof TranscriptServiceError) {
      return error;
    }

    // Handle abort errors
    if (error.name === 'AbortError') {
      return new TranscriptServiceError(
        'Request was cancelled or timed out',
        408, // Request Timeout
        'TIMEOUT',
        { url, originalError: error.message }
      );
    }

    // Handle network errors
    if (error.message.includes('fetch')) {
      return new TranscriptServiceError(
        'Network error: Unable to connect to transcript service',
        0, // Network error
        'NETWORK_ERROR',
        { url, originalError: error.message }
      );
    }

    // Generic error
    return new TranscriptServiceError(
      `Request failed: ${error.message}`,
      500,
      'UNKNOWN_ERROR',
      { url, originalError: error.message }
    );
  }

  /**
   * Check if an error is retryable
   * @private
   */
  private isRetryableError(error: Error): boolean {
    if (error instanceof TranscriptServiceError) {
      return error.isRecoverable();
    }

    // Network errors and timeouts are retryable
    return error.name === 'AbortError' || error.message.includes('fetch');
  }

  /**
   * Calculate delay for retry attempt
   * @private
   */
  private calculateRetryDelay(attempt: number): number {
    let delay = this.config.retryDelay;

    if (this.config.exponentialBackoff) {
      delay = this.config.retryDelay * Math.pow(2, attempt);
    } else {
      delay = this.config.retryDelay * (attempt + 1);
    }

    // Cap at maximum delay
    if (this.config.maxRetryDelay) {
      delay = Math.min(delay, this.config.maxRetryDelay);
    }

    // Add jitter to prevent thundering herd
    delay += Math.random() * 1000;

    return Math.floor(delay);
  }

  /**
   * Sleep utility for retry delays
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Fetch transcript for a YouTube video
   * 
   * @param request - Transcript request with video URL, language, and format
   * @param options - Optional request options (timeout, retry, etc.)
   * @returns Promise<TranscriptResponse> - Complete transcript data
   * 
   * @example
   * ```typescript
   * const response = await client.fetchTranscript({
   *   video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
   *   language: 'en',
   *   format: 'json'
   * });
   * ```
   */
  async fetchTranscript(
    request: TranscriptRequest,
    options?: RequestOptions
  ): Promise<TranscriptResponse> {
    // Validate and normalize the request using our comprehensive validation
    const requestData = this.validateAndNormalizeRequest(request);

    try {
      const response = await this.makeRequest<TranscriptResponse>(
        '/transcript/fetch',
        {
          method: 'POST',
          body: JSON.stringify(requestData)
        },
        options
      );

      return response;
    } catch (error) {
      if (error instanceof TranscriptServiceError) {
        throw error;
      }
      throw new TranscriptServiceError(
        `Failed to fetch transcript: ${error instanceof Error ? error.message : String(error)}`,
        500,
        'FETCH_FAILED',
        { request: requestData, originalError: error }
      );
    }
  }

  /**
   * Get available transcript languages for a YouTube video
   * 
   * @param videoId - YouTube video ID (11 characters)
   * @param options - Optional request options
   * @returns Promise<LanguageInfo[]> - Array of available languages
   * 
   * @example
   * ```typescript
   * const languages = await client.getAvailableLanguages('dQw4w9WgXcQ');
   * console.log(languages); // [{ code: 'en', name: 'English', auto_generated: true }]
   * ```
   */
  async getAvailableLanguages(
    videoId: string,
    options?: RequestOptions
  ): Promise<LanguageInfo[]> {
    if (!videoId) {
      throw new TranscriptServiceError(
        'videoId is required',
        400,
        'INVALID_REQUEST',
        { videoId }
      );
    }

    // Validate video ID format (11 characters, alphanumeric and some symbols)
    if (!this.validateVideoId(videoId)) {
      throw new TranscriptServiceError(
        'Invalid YouTube video ID format',
        400,
        'INVALID_VIDEO_ID',
        { videoId, expectedFormat: '11 character alphanumeric string' }
      );
    }

    try {
      const response = await this.makeRequest<LanguagesResponse>(
        `/transcript/languages/${videoId}`,
        {
          method: 'GET'
        },
        options
      );

      return response.available_languages;
    } catch (error) {
      if (error instanceof TranscriptServiceError) {
        throw error;
      }
      throw new TranscriptServiceError(
        `Failed to get available languages: ${error instanceof Error ? error.message : String(error)}`,
        500,
        'LANGUAGES_FAILED',
        { videoId, originalError: error }
      );
    }
  }

  /**
   * Check the health status of the transcript service
   * 
   * @param options - Optional request options
   * @returns Promise<HealthResponse> - Service health information
   * 
   * @example
   * ```typescript
   * const health = await client.checkHealth();
   * console.log(health.status); // 'healthy' | 'unhealthy' | 'degraded'
   * ```
   */
  async checkHealth(options?: RequestOptions): Promise<HealthResponse> {
    try {
      const response = await this.makeRequest<HealthResponse>(
        '/health',
        {
          method: 'GET'
        },
        // Override default retry behavior for health checks
        {
          ...options,
          retryOnFailure: options?.retryOnFailure ?? false,
          timeout: options?.timeout ?? 10000 // Shorter timeout for health checks
        }
      );

      return response;
    } catch (error) {
      if (error instanceof TranscriptServiceError) {
        throw error;
      }
      throw new TranscriptServiceError(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        503,
        'HEALTH_CHECK_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Get service information and capabilities
   * 
   * @param options - Optional request options
   * @returns Promise<any> - Service metadata and capabilities
   * 
   * @example
   * ```typescript
   * const info = await client.getServiceInfo();
   * console.log(info.features); // Array of supported features
   * ```
   */
  async getServiceInfo(options?: RequestOptions): Promise<any> {
    try {
      const response = await this.makeRequest<any>(
        '/info',
        {
          method: 'GET'
        },
        {
          ...options,
          retryOnFailure: options?.retryOnFailure ?? false,
          timeout: options?.timeout ?? 10000
        }
      );

      return response;
    } catch (error) {
      if (error instanceof TranscriptServiceError) {
        throw error;
      }
      throw new TranscriptServiceError(
        `Failed to get service info: ${error instanceof Error ? error.message : String(error)}`,
        500,
        'SERVICE_INFO_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Test the connection to the transcript service
   * Combines health check and service info for comprehensive status
   * 
   * @param options - Optional request options
   * @returns Promise<{health: HealthResponse, info: any}> - Combined status
   */
  async testConnection(options?: RequestOptions): Promise<{
    health: HealthResponse;
    info: any;
    connectionTime: number;
  }> {
    const startTime = Date.now();

    try {
      // Run health check and service info in parallel
      const [health, info] = await Promise.all([
        this.checkHealth(options),
        this.getServiceInfo(options)
      ]);

      const connectionTime = Date.now() - startTime;

      return {
        health,
        info,
        connectionTime
      };
    } catch (error) {
      const connectionTime = Date.now() - startTime;
      
      if (error instanceof TranscriptServiceError) {
        throw new TranscriptServiceError(
          error.message,
          error.statusCode,
          'CONNECTION_TEST_FAILED',
          { ...error.details, connectionTime }
        );
      }
      
      throw new TranscriptServiceError(
        `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        503,
        'CONNECTION_TEST_FAILED',
        { originalError: error, connectionTime }
      );
    }
  }

  // ============================================================================
  // UTILITY & VALIDATION METHODS
  // ============================================================================

  /**
   * Extract video ID from YouTube URL or return the input if it's already a video ID
   * Supports multiple YouTube URL formats
   * 
   * @param url - YouTube URL or video ID
   * @returns string - Extracted video ID
   * @throws TranscriptServiceError - If URL format is invalid
   * 
   * @example
   * ```typescript
   * extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') // Returns: 'dQw4w9WgXcQ'
   * extractVideoId('youtu.be/dQw4w9WgXcQ') // Returns: 'dQw4w9WgXcQ'
   * extractVideoId('dQw4w9WgXcQ') // Returns: 'dQw4w9WgXcQ'
   * ```
   */
  extractVideoId(url: string): string {
    if (!url || typeof url !== 'string') {
      throw new TranscriptServiceError(
        'URL cannot be empty',
        400,
        'INVALID_URL',
        { providedUrl: url }
      );
    }

    const trimmedUrl = url.trim();

    // Check if it's already a video ID (11 characters, alphanumeric and some symbols)
    if (this.validateVideoId(trimmedUrl)) {
      return trimmedUrl;
    }

    // YouTube URL patterns (matching backend validation)
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/.*[?&]v=)([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = trimmedUrl.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    throw new TranscriptServiceError(
      'Invalid YouTube URL or video ID format',
      400,
      'INVALID_URL_FORMAT',
      {
        providedUrl: url,
        supportedFormats: [
          'https://youtube.com/watch?v=VIDEO_ID',
          'https://youtu.be/VIDEO_ID',
          'https://youtube.com/embed/VIDEO_ID',
          'VIDEO_ID (11 characters)'
        ]
      }
    );
  }

  /**
   * Validate YouTube URL or video ID format
   * 
   * @param url - YouTube URL or video ID to validate
   * @returns boolean - True if valid, false otherwise
   * 
   * @example
   * ```typescript
   * validateVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ') // Returns: true
   * validateVideoUrl('invalid-url') // Returns: false
   * ```
   */
  validateVideoUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      this.extractVideoId(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate YouTube video ID format (11 characters, alphanumeric and some symbols)
   * Matches backend validation exactly
   * 
   * @param videoId - Video ID to validate
   * @returns boolean - True if valid video ID format
   * 
   * @example
   * ```typescript
   * validateVideoId('dQw4w9WgXcQ') // Returns: true
   * validateVideoId('invalid') // Returns: false
   * ```
   */
  private validateVideoId(videoId: string): boolean {
    if (!videoId || typeof videoId !== 'string') {
      return false;
    }

    // YouTube video IDs are exactly 11 characters: alphanumeric, underscore, hyphen
    const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
    return videoIdPattern.test(videoId);
  }

  /**
   * Validate language code format
   * Supports ISO 639-1 format and common language codes
   * Matches backend validation exactly
   * 
   * @param language - Language code to validate
   * @returns boolean - True if valid language code
   * 
   * @example
   * ```typescript
   * validateLanguageCode('en') // Returns: true
   * validateLanguageCode('en-US') // Returns: true
   * validateLanguageCode('invalid') // Returns: false
   * ```
   */
  validateLanguageCode(language: string): boolean {
    if (!language || typeof language !== 'string') {
      return false;
    }

    const trimmedLanguage = language.trim().toLowerCase();

    // ISO 639-1 format: 2 lowercase letters, optionally followed by -XX (country code)
    const isoPattern = /^[a-z]{2}(-[a-z]{2})?$/i;
    if (isoPattern.test(trimmedLanguage)) {
      return true;
    }

    // Common language codes (matching backend validation)
    const commonLanguages = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi',
      'nl', 'sv', 'da', 'no', 'fi', 'pl', 'tr', 'cs', 'hu', 'ro', 'bg',
      'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'mt', 'el', 'cy', 'ga', 'eu'
    ];

    return commonLanguages.includes(trimmedLanguage);
  }

  /**
   * Validate and normalize transcript request data
   * Performs comprehensive validation and applies defaults
   * 
   * @param request - Raw transcript request
   * @returns TranscriptRequest - Validated and normalized request
   * @throws TranscriptServiceError - If validation fails
   */
  validateAndNormalizeRequest(request: Partial<TranscriptRequest>): TranscriptRequest {
    if (!request || typeof request !== 'object') {
      throw new TranscriptServiceError(
        'Request object is required',
        400,
        'INVALID_REQUEST',
        { request }
      );
    }

    if (!request.video_url) {
      throw new TranscriptServiceError(
        'video_url is required',
        400,
        'MISSING_VIDEO_URL',
        { request }
      );
    }

    // Extract and validate video ID
    let videoId: string;
    try {
      videoId = this.extractVideoId(request.video_url);
    } catch (error) {
      if (error instanceof TranscriptServiceError) {
        throw error;
      }
      throw new TranscriptServiceError(
        'Invalid video URL format',
        400,
        'INVALID_VIDEO_URL',
        { videoUrl: request.video_url, originalError: error }
      );
    }

    // Validate and normalize language
    const language = request.language || 'en';
    if (!this.validateLanguageCode(language)) {
      throw new TranscriptServiceError(
        'Invalid language code format',
        400,
        'INVALID_LANGUAGE',
        { 
          language, 
          supportedFormats: ['ISO 639-1 (e.g., en, es, fr)', 'Common language codes'],
          examples: ['en', 'es', 'fr', 'de', 'en-US']
        }
      );
    }

    // Validate format
    const format = request.format || 'json';
    const supportedFormats: SupportedFormat[] = ['json', 'text', 'srt', 'vtt', 'fts'];
    if (!supportedFormats.includes(format as SupportedFormat)) {
      throw new TranscriptServiceError(
        'Invalid output format',
        400,
        'INVALID_FORMAT',
        { 
          format, 
          supportedFormats,
          defaultFormat: 'json'
        }
      );
    }

    return {
      video_url: request.video_url, // Keep original URL for backend processing
      language: language.toLowerCase(),
      format: format as SupportedFormat
    };
  }

  /**
   * Get supported output formats
   * 
   * @returns SupportedFormat[] - Array of supported output formats
   */
  getSupportedFormats(): SupportedFormat[] {
    return ['json', 'text', 'srt', 'vtt', 'fts'];
  }

  /**
   * Get supported language codes
   * 
   * @returns SupportedLanguage[] - Array of supported language codes
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi'];
  }

  /**
   * Check if a format is supported
   * 
   * @param format - Format to check
   * @returns boolean - True if format is supported
   */
  isFormatSupported(format: string): format is SupportedFormat {
    return this.getSupportedFormats().includes(format as SupportedFormat);
  }

  /**
   * Check if a language is supported
   * 
   * @param language - Language code to check
   * @returns boolean - True if language is supported
   */
  isLanguageSupported(language: string): language is SupportedLanguage {
    return this.validateLanguageCode(language);
  }

  /**
   * Generate a human-readable description of the request
   * Useful for logging and debugging
   * 
   * @param request - Transcript request
   * @returns string - Human-readable description
   */
  describeRequest(request: TranscriptRequest): string {
    try {
      const videoId = this.extractVideoId(request.video_url);
      return `Fetch ${request.format || 'json'} transcript for video ${videoId} in ${request.language || 'en'}`;
    } catch {
      return `Fetch transcript with invalid URL: ${request.video_url}`;
    }
  }
} 