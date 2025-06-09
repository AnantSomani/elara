import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ podcast_id: string }> }
) {
  try {
    const { podcast_id } = await params
    const { episodeCount = 3 } = await request.json()

    console.log(`🎙️ Manual transcription trigger for podcast: ${podcast_id}`)

    // Get the podcast's latest episodes with audio URLs
    const { data: episodes, error } = await supabaseAdmin()
      .from('episodes')
      .select('id, title, audio_url, podcast_id')
      .eq('podcast_id', podcast_id)
      .not('audio_url', 'is', null)
      .order('pub_date', { ascending: false })
      .limit(episodeCount)

    if (error || !episodes || episodes.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No episodes with audio URLs found'
      }, { status: 404 })
    }

    // Call the transcription API for these specific episodes
    const transcriptionResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:8080'}/api/transcription/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'existing',
        episodeIds: episodes.map(ep => ep.id),
        maxEpisodes: episodes.length,
        maxConcurrentTranscriptions: 2,
        skipExisting: false
      }),
    })

    if (!transcriptionResponse.ok) {
      console.error('Transcription API failed:', transcriptionResponse.status)
      return NextResponse.json({
        success: false,
        error: 'Failed to trigger transcription'
      }, { status: 500 })
    }

    const transcriptionResult = await transcriptionResponse.json()

    return NextResponse.json({
      success: true,
      message: `Triggered transcription for ${episodes.length} episodes`,
      episodes: episodes.map(ep => ({ id: ep.id, title: ep.title })),
      transcriptionResult
    })

  } catch (error) {
    console.error('Error triggering transcription:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 