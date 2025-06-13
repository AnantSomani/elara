#!/usr/bin/env python3

import os
import requests
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from googleapiclient.discovery import build
from app.chunking import create_transcript_chunks

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, YOUTUBE_API_KEY]):
    raise ValueError("Missing required environment variables")

# Supabase headers
HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json"
}

# FastAPI app
app = FastAPI(title="Elara YouTube Transcript Service", version="1.0.0")

# Pydantic models
class TranscriptRequest(BaseModel):
    video_id: str

class TranscriptResponse(BaseModel):
    success: bool
    video_id: str
    segments_count: int
    total_characters: int
    message: str

class ChunkingRequest(BaseModel):
    video_id: str
    chunk_duration: float = 45.0
    overlap_duration: float = 10.0

class ChunkingResponse(BaseModel):
    success: bool
    video_id: str
    chunks_created: int
    total_words: int
    total_duration: float
    avg_words_per_chunk: float
    chunks: List[Dict]
    message: str

@app.get("/")
async def root():
    return {"message": "Elara YouTube Transcript Service", "status": "running"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test Supabase connection
        response = requests.get(f"{SUPABASE_URL}/rest/v1/", headers=HEADERS)
        supabase_status = "healthy" if response.status_code == 200 else "unhealthy"
        
        # Test YouTube API
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        youtube_status = "healthy"
        
        return {
            "status": "healthy",
            "supabase": supabase_status,
            "youtube_api": youtube_status,
            "timestamp": "2024-01-01T00:00:00Z"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@app.post("/api/fetch-transcript", response_model=TranscriptResponse)
async def fetch_transcript(request: TranscriptRequest):
    """Fetch YouTube transcript and store in Supabase"""
    try:
        video_id = request.video_id
        print(f"🎥 Processing video: {video_id}")
        
        # Get video metadata from YouTube API
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        video_response = youtube.videos().list(
            part='snippet,statistics',
            id=video_id
        ).execute()
        
        if not video_response['items']:
            raise HTTPException(status_code=404, detail="Video not found")
        
        video_data = video_response['items'][0]
        snippet = video_data['snippet']
        statistics = video_data['statistics']
        
        # Get channel data
        channel_response = youtube.channels().list(
            part='snippet',
            id=snippet['channelId']
        ).execute()
        
        channel_data = channel_response['items'][0]['snippet'] if channel_response['items'] else {}
        
        # Check if video already exists
        check_url = f"{SUPABASE_URL}/rest/v1/youtube_videos?select=id&id=eq.{video_id}"
        check_response = requests.get(check_url, headers=HEADERS)
        
        if check_response.status_code == 200 and check_response.json():
            return TranscriptResponse(
                success=False,
                video_id=video_id,
                segments_count=0,
                total_characters=0,
                message=f"Video {video_id} already exists in database"
            )
        
        # Get transcript
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        
        if not transcript_list:
            raise HTTPException(status_code=404, detail="No transcript available")
        
        # Store video metadata
        video_insert_data = {
            "id": video_id,
            "title": snippet.get('title', ''),
            "description": snippet.get('description', ''),
            "channel_id": snippet.get('channelId', ''),
            "published_at": snippet.get('publishedAt', ''),
            "view_count": int(statistics.get('viewCount', 0)) if statistics.get('viewCount') else None,
            "like_count": int(statistics.get('likeCount', 0)) if statistics.get('likeCount') else None,
            "comment_count": int(statistics.get('commentCount', 0)) if statistics.get('commentCount') else None,
            "thumbnail_url": snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
            "language": snippet.get('defaultLanguage', 'en'),
            "tags": snippet.get('tags', [])
        }
        
        # Insert video
        video_insert_url = f"{SUPABASE_URL}/rest/v1/youtube_videos"
        video_insert_response = requests.post(
            video_insert_url,
            headers=HEADERS,
            json=video_insert_data
        )
        
        if video_insert_response.status_code not in [200, 201]:
            raise HTTPException(status_code=500, detail=f"Failed to insert video: {video_insert_response.text}")
        
        # Store transcript segments
        transcript_segments = []
        total_characters = 0
        
        for segment in transcript_list:
            segment_data = {
                "video_id": video_id,
                "start_time": segment['start'],
                "end_time": segment['start'] + segment['duration'],
                "duration": segment['duration'],
                "text": segment['text'],
                "source": "auto"
            }
            transcript_segments.append(segment_data)
            total_characters += len(segment['text'])
        
        # Insert transcript segments
        transcript_insert_url = f"{SUPABASE_URL}/rest/v1/youtube_transcripts"
        transcript_insert_response = requests.post(
            transcript_insert_url,
            headers=HEADERS,
            json=transcript_segments
        )
        
        if transcript_insert_response.status_code not in [200, 201]:
            raise HTTPException(status_code=500, detail=f"Failed to insert transcript: {transcript_insert_response.text}")
        
        print(f"✅ Stored {len(transcript_segments)} segments, {total_characters} characters")
        
        return TranscriptResponse(
            success=True,
            video_id=video_id,
            segments_count=len(transcript_segments),
            total_characters=total_characters,
            message=f"Successfully processed video {video_id}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.post("/api/process-chunks", response_model=ChunkingResponse)
async def process_transcript_chunks(request: ChunkingRequest):
    """Process a YouTube video transcript into time-based chunks ready for embedding"""
    try:
        video_id = request.video_id
        print(f"🔄 Processing chunks for video: {video_id}")
        
        # 1. Check if video exists in database
        video_query = f"{SUPABASE_URL}/rest/v1/youtube_videos?select=*&id=eq.{video_id}"
        video_response = requests.get(video_query, headers=HEADERS)
        
        if video_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to check video in database")
        
        videos = video_response.json()
        if not videos:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found in database. Please fetch transcript first.")
        
        video_data = videos[0]
        
        # 2. Check if chunks already exist
        chunks_query = f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks?select=chunk_id&video_id=eq.{video_id}"
        chunks_response = requests.get(chunks_query, headers=HEADERS)
        
        if chunks_response.status_code == 200:
            existing_chunks = chunks_response.json()
            if existing_chunks:
                return ChunkingResponse(
                    success=False,
                    video_id=video_id,
                    chunks_created=0,
                    total_words=0,
                    total_duration=0,
                    avg_words_per_chunk=0,
                    chunks=[],
                    message=f"Chunks already exist for video {video_id}. Found {len(existing_chunks)} existing chunks."
                )
        
        # 3. Fetch transcript segments
        print(f"📥 Fetching transcript segments...")
        try:
            transcript_segments = YouTubeTranscriptApi.get_transcript(video_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch transcript: {str(e)}")
        
        if not transcript_segments:
            raise HTTPException(status_code=404, detail="No transcript segments found")
        
        # 4. Create chunks using our chunking logic
        print(f"✂️  Creating chunks with {request.chunk_duration}s duration, {request.overlap_duration}s overlap...")
        chunks = create_transcript_chunks(
            transcript_segments,
            video_id,
            chunk_duration=request.chunk_duration,
            overlap_duration=request.overlap_duration
        )
        
        if not chunks:
            raise HTTPException(status_code=500, detail="Failed to create chunks from transcript")
        
        # 5. Prepare chunks for database insertion (using new youtube_transcript_chunks schema)
        chunks_for_db = []
        for chunk in chunks:
            chunk_data = {
                "video_id": video_id,
                "chunk_index": chunk["chunk_index"],
                "start_time": chunk["start_time"],
                "end_time": chunk["end_time"],
                "text": chunk["content"],
                "word_count": chunk["word_count"],
                "metadata": {
                    "segment_count": chunk["segment_count"],
                    "duration": round(chunk["end_time"] - chunk["start_time"], 2),
                    "chunk_config": {
                        "chunk_duration": request.chunk_duration,
                        "overlap_duration": request.overlap_duration
                    }
                }
            }
            chunks_for_db.append(chunk_data)
        
        # 6. Insert chunks into Supabase
        print(f"💾 Inserting {len(chunks_for_db)} chunks into database...")
        chunks_url = f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks"
        insert_response = requests.post(
            chunks_url,
            headers=HEADERS,
            json=chunks_for_db
        )
        
        if insert_response.status_code not in [200, 201]:
            error_detail = insert_response.text
            raise HTTPException(
                status_code=500,
                detail=f"Failed to insert chunks into database: {error_detail}"
            )
        
        # 7. Calculate statistics
        total_words = sum(chunk["word_count"] for chunk in chunks)
        total_duration = max(chunk["end_time"] for chunk in chunks)
        avg_words_per_chunk = round(total_words / len(chunks), 1) if chunks else 0
        
        print(f"✅ Successfully created and stored {len(chunks)} chunks")
        
        return ChunkingResponse(
            success=True,
            video_id=video_id,
            chunks_created=len(chunks),
            total_words=total_words,
            total_duration=total_duration,
            avg_words_per_chunk=avg_words_per_chunk,
            chunks=chunks[:5],  # Return first 5 chunks as preview
            message=f"Successfully created {len(chunks)} chunks for video {video_id}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/api/chunks/{video_id}")
async def get_video_chunks(video_id: str, limit: int = 10, offset: int = 0):
    """Retrieve chunks for a specific video with pagination"""
    try:
        # Query chunks with pagination
        chunks_query = f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks?select=*&video_id=eq.{video_id}&order=chunk_index&limit={limit}&offset={offset}"
        response = requests.get(chunks_query, headers=HEADERS)
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch chunks")
        
        chunks = response.json()
        
        # Get total count
        count_query = f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks?select=chunk_id&video_id=eq.{video_id}"
        count_response = requests.get(count_query, headers=HEADERS)
        total_chunks = len(count_response.json()) if count_response.status_code == 200 else 0
        
        return {
            "success": True,
            "video_id": video_id,
            "chunks": chunks,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total_chunks": total_chunks,
                "has_more": offset + len(chunks) < total_chunks
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.get("/api/video/{video_id}")
async def get_video_info(video_id: str):
    """Get video information from database"""
    try:
        query = f"{SUPABASE_URL}/rest/v1/youtube_videos?select=*&id=eq.{video_id}"
        response = requests.get(query, headers=HEADERS)
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch video")
        
        videos = response.json()
        if not videos:
            raise HTTPException(status_code=404, detail="Video not found")
        
        return {"success": True, "video": videos[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 