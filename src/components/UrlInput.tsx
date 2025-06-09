'use client'

import { useState, useEffect } from 'react'
import { LinkIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { YouTubeUrlParser } from '@/lib/utils/youtube-url-parser'

interface UrlInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (videoId: string, originalUrl?: string) => void
  placeholder?: string
  isLoading?: boolean
}

interface ValidationResult {
  isValid: boolean
  videoId: string | null
  error?: string
}

export default function UrlInput({ value, onChange, onSubmit, placeholder, isLoading }: UrlInputProps) {
  const [validation, setValidation] = useState<ValidationResult>({ isValid: false, videoId: null })

  // Use the enhanced YouTube URL parser
  const validateYouTubeUrl = (url: string): ValidationResult => {
    if (!url.trim()) {
      return { isValid: false, videoId: null }
    }

    const result = YouTubeUrlParser.parseUrl(url)
    
    return {
      isValid: result.isValid,
      videoId: result.videoId,
      error: result.error
    }
  }

  // Validate URL in real-time
  useEffect(() => {
    const result = validateYouTubeUrl(value)
    setValidation(result)
  }, [value])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && validation.isValid && validation.videoId) {
      onSubmit(validation.videoId, value)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    onChange(pastedText)
    
    // Auto-submit on paste if valid
    const result = validateYouTubeUrl(pastedText)
    if (result.isValid && result.videoId) {
      setTimeout(() => onSubmit(result.videoId!, pastedText), 100)
    }
  }

  const getValidationIcon = () => {
    if (!value.trim()) return null
    
    if (isLoading) {
      return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
    }
    
    if (validation.isValid) {
      return <CheckCircleIcon className="w-5 h-5 text-green-500" />
    } else {
      return <XCircleIcon className="w-5 h-5 text-red-500" />
    }
  }

  const getBorderColor = () => {
    if (!value.trim()) return 'border-slate-300 focus:border-purple-500'
    if (validation.isValid) return 'border-green-300 focus:border-green-500'
    return 'border-red-300 focus:border-red-500'
  }

  return (
    <div className="relative">
      <div className="relative">
        <LinkIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
        
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          placeholder={placeholder || "Paste a YouTube URL (e.g., https://youtu.be/VIDEO_ID)"}
          disabled={isLoading}
          className={`
            w-full pl-12 pr-12 py-4 text-lg rounded-xl border-2 transition-all duration-200
            ${getBorderColor()}
            disabled:bg-slate-50 disabled:cursor-not-allowed
            placeholder:text-slate-400
            focus:outline-none focus:ring-4 focus:ring-purple-100
          `}
        />
        
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
          {getValidationIcon()}
        </div>
      </div>

      {/* Validation Message */}
      {value.trim() && (
        <div className="mt-2 px-1">
          {validation.isValid ? (
            <p className="text-sm text-green-600 flex items-center">
              <CheckCircleIcon className="w-4 h-4 mr-1" />
              Valid YouTube URL • Video ID: {validation.videoId}
            </p>
          ) : validation.error ? (
            <p className="text-sm text-red-600 flex items-center">
              <XCircleIcon className="w-4 h-4 mr-1" />
              {validation.error}
            </p>
          ) : null}
        </div>
      )}

      {/* Supported Formats Help */}
      {!value.trim() && (
        <div className="mt-2 text-xs text-slate-500">
          <p className="mb-1">Supported formats:</p>
          <ul className="space-y-1 pl-4">
            <li>• youtube.com/watch?v=VIDEO_ID</li>
            <li>• youtu.be/VIDEO_ID</li>
            <li>• m.youtube.com/watch?v=VIDEO_ID</li>
          </ul>
        </div>
      )}
    </div>
  )
} 