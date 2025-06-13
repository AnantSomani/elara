#!/usr/bin/env python3

import os
import asyncio
import time
import json
from typing import List, Dict, Optional, Tuple
from openai import OpenAI
import requests
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmbeddingGenerator:
    """
    OpenAI embedding generation service for YouTube transcript chunks
    Handles batch processing, rate limiting, and error recovery
    """
    
    def __init__(self, 
                 model: str = "text-embedding-3-small",
                 dimensions: int = 1536,
                 batch_size: int = 100,
                 max_retries: int = 3):
        """
        Initialize the embedding generator
        
        Args:
            model: OpenAI embedding model to use
            dimensions: Vector dimensions (1536 for text-embedding-3-small)
            batch_size: Number of texts to process per batch
            max_retries: Maximum retry attempts for failed requests
        """
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = model
        self.dimensions = dimensions
        self.batch_size = batch_size
        self.max_retries = max_retries
        
        # Supabase configuration
        self.supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json"
        }
        
        if not all([self.client.api_key, self.supabase_url, self.supabase_key]):
            raise ValueError("Missing required environment variables: OPENAI_API_KEY, SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY")
    
    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for a single text
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector, or None if failed
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for embedding")
            return None
            
        for attempt in range(self.max_retries):
            try:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=text.strip(),
                    dimensions=self.dimensions
                )
                
                embedding = response.data[0].embedding
                logger.info(f"✅ Generated embedding for text (length: {len(text)})")
                return embedding
                
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error(f"Failed to generate embedding after {self.max_retries} attempts")
                    return None
        
        return None
    
    async def batch_generate_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts efficiently
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors (same order as input)
        """
        if not texts:
            return []
            
        embeddings = []
        total_batches = (len(texts) + self.batch_size - 1) // self.batch_size
        
        logger.info(f"🚀 Processing {len(texts)} texts in {total_batches} batches")
        
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            
            logger.info(f"📦 Processing batch {batch_num}/{total_batches} ({len(batch)} items)")
            
            try:
                # OpenAI supports batch requests
                response = self.client.embeddings.create(
                    model=self.model,
                    input=[text.strip() for text in batch if text and text.strip()],
                    dimensions=self.dimensions
                )
                
                batch_embeddings = [data.embedding for data in response.data]
                embeddings.extend(batch_embeddings)
                
                logger.info(f"✅ Batch {batch_num} completed successfully")
                
                # Rate limiting: small delay between batches
                if batch_num < total_batches:
                    await asyncio.sleep(0.5)
                    
            except Exception as e:
                logger.error(f"❌ Batch {batch_num} failed: {str(e)}")
                # Add None for failed batch items
                embeddings.extend([None] * len(batch))
        
        logger.info(f"🎉 Completed embedding generation: {len([e for e in embeddings if e is not None])}/{len(texts)} successful")
        return embeddings
    
    async def get_chunks_without_embeddings(self, video_id: Optional[str] = None) -> List[Dict]:
        """
        Retrieve chunks that don't have embeddings yet
        
        Args:
            video_id: Optional video ID to filter by
            
        Returns:
            List of chunk dictionaries needing embeddings
        """
        try:
            # Build query
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {
                "select": "chunk_id,video_id,text,chunk_index,start_time,end_time",
                "embedding": "is.null",
                "order": "video_id,chunk_index"
            }
            
            if video_id:
                params["video_id"] = f"eq.{video_id}"
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            chunks = response.json()
            logger.info(f"📊 Found {len(chunks)} chunks without embeddings")
            return chunks
            
        except Exception as e:
            logger.error(f"Failed to fetch chunks: {str(e)}")
            return []
    
    async def update_chunk_embedding(self, chunk_id: str, embedding: List[float]) -> bool:
        """
        Update a chunk with its embedding vector
        
        Args:
            chunk_id: Chunk identifier
            embedding: Vector embedding to store
            
        Returns:
            True if successful, False otherwise
        """
        try:
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {"chunk_id": f"eq.{chunk_id}"}
            
            data = {
                "embedding": embedding,
                "updated_at": datetime.utcnow().isoformat()
            }
            
            response = requests.patch(url, headers=self.headers, params=params, json=data)
            response.raise_for_status()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to update chunk {chunk_id}: {str(e)}")
            return False
    
    async def generate_embeddings_for_video(self, video_id: str) -> Dict:
        """
        Generate embeddings for all chunks of a specific video
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Processing results and statistics
        """
        start_time = time.time()
        
        # Get chunks without embeddings
        chunks = await self.get_chunks_without_embeddings(video_id)
        
        if not chunks:
            return {
                "success": True,
                "video_id": video_id,
                "message": "No chunks found or all chunks already have embeddings",
                "processed_count": 0,
                "failed_count": 0,
                "processing_time": 0
            }
        
        logger.info(f"🎯 Generating embeddings for {len(chunks)} chunks from video {video_id}")
        
        # Extract texts for embedding
        texts = [chunk.get("text", "") for chunk in chunks]
        
        # Generate embeddings
        embeddings = await self.batch_generate_embeddings(texts)
        
        # Update database
        successful_updates = 0
        failed_updates = 0
        
        for chunk, embedding in zip(chunks, embeddings):
            if embedding is not None:
                success = await self.update_chunk_embedding(chunk["chunk_id"], embedding)
                if success:
                    successful_updates += 1
                else:
                    failed_updates += 1
            else:
                failed_updates += 1
        
        processing_time = time.time() - start_time
        
        logger.info(f"🎉 Embedding generation complete: {successful_updates} successful, {failed_updates} failed")
        
        return {
            "success": successful_updates > 0,
            "video_id": video_id,
            "message": f"Processed {successful_updates}/{len(chunks)} chunks successfully",
            "processed_count": successful_updates,
            "failed_count": failed_updates,
            "processing_time": round(processing_time, 2),
            "embeddings_generated": successful_updates,
            "cost_estimate": self._estimate_cost(len(texts))
        }
    
    async def get_embedding_status(self, video_id: str) -> Dict:
        """
        Check embedding generation status for a video
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Status information about embeddings
        """
        try:
            # Count total chunks
            total_url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            total_params = {
                "select": "count",
                "video_id": f"eq.{video_id}"
            }
            
            total_response = requests.get(total_url, headers=self.headers, params=total_params)
            total_response.raise_for_status()
            total_count = len(total_response.json())
            
            # Count chunks with embeddings
            embedded_params = {
                "select": "count",
                "video_id": f"eq.{video_id}",
                "embedding": "not.is.null"
            }
            
            embedded_response = requests.get(total_url, headers=self.headers, params=embedded_params)
            embedded_response.raise_for_status()
            embedded_count = len(embedded_response.json())
            
            completion_percentage = (embedded_count / total_count * 100) if total_count > 0 else 0
            
            return {
                "video_id": video_id,
                "total_chunks": total_count,
                "embedded_chunks": embedded_count,
                "pending_chunks": total_count - embedded_count,
                "completion_percentage": round(completion_percentage, 1),
                "status": "complete" if completion_percentage == 100 else "incomplete"
            }
            
        except Exception as e:
            logger.error(f"Failed to get embedding status: {str(e)}")
            return {
                "video_id": video_id,
                "error": str(e),
                "status": "error"
            }
    
    def _estimate_cost(self, text_count: int) -> float:
        """
        Estimate the cost of embedding generation
        
        Args:
            text_count: Number of texts to embed
            
        Returns:
            Estimated cost in USD
        """
        # OpenAI pricing for text-embedding-3-small: $0.00002 per 1K tokens
        # Rough estimate: ~750 tokens per chunk
        estimated_tokens = text_count * 750
        estimated_cost = (estimated_tokens / 1000) * 0.00002
        return round(estimated_cost, 4)
    
    def _parse_embedding(self, embedding_data) -> Optional[List[float]]:
        """
        Convert embedding from Supabase API format to list of floats
        
        Supabase returns vector data as strings via REST API, but we need lists.
        This method handles the conversion reliably.
        
        Args:
            embedding_data: Raw embedding data from Supabase (string, list, or None)
            
        Returns:
            List of floats representing the embedding vector, or None if invalid
        """
        if embedding_data is None:
            return None
        elif isinstance(embedding_data, list):
            # Already a list - return as-is
            return embedding_data
        elif isinstance(embedding_data, str):
            try:
                # Parse string format: "[-0.123, 0.456, ...]" → [-0.123, 0.456, ...]
                parsed = json.loads(embedding_data)
                if isinstance(parsed, list) and all(isinstance(x, (int, float)) for x in parsed):
                    return [float(x) for x in parsed]  # Ensure all elements are floats
                else:
                    logger.warning(f"Parsed embedding is not a valid numeric list: {type(parsed)}")
                    return None
            except (json.JSONDecodeError, ValueError, TypeError) as e:
                logger.warning(f"Failed to parse embedding string: {str(e)}")
                return None
        else:
            logger.warning(f"Unexpected embedding data type: {type(embedding_data)}")
            return None
    
    async def test_connection(self) -> Dict:
        """
        Test connection to OpenAI API and Supabase
        
        Returns:
            Connection status information
        """
        results = {
            "openai_api": "unknown",
            "supabase": "unknown",
            "embedding_model": self.model,
            "dimensions": self.dimensions
        }
        
        # Test OpenAI API
        try:
            test_response = self.client.embeddings.create(
                model=self.model,
                input="test connection",
                dimensions=self.dimensions
            )
            if test_response.data and len(test_response.data[0].embedding) == self.dimensions:
                results["openai_api"] = "healthy"
            else:
                results["openai_api"] = "unhealthy"
        except Exception as e:
            results["openai_api"] = f"error: {str(e)}"
        
        # Test Supabase
        try:
            response = requests.get(f"{self.supabase_url}/rest/v1/", headers=self.headers)
            results["supabase"] = "healthy" if response.status_code == 200 else "unhealthy"
        except Exception as e:
            results["supabase"] = f"error: {str(e)}"
        
        return results
    
    async def validate_embeddings(self, video_id: str) -> Dict:
        """
        Validate that embeddings are properly stored and have correct dimensions
        
        Args:
            video_id: YouTube video ID to validate
            
        Returns:
            Validation results
        """
        try:
            # Get chunks with embeddings
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {
                "select": "chunk_id,video_id,embedding",
                "video_id": f"eq.{video_id}",
                "embedding": "not.is.null"
            }
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            chunks = response.json()
            
            if not chunks:
                return {
                    "video_id": video_id,
                    "status": "no_embeddings",
                    "message": "No embeddings found for this video"
                }
            
            # Validate dimensions using the parser helper
            valid_embeddings = 0
            invalid_embeddings = 0
            
            for chunk in chunks:
                embedding_raw = chunk.get("embedding")
                embedding_parsed = self._parse_embedding(embedding_raw)
                if embedding_parsed and len(embedding_parsed) == self.dimensions:
                    valid_embeddings += 1
                else:
                    invalid_embeddings += 1
            
            return {
                "video_id": video_id,
                "status": "valid" if invalid_embeddings == 0 else "invalid",
                "total_chunks": len(chunks),
                "valid_embeddings": valid_embeddings,
                "invalid_embeddings": invalid_embeddings,
                "expected_dimensions": self.dimensions,
                "validation_percentage": round((valid_embeddings / len(chunks)) * 100, 1) if chunks else 0
            }
            
        except Exception as e:
            logger.error(f"Failed to validate embeddings: {str(e)}")
            return {
                "video_id": video_id,
                "status": "error",
                "error": str(e)
            }
    
    async def regenerate_embeddings(self, video_id: str, force: bool = False) -> Dict:
        """
        Regenerate embeddings for a video, optionally forcing regeneration of existing embeddings
        
        Args:
            video_id: YouTube video ID
            force: If True, regenerate even if embeddings exist
            
        Returns:
            Regeneration results
        """
        if force:
            # Clear existing embeddings
            try:
                url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
                params = {"video_id": f"eq.{video_id}"}
                data = {"embedding": None}
                
                response = requests.patch(url, headers=self.headers, params=params, json=data)
                response.raise_for_status()
                
                logger.info(f"🔄 Cleared existing embeddings for video {video_id}")
                
            except Exception as e:
                logger.error(f"Failed to clear embeddings: {str(e)}")
                return {
                    "success": False,
                    "video_id": video_id,
                    "message": f"Failed to clear existing embeddings: {str(e)}"
                }
        
        # Generate new embeddings
        return await self.generate_embeddings_for_video(video_id)
    
    def get_processing_stats(self) -> Dict:
        """
        Get processing statistics and configuration
        
        Returns:
            Current configuration and stats
        """
        return {
            "model": self.model,
            "dimensions": self.dimensions,
            "batch_size": self.batch_size,
            "max_retries": self.max_retries,
            "cost_per_1k_tokens": 0.00002,
            "estimated_tokens_per_chunk": 750
        }


# Convenience function for quick testing
async def test_embedding_service() -> Dict:
    """
    Quick test function for the embedding service
    
    Returns:
        Test results
    """
    try:
        generator = EmbeddingGenerator()
        
        # Test connection
        connection_test = await generator.test_connection()
        
        # Test single embedding
        test_text = "This is a test sentence for embedding generation."
        embedding = await generator.generate_embedding(test_text)
        
        return {
            "connection_test": connection_test,
            "single_embedding_test": {
                "success": embedding is not None,
                "dimensions": len(embedding) if embedding else 0,
                "expected_dimensions": 1536
            },
            "service_ready": embedding is not None and len(embedding) == 1536
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "service_ready": False
        } 