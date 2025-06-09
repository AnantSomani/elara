'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import UrlInput from '@/components/UrlInput'

export default function LandingPage() {
  const [urlInput, setUrlInput] = useState('')
  const [isProcessingUrl, setIsProcessingUrl] = useState(false)
  const router = useRouter()



  const handleUrlSubmit = async (videoId: string, originalUrl?: string) => {
    setIsProcessingUrl(true)
    try {
      if (originalUrl) {
        // Enhanced URL processing with backend validation
        const response = await fetch('/api/youtube/url/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: originalUrl })
        })

        const data = await response.json()
        
        if (data.success && data.result.isValid) {
          // Navigate with enhanced metadata
          const queryParams = new URLSearchParams({
            url: encodeURIComponent(originalUrl),
            parsed: encodeURIComponent(data.result.parsedUrl || ''),
            format: data.result.metadata?.format || 'standard'
          })
          
          // Add timestamp if available for auto-seeking
          if (data.result.metadata?.timestamp) {
            queryParams.set('t', data.result.metadata.timestamp.toString())
          }
          
          console.log(`🎯 Enhanced navigation: ${videoId} with metadata`, data.result.metadata)
          router.push(`/video/${videoId}?${queryParams.toString()}`)
        } else {
          // Fallback to basic navigation
          console.log(`⚠️ Basic navigation fallback for: ${videoId}`)
          router.push(`/video/${videoId}`)
        }
      } else {
        // Direct navigation without URL processing
        router.push(`/video/${videoId}`)
      }
    } catch (error) {
      console.error('Error processing URL:', error)
      // Always fallback to basic navigation
      router.push(`/video/${videoId}`)
    } finally {
      setIsProcessingUrl(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white">
      {/* Main content */}
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        {/* Logo/Title */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-slate-900 mb-4">
            <span className="text-purple-600">Elara</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl">
            Your AI conversational assistant for YouTube videos. Paste any YouTube URL to get started with intelligent video analysis and chat.
          </p>
        </div>

        {/* URL Input Section */}
        <div className="w-full max-w-3xl relative">
          <UrlInput
            value={urlInput}
            onChange={setUrlInput}
            onSubmit={handleUrlSubmit}
            placeholder="Paste a YouTube URL to access the video directly"
            isLoading={isProcessingUrl}
          />
          
          {/* Info Box */}
          <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200">
            <h3 className="text-lg font-semibold text-purple-900 mb-3 flex items-center">
              🎯 Direct YouTube Access
            </h3>
            <div className="space-y-2 text-sm text-purple-700">
              <p>✅ Paste any YouTube URL to instantly access the video</p>
              <p>✅ AI-powered video analysis and intelligent conversations</p>
              <p>✅ No quota limits - works with any video instantly</p>
              <p>✅ Supports timestamps and enhanced metadata</p>
            </div>
          </div>

          {/* Development Notice */}
          <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <h4 className="text-sm font-medium text-amber-900 mb-1">
              🔧 Development Mode
            </h4>
            <p className="text-xs text-amber-700">
              Search functionality temporarily disabled to preserve API quota during development.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 