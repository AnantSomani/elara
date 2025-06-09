'use client'

import { useState, useEffect } from 'react'

interface SearchResult {
  id: string
  title: string
  description: string
  host?: string
  episodeCount?: number
  image?: string
  videoId?: string
  channelTitle?: string
  channelId?: string
  duration?: string
  viewCount?: number
  publishedAt?: string
  subscriberCount?: number
  videoCount?: number
}

interface TabbedSearchResultsProps {
  query: string
  onResultSelect: (result: SearchResult) => void
  isVisible: boolean
}

type SearchTab = 'channels' | 'episodes' | 'all'

export default function TabbedSearchResults({ query, onResultSelect, isVisible }: TabbedSearchResultsProps) {
  const [activeTab, setActiveTab] = useState<SearchTab>('all')
  const [channelResults, setChannelResults] = useState<SearchResult[]>([])
  const [episodeResults, setEpisodeResults] = useState<SearchResult[]>([])
  const [allResults, setAllResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (query.trim().length >= 2) {
      performSearches(query)
    } else {
      setChannelResults([])
      setEpisodeResults([])
      setAllResults([])
    }
  }, [query])

  const performSearches = async (searchQuery: string) => {
    setIsLoading(true)
    
    try {
      // Perform all searches in parallel
      const [channelsResponse, episodesResponse, allResponse] = await Promise.all([
        fetch('/api/search/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        }),
        fetch('/api/search/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        }),
        fetch('/api/search/podcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        })
      ])

      const [channelsData, episodesData, allData] = await Promise.all([
        channelsResponse.json(),
        episodesResponse.json(),
        allResponse.json()
      ])

      setChannelResults(channelsData.results || [])
      setEpisodeResults(episodesData.results || [])
      setAllResults(allData.results || [])

    } catch (error) {
      console.error('Search error:', error)
      setChannelResults([])
      setEpisodeResults([])
      setAllResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const getCurrentResults = () => {
    switch (activeTab) {
      case 'channels': return channelResults
      case 'episodes': return episodeResults
      case 'all': return allResults
      default: return allResults
    }
  }

  const getResultCount = (tab: SearchTab) => {
    switch (tab) {
      case 'channels': return channelResults.length
      case 'episodes': return episodeResults.length
      case 'all': return allResults.length
      default: return 0
    }
  }

  const formatViewCount = (count?: number) => {
    if (!count) return ''
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`
    return `${count} views`
  }

  const formatSubscriberCount = (count?: number) => {
    if (!count) return ''
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M subscribers`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K subscribers`
    return `${count} subscribers`
  }

  if (!isVisible) return null

  const currentResults = getCurrentResults()

  return (
    <div className="absolute top-full left-0 right-0 bg-white rounded-lg shadow-xl border border-purple-200 mt-2 z-10">
      {/* Tab Headers */}
      <div className="flex border-b border-purple-100">
        {(['all', 'channels', 'episodes'] as SearchTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors relative ${
              activeTab === tab
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-slate-600 hover:text-purple-600 hover:bg-purple-25'
            }`}
          >
            {tab === 'all' ? 'All Results' : tab}
            <span className="ml-2 text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">
              {getResultCount(tab)}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto mb-2"></div>
            <p className="text-slate-600">Searching...</p>
          </div>
        ) : currentResults.length > 0 ? (
          <div>
            {currentResults.map((result) => (
              <button
                key={result.id}
                onClick={() => onResultSelect(result)}
                className="w-full px-4 py-4 text-left hover:bg-purple-50 border-b border-purple-100 last:border-b-0 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0">
                    {result.image ? (
                      <img
                        src={result.image}
                        alt={result.title}
                        className="w-16 h-16 rounded-lg object-cover shadow-sm"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg flex items-center justify-center">
                        <span className="text-purple-600 font-bold text-sm">
                          {result.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-purple-700 transition-colors text-lg line-clamp-2">
                      {result.title}
                    </h3>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-2">
                      {/* Channel Info */}
                      {result.channelTitle && (
                        <span>By {result.channelTitle}</span>
                      )}
                      
                      {/* Stats based on type */}
                      {activeTab === 'channels' ? (
                        <>
                          {result.subscriberCount && (
                            <span className="text-purple-600 font-medium">
                              {formatSubscriberCount(result.subscriberCount)}
                            </span>
                          )}
                          {result.videoCount && (
                            <span>{result.videoCount} videos</span>
                          )}
                        </>
                      ) : (
                        <>
                          {result.viewCount && (
                            <span className="text-purple-600 font-medium">
                              {formatViewCount(result.viewCount)}
                            </span>
                          )}
                          {result.duration && result.duration !== 'Unknown' && (
                            <span>{result.duration}</span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Description */}
                    {result.description && (
                      <p className="text-sm text-slate-600 line-clamp-2">
                        {result.description}
                      </p>
                    )}
                  </div>

                  {/* Arrow indicator */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg 
                      className="w-5 h-5 text-purple-400" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M9 5l7 7-7 7" 
                      />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-slate-600 mb-2">
              No {activeTab === 'all' ? 'results' : activeTab} found for "{query}"
            </p>
            <p className="text-sm text-slate-400">
              Try a different search term or check the spelling
            </p>
          </div>
        )}
      </div>
    </div>
  )
} 