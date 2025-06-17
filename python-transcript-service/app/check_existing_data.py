#!/usr/bin/env python3
"""
Check Current Database Contents
This script examines what data already exists to understand the current pipeline state
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Load environment variables 
load_dotenv()
load_dotenv('../.env.local')

async def check_existing_data():
    """
    Check what data already exists in the database
    """
    print('🔍 Current Database Contents Analysis')
    print('=' * 50)
    
    # Database connection
    password = "tAAo1UrQGrqrJM0O"
    conn = await asyncpg.connect(f"postgresql://postgres:{password}@db.yuecfzzsvpndsqgczfbv.supabase.co:5432/postgres")
    
    try:
        # Check videos table
        print("📹 YouTube Videos:")
        videos = await conn.fetch("SELECT * FROM youtube_videos LIMIT 10")
        print(f"   Total videos: {len(videos)}")
        for video in videos:
            print(f"   - {video['id']}: {video['title'][:50]}...")
            print(f"     Channel: {video.get('channel_id', 'N/A')}")
            print(f"     Duration: {video.get('duration_seconds', 'N/A')}s")
        
        # Check transcripts table  
        print(f"\n📝 YouTube Transcripts:")
        transcripts = await conn.fetch("SELECT * FROM youtube_transcripts LIMIT 10")
        print(f"   Total transcripts: {len(transcripts)}")
        for transcript in transcripts:
            content_len = len(transcript.get('content', '')) if transcript.get('content') else 0
            print(f"   - Video {transcript['video_id']}: {content_len} chars")
            print(f"     Language: {transcript.get('language', 'N/A')}")
            print(f"     Source: {transcript.get('source', 'N/A')}")
        
        # Check chunks table
        print(f"\n✂️  YouTube Transcript Chunks:")
        chunks = await conn.fetch("SELECT * FROM youtube_transcript_chunks LIMIT 10")
        print(f"   Total chunks: {len(chunks)}")
        
        # Check embeddings
        embedded_chunks = await conn.fetch("SELECT * FROM youtube_transcript_chunks WHERE embedding IS NOT NULL LIMIT 5")
        print(f"   Chunks with embeddings: {len(embedded_chunks)}")
        
        for chunk in chunks[:5]:
            text_preview = chunk['text'][:50] + "..." if len(chunk['text']) > 50 else chunk['text']
            has_embedding = "✅" if chunk.get('embedding') else "❌"
            print(f"   - {chunk['video_id']} [{chunk['start_time']:.1f}s]: {text_preview}")
            print(f"     Embedding: {has_embedding}")
        
        # Check for any processing endpoints/patterns
        print(f"\n🔧 Data Analysis:")
        
        # Video IDs with complete pipeline
        complete_videos = await conn.fetch("""
            SELECT DISTINCT v.id, v.title,
                   COUNT(DISTINCT t.id) as transcript_count,
                   COUNT(DISTINCT c.chunk_id) as chunk_count,
                   COUNT(CASE WHEN c.embedding IS NOT NULL THEN 1 END) as embedded_chunks
            FROM youtube_videos v
            LEFT JOIN youtube_transcripts t ON v.id = t.video_id
            LEFT JOIN youtube_transcript_chunks c ON v.id = c.video_id
            GROUP BY v.id, v.title
        """)
        
        for video in complete_videos:
            print(f"   Video: {video['id']}")
            print(f"     - Transcripts: {video['transcript_count']}")
            print(f"     - Chunks: {video['chunk_count']}")
            print(f"     - Embeddings: {video['embedded_chunks']}")
            completion = video['embedded_chunks'] / video['chunk_count'] * 100 if video['chunk_count'] > 0 else 0
            print(f"     - Pipeline completion: {completion:.1f}%")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database check failed: {str(e)}")
        await conn.close()
        return False

if __name__ == "__main__":
    asyncio.run(check_existing_data()) 