import { NextRequest, NextResponse } from 'next/server'
import { findPodcastWithEpisodes } from '@/lib/utils/podcast-slug-resolver'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ podcast_id: string; episode_id: string }> }
) {
  try {
    const { podcast_id, episode_id } = await params
    console.log('🔍 Looking for episode:', { podcast_id, episode_id })

    // Find the podcast with all its episodes
    const podcast = await findPodcastWithEpisodes(podcast_id)
    
    if (!podcast) {
      console.log(`❌ Podcast not found: ${podcast_id}`)
      return NextResponse.json(
        { success: false, error: 'Podcast not found' },
        { status: 404 }
      )
    }

    console.log(`✅ Found podcast: ${podcast.title} with ${podcast.episodes?.length || 0} episodes`)

    // Find the episode in the episodes array
    const episode = podcast.episodes?.find((ep: any) => ep.id === episode_id)
    
    if (!episode) {
      console.log(`❌ Episode not found: ${episode_id} in podcast ${podcast.title}`)
      console.log(`Available episode IDs:`, podcast.episodes?.map((ep: any) => ep.id).slice(0, 3))
      return NextResponse.json(
        { success: false, error: 'Episode not found' },
        { status: 404 }
      )
    }

    // Transform episode data to match expected format
    const transformedEpisode = {
      id: episode.id,
      title: episode.title,
      description: episode.description || 'No description available',
      duration: episode.duration || 'Unknown',
      releaseDate: episode.pub_date,
      audioUrl: episode.audio_url,
      isAiEnabled: false,
      transcriptionStatus: 'not_eligible',
      podcastTitle: podcast.title,
      podcastId: podcast.id,
      host: podcast.author || 'Unknown Host'
    }

    console.log(`✅ Found episode: ${episode.title} in podcast ${podcast.title}`)

    return NextResponse.json({
      success: true,
      episode: transformedEpisode
    })

  } catch (error) {
    console.error('❌ Unexpected error in episode endpoint:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
} 