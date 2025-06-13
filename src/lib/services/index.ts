/**
 * Service Layer Exports
 * 
 * This module provides a centralized export for all transcript service
 * components including the API client, configuration, and types.
 */

import { TranscriptApiClient } from './transcript-api-client';
import { 
  transcriptServiceConfig,
  getApiClientConfig,
  validateConfiguration,
  getConfigurationSummary
} from '../config/transcript-service';
import type { 
  ApiClientConfig, 
  SupportedFormat, 
  SupportedLanguage,
  HealthResponse 
} from '../../types/transcript-service';

// Core API Client
export { TranscriptApiClient } from './transcript-api-client';

// Configuration
export { 
  transcriptServiceConfig,
  getApiClientConfig,
  validateConfiguration,
  getConfigurationSummary
} from '../config/transcript-service';

// Types
export type {
  TranscriptRequest,
  TranscriptResponse,
  TranscriptSegment,
  LanguageInfo,
  LanguagesResponse,
  HealthResponse,
  ErrorResponse,
  ApiClientConfig,
  RequestOptions,
  SupportedFormat,
  SupportedLanguage,
  HealthStatus
} from '../../types/transcript-service';

// Configuration types
export type {
  TranscriptServiceConfig,
  SupportedFormats,
  SupportedLanguages
} from '../config/transcript-service';

// Re-export the error class (only once)
export { TranscriptServiceError } from '../../types/transcript-service';

/**
 * Default Transcript Service Instance
 * 
 * Pre-configured instance using environment variables.
 * This is the recommended way to use the service.
 * 
 * @example
 * ```typescript
 * import { transcriptService } from '@/lib/services';
 * 
 * const response = await transcriptService.fetchTranscript({
 *   video_url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
 *   language: 'en',
 *   format: 'json'
 * });
 * ```
 */
export const transcriptService = new TranscriptApiClient(getApiClientConfig());

/**
 * Create a custom transcript service instance
 * 
 * @param config - Custom configuration overrides
 * @returns TranscriptApiClient - New instance with custom config
 * 
 * @example
 * ```typescript
 * import { createTranscriptService } from '@/lib/services';
 * 
 * const customService = createTranscriptService({
 *   baseUrl: 'https://my-custom-service.com',
 *   timeout: 60000,
 *   retryAttempts: 5
 * });
 * ```
 */
export function createTranscriptService(config?: Partial<ApiClientConfig>): TranscriptApiClient {
  return new TranscriptApiClient(getApiClientConfig(config));
}

/**
 * Validate the service configuration and log any issues
 * 
 * @returns boolean - True if configuration is valid
 * 
 * @example
 * ```typescript
 * import { validateServiceConfiguration } from '@/lib/services';
 * 
 * if (!validateServiceConfiguration()) {
 *   console.error('Transcript service configuration is invalid');
 * }
 * ```
 */
export function validateServiceConfiguration(): boolean {
  const validation = validateConfiguration();
  
  if (!validation.valid) {
    console.error('❌ Transcript Service Configuration Errors:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    return false;
  }
  
  if (transcriptServiceConfig.features.debug) {
    console.log('✅ Transcript Service Configuration:');
    const summary = getConfigurationSummary();
    Object.entries(summary).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
  
  return true;
}

/**
 * Test the transcript service connection
 * 
 * @returns Promise<boolean> - True if connection is successful
 * 
 * @example
 * ```typescript
 * import { testServiceConnection } from '@/lib/services';
 * 
 * const isConnected = await testServiceConnection();
 * if (!isConnected) {
 *   console.error('Cannot connect to transcript service');
 * }
 * ```
 */
export async function testServiceConnection(): Promise<boolean> {
  try {
    const result = await transcriptService.testConnection({
      timeout: transcriptServiceConfig.timeouts.connectionTest
    });
    
    if (transcriptServiceConfig.features.debug) {
      console.log('✅ Transcript Service Connection Test:');
      console.log(`  Status: ${result.health.status}`);
      console.log(`  Service: ${result.health.service} v${result.health.version}`);
      console.log(`  Environment: ${result.health.environment}`);
      console.log(`  Connection Time: ${result.connectionTime}ms`);
    }
    
    return result.health.status === 'healthy';
  } catch (error) {
    if (transcriptServiceConfig.features.debug) {
      console.error('❌ Transcript Service Connection Failed:', error);
    }
    return false;
  }
}

/**
 * Get service health status
 * 
 * @returns Promise<HealthResponse | null> - Health response or null if failed
 */
export async function getServiceHealth(): Promise<HealthResponse | null> {
  try {
    return await transcriptService.checkHealth({
      timeout: transcriptServiceConfig.timeouts.health
    });
  } catch (error) {
    if (transcriptServiceConfig.features.debug) {
      console.error('❌ Health check failed:', error);
    }
    return null;
  }
}

/**
 * Utility function to extract video ID from YouTube URL
 * 
 * @param url - YouTube URL or video ID
 * @returns string - Extracted video ID
 * 
 * @example
 * ```typescript
 * import { extractVideoId } from '@/lib/services';
 * 
 * const videoId = extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ');
 * console.log(videoId); // 'dQw4w9WgXcQ'
 * ```
 */
export function extractVideoId(url: string): string {
  return transcriptService.extractVideoId(url);
}

/**
 * Utility function to validate YouTube URL
 * 
 * @param url - YouTube URL or video ID to validate
 * @returns boolean - True if valid
 */
export function validateYouTubeUrl(url: string): boolean {
  return transcriptService.validateVideoUrl(url);
}

/**
 * Get supported transcript formats
 * 
 * @returns SupportedFormat[] - Array of supported formats
 */
export function getSupportedFormats(): SupportedFormat[] {
  return transcriptService.getSupportedFormats();
}

/**
 * Get supported languages
 * 
 * @returns SupportedLanguage[] - Array of supported languages
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return transcriptService.getSupportedLanguages();
} 