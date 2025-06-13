/**
 * Transcript Components Module
 * 
 * Exports all transcript-related React components for the YouTube Transcript Service.
 * This module provides components for fetching, displaying, and managing YouTube video transcripts.
 */

// Core transcript fetcher component
export { 
  TranscriptFetcher,
  type TranscriptFetcherProps,
  default as TranscriptFetcherComponent 
} from './TranscriptFetcher';

// Re-export types from the API client for convenience
export type {
  TranscriptRequest,
  TranscriptResponse,
  TranscriptSegment,
  SupportedLanguage,
  SupportedFormat,
  TranscriptServiceError,
  LanguageInfo,
  ErrorResponse,
  HealthResponse
} from '@/lib/services'; 