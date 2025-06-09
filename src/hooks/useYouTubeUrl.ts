import { useState, useCallback } from 'react'
import { YouTubeUrlParser } from '@/lib/utils/youtube-url-parser'

interface YouTubeUrlState {
  isProcessing: boolean
  result: {
    isValid: boolean
    videoId: string | null
    originalUrl: string
    parsedUrl?: string
    metadata?: {
      timestamp?: number
      playlist?: string
      format: 'standard' | 'short' | 'embed' | 'mobile'
    }
  } | null
  error: string | null
}

interface UseYouTubeUrlReturn {
  state: YouTubeUrlState
  validateUrl: (url: string, useServer?: boolean) => Promise<void>
  clearResult: () => void
}

export function useYouTubeUrl(): UseYouTubeUrlReturn {
  const [state, setState] = useState<YouTubeUrlState>({
    isProcessing: false,
    result: null,
    error: null
  })

  const validateUrl = useCallback(async (url: string, useServer = false) => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }))

    try {
      if (useServer) {
        // Server-side validation via API
        const response = await fetch('/api/youtube/url/parse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to validate URL')
        }

        if (!data.success) {
          throw new Error(data.error || 'URL validation failed')
        }

        setState({
          isProcessing: false,
          result: data.result,
          error: null
        })
      } else {
        // Client-side validation
        const result = YouTubeUrlParser.parseUrl(url)
        
        setState({
          isProcessing: false,
          result,
          error: result.isValid ? null : (result.error || 'Invalid YouTube URL')
        })
      }
    } catch (error) {
      console.error('YouTube URL validation error:', error)
      setState({
        isProcessing: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    }
  }, [])

  const clearResult = useCallback(() => {
    setState({
      isProcessing: false,
      result: null,
      error: null
    })
  }, [])

  return {
    state,
    validateUrl,
    clearResult
  }
}

// Convenience functions for direct use
export const parseYouTubeUrlClient = (url: string) => YouTubeUrlParser.parseUrl(url)

export const parseYouTubeUrlServer = async (url: string) => {
  const response = await fetch('/api/youtube/url/parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  })

  const data = await response.json()
  
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to parse URL')
  }

  return data.result
} 