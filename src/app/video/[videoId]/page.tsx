'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { PlayIcon, CalendarIcon, EyeIcon, ClockIcon, ChatBubbleLeftRightIcon, LinkIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

interface VideoDetails {
  id: string
  title: string
  description: string
  channelTitle: string
  channelId: string
  duration: string
  viewCount: number
  publishedAt: string
  thumbnails: {
    default: string
    medium: string
    high: string
    maxres?: string
  }
  tags?: string[]
}

interface UrlMetadata {
  originalUrl?: string
  parsedUrl?: string
  format?: string
  timestamp?: number
  isEnhanced?: boolean
}

export default function VideoPage() {
  const [video, setVideo] = useState<VideoDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [urlMetadata, setUrlMetadata] = useState<UrlMetadata>({})
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const videoId = params.videoId as string

  useEffect(() => {
    if (videoId) {
      parseUrlParameters()
      loadVideoDetails()
    }
  }, [videoId, searchParams])

  const parseUrlParameters = async () => {
    // Extract URL parameters
    const timestamp = searchParams.get('t')
    const originalUrl = searchParams.get('url')
    const format = searchParams.get('format')
    const parsedUrl = searchParams.get('parsed')

    let enhancedMetadata: UrlMetadata = {
      originalUrl: originalUrl || undefined,
      parsedUrl: parsedUrl || undefined,
      format: format || undefined,
      timestamp: timestamp ? parseInt(timestamp) : undefined,
      isEnhanced: !!(originalUrl || format || timestamp)
    }

    // If we have an original URL but no format info, parse it
    if (originalUrl && !format) {
      try {
        const response = await fetch('/api/youtube/url/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: originalUrl })
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.result.isValid) {
            enhancedMetadata = {
              ...enhancedMetadata,
              parsedUrl: data.result.parsedUrl,
              format: data.result.metadata?.format,
              timestamp: data.result.metadata?.timestamp || enhancedMetadata.timestamp,
              isEnhanced: true
            }
          }
        }
      } catch (error) {
        console.log('URL parsing failed, using basic metadata:', error)
      }
    }

    setUrlMetadata(enhancedMetadata)
  }

  const loadVideoDetails = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/youtube/video/${videoId}`)
      if (response.ok) {
        const data = await response.json()
        setVideo(data.video)
      } else {
        // API failed (likely quota exceeded), create fallback video object
        console.log('YouTube API unavailable, using fallback data')
        setVideo({
          id: videoId,
          title: 'YouTube Video',
          description: 'Video details unavailable due to API quota limits. You can still watch the video and use AI chat functionality.',
          channelTitle: 'Unknown Channel',
          channelId: '',
          duration: 'Unknown',
          viewCount: 0,
          publishedAt: new Date().toISOString(),
          thumbnails: {
            default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
            medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          },
          tags: []
        })
      }
    } catch (error) {
      console.error('Error loading video:', error)
      // Create fallback video object even on network errors
      setVideo({
        id: videoId,
        title: 'YouTube Video',
        description: 'Video details unavailable. You can still watch the video below.',
        channelTitle: 'Unknown Channel',
        channelId: '',
        duration: 'Unknown',
        viewCount: 0,
        publishedAt: new Date().toISOString(),
        thumbnails: {
          default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
          medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        },
        tags: []
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Build enhanced YouTube embed URL with auto-seek
  const getEmbedUrl = () => {
    let embedUrl = `https://www.youtube.com/embed/${videoId}`
    const params = new URLSearchParams()
    
    // Add auto-seek if timestamp available
    if (urlMetadata.timestamp) {
      params.set('start', urlMetadata.timestamp.toString())
    }
    
    // Enhanced player parameters
    params.set('rel', '0') // Don't show related videos
    params.set('modestbranding', '1') // Reduce YouTube branding
    
    return embedUrl + (params.toString() ? `?${params.toString()}` : '')
  }

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`
    return `${count} views`
  }

  const formatDuration = (duration: string) => {
    // Convert ISO 8601 duration (PT1H2M3S) to readable format
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return duration
    
    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }
  }

  const formatTimestamp = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const startAIChat = () => {
    router.push(`/chat/video/${videoId}`)
  }

  const visitChannel = () => {
    router.push(`/channel/${video?.channelId}`)
  }

  const getFormatDisplayName = (format?: string) => {
    switch (format) {
      case 'short': return 'Short URL (youtu.be)'
      case 'standard': return 'Standard URL'
      case 'mobile': return 'Mobile URL'
      case 'embed': return 'Embed URL'
      default: return 'Direct Link'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading video...</p>
          {urlMetadata.timestamp && (
            <p className="text-sm text-slate-500 mt-2">
              Will start at {formatTimestamp(urlMetadata.timestamp)}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Video Not Found</h1>
          <p className="text-slate-600 mb-6">{error || 'The video you\'re looking for doesn\'t exist or couldn\'t be loaded.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="text-purple-600 hover:text-purple-700 inline-flex items-center"
            >
              ← Back to Home
            </button>
            
            {/* URL Info Banner */}
            {urlMetadata.isEnhanced && (
              <div className="flex items-center space-x-2 text-sm">
                <LinkIcon className="w-4 h-4 text-green-600" />
                <span className="text-green-700 font-medium">
                  {getFormatDisplayName(urlMetadata.format)}
                  {urlMetadata.timestamp && ` • Starts at ${formatTimestamp(urlMetadata.timestamp)}`}
                </span>
                <button
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <InformationCircleIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* Debug Info */}
          {showDebugInfo && urlMetadata.isEnhanced && (
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs">
              <div className="grid grid-cols-2 gap-2">
                {urlMetadata.originalUrl && (
                  <div>
                    <span className="font-medium">Original:</span> {urlMetadata.originalUrl}
                  </div>
                )}
                {urlMetadata.format && (
                  <div>
                    <span className="font-medium">Format:</span> {urlMetadata.format}
                  </div>
                )}
                {urlMetadata.timestamp && (
                  <div>
                    <span className="font-medium">Timestamp:</span> {urlMetadata.timestamp}s
                  </div>
                )}
                {urlMetadata.parsedUrl && (
                  <div>
                    <span className="font-medium">Parsed:</span> {urlMetadata.parsedUrl}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Player & Info */}
          <div className="lg:col-span-2">
            {/* Enhanced Video Player */}
            <div className="bg-black rounded-lg overflow-hidden mb-6 aspect-video relative">
              <iframe
                width="100%"
                height="100%"
                src={getEmbedUrl()}
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              ></iframe>
              
              {/* Timestamp Indicator */}
              {urlMetadata.timestamp && (
                <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm">
                  Started at {formatTimestamp(urlMetadata.timestamp)}
                </div>
              )}
            </div>

            {/* Video Info */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h1 className="text-2xl font-bold text-slate-900 mb-4">
                {video.title}
              </h1>

              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={visitChannel}
                  className="text-lg font-semibold text-purple-600 hover:text-purple-700 transition-colors"
                >
                  {video.channelTitle}
                </button>
                
                <div className="flex items-center space-x-4 text-sm text-slate-500">
                  <div className="flex items-center">
                    <EyeIcon className="w-4 h-4 mr-1" />
                    {formatViewCount(video.viewCount)}
                  </div>
                  <div className="flex items-center">
                    <ClockIcon className="w-4 h-4 mr-1" />
                    {formatDuration(video.duration)}
                  </div>
                  <div className="flex items-center">
                    <CalendarIcon className="w-4 h-4 mr-1" />
                    {formatDate(video.publishedAt)}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="prose prose-slate max-w-none">
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {video.description}
                </p>
              </div>

              {/* Tags */}
              {video.tags && video.tags.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {video.tags.slice(0, 10).map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                🤖 Chat with Elara
              </h2>
              <p className="text-slate-600 mb-4">
                Have an AI conversation about this video with Elara. Ask questions, get insights, and dive deeper into the content.
              </p>
              
              <button
                onClick={startAIChat}
                className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                <ChatBubbleLeftRightIcon className="w-5 h-5 mr-2" />
                Start AI Chat
              </button>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-sm font-medium text-slate-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={visitChannel}
                    className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
                    disabled={!video.channelId}
                  >
                    Visit {video.channelTitle}
                  </button>
                  <a
                    href={urlMetadata.originalUrl || `https://youtube.com/watch?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
                  >
                    Open on YouTube
                  </a>
                  {urlMetadata.timestamp && (
                    <a
                      href={`https://youtube.com/watch?v=${videoId}&t=${urlMetadata.timestamp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
                    >
                      Open at {formatTimestamp(urlMetadata.timestamp)} on YouTube
                    </a>
                  )}
                </div>
              </div>

              {/* URL Source Info */}
              {urlMetadata.isEnhanced && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">URL Information</h3>
                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-center">
                      <LinkIcon className="w-3 h-3 mr-2 text-green-600" />
                      {getFormatDisplayName(urlMetadata.format)}
                    </div>
                    {urlMetadata.timestamp && (
                      <div className="flex items-center">
                        <ClockIcon className="w-3 h-3 mr-2 text-blue-600" />
                        Auto-seek to {formatTimestamp(urlMetadata.timestamp)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 