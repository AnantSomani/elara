'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AudioPlayer from '@/components/audio/AudioPlayer'
import ChatWindow from '@/components/chat/ChatWindow'
import { stripHtmlTags } from '@/lib/utils/text-utils'

interface Episode {
  id: string
  title: string
  description: string
  duration?: string
  releaseDate: string
  audioUrl?: string
  podcastTitle: string
  host: string
}

export default function EpisodeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const podcastId = params.podcast_id as string
  const episodeId = params.episode_id as string
  
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isComponentsReady, setIsComponentsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (podcastId && episodeId) {
      loadEpisode()
    }
  }, [podcastId, episodeId])

  // Delay heavy components to improve perceived performance
  useEffect(() => {
    if (episode && !isLoading) {
      const timer = setTimeout(() => {
        setIsComponentsReady(true)
      }, 100) // Small delay to let the page render first
      return () => clearTimeout(timer)
    }
  }, [episode, isLoading])

  const loadEpisode = async () => {
    const startTime = performance.now()
    console.log('🔄 Starting episode load...')
    
    setIsLoading(true)
    setError(null)
    
    try {
      console.log('📡 Fetching episode data...')
      const response = await fetch(`/api/podcasts/${podcastId}/episodes/${episodeId}`)
      const data = await response.json()
      
      console.log('✅ API response received in', performance.now() - startTime, 'ms')
      
      if (data.success) {
        console.log('📝 Episode data:', {
          title: data.episode.title,
          descriptionLength: data.episode.description?.length || 0,
          hasAudioUrl: !!data.episode.audioUrl
        })
        setEpisode(data.episode)
        console.log('✅ Episode state updated in', performance.now() - startTime, 'ms')
      } else {
        throw new Error(data.error || 'Failed to load episode')
      }
    } catch (error) {
      console.error('❌ Episode load error:', error)
      setError(error instanceof Error ? error.message : 'Failed to load episode')
      setEpisode(null)
    } finally {
      setIsLoading(false)
      console.log('🏁 Episode loading complete in', performance.now() - startTime, 'ms')
    }
  }

  const getMockEpisode = (podcastId: string, episodeId: string): Episode => {
    const episodes: Record<string, Record<string, Episode>> = {
      'joe-rogan-experience': {
        'c8d54175-29f9-4b91-ad77-52c379d32a71': {
          id: 'c8d54175-29f9-4b91-ad77-52c379d32a71',
          title: 'UFC 229: Conor vs Khabib Breakdown',
          description: 'Joe Rogan and Brendan Schaub break down the biggest fight in UFC history, discussing the drama, technique, and aftermath of the Conor McGregor vs Khabib Nurmagomedov fight.',
          duration: '28:09',
          releaseDate: '2024-06-05',
          podcastTitle: 'The Joe Rogan Experience',
          host: 'Joe Rogan',
          audioUrl: 'https://example.com/audio/joe-rogan-ufc229.mp3'
        },
        '2240': {
          id: '2240',
          title: 'Elon Musk on AI and the Future',
          description: 'Elon Musk returns to discuss the latest developments in artificial intelligence, neural interfaces, and what the future holds for humanity.',
          duration: '3:22:45',
          releaseDate: '2024-06-03',
          podcastTitle: 'The Joe Rogan Experience',
          host: 'Joe Rogan',
          audioUrl: 'https://example.com/audio/joe-rogan-2240.mp3'
        },
        '2239': {
          id: '2239',
          title: 'Navy SEAL David Goggins on Mental Toughness',
          description: 'David Goggins shares his philosophy on pushing through mental barriers and achieving the impossible through discipline and hard work.',
          duration: '2:45:20',
          releaseDate: '2024-06-01',
          podcastTitle: 'The Joe Rogan Experience',
          host: 'Joe Rogan',
          audioUrl: 'https://example.com/audio/joe-rogan-2239.mp3'
        },
        '2238': {
          id: '2238',
          title: 'Old Episode - Audio Only',
          description: 'This is an older episode that you can listen to but cannot chat about with Elara.',
          duration: '2:30:00',
          releaseDate: '2024-01-05',
          podcastTitle: 'The Joe Rogan Experience',
          host: 'Joe Rogan',
          audioUrl: 'https://example.com/audio/joe-rogan-2238.mp3'
        }
      },
      'tim-ferriss-show': {
        '756': {
          id: '756',
          title: 'Kevin Kelly on AI and Technology Trends',
          description: 'Kevin Kelly, founding executive editor of WIRED magazine, discusses the future of AI, technology trends, and how to navigate an uncertain world.',
          duration: '1:45:30',
          releaseDate: '2024-06-04',
          podcastTitle: 'The Tim Ferriss Show',
          host: 'Tim Ferriss',
          audioUrl: 'https://example.com/audio/tim-ferriss-756.mp3'
        },
        '755': {
          id: '755',
          title: 'Josh Waitzkin on Learning and Performance',
          description: 'Chess prodigy and martial arts champion Josh Waitzkin shares strategies for accelerated learning and peak performance.',
          duration: '2:10:15',
          releaseDate: '2024-06-02',
          podcastTitle: 'The Tim Ferriss Show',
          host: 'Tim Ferriss',
          audioUrl: 'https://example.com/audio/tim-ferriss-755.mp3'
        }
      },
      'lex-fridman-podcast': {
        '456': {
          id: '456',
          title: 'Sam Altman: OpenAI and the Future of AGI',
          description: 'Sam Altman, CEO of OpenAI, discusses the path to artificial general intelligence, safety considerations, and the future of human-AI collaboration.',
          duration: '2:55:40',
          releaseDate: '2024-06-06',
          podcastTitle: 'Lex Fridman Podcast',
          host: 'Lex Fridman',
          audioUrl: 'https://example.com/audio/lex-fridman-456.mp3'
        },
        '455': {
          id: '455',
          title: 'Michio Kaku: Quantum Computing and Physics',
          description: 'Theoretical physicist Michio Kaku explores quantum computing, parallel universes, and the fundamental nature of reality.',
          duration: '2:20:30',
          releaseDate: '2024-06-04',
          podcastTitle: 'Lex Fridman Podcast',
          host: 'Lex Fridman',
          audioUrl: 'https://example.com/audio/lex-fridman-455.mp3'
        }
      }
    }

    return episodes[podcastId]?.[episodeId] || {
      id: episodeId,
      title: 'Episode Not Found',
      description: 'This episode could not be found.',
      podcastTitle: 'Unknown Podcast',
      host: 'Unknown Host',
      releaseDate: '2024-01-01'
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading episode...</p>
        </div>
      </div>
    )
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Episode Not Found</h1>
          {error && (
            <p className="text-red-600 mb-4">{error}</p>
          )}
          <button
            onClick={() => router.push(`/podcast/${podcastId}`)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Podcast
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push(`/podcast/${podcastId}`)}
              className="text-blue-600 hover:text-blue-700"
            >
              ← Back to {episode?.podcastTitle || 'Podcast'}
            </button>
            <span className="text-slate-400">•</span>
            <button
              onClick={() => router.push('/')}
              className="text-slate-500 hover:text-slate-700"
            >
              Home
            </button>
          </div>
          
          {/* Show database status */}
          {error && (
            <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              Error: {error}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Episode Info - Show immediately */}
        {episode && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {episode.title}
            </h1>
            <p className="text-slate-600 mb-2">
              {episode.podcastTitle} • Hosted by {episode.host}
            </p>
            <p className="text-sm text-slate-500 mb-4">
              {formatDate(episode.releaseDate)}
              {episode.duration && ` • ${episode.duration}`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-300px)]">
          {/* Audio Player Section - Left 2/3 */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            {episode && (
              <>
                <div className="mb-6">
                  <p className="text-slate-700 leading-relaxed">
                    {stripHtmlTags(episode.description)}
                  </p>
                </div>

                {/* Audio Player Component - Load after delay */}
                {isComponentsReady ? (
                  <div className="flex-1">
                    <AudioPlayer
                      episodeId={episode.id}
                      title={episode.title}
                      audioUrl={episode.audioUrl}
                    />
                  </div>
                ) : (
                  <div className="flex-1 bg-slate-50 rounded-lg flex items-center justify-center h-32">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-slate-500 text-sm">Loading audio player...</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chat Section - Right 1/3 */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                Chat with AI about this episode
              </h2>
              <p className="text-sm text-slate-500">
                Ask questions or discuss topics from the episode
              </p>
            </div>
            
            <div className="flex-1 min-h-0">
              {isComponentsReady ? (
                <ChatWindow
                  episodeId={episode?.id || episodeId}
                  podcastTitle={episode?.podcastTitle || 'Unknown Podcast'}
                  episodeTitle={episode?.title || 'Unknown Episode'}
                  host={episode?.host || 'Unknown Host'}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-slate-500 text-sm">Loading chat...</p>
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