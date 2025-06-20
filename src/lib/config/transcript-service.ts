/**
 * Configuration for YouTube Transcript Service
 * 
 * This configuration module loads environment variables and provides
 * typed configuration objects for the transcript API client.
 */

import { ApiClientConfig, SupportedFormat, SupportedLanguage } from '../../types/transcript-service';

/**
 * Load environment variables with fallbacks
 */
const getEnvVar = (key: string, defaultValue: string): string => {
  if (typeof window !== 'undefined') {
    // Client-side: only access NEXT_PUBLIC_ variables
    return (window as any).process?.env?.[key] || 
           (process as any).env?.[key] || 
           defaultValue;
  }
  // Server-side: access all environment variables
  return process.env[key] || defaultValue;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = getEnvVar(key, String(defaultValue));
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = getEnvVar(key, String(defaultValue));
  return value.toLowerCase() === 'true';
};

/**
 * Transcript Service Configuration Object
 */
export const transcriptServiceConfig = {
  // Core API configuration
  api: {
    baseUrl: getEnvVar('NEXT_PUBLIC_TRANSCRIPT_SERVICE_URL', 'http://localhost:6000'),
    timeout: getEnvNumber('TRANSCRIPT_SERVICE_TIMEOUT', 30000),
    retryAttempts: getEnvNumber('TRANSCRIPT_SERVICE_RETRY_ATTEMPTS', 3),
    retryDelay: getEnvNumber('TRANSCRIPT_SERVICE_RETRY_DELAY', 1000),
    maxRetryDelay: getEnvNumber('TRANSCRIPT_SERVICE_MAX_RETRY_DELAY', 10000),
    exponentialBackoff: getEnvBoolean('TRANSCRIPT_SERVICE_EXPONENTIAL_BACKOFF', true),
  },

  // Specific timeouts for different operations
  timeouts: {
    health: getEnvNumber('TRANSCRIPT_SERVICE_HEALTH_TIMEOUT', 10000),
    connectionTest: getEnvNumber('TRANSCRIPT_SERVICE_CONNECTION_TEST_TIMEOUT', 15000),
    transcript: getEnvNumber('TRANSCRIPT_SERVICE_TIMEOUT', 30000),
    languages: getEnvNumber('TRANSCRIPT_SERVICE_TIMEOUT', 30000),
  },

  // Default values
  defaults: {
    language: getEnvVar('TRANSCRIPT_SERVICE_DEFAULT_LANGUAGE', 'en') as SupportedLanguage,
    format: getEnvVar('TRANSCRIPT_SERVICE_DEFAULT_FORMAT', 'json') as SupportedFormat,
  },

  // Feature flags
  features: {
    debug: getEnvBoolean('TRANSCRIPT_SERVICE_DEBUG', false),
    retryEnabled: true,
    healthCheckEnabled: true,
    connectionTestEnabled: true,
  },

  // API endpoints
  endpoints: {
    fetchTranscript: '/transcript/fetch',
    getLanguages: '/transcript/languages',
    health: '/health',
    info: '/info',
  },

  // Supported formats and languages
  supported: {
    formats: ['json', 'text', 'srt', 'vtt', 'fts'] as const,
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi'] as const,
  },

  // Validation patterns
  validation: {
    videoIdPattern: /^[a-zA-Z0-9_-]{11}$/,
    languagePattern: /^[a-z]{2}(-[a-z]{2})?$/i,
    urlPatterns: [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/.*[?&]v=)([a-zA-Z0-9_-]{11})/
    ],
  },

  // Error codes that should trigger retries
  retryableErrorCodes: [429, 500, 502, 503, 504],

  // Error codes that indicate permanent failures (no retry)
  permanentErrorCodes: [400, 401, 403, 404, 422],
} as const;

/**
 * Generate API client configuration from environment
 */
export function getApiClientConfig(overrides?: Partial<ApiClientConfig>): ApiClientConfig {
  return {
    baseUrl: transcriptServiceConfig.api.baseUrl,
    timeout: transcriptServiceConfig.api.timeout,
    retryAttempts: transcriptServiceConfig.api.retryAttempts,
    retryDelay: transcriptServiceConfig.api.retryDelay,
    exponentialBackoff: transcriptServiceConfig.api.exponentialBackoff,
    maxRetryDelay: transcriptServiceConfig.api.maxRetryDelay,
    ...overrides,
  };
}

/**
 * Validate configuration on startup
 */
export function validateConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate base URL
  try {
    new URL(transcriptServiceConfig.api.baseUrl);
  } catch {
    errors.push('Invalid NEXT_PUBLIC_TRANSCRIPT_SERVICE_URL: must be a valid URL');
  }

  // Validate timeouts
  if (transcriptServiceConfig.api.timeout <= 0) {
    errors.push('TRANSCRIPT_SERVICE_TIMEOUT must be positive');
  }

  if (transcriptServiceConfig.api.retryAttempts < 0) {
    errors.push('TRANSCRIPT_SERVICE_RETRY_ATTEMPTS must be non-negative');
  }

  if (transcriptServiceConfig.api.retryDelay < 0) {
    errors.push('TRANSCRIPT_SERVICE_RETRY_DELAY must be non-negative');
  }

  // Validate default language
  if (!transcriptServiceConfig.supported.languages.includes(transcriptServiceConfig.defaults.language)) {
    errors.push(`Invalid TRANSCRIPT_SERVICE_DEFAULT_LANGUAGE: ${transcriptServiceConfig.defaults.language}`);
  }

  // Validate default format
  if (!transcriptServiceConfig.supported.formats.includes(transcriptServiceConfig.defaults.format)) {
    errors.push(`Invalid TRANSCRIPT_SERVICE_DEFAULT_FORMAT: ${transcriptServiceConfig.defaults.format}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration summary for debugging
 */
export function getConfigurationSummary(): Record<string, any> {
  return {
    baseUrl: transcriptServiceConfig.api.baseUrl,
    timeout: `${transcriptServiceConfig.api.timeout}ms`,
    retryAttempts: transcriptServiceConfig.api.retryAttempts,
    retryDelay: `${transcriptServiceConfig.api.retryDelay}ms`,
    exponentialBackoff: transcriptServiceConfig.api.exponentialBackoff,
    defaultLanguage: transcriptServiceConfig.defaults.language,
    defaultFormat: transcriptServiceConfig.defaults.format,
    debugEnabled: transcriptServiceConfig.features.debug,
    supportedFormats: transcriptServiceConfig.supported.formats,
    supportedLanguages: transcriptServiceConfig.supported.languages.length,
  };
}

/**
 * Type exports for convenience
 */
export type TranscriptServiceConfig = typeof transcriptServiceConfig;
export type SupportedFormats = typeof transcriptServiceConfig.supported.formats[number];
export type SupportedLanguages = typeof transcriptServiceConfig.supported.languages[number]; 