import { NextRequest, NextResponse } from 'next/server'
import { findPodcastWithEpisodes } from '@/lib/utils/podcast-slug-resolver'
import { PodcastImportService } from '@/lib/services/podcast-import-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ podcast_id: string }> }
) {
  try {
    const { podcast_id } = await params
    console.log('🔍 Looking for podcast:', podcast_id)

    // First try to find the podcast in our database (supports slugs/UUIDs)
    let podcast = await findPodcastWithEpisodes(podcast_id)
    
    if (!podcast) {
      // If not found and it looks like a Listen Notes ID, try to import it
      console.log(`❌ Podcast not found in database: ${podcast_id}`)
      
      // Check if this could be a Listen Notes ID (they're typically alphanumeric strings)
      const isLikelyListenNotesId = /^[a-zA-Z0-9]+$/.test(podcast_id) && podcast_id.length > 10
      console.log(`🔍 Is likely Listen Notes ID: ${isLikelyListenNotesId}`)

      if (isLikelyListenNotesId) {
        // Try to import the podcast
        console.log(`🚀 Attempting to import podcast from Listen Notes: ${podcast_id}`)
        
        const importService = new PodcastImportService()
        const importResult = await importService.importAndTranscribePodcast(podcast_id, {
          episodeLimit: 10,
          transcribeCount: 3,
        })

        if (importResult.importResult.success && importResult.importResult.podcast) {
          // Now try to find the imported podcast
          podcast = await findPodcastWithEpisodes(importResult.importResult.podcast.id)
          
          if (podcast) {
            console.log(`✅ Successfully imported and found podcast: ${podcast.title}`)
          }
        } else {
          console.log(`❌ Failed to import podcast: ${importResult.importResult.error}`)
        }
      }

      // If still not found, return 404
      if (!podcast) {
        return NextResponse.json(
          { success: false, error: 'Podcast not found' },
          { status: 404 }
        )
      }
    }

    // Transform episodes to match the expected frontend format
    const transformedEpisodes = (podcast.episodes || [])
      .sort((a: any, b: any) => new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime()) // Sort by newest first
      .map((episode: any) => ({
        id: episode.id,
        title: episode.title,
        description: episode.description || 'No description available',
        duration: episode.duration || 'Unknown',
        releaseDate: episode.pub_date,
        audioUrl: episode.audio_url,
        isAiEnabled: episode.ai_ready || false,
        transcriptionStatus: episode.transcript_id ? 'completed' : (episode.ai_ready ? 'queued' : 'not_eligible')
      }))

    const transformedPodcast = {
      id: podcast.id,
      title: podcast.title,
      description: podcast.description || 'No description available',
      host: podcast.author,
      episodes: transformedEpisodes,
      listenNotesId: podcast.listen_notes_id || null,
    }

    console.log(`✅ Found podcast: ${podcast.title} with ${transformedEpisodes.length} episodes`)

    return NextResponse.json({
      success: true,
      podcast: transformedPodcast
    })

  } catch (error) {
    console.error('❌ Unexpected error in podcast endpoint:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
} 