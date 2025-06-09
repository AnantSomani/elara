'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PlayIcon, CalendarIcon, EyeIcon, UserGroupIcon } from '@heroicons/react/24/outline'

interface ChannelDetails {
  id: string
  title: string
  description: string
  subscriberCount: number
  videoCount: number
  publishedAt: string
  thumbnails: {
    default: string
    medium: string
    high: string
  }
}

interface VideoItem {
  id: string
  title: string
  description: string
  duration: string
  viewCount: number
  publishedAt: string
  thumbnails: {
    default: string
    medium: string
    high: string
  }
}

export default function ChannelPage() {
  const [channel, setChannel] = useState<ChannelDetails | null>(null)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const channelId = params.channelId as string

  useEffect(() => {
    if (channelId) {
      loadChannelData()
    }
  }, [channelId])

  const loadChannelData = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Load channel details and recent videos in parallel
      const [channelResponse, videosResponse] = await Promise.all([
        fetch(`/api/youtube/channel/${channelId}`),
        fetch(`/api/youtube/channel/${channelId}/videos`)
      ])

      if (channelResponse.ok) {
        const channelData = await channelResponse.json()
        setChannel(channelData.channel)
      } else {
        setError('Channel not found or unavailable')
      }

      if (videosResponse.ok) {
        const videosData = await videosResponse.json()
        setVideos(videosData.videos || [])
      }

    } catch (error) {
      console.error('Error loading channel:', error)
      setError('Failed to load channel details')
    } finally {
      setIsLoading(false)
    }
  }

  const formatSubscriberCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M subscribers`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K subscribers`
    return `${count} subscribers`
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handleVideoClick = (video: VideoItem) => {
    router.push(`/video/${video.id}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading channel...</p>
        </div>
      </div>
    )
  }

  if (error || !channel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Channel Not Found</h1>
          <p className="text-slate-600 mb-6">{error || 'The channel you\'re looking for doesn\'t exist or couldn\'t be loaded.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Back to Search
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
          <button
            onClick={() => router.push('/')}
            className="text-purple-600 hover:text-purple-700 mb-4 inline-flex items-center"
          >
            ← Back to Search
          </button>
          
          <div className="flex items-start space-x-6">
            {/* Channel Avatar */}
            <div className="flex-shrink-0">
              <img
                src={channel.thumbnails.high}
                alt={channel.title}
                className="w-32 h-32 rounded-full object-cover shadow-lg"
                onError={(e) => {
                  // Fallback to gradient if image fails
                  e.currentTarget.style.display = 'none';
                }}
              />
              {/* Fallback avatar */}
              <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {channel.title.charAt(0).toUpperCase()}
              </div>
            </div>
            
            {/* Channel Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                {channel.title}
              </h1>
              
              <div className="flex items-center space-x-6 text-slate-600 mb-4">
                <div className="flex items-center">
                  <UserGroupIcon className="w-5 h-5 mr-2" />
                  {formatSubscriberCount(channel.subscriberCount)}
                </div>
                <span>{channel.videoCount.toLocaleString()} videos</span>
                <span>Joined {formatDate(channel.publishedAt)}</span>
              </div>
              
              <p className="text-slate-700 leading-relaxed max-w-4xl">
                {channel.description}
              </p>

              <div className="mt-4">
                <a
                  href={`https://youtube.com/channel/${channelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  <PlayIcon className="w-4 h-4 mr-2" />
                  Visit on YouTube
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Videos */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">Recent Videos</h2>
        
        {videos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No recent videos found for this channel.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <div
                key={video.id}
                onClick={() => handleVideoClick(video)}
                className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
              >
                {/* Video Thumbnail */}
                <div className="relative aspect-video bg-slate-100">
                  <img
                    src={video.thumbnails.medium}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute bottom-2 right-2 px-2 py-1 bg-black bg-opacity-75 text-white text-xs rounded">
                    {formatDuration(video.duration)}
                  </div>
                </div>

                {/* Video Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2 group-hover:text-purple-700 transition-colors">
                    {video.title}
                  </h3>
                  
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <div className="flex items-center">
                      <EyeIcon className="w-4 h-4 mr-1" />
                      {formatViewCount(video.viewCount)}
                    </div>
                    <div className="flex items-center">
                      <CalendarIcon className="w-4 h-4 mr-1" />
                      {formatDate(video.publishedAt)}
                    </div>
                  </div>

                  {video.description && (
                    <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                      {video.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 