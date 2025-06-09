import { NextRequest, NextResponse } from 'next/server'
import { PodcastImportService } from '@/lib/services/podcast-import-service'

export async function POST(request: NextRequest) {
  try {
    const { listenNotesId, episodeLimit, transcribeCount } = await request.json()

    if (!listenNotesId || typeof listenNotesId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'listenNotesId is required' },
        { status: 400 }
      )
    }

    console.log(`🚀 Import request for podcast: ${listenNotesId}`)

    const importService = new PodcastImportService()
    
    // Check if already cached first
    const cacheCheck = await importService.isPodcastCached(listenNotesId)
    if (cacheCheck.isCached) {
      console.log(`✅ Podcast already cached: ${cacheCheck.title}`)
      return NextResponse.json({
        success: true,
        alreadyCached: true,
        podcast: {
          id: cacheCheck.podcastId,
          title: cacheCheck.title,
        },
        message: 'Podcast already in database'
      })
    }

    // Import podcast with episodes and trigger transcription
    const result = await importService.importAndTranscribePodcast(listenNotesId, {
      episodeLimit: episodeLimit || 10,
      transcribeCount: transcribeCount || 3,
    })

    if (!result.importResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.importResult.error || 'Import failed' 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      podcast: result.importResult.podcast,
      transcription: {
        triggered: !!result.transcriptionResult,
        success: result.transcriptionResult?.success || false,
        transcribedEpisodes: result.transcriptionResult?.transcribedEpisodes || 0,
        error: result.transcriptionResult?.error,
      },
      message: `Successfully imported "${result.importResult.podcast?.title}" with ${result.importResult.podcast?.episodes} episodes`
    })

  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
} 