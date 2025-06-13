/**
 * YouTube Transcript Fetcher Component
 * 
 * A comprehensive React component that provides a complete UI for fetching
 * YouTube video transcripts using the FastAPI backend service.
 * 
 * Features:
 * - YouTube URL input with real-time validation
 * - Language and format selection
 * - Loading states with progress indication
 * - Error handling with retry functionality
 * - Success state with transcript preview
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  transcriptService,
  transcriptServiceConfig,
  extractVideoId,
  validateYouTubeUrl,
  getSupportedLanguages,
  getSupportedFormats,
  type TranscriptRequest,
  type TranscriptResponse,
  type SupportedLanguage,
  type SupportedFormat
} from '@/lib/services';
import { TranscriptServiceError } from '@/lib/services';

// ============================================================================
// COMPONENT PROPS INTERFACE
// ============================================================================

/**
 * Props for the TranscriptFetcher component
 */
export interface TranscriptFetcherProps {
  // Callback functions
  /** Called when transcript is successfully fetched */
  onSuccess?: (response: TranscriptResponse, videoId: string) => void;
  /** Called when an error occurs during fetching */
  onError?: (error: TranscriptServiceError, videoId?: string) => void;
  /** Called when fetching starts */
  onStart?: (videoId: string, request: TranscriptRequest) => void;
  /** Called when fetching is cancelled */
  onCancel?: (videoId: string) => void;

  // UI customization
  /** Additional CSS classes for the component */
  className?: string;
  /** Whether to show advanced options (language, format) */
  showAdvancedOptions?: boolean;
  /** Custom title for the component */
  title?: string;
  /** Whether to show the component in compact mode */
  compact?: boolean;

  // Default values
  /** Default language for transcript requests */
  defaultLanguage?: SupportedLanguage;
  /** Default format for transcript requests */
  defaultFormat?: SupportedFormat;
  /** Default video URL to pre-populate */
  defaultVideoUrl?: string;

  // Feature flags
  /** Whether to enable retry functionality */
  enableRetry?: boolean;
  /** Whether to enable request cancellation */
  enableCancel?: boolean;
  /** Whether to show transcript preview on success */
  showPreview?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;

  // Styling options
  /** Custom styles for the container */
  containerStyle?: React.CSSProperties;
  /** Theme variant */
  variant?: 'default' | 'minimal' | 'card';
}

// ============================================================================
// COMPONENT STATE INTERFACES
// ============================================================================

/**
 * Form state for the transcript fetcher
 */
interface FormState {
  videoUrl: string;
  language: SupportedLanguage;
  format: SupportedFormat;
}

/**
 * Request status enum
 */
type RequestStatus = 'idle' | 'validating' | 'loading' | 'success' | 'error' | 'cancelled';

/**
 * Component state interface
 */
interface ComponentState {
  // Form data
  form: FormState;
  
  // Request status
  status: RequestStatus;
  
  // Results and errors
  result: TranscriptResponse | null;
  error: TranscriptServiceError | null;
  
  // Validation state
  isUrlValid: boolean;
  urlValidationMessage: string;
  
  // Request management
  abortController: AbortController | null;
  
  // Retry tracking
  retryCount: number;
  lastRequestTime: number;
}

// ============================================================================
// COMPONENT DEFAULT VALUES
// ============================================================================

/**
 * Default props for the component
 */
const DEFAULT_PROPS: Partial<TranscriptFetcherProps> = {
  showAdvancedOptions: true,
  title: 'YouTube Transcript Fetcher',
  compact: false,
  defaultLanguage: 'en',
  defaultFormat: 'json',
  enableRetry: true,
  enableCancel: true,
  showPreview: true,
  maxRetries: 3,
  variant: 'default',
};

/**
 * Initial form state
 */
const createInitialFormState = (props: TranscriptFetcherProps): FormState => ({
  videoUrl: props.defaultVideoUrl || '',
  language: props.defaultLanguage || 'en',
  format: props.defaultFormat || 'json',
});

/**
 * Initial component state
 */
const createInitialState = (props: TranscriptFetcherProps): ComponentState => ({
  form: createInitialFormState(props),
  status: 'idle',
  result: null,
  error: null,
  isUrlValid: false,
  urlValidationMessage: '',
  abortController: null,
  retryCount: 0,
  lastRequestTime: 0,
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * TranscriptFetcher Component
 * 
 * Provides a complete interface for fetching YouTube video transcripts
 * with validation, error handling, and progress indication.
 */
export const TranscriptFetcher: React.FC<TranscriptFetcherProps> = (props) => {
  // Merge props with defaults
  const config = { ...DEFAULT_PROPS, ...props };
  
  // Component state
  const [state, setState] = useState<ComponentState>(() => createInitialState(config));
  
  // Refs for component lifecycle
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // Supported options from API client
  const supportedLanguages = getSupportedLanguages();
  const supportedFormats = getSupportedFormats();

  // ============================================================================
  // STATE UPDATE HELPERS
  // ============================================================================

  /**
   * Safe state update that checks if component is still mounted
   */
  const safeSetState = useCallback((updater: (prev: ComponentState) => ComponentState) => {
    if (isMountedRef.current) {
      setState(updater);
    }
  }, []);

  /**
   * Update form field
   */
  const updateFormField = useCallback(<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    safeSetState(prev => ({
      ...prev,
      form: {
        ...prev.form,
        [field]: value
      }
    }));
  }, [safeSetState]);

  /**
   * Update request status
   */
  const updateStatus = useCallback((status: RequestStatus) => {
    safeSetState(prev => ({ ...prev, status }));
  }, [safeSetState]);

  /**
   * Update URL validation state
   */
  const updateUrlValidation = useCallback((isValid: boolean, message: string) => {
    safeSetState(prev => ({
      ...prev,
      isUrlValid: isValid,
      urlValidationMessage: message
    }));
  }, [safeSetState]);

  // ============================================================================
  // VALIDATION LOGIC
  // ============================================================================

  /**
   * Validate YouTube URL with debouncing
   */
  const validateUrl = useCallback((url: string) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set validation status
    updateStatus('validating');

    // Debounce validation
    timeoutRef.current = setTimeout(() => {
      try {
        if (!url.trim()) {
          updateUrlValidation(false, 'Please enter a YouTube URL');
          updateStatus('idle');
          return;
        }

        const isValid = validateYouTubeUrl(url);
        
        if (isValid) {
          const videoId = extractVideoId(url);
          updateUrlValidation(true, `Valid URL - Video ID: ${videoId}`);
        } else {
          updateUrlValidation(false, 'Invalid YouTube URL format');
        }
        
        updateStatus('idle');
      } catch (error) {
        updateUrlValidation(false, 'Invalid YouTube URL format');
        updateStatus('idle');
      }
    }, 300); // 300ms debounce
  }, [updateStatus, updateUrlValidation]);

  // ============================================================================
  // DISPLAY HELPER FUNCTIONS
  // ============================================================================

  /**
   * Get display name for language code
   */
  const getLanguageDisplayName = useCallback((lang: SupportedLanguage): string => {
    const languageNames: Record<SupportedLanguage, string> = {
      'en': 'English'
    };
    return languageNames[lang] || lang.toUpperCase();
  }, []);

  /**
   * Get display name for format
   */
  const getFormatDisplayName = useCallback((format: SupportedFormat): string => {
    const formatNames: Record<SupportedFormat, string> = {
      'json': 'JSON (Structured Data)',
      'text': 'Plain Text',
      'srt': 'SRT (SubRip Subtitle)',
      'vtt': 'VTT (WebVTT Subtitle)',
      'fts': 'FTS (Full-Text Search)'
    };
    return formatNames[format] || format.toUpperCase();
  }, []);

  /**
   * Get description for format
   */
  const getFormatDescription = useCallback((format: SupportedFormat): string => {
    const descriptions: Record<SupportedFormat, string> = {
      'json': 'Structured data with timestamps, speaker info, and metadata',
      'text': 'Simple text format with paragraph breaks',
      'srt': 'Standard subtitle format with timing codes',
      'vtt': 'Web-compatible subtitle format with styling support',
      'fts': 'Optimized for search indexing and full-text queries'
    };
    return descriptions[format] || 'Standard format';
  }, []);

  /**
   * Get example output for format
   */
  const getFormatExample = useCallback((format: SupportedFormat): string => {
    const examples: Record<SupportedFormat, string> = {
      'json': `{
  "segments": [
    {
      "start": 0.0,
      "end": 3.2,
      "text": "Welcome to this video tutorial",
      "speaker": "narrator"
    }
  ],
  "metadata": { "duration": 120.5, "language": "en" }
}`,
      'text': `Welcome to this video tutorial.

In today's session, we'll be covering the basics of...

Thank you for watching!`,
      'srt': `1
00:00:00,000 --> 00:00:03,200
Welcome to this video tutorial

2
00:00:03,200 --> 00:00:06,800
In today's session, we'll be covering...`,
      'vtt': `WEBVTT

00:00:00.000 --> 00:00:03.200
Welcome to this video tutorial

00:00:03.200 --> 00:00:06.800
In today's session, we'll be covering...`,
      'fts': `welcome video tutorial session covering basics thank watching`
    };
    return examples[format] || 'Example output';
  }, []);

  // ============================================================================
  // COMPONENT LIFECYCLE
  // ============================================================================

  /**
   * Cleanup on component unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      
      // Cancel any ongoing requests
      if (state.abortController) {
        state.abortController.abort();
      }
      
      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [state.abortController]);

  /**
   * Validate URL when it changes
   */
  useEffect(() => {
    if (state.form.videoUrl.trim()) {
      validateUrl(state.form.videoUrl);
    } else {
      updateUrlValidation(false, '');
    }
  }, [state.form.videoUrl, validateUrl, updateUrlValidation]);

  /**
   * Reset error when form changes
   */
  useEffect(() => {
    if (state.error && state.status === 'error') {
      setState(prev => ({
        ...prev,
        error: null,
        status: 'idle'
      }));
    }
  }, [state.form, state.error, state.status]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /**
   * Check if form is ready for submission
   */
  const isFormValid = state.isUrlValid && 
                     supportedLanguages.includes(state.form.language) &&
                     supportedFormats.includes(state.form.format);

  /**
   * Check if component is in a loading state
   */
  const isLoading = state.status === 'loading' || state.status === 'validating';

  /**
   * Check if retry is available
   */
  const canRetry = config.enableRetry && 
                   state.status === 'error' && 
                   state.error?.isRecoverable() &&
                   state.retryCount < (config.maxRetries || 3);

  /**
   * Check if request can be cancelled
   */
  const canCancel = config.enableCancel && 
                    state.status === 'loading' && 
                    state.abortController;

  // ============================================================================
  // API INTEGRATION FUNCTIONS
  // ============================================================================

  /**
   * Handle transcript fetch request
   */
  const handleFetchTranscript = useCallback(async () => {
    if (!state.isUrlValid || !isFormValid) {
      return;
    }

    try {
      // Extract video ID from URL
      const videoId = extractVideoId(state.form.videoUrl);
      
      // Create abort controller for cancellation
      const abortController = new AbortController();
      
      // Update state to loading
      safeSetState(prev => ({
        ...prev,
        status: 'loading',
        error: null,
        result: null,
        abortController,
        lastRequestTime: Date.now()
      }));

      // Call onStart callback
      if (config.onStart) {
        const request: TranscriptRequest = {
          video_url: state.form.videoUrl,
          language: state.form.language,
          format: state.form.format
        };
        config.onStart(videoId, request);
      }

      // Make the API request
      const response = await transcriptService.fetchTranscript({
        video_url: state.form.videoUrl,
        language: state.form.language,
        format: state.form.format
      }, {
        abortSignal: abortController.signal,
        timeout: transcriptServiceConfig.timeouts.transcript
      });

      // Success - update state
      safeSetState(prev => ({
        ...prev,
        status: 'success',
        result: response,
        error: null,
        abortController: null,
        retryCount: 0
      }));

      // Call onSuccess callback
      if (config.onSuccess) {
        config.onSuccess(response, videoId);
      }

    } catch (error) {
      // Handle cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        safeSetState(prev => ({
          ...prev,
          status: 'cancelled',
          abortController: null
        }));

        if (config.onCancel) {
          const videoId = extractVideoId(state.form.videoUrl);
          config.onCancel(videoId);
        }
        return;
      }

      // Handle other errors
      const transcriptError = error instanceof TranscriptServiceError 
        ? error 
        : new TranscriptServiceError(
            error instanceof Error ? error.message : 'Unknown error occurred',
            500
          );

      safeSetState(prev => ({
        ...prev,
        status: 'error',
        error: transcriptError,
        abortController: null
      }));

      // Call onError callback
      if (config.onError) {
        const videoId = extractVideoId(state.form.videoUrl);
        config.onError(transcriptError, videoId);
      }
    }
  }, [
    state.isUrlValid,
    state.form,
    isFormValid,
    safeSetState,
    config
  ]);

  /**
   * Handle request cancellation
   */
  const handleCancelRequest = useCallback(() => {
    if (state.abortController && state.status === 'loading') {
      state.abortController.abort();
      
      // Note: The abort will trigger the catch block in handleFetchTranscript
      // which will handle the state update and callback
    }
  }, [state.abortController, state.status]);

  /**
   * Handle retry request
   */
  const handleRetryRequest = useCallback(() => {
    if (!canRetry) {
      return;
    }

    // Increment retry count
    safeSetState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1,
      error: null
    }));

    // Add a small delay before retrying
    setTimeout(() => {
      handleFetchTranscript();
    }, 1000); // 1 second delay
  }, [canRetry, safeSetState, handleFetchTranscript]);

  /**
   * Reset component state
   */
  const handleReset = useCallback(() => {
    // Cancel any ongoing request
    if (state.abortController) {
      state.abortController.abort();
    }

    // Reset to initial state
    safeSetState(prev => ({
      ...prev,
      status: 'idle',
      result: null,
      error: null,
      abortController: null,
      retryCount: 0
    }));
  }, [state.abortController, safeSetState]);

  // ============================================================================
  // MAIN COMPONENT UI
  // ============================================================================

  return (
    <div className={`transcript-fetcher ${config.className || ''}`} style={config.containerStyle}>
      <div className={`
        ${config.variant === 'card' ? 'bg-white border border-gray-200 rounded-lg shadow-sm' : ''}
        ${config.variant === 'minimal' ? 'bg-transparent' : ''}
        ${config.variant === 'default' ? 'bg-white border border-gray-200 rounded-lg shadow-sm' : ''}
        ${config.compact ? 'p-4' : 'p-6'}
      `}>
        {/* Header */}
        {config.title && (
          <div className="mb-6">
            <h2 className={`font-semibold text-gray-900 ${config.compact ? 'text-lg' : 'text-xl'}`}>
              {config.title}
            </h2>
            {!config.compact && (
              <p className="text-sm text-gray-500 mt-1">
                Enter a YouTube video URL to fetch its transcript
              </p>
            )}
          </div>
        )}

        {/* YouTube URL Input Section */}
        <div className="space-y-4">
          {/* URL Input Field */}
          <div className="space-y-2">
            <label 
              htmlFor="youtube-url-input" 
              className="block text-sm font-medium text-gray-700"
            >
              YouTube Video URL
            </label>
            
            <div className="relative">
              <input
                id="youtube-url-input"
                type="url"
                value={state.form.videoUrl}
                onChange={(e) => updateFormField('videoUrl', e.target.value)}
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                className={`
                  block w-full px-4 py-3 text-sm border rounded-lg 
                  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2
                  transition-colors duration-200
                  ${state.status === 'validating' ? 
                    'border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500' : 
                    state.form.videoUrl && !state.isUrlValid ? 
                      'border-red-300 focus:ring-red-500 focus:border-red-500' :
                      state.isUrlValid ? 
                        'border-green-300 focus:ring-green-500 focus:border-green-500' :
                        'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }
                `}
                disabled={state.status === 'loading'}
                autoComplete="url"
                spellCheck={false}
              />
              
              {/* Input Status Icon */}
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                {state.status === 'validating' && (
                  <div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
                )}
                {state.form.videoUrl && state.status !== 'validating' && (
                  <>
                    {state.isUrlValid ? (
                      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Validation Message */}
          {(state.urlValidationMessage || state.status === 'validating') && (
            <div className={`
              flex items-start space-x-2 text-sm p-3 rounded-lg
              ${state.status === 'validating' ? 
                'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                state.isUrlValid ? 
                  'bg-green-50 text-green-800 border border-green-200' :
                  'bg-red-50 text-red-800 border border-red-200'
              }
            `}>
              <div className="flex-shrink-0 mt-0.5">
                {state.status === 'validating' ? (
                  <div className="animate-spin h-3 w-3 border border-yellow-600 border-t-transparent rounded-full"></div>
                ) : state.isUrlValid ? (
                  <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                {state.status === 'validating' ? (
                  <span>Validating URL...</span>
                ) : (
                  <span>{state.urlValidationMessage}</span>
                )}
              </div>
            </div>
          )}

          {/* Video Preview (when URL is valid) */}
          {state.isUrlValid && state.form.videoUrl && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-blue-900">
                    Valid YouTube Video
                  </h4>
                  <div className="mt-1 text-sm text-blue-700">
                    <div className="flex items-center space-x-4">
                      <span>
                        <span className="font-medium">Video ID:</span> {extractVideoId(state.form.videoUrl)}
                      </span>
                      <span className="text-blue-500">•</span>
                      <span>
                        <span className="font-medium">Ready for transcript</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* URL Format Help */}
          {!state.form.videoUrl && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Supported URL Formats:
              </h4>
              <div className="text-xs text-gray-600 space-y-1">
                <div>• https://www.youtube.com/watch?v=VIDEO_ID</div>
                <div>• https://youtu.be/VIDEO_ID</div>
                <div>• https://m.youtube.com/watch?v=VIDEO_ID</div>
                <div>• https://youtube.com/watch?v=VIDEO_ID</div>
              </div>
            </div>
          )}
        </div>

        {/* Language & Format Selection */}
        {config.showAdvancedOptions && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Transcript Options
              </h3>
              <div className="text-sm text-gray-500">
                English only • {supportedFormats.length} formats
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Language Selection - Simplified for English only */}
              <div className="space-y-2">
                <label 
                  htmlFor="language-select" 
                  className="block text-sm font-medium text-gray-700"
                >
                  Language
                </label>
                <div className="relative">
                  <select
                    id="language-select"
                    value={state.form.language}
                    onChange={(e) => updateFormField('language', e.target.value as SupportedLanguage)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                    disabled={true}
                  >
                    <option value="en">English (Only supported language)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-8 pointer-events-none">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Multi-language support coming in future updates
                </p>
              </div>

              {/* Format Selection */}
              <div className="space-y-2">
                <label 
                  htmlFor="format-select" 
                  className="block text-sm font-medium text-gray-700"
                >
                  Output Format
                </label>
                <select
                  id="format-select"
                  value={state.form.format}
                  onChange={(e) => updateFormField('format', e.target.value as SupportedFormat)}
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                  disabled={state.status === 'loading'}
                >
                  {supportedFormats.map(format => (
                    <option key={format} value={format}>
                      {getFormatDisplayName(format)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  {getFormatDescription(state.form.format)}
                </p>
              </div>
            </div>

            {/* Format Examples */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900">
                    {getFormatDisplayName(state.form.format)} Format
                  </h4>
                  <p className="mt-1 text-sm text-gray-600">
                    {getFormatDescription(state.form.format)}
                  </p>
                  <div className="mt-2">
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                        View example output
                      </summary>
                      <div className="mt-2 p-2 bg-white border rounded font-mono text-xs">
                        {getFormatExample(state.form.format)}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            {state.isUrlValid ? (
              <>
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Ready to fetch transcript</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Enter a valid YouTube URL to continue</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {canCancel && (
              <button
                type="button"
                onClick={handleCancelRequest}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
                disabled={state.status !== 'loading'}
              >
                Cancel
              </button>
            )}
            
            <button
              type="button"
              onClick={handleFetchTranscript}
              disabled={!isFormValid || state.status === 'loading' || state.status === 'validating'}
              className={`
                px-6 py-2 text-sm font-medium rounded-lg transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${isFormValid && state.status === 'idle' ? 
                  'text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' :
                  'text-gray-400 bg-gray-100 cursor-not-allowed'
                }
              `}
            >
              {state.status === 'loading' ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Fetching...</span>
                </div>
              ) : state.status === 'validating' ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                  <span>Validating...</span>
                </div>
              ) : (
                'Fetch Transcript'
              )}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {state.status === 'error' && state.error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-red-900">
                  Error Fetching Transcript
                </h4>
                <p className="mt-1 text-sm text-red-800">
                  {state.error.getUserMessage()}
                </p>
                {state.error.details && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-700 cursor-pointer hover:text-red-900">
                      Technical details
                    </summary>
                    <pre className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded overflow-auto">
                      {JSON.stringify(state.error.details, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="mt-4 flex items-center space-x-3">
                  {canRetry && (
                    <button
                      type="button"
                      onClick={handleRetryRequest}
                      className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                    >
                      Retry ({state.retryCount}/{config.maxRetries})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Result Display */}
        {state.status === 'success' && state.result && config.showPreview && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-green-900">
                  Transcript Fetched Successfully
                </h4>
                <div className="mt-2 text-sm text-green-800">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">Video ID:</span> {state.result.video_id}
                    </div>
                    <div>
                      <span className="font-medium">Language:</span> {state.result.language}
                    </div>
                    <div>
                      <span className="font-medium">Format:</span> {state.result.format}
                    </div>
                    <div>
                      <span className="font-medium">Segments:</span> {state.result.segment_count}
                    </div>
                    {state.result.total_duration && (
                      <div>
                        <span className="font-medium">Duration:</span> {Math.round(state.result.total_duration)}s
                      </div>
                    )}
                    {state.result.processing_time_ms && (
                      <div>
                        <span className="font-medium">Processing:</span> {state.result.processing_time_ms}ms
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Transcript Preview */}
                <div className="mt-4">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-green-700 hover:text-green-900 font-medium">
                      Preview transcript ({state.result.transcript.length} segments)
                    </summary>
                    <div className="mt-2 max-h-60 overflow-auto bg-white border rounded p-3">
                      {state.form.format === 'json' ? (
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(state.result, null, 2)}
                        </pre>
                      ) : (
                        <div className="text-sm text-gray-800 space-y-2">
                          {state.result.transcript.slice(0, 5).map((segment, index) => (
                            <div key={index} className="border-l-2 border-green-300 pl-3">
                              <div className="text-xs text-gray-500">
                                {segment.start}s - {segment.start + segment.duration}s
                              </div>
                              <div>{segment.text}</div>
                            </div>
                          ))}
                          {state.result.transcript.length > 5 && (
                            <div className="text-xs text-gray-500 italic">
                              ... and {state.result.transcript.length - 5} more segments
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-sm font-medium text-green-600 hover:text-green-700"
                  >
                    Fetch Another Transcript
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Debug Info (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">Debug Information</summary>
              <div className="mt-2 space-y-1 font-mono bg-gray-50 p-2 rounded">
                <div>Status: {state.status}</div>
                <div>URL Valid: {state.isUrlValid ? 'Yes' : 'No'}</div>
                <div>Form Valid: {isFormValid ? 'Yes' : 'No'}</div>
                <div>Supported Languages: {supportedLanguages.length}</div>
                <div>Supported Formats: {supportedFormats.length}</div>
                <div>Retry Count: {state.retryCount}</div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Default export
 */
export default TranscriptFetcher; 