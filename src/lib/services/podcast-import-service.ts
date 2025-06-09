import { supabaseAdmin } from '@/lib/database/supabase'
import { ListenNotesPodcastService, PodcastImportData, PodcastSearchResult } from './listen-notes-podcast-service'

export interface ImportResult {
  success: boolean;
  podcast?: {
    id: string;
    title: string;
    episodes: number;
  };
  error?: string;
  isAlreadyCached?: boolean;
}

export interface TranscriptionTriggerResult {
  success: boolean;
  transcribedEpisodes: number;
  error?: string;
}

/**
 * Service to handle importing podcasts from Listen Notes into our database
 */
export class PodcastImportService {
  private listenNotesService: ListenNotesPodcastService;

  constructor() {
    this.listenNotesService = new ListenNotesPodcastService();
  }

  /**
   * Check if a podcast is already cached in our database
   */
  async isPodcastCached(listenNotesId: string): Promise<{
    isCached: boolean;
    podcastId?: string;
    title?: string;
  }> {
    try {
      const { data: podcast, error } = await supabaseAdmin()
        .from('podcasts')
        .select('id, title')
        .eq('listen_notes_id', listenNotesId)
        .single();

      if (error || !podcast) {
        return { isCached: false };
      }

      return {
        isCached: true,
        podcastId: podcast.id,
        title: podcast.title,
      };
    } catch (error) {
      console.error('Error checking podcast cache:', error);
      return { isCached: false };
    }
  }

  /**
   * Import a podcast and its episodes from Listen Notes
   */
  async importPodcast(listenNotesId: string, options: {
    episodeLimit?: number;
  } = {}): Promise<ImportResult> {
    try {
      console.log(`🔄 Starting import for podcast: ${listenNotesId}`);

      // Check if already cached
      const cacheCheck = await this.isPodcastCached(listenNotesId);
      if (cacheCheck.isCached) {
        console.log(`✅ Podcast already cached: ${cacheCheck.title}`);
        return {
          success: true,
          podcast: {
            id: cacheCheck.podcastId!,
            title: cacheCheck.title!,
            episodes: 0, // We'll get the actual count below
          },
          isAlreadyCached: true,
        };
      }

      // Fetch podcast data from Listen Notes
      const podcastData = await this.listenNotesService.getPodcastWithEpisodes(
        listenNotesId,
        { episodeLimit: options.episodeLimit || 10 }
      );

      // Import podcast into database
      const importResult = await this.importPodcastToDatabase(podcastData);

      console.log(`✅ Successfully imported podcast: ${podcastData.podcast.title}`);
      return importResult;

    } catch (error) {
      console.error('Error importing podcast:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Import podcast data into the database
   */
  private async importPodcastToDatabase(podcastData: PodcastImportData): Promise<ImportResult> {
    try {
      // Insert podcast - only use fields that exist in the database schema
      const { data: insertedPodcast, error: podcastError } = await supabaseAdmin()
        .from('podcasts')
        .insert({
          id: podcastData.podcast.id,
          title: podcastData.podcast.title,
          description: podcastData.podcast.description,
          author: podcastData.podcast.author,
          image: podcastData.podcast.image,
          website: podcastData.podcast.rss_url || '', // Map rss_url to website field
          listen_notes_id: podcastData.podcast.listen_notes_id,
        })
        .select()
        .single();

      if (podcastError) {
        throw new Error(`Failed to insert podcast: ${podcastError.message}`);
      }

      console.log(`✅ Inserted podcast: ${podcastData.podcast.title}`);

      // Insert episodes - only use fields that exist in the database schema
      if (podcastData.episodes.length > 0) {
        const episodesToInsert = podcastData.episodes.map(episode => ({
          id: episode.id,
          podcast_id: podcastData.podcast.id,
          title: episode.title,
          description: episode.description,
          audio_url: episode.audio_url,
          duration: parseInt(episode.duration.split(':')[0]) * 60 + parseInt(episode.duration.split(':')[1] || '0'), // Convert "MM:SS" to seconds
          pub_date: episode.pub_date,
          listen_notes_id: episode.listen_notes_id,
        }));

        const { error: episodesError } = await supabaseAdmin()
          .from('episodes')
          .insert(episodesToInsert);

        if (episodesError) {
          throw new Error(`Failed to insert episodes: ${episodesError.message}`);
        }

        console.log(`✅ Inserted ${podcastData.episodes.length} episodes`);
      }

      return {
        success: true,
        podcast: {
          id: podcastData.podcast.id,
          title: podcastData.podcast.title,
          episodes: podcastData.episodes.length,
        },
      };

    } catch (error) {
      console.error('Error inserting into database:', error);
      throw error;
    }
  }

  /**
   * Trigger transcription for the latest N episodes of a podcast
   */
  async triggerTranscriptionForLatestEpisodes(
    podcastId: string,
    count: number = 3
  ): Promise<TranscriptionTriggerResult> {
    try {
      console.log(`🎙️ Marking latest ${count} episodes for transcription: ${podcastId}`);

      // Get the latest episodes and mark them for transcription
      const { data: episodes, error } = await supabaseAdmin()
        .from('episodes')
        .select('id, title, audio_url')
        .eq('podcast_id', podcastId)
        .order('pub_date', { ascending: false })
        .limit(count);

      if (error || !episodes || episodes.length === 0) {
        console.log(`❌ No episodes found: ${error?.message || 'No episodes'}`);
        return {
          success: false,
          transcribedEpisodes: 0,
          error: 'No episodes found'
        };
      }

      // Filter episodes that have audio URLs (can be transcribed)
      const transcribableEpisodes = episodes.filter(ep => ep.audio_url);
      console.log(`🎯 Found ${transcribableEpisodes.length} transcribable episodes out of ${episodes.length} total`);

      if (transcribableEpisodes.length === 0) {
        return {
          success: true,
          transcribedEpisodes: 0,
          error: 'No episodes have audio URLs for transcription'
        };
      }

      console.log(`✅ Episodes ready for transcription:`, transcribableEpisodes.map(ep => ep.title));
      
      return {
        success: true,
        transcribedEpisodes: transcribableEpisodes.length,
      };

    } catch (error) {
      console.error('Error preparing episodes for transcription:', error);
      return {
        success: false,
        transcribedEpisodes: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Complete podcast import workflow: import + transcribe latest episodes
   */
  async importAndTranscribePodcast(
    listenNotesId: string,
    options: {
      episodeLimit?: number;
      transcribeCount?: number;
    } = {}
  ): Promise<{
    importResult: ImportResult;
    transcriptionResult?: TranscriptionTriggerResult;
  }> {
    console.log(`🚀 Starting complete import workflow for podcast: ${listenNotesId}`);

    // Step 1: Import podcast
    const importResult = await this.importPodcast(listenNotesId, {
      episodeLimit: options.episodeLimit || 10,
    });

    if (!importResult.success || !importResult.podcast) {
      return { importResult };
    }

    // Step 2: Trigger transcription for latest episodes
    const transcriptionResult = await this.triggerTranscriptionForLatestEpisodes(
      importResult.podcast.id,
      options.transcribeCount || 3
    );

    return {
      importResult,
      transcriptionResult,
    };
  }
} 