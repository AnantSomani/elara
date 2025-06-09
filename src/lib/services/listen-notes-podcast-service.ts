// Temporary placeholder for Listen Notes service while migrating to YouTube
// This file will be replaced with YouTube-based functionality

export interface PodcastSearchResult {
  id: string
  title: string
  description: string
  host: string
  totalEpisodes: number
  image: string
  listenNotesId: string
}

export interface PodcastImportData {
  podcast: {
    id: string
    title: string
    description: string
    author: string
    image: string
    rss_url?: string
    listen_notes_id: string
  }
  episodes: Array<{
    id: string
    title: string
    description: string
    audio_url: string
    duration: string
    pub_date: string
    listen_notes_id: string
  }>
}

export class ListenNotesPodcastService {
  constructor() {
    console.warn('⚠️ ListenNotesPodcastService is deprecated. Use YouTubeSearchService instead.')
  }

  async searchPodcasts(query: string, options: { limit?: number } = {}): Promise<PodcastSearchResult[]> {
    console.warn('⚠️ searchPodcasts is deprecated. Use YouTubeSearchService.searchPodcasts() instead.')
    // Return empty results as fallback
    return []
  }

  async getPopularPodcasts(options: { limit?: number } = {}): Promise<PodcastSearchResult[]> {
    console.warn('⚠️ getPopularPodcasts is deprecated. Use YouTubeSearchService instead.')
    // Return empty results as fallback
    return []
  }

  async getPodcastWithEpisodes(id: string, options: { episodeLimit?: number } = {}): Promise<PodcastImportData> {
    console.warn('⚠️ getPodcastWithEpisodes is deprecated. Use YouTube-based import instead.')
    throw new Error('Listen Notes service is no longer available. Please use YouTube import.')
  }
} 