'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, CalendarIcon, ChatBubbleLeftRightIcon, PlayIcon } from '@heroicons/react/24/outline'
import { formatPreviewText } from '@/lib/utils/text-utils'

interface Episode {
  id: string
  title: string
  description: string
  duration?: string
  releaseDate: string
  audioUrl?: string
  isAiEnabled?: boolean
  transcriptionStatus?: string
}

interface Podcast {
  id: string
  title: string
  description: string
  host: string
  coverImage?: string
  episodes: Episode[]
}

export default function PodcastDetailPage() {
  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const router = useRouter()
  
  // Extract podcast ID from URL
  const podcastId = typeof window !== 'undefined' ? window.location.pathname.split('/')[2] : ''

  useEffect(() => {
    if (podcastId) {
      loadPodcast()
    }
  }, [podcastId])

  const loadPodcast = async () => {
    setIsLoading(true)
    try {
      // Fetch podcast data - the API will handle caching/importing automatically
      const response = await fetch(`/api/podcasts/${podcastId}`)
      if (response.ok) {
        const data = await response.json()
        setPodcast(data.podcast)
      } else {
        console.error('Failed to load podcast')
        setPodcast(null)
      }
    } catch (error) {
      console.error('Error loading podcast:', error)
      setPodcast(null)
    } finally {
      setIsLoading(false)
    }
  }

  const triggerTranscription = async () => {
    if (!podcast) return
    
    setIsTranscribing(true)
    try {
      const response = await fetch(`/api/podcasts/${podcast.id}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ episodeCount: 3 }),
      })
      
      const data = await response.json()
      if (data.success) {
        alert(`✅ Transcription started for ${data.episodes?.length || 0} episodes!`)
      } else {
        alert(`❌ Transcription failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Error triggering transcription:', error)
      alert('❌ Failed to trigger transcription')
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleEpisodeClick = (episode: Episode) => {
    router.push(`/podcast/${podcastId}/${episode.id}`)
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getTranscriptionStatusDisplay = (status?: string): { text: string; color: string } => {
    switch (status) {
      case 'completed':
        return { text: 'Ready for AI Chat', color: 'text-green-600' }
      case 'processing':
        return { text: 'Processing...', color: 'text-yellow-600' }
      case 'queued':
        return { text: 'Queued for Processing', color: 'text-blue-600' }
      case 'not_eligible':
        return { text: 'Audio Only', color: 'text-slate-500' }
      default:
        return { text: 'Audio Only', color: 'text-slate-500' }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading podcast...</p>
        </div>
      </div>
    )
  }

  if (!podcast) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Podcast Not Found</h1>
          <p className="text-slate-600 mb-6">The podcast you're looking for doesn't exist or couldn't be loaded.</p>
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
            {/* Podcast Cover (placeholder) */}
            <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xl font-bold">
                {podcast.title.split(' ').map(word => word[0]).join('').slice(0, 2)}
              </span>
            </div>
            
            {/* Podcast Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                {podcast.title}
              </h1>
              <p className="text-lg text-slate-600 mb-3">
                Hosted by {podcast.host}
              </p>
              <p className="text-slate-700 leading-relaxed">
                {podcast.description}
              </p>
              <div className="mt-4 flex items-center space-x-4 text-sm text-slate-500">
                <span>{podcast.episodes.length} episodes</span>
                {podcast.episodes.filter(e => e.isAiEnabled).length > 0 && (
                  <span className="text-purple-600 font-medium">
                    {podcast.episodes.filter(e => e.isAiEnabled).length} episodes with AI chat
                  </span>
                )}
                <button
                  onClick={triggerTranscription}
                  disabled={isTranscribing}
                  className="ml-4 px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {isTranscribing ? 'Transcribing...' : 'Transcribe Latest Episodes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes List */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">Episodes</h2>
        
        {podcast.episodes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No episodes available for this podcast.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {podcast.episodes.map((episode) => {
              const statusDisplay = getTranscriptionStatusDisplay(episode.transcriptionStatus)
              
              return (
                <div
                  key={episode.id}
                  className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleEpisodeClick(episode)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {episode.title}
                      </h3>
                      <p className="text-slate-600 mb-4 line-clamp-2">
                        {formatPreviewText(episode.description)}
                      </p>
                      
                      <div className="flex items-center space-x-4 text-sm text-slate-500">
                        {episode.duration && (
                          <div className="flex items-center space-x-1">
                            <ClockIcon className="w-4 h-4" />
                            <span>{episode.duration}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1">
                          <CalendarIcon className="w-4 h-4" />
                          <span>{formatDate(episode.releaseDate)}</span>
                        </div>
                        <div className={`flex items-center space-x-1 ${statusDisplay.color}`}>
                          {episode.isAiEnabled ? (
                            <ChatBubbleLeftRightIcon className="w-4 h-4" />
                          ) : (
                            <PlayIcon className="w-4 h-4" />
                          )}
                          <span>{statusDisplay.text}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ml-4 flex flex-col items-center space-y-2">
                      {episode.isAiEnabled && (
                        <div className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                          AI Chat Available
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEpisodeClick(episode)
                        }}
                        className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                      >
                        {episode.isAiEnabled ? 'Chat with Elara' : 'Listen'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
} 