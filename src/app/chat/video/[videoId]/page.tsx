'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import YouTubeChatWindow from '@/components/chat/YouTubeChatWindow'

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

export default function VideoChatPage() {
  const [video, setVideo] = useState<VideoDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const videoId = params.videoId as string

  useEffect(() => {
    if (videoId) {
      loadVideoDetails()
    }
  }, [videoId])

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
          description: 'Video details unavailable due to API quota limits. You can still use AI chat functionality.',
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
        description: 'Video details unavailable. You can still use the chat functionality below.',
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading video for chat...</p>
        </div>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Chat Unavailable</h1>
          <p className="text-slate-600 mb-6">{error || 'Unable to load video for chat.'}</p>
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push(`/video/${videoId}`)}
              className="text-purple-600 hover:text-purple-700 inline-flex items-center text-sm font-medium"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-1" />
              Back to Video
            </button>
            
            <div className="text-center">
              <h1 className="text-lg font-semibold text-slate-900 truncate max-w-md">
                Chat: {video.title}
              </h1>
              <p className="text-sm text-slate-500">
                {video.channelTitle} • {formatDuration(video.duration)}
              </p>
            </div>
            
            <div className="w-20"> {/* Spacer for centering */}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Layout */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          
          {/* Video Player Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 h-full">
              {/* Video Player */}
              <div className="aspect-video bg-black rounded-t-lg overflow-hidden">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                  title={video.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                ></iframe>
              </div>
              
              {/* Video Info */}
              <div className="p-4">
                <h3 className="font-medium text-slate-900 mb-2 text-sm leading-tight">
                  {video.title}
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  {video.channelTitle}
                </p>
                
                {/* Quick Info */}
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span>{formatDuration(video.duration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Views:</span>
                    <span>{video.viewCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 h-full">
              <YouTubeChatWindow
                videoId={videoId}
                videoTitle={video.title}
                channelTitle={video.channelTitle}
                duration={formatDuration(video.duration)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 