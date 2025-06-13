"""
Database configuration and connection management for YouTube Transcript Service
"""

import os
import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import asyncpg
from supabase import create_client, Client
import openai
import numpy as np
from dotenv import load_dotenv

# Load environment variables from multiple possible locations
load_dotenv()  # Local .env file
load_dotenv('../.env.local')  # Parent directory .env.local

logger = logging.getLogger(__name__)

class DatabaseManager:
    """
    Manages database connections and operations for the YouTube transcript service
    """
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        # Use DATABASE_URL directly from environment
        self.database_url = os.getenv("DATABASE_URL")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        # Initialize clients
        self.supabase: Optional[Client] = None
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.openai_client = None
        
        if self.openai_api_key:
            openai.api_key = self.openai_api_key
            self.openai_client = openai.OpenAI(api_key=self.openai_api_key)
    
    async def initialize(self):
        """Initialize database connections"""
        try:
            # Skip Supabase Python client for now, use direct PostgreSQL
            # Initialize PostgreSQL connection pool with connection pooling disabled for testing
            if self.database_url:
                try:
                    # Try to create a single connection first to test
                    test_conn = await asyncpg.connect(self.database_url, statement_cache_size=0)
                    await test_conn.close()
                    
                    # If test succeeds, create the pool
                    self.pg_pool = await asyncpg.create_pool(
                        self.database_url,
                        min_size=1,
                        max_size=5,
                        command_timeout=30,
                        statement_cache_size=0,  # Required for pgbouncer compatibility
                        server_settings={'application_name': 'youtube_transcript_service'}
                    )
                    logger.info("✅ PostgreSQL connection pool initialized")
                except Exception as conn_error:
                    logger.error(f"❌ PostgreSQL connection failed: {conn_error}")
                    # Try alternative connection method
                    logger.info("🔄 Trying alternative connection method...")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"❌ Database initialization failed: {e}")
            return False
    
    async def close(self):
        """Close database connections"""
        if self.pg_pool:
            await self.pg_pool.close()
            logger.info("🔒 PostgreSQL connection pool closed")
    
    async def get_or_create_channel(self, channel_data: Dict[str, Any]) -> str:
        """
        Get existing channel or create new one
        Returns channel_id
        """
        if not self.pg_pool:
            raise Exception("Database not initialized")
        
        async with self.pg_pool.acquire() as conn:
            # Check if channel exists
            existing = await conn.fetchrow(
                "SELECT id FROM youtube_channels WHERE id = $1",
                channel_data['id']
            )
            
            if existing:
                return existing['id']
            
            # Create new channel
            await conn.execute("""
                INSERT INTO youtube_channels (
                    id, name, description, subscriber_count, video_count, 
                    view_count, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    subscriber_count = EXCLUDED.subscriber_count,
                    video_count = EXCLUDED.video_count,
                    view_count = EXCLUDED.view_count,
                    updated_at = EXCLUDED.updated_at
            """,
                channel_data['id'],
                channel_data.get('name', ''),
                channel_data.get('description', ''),
                channel_data.get('subscriber_count', 0),
                channel_data.get('video_count', 0),
                channel_data.get('view_count', 0),
                datetime.now(timezone.utc),
                datetime.now(timezone.utc)
            )
            
            logger.info(f"📺 Created/updated channel: {channel_data['id']}")
            return channel_data['id']
    
    async def save_video_metadata(self, video_data: Dict[str, Any]) -> str:
        """
        Save video metadata to database
        Returns video_id
        """
        if not self.pg_pool:
            raise Exception("Database not initialized")
        
        async with self.pg_pool.acquire() as conn:
            # Provide default published_at if not available
            published_at = video_data.get('published_at')
            logger.info(f"🔧 DEBUG: published_at from video_data: {published_at}")
            if not published_at:
                published_at = datetime.now(timezone.utc)  # Use current time as fallback
                logger.info(f"🔧 DEBUG: Using fallback published_at: {published_at}")
            
            await conn.execute("""
                INSERT INTO youtube_videos (
                    id, channel_id, title, description, published_at,
                    duration_seconds, view_count, like_count, comment_count,
                    has_captions, transcript_status, tags, category,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    view_count = EXCLUDED.view_count,
                    like_count = EXCLUDED.like_count,
                    comment_count = EXCLUDED.comment_count,
                    has_captions = EXCLUDED.has_captions,
                    transcript_status = EXCLUDED.transcript_status,
                    updated_at = EXCLUDED.updated_at
            """,
                video_data['id'],
                video_data['channel_id'],
                video_data.get('title', ''),
                video_data.get('description', ''),
                published_at,
                video_data.get('duration_seconds', 0),
                video_data.get('view_count', 0),
                video_data.get('like_count', 0),
                video_data.get('comment_count', 0),
                video_data.get('has_captions', False),
                video_data.get('transcript_status', 'pending'),
                video_data.get('tags', []),
                video_data.get('category', ''),
                datetime.now(timezone.utc),
                datetime.now(timezone.utc)
            )
            
            logger.info(f"🎥 Saved video metadata: {video_data['id']}")
            return video_data['id']
    
    async def save_transcript(self, video_id: str, channel_id: str, transcript_data: Dict[str, Any]) -> str:
        """
        Save full transcript to database
        Returns transcript_id
        """
        if not self.pg_pool:
            raise Exception("Database not initialized")
        
        async with self.pg_pool.acquire() as conn:
            # Save full transcript
            transcript_id = await conn.fetchval("""
                INSERT INTO youtube_transcripts (
                    video_id, channel_id, language, content, segment_count,
                    total_duration, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (video_id, language) DO UPDATE SET
                    content = EXCLUDED.content,
                    segment_count = EXCLUDED.segment_count,
                    total_duration = EXCLUDED.total_duration,
                    updated_at = EXCLUDED.updated_at
                RETURNING id
            """,
                video_id,
                channel_id,
                transcript_data['language'],
                transcript_data['content'],
                transcript_data['segment_count'],
                transcript_data['total_duration'],
                datetime.now(timezone.utc),
                datetime.now(timezone.utc)
            )
            
            logger.info(f"📝 Saved transcript: {transcript_id}")
            return str(transcript_id)
    
    async def save_transcript_segments(self, video_id: str, segments: List[Dict[str, Any]]):
        """
        Save individual transcript segments to database
        """
        if not self.pg_pool:
            raise Exception("Database not initialized")
        
        async with self.pg_pool.acquire() as conn:
            # Clear existing segments for this video
            await conn.execute(
                "DELETE FROM youtube_transcript_segments WHERE video_id = $1",
                video_id
            )
            
            # Insert new segments
            for i, segment in enumerate(segments):
                await conn.execute("""
                    INSERT INTO youtube_transcript_segments (
                        video_id, segment_index, text, start_time, end_time,
                        duration, keywords, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                    video_id,
                    i,
                    segment['text'],
                    segment['start'],
                    segment.get('end', segment['start'] + segment['duration']),
                    segment['duration'],
                    segment.get('keywords', []),
                    datetime.now(timezone.utc)
                )
            
            logger.info(f"📊 Saved {len(segments)} transcript segments for video: {video_id}")
    
    async def generate_embeddings(self, text: str) -> List[float]:
        """
        Generate embeddings for text using OpenAI
        """
        if not self.openai_client:
            raise Exception("OpenAI client not initialized")
        
        try:
            response = self.openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
                encoding_format="float"
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"❌ Embedding generation failed: {e}")
            raise
    
    async def save_embeddings(self, content_id: str, content_type: str, text: str, embeddings: List[float], metadata: Dict[str, Any] = None):
        """
        Save embeddings to database
        """
        if not self.pg_pool:
            raise Exception("Database not initialized")
        
        async with self.pg_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO youtube_embeddings (
                    content_id, content_type, embedding, chunk_text, 
                    chunk_index, model, metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (content_id, content_type, chunk_index) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    chunk_text = EXCLUDED.chunk_text,
                    model = EXCLUDED.model,
                    metadata = EXCLUDED.metadata,
                    created_at = EXCLUDED.created_at
            """,
                content_id,
                content_type,
                embeddings,
                text[:1000],  # Truncate for storage
                metadata.get('chunk_index', 0) if metadata else 0,
                "text-embedding-3-small",
                metadata or {},
                datetime.now(timezone.utc)
            )
    
    async def search_transcripts(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search transcripts using our database functions
        """
        if not self.pg_pool:
            raise Exception("Database not initialized")
        
        async with self.pg_pool.acquire() as conn:
            # Generate embedding for the query
            query_embedding = await self.generate_embeddings(query)
            
            # Use our unified search function
            results = await conn.fetch("""
                SELECT * FROM search_youtube_unified($1, $2, 'auto', $3)
            """, query, query_embedding, limit)
            
            return [dict(row) for row in results]

# Global database manager instance
db_manager = DatabaseManager() 