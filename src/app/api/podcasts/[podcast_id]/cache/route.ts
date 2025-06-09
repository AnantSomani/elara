import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase'
import { findPodcastBySlugOrId } from '@/lib/utils/podcast-slug-resolver'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ podcast_id: string }> }
) {
  try {
    const { podcast_id } = await params
    console.log('🔄 Triggering cache for podcast:', podcast_id)

    // Find the actual podcast and get its UUID
    const podcast = await findPodcastBySlugOrId(podcast_id)
    
    if (!podcast) {
      console.log(`❌ Podcast not found: ${podcast_id}`)
      return NextResponse.json(
        { success: false, error: 'Podcast not found' },
        { status: 404 }
      )
    }

    console.log(`✅ Found podcast: ${podcast.title} (ID: ${podcast.id})`)

    // Call the database function to update AI status for latest 3 episodes
    const { data, error } = await supabaseAdmin()
      .rpc('update_latest_episodes_ai_status', {
        target_podcast_id: podcast.id // Use the actual UUID
      })

    if (error) {
      console.error('❌ Error updating AI status:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    console.log(`✅ Updated AI status for ${data} episodes of podcast ${podcast.title}`)

    // Get the updated episodes to return their status
    const { data: episodes, error: episodesError } = await supabaseAdmin()
      .rpc('get_podcast_episodes_with_ai_status', {
        target_podcast_id: podcast.id // Use the actual UUID
      })

    if (episodesError) {
      console.warn('⚠️ Could not fetch updated episodes:', episodesError.message)
    }

    return NextResponse.json({
      success: true,
      updatedCount: data,
      episodes: episodes || [],
      message: `Updated ${data} episodes for AI chat eligibility`,
      podcastTitle: podcast.title,
      podcastId: podcast.id
    })

  } catch (error) {
    console.error('❌ Unexpected error in cache endpoint:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
} 