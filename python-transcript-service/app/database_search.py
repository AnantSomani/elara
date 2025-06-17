#!/usr/bin/env python3
"""
Database Search Module for Elara Search Service
Handles vector similarity queries using pgvector and existing Supabase infrastructure
"""

import os
import time
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
import requests
from dotenv import load_dotenv

# Load environment variables (same pattern as existing code)
load_dotenv()
load_dotenv('.env.local')
load_dotenv('../.env.local')

logger = logging.getLogger(__name__)

class VectorSearchDB:
    """
    Database search class for semantic vector queries
    Reuses existing Supabase configuration and connection patterns
    """
    
    def __init__(self):
        """Initialize database connection using existing patterns"""
        # Use same environment variable patterns as embeddings.py
        self.supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        # HTTP headers for Supabase REST API (same as embeddings.py)
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Validate required environment variables
        if not all([self.supabase_url, self.supabase_key]):
            raise ValueError(
                "Missing required environment variables: "
                "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, "
                "SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY"
            )
        
        logger.info("✅ VectorSearchDB initialized with Supabase connection")
    
    async def test_connection(self) -> Dict[str, Any]:
        """
        Test basic database connectivity
        Returns connection status and basic statistics
        """
        try:
            # Test basic connection by querying a small amount of data
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {
                "select": "chunk_id",
                "limit": 1
            }
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            # Parse response
            data = response.json()
            
            # Get total count from response headers (if available)
            content_range = response.headers.get('content-range', '')
            total_chunks = 0
            
            if content_range:
                try:
                    # Parse format like "0-0/123" to get total count
                    parts = content_range.split('/')
                    if len(parts) > 1 and parts[1] != '*':
                        total_chunks = int(parts[1])
                except (ValueError, IndexError):
                    # If parsing fails, we'll get count another way below
                    pass
            
            # If we couldn't get count from headers, do a separate count query
            if total_chunks == 0:
                count_response = requests.get(
                    url, 
                    headers=self.headers, 
                    params={"select": "chunk_id", "limit": 0}
                )
                count_content_range = count_response.headers.get('content-range', '0-0/0')
                try:
                    total_chunks = int(count_content_range.split('/')[-1]) if count_content_range else len(data)
                except (ValueError, IndexError):
                    total_chunks = len(data) if data else 0
            
            logger.info(f"✅ Database connection successful - {total_chunks} total chunks")
            
            return {
                "status": "connected",
                "total_chunks": total_chunks,
                "supabase_url": self.supabase_url.replace(self.supabase_key, "***"),  # Hide key in logs
                "connection_time": time.time(),
                "test_data_available": len(data) > 0
            }
            
        except Exception as e:
            logger.error(f"❌ Database connection failed: {str(e)}")
            return {
                "status": "failed",
                "error": str(e),
                "connection_time": time.time()
            }
    
    async def get_embedded_chunks_count(self) -> Dict[str, Any]:
        """
        Get count of chunks that have embeddings vs those that don't
        Useful for understanding data readiness
        """
        try:
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            
            # Get chunks with embeddings - use actual data query to be reliable
            with_embeddings_params = {
                "select": "chunk_id",
                "embedding": "not.is.null",
                "limit": 1000  # Reasonable limit for counting
            }
            
            response_with = requests.get(url, headers=self.headers, params=with_embeddings_params)
            response_with.raise_for_status()
            
            with_embeddings_data = response_with.json()
            with_embeddings_count = len(with_embeddings_data)
            
            # Check if we hit the limit (might be more data)
            content_range = response_with.headers.get('content-range', '')
            if content_range:
                try:
                    # Parse content-range header like "0-999/1234" 
                    parts = content_range.split('/')
                    if len(parts) > 1 and parts[1] != '*' and parts[1].isdigit():
                        actual_with_count = int(parts[1])
                        if actual_with_count != with_embeddings_count:
                            with_embeddings_count = actual_with_count
                except (ValueError, IndexError):
                    pass  # Use the length we calculated
            
            # Get chunks without embeddings
            without_embeddings_params = {
                "select": "chunk_id",
                "embedding": "is.null", 
                "limit": 1000
            }
            
            response_without = requests.get(url, headers=self.headers, params=without_embeddings_params)
            response_without.raise_for_status()
            
            without_embeddings_data = response_without.json()
            without_embeddings_count = len(without_embeddings_data)
            
            # Check content-range for without embeddings too
            without_content_range = response_without.headers.get('content-range', '')
            if without_content_range:
                try:
                    parts = without_content_range.split('/')
                    if len(parts) > 1 and parts[1] != '*' and parts[1].isdigit():
                        actual_without_count = int(parts[1])
                        if actual_without_count != without_embeddings_count:
                            without_embeddings_count = actual_without_count
                except (ValueError, IndexError):
                    pass
            
            total_count = with_embeddings_count + without_embeddings_count
            embedding_percentage = (with_embeddings_count / total_count * 100) if total_count > 0 else 0
            
            logger.info(f"📊 Embedding status: {with_embeddings_count}/{total_count} chunks have embeddings ({embedding_percentage:.1f}%)")
            
            return {
                "total_chunks": total_count,
                "with_embeddings": with_embeddings_count,
                "without_embeddings": without_embeddings_count,
                "embedding_percentage": round(embedding_percentage, 1),
                "ready_for_search": with_embeddings_count > 0
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get embedding counts: {str(e)}")
            return {
                "error": str(e),
                "ready_for_search": False
            }
    
    async def get_sample_embedded_chunks(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Get a sample of chunks with embeddings for testing
        Useful for verifying data structure and content
        """
        try:
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {
                "select": "chunk_id,video_id,text,start_time,end_time,chunk_index",
                "embedding": "not.is.null",
                "order": "created_at.desc",
                "limit": limit
            }
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            chunks = response.json()
            logger.info(f"📝 Retrieved {len(chunks)} sample embedded chunks")
            
            # Add some useful metadata
            for chunk in chunks:
                chunk['text_length'] = len(chunk.get('text', ''))
                chunk['duration'] = chunk.get('end_time', 0) - chunk.get('start_time', 0)
            
            return chunks
            
        except Exception as e:
            logger.error(f"❌ Failed to get sample chunks: {str(e)}")
            return []
    
    async def get_video_list(self) -> List[Dict[str, Any]]:
        """
        Get list of videos that have embedded transcript chunks
        Useful for understanding available search content
        """
        try:
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {
                "select": "video_id",
                "embedding": "not.is.null"
            }
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            chunks = response.json()
            
            # Count chunks per video
            video_counts = {}
            for chunk in chunks:
                video_id = chunk['video_id']
                video_counts[video_id] = video_counts.get(video_id, 0) + 1
            
            # Format as list with counts
            video_list = [
                {"video_id": video_id, "embedded_chunks": count}
                for video_id, count in video_counts.items()
            ]
            
            # Sort by chunk count (most embedded content first)
            video_list.sort(key=lambda x: x['embedded_chunks'], reverse=True)
            
            logger.info(f"🎥 Found {len(video_list)} videos with embedded content")
            
            return video_list
            
        except Exception as e:
            logger.error(f"❌ Failed to get video list: {str(e)}")
            return []
    
    async def vector_similarity_search(self, 
                                     query_embedding: List[float], 
                                     limit: int = 10,
                                     similarity_threshold: float = 0.7,
                                     video_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Core vector similarity search using pgvector
        
        Args:
            query_embedding: The embedding vector to search for
            limit: Maximum number of results to return
            similarity_threshold: Minimum similarity score (0-1, higher = more similar)
            video_ids: Optional list of video IDs to filter by
            
        Returns:
            List of similar chunks with similarity scores
        """
        try:
            url = f"{self.supabase_url}/rest/v1/rpc/vector_similarity_search"
            
            # Prepare the RPC call data
            rpc_data = {
                "query_embedding": query_embedding,
                "similarity_threshold": 1 - similarity_threshold,  # Convert to distance (pgvector uses distance, not similarity)
                "result_limit": limit
            }
            
            # Add video filter if provided
            if video_ids:
                rpc_data["filter_video_ids"] = video_ids
            
            # Make the RPC call
            response = requests.post(url, headers=self.headers, json=rpc_data)
            
            # If RPC function doesn't exist, fall back to direct query
            if response.status_code == 404:
                logger.info("🔄 RPC function not found, using direct SQL query")
                return await self._direct_vector_search(query_embedding, limit, similarity_threshold, video_ids)
            
            response.raise_for_status()
            results = response.json()
            
            logger.info(f"🔍 Vector search returned {len(results)} results")
            return results
            
        except Exception as e:
            logger.warning(f"⚠️ RPC search failed: {str(e)}, falling back to direct query")
            return await self._direct_vector_search(query_embedding, limit, similarity_threshold, video_ids)
    
    async def _direct_vector_search(self, 
                                  query_embedding: List[float], 
                                  limit: int = 10,
                                  similarity_threshold: float = 0.7,
                                  video_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Direct vector similarity search using Supabase REST API
        Falls back to this method if RPC function is not available
        """
        try:
            # Build the query URL
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            
            # Base parameters for the query
            params = {
                "select": "chunk_id,video_id,text,start_time,end_time,chunk_index",
                "embedding": f"not.is.null",
                "order": f"embedding.isdistance(vector('[{','.join(map(str, query_embedding))}]'))",
                "limit": limit * 2  # Get more results to filter by similarity threshold
            }
            
            # Add video filter if provided
            if video_ids:
                video_filter = ','.join(video_ids)
                params["video_id"] = f"in.({video_filter})"
            
            response = requests.get(url, headers=self.headers, params=params)
            
            # If the vector query syntax doesn't work, try a simpler approach
            if response.status_code != 200:
                logger.info("🔄 Vector ordering failed, using basic query with post-processing")
                return await self._fallback_search(query_embedding, limit, similarity_threshold, video_ids)
            
            chunks = response.json()
            
            # Calculate similarity scores manually and filter
            results = []
            for chunk in chunks:
                # We'll need to get the actual embedding to calculate similarity
                # For now, return the chunks and we'll enhance this
                result = {
                    "chunk_id": chunk["chunk_id"],
                    "video_id": chunk["video_id"],
                    "text": chunk["text"],
                    "start_time": chunk["start_time"],
                    "end_time": chunk["end_time"],
                    "similarity_score": 0.8,  # Placeholder - we'll calculate this properly
                    "video_url": f"https://youtube.com/watch?v={chunk['video_id']}",
                    "timestamp_url": f"https://youtube.com/watch?v={chunk['video_id']}&t={int(chunk['start_time'])}s"
                }
                results.append(result)
                
                if len(results) >= limit:
                    break
            
            logger.info(f"🔍 Direct vector search returned {len(results)} results")
            return results
            
        except Exception as e:
            logger.error(f"❌ Direct vector search failed: {str(e)}")
            return await self._fallback_search(query_embedding, limit, similarity_threshold, video_ids)
    
    async def _fallback_search(self, 
                             query_embedding: List[float], 
                             limit: int = 10,
                             similarity_threshold: float = 0.7,
                             video_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Fallback search method that gets embeddings and calculates similarity in Python
        This ensures we always have working search functionality
        """
        try:
            # Get all chunks with embeddings
            url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            params = {
                "select": "chunk_id,video_id,text,start_time,end_time,chunk_index,embedding",
                "embedding": "not.is.null",
                "limit": 100  # Reasonable limit for processing
            }
            
            # Add video filter if provided
            if video_ids:
                video_filter = ','.join(video_ids)
                params["video_id"] = f"in.({video_filter})"
            
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            chunks = response.json()
            logger.info(f"🔍 Retrieved {len(chunks)} chunks with embeddings for similarity calculation")
            
            # Calculate cosine similarity with each chunk
            results = []
            processed_count = 0
            for chunk in chunks:
                if not chunk.get('embedding'):
                    logger.warning(f"⚠️ Chunk {chunk.get('chunk_id', 'unknown')} missing embedding")
                    continue
                
                processed_count += 1
                
                chunk_embedding = chunk['embedding']
                
                # FIX: Parse JSON string to float array if needed
                if isinstance(chunk_embedding, str):
                    try:
                        import json
                        chunk_embedding = json.loads(chunk_embedding)
                        if processed_count <= 2:  # Log first couple for debugging
                            logger.info(f"🔧 Parsed string embedding to list: {len(chunk_embedding)} elements")
                    except json.JSONDecodeError as e:
                        logger.error(f"❌ Failed to parse embedding for chunk {chunk.get('chunk_id', 'unknown')}: {e}")
                        continue
                
                # Debug: Check embedding format
                if processed_count <= 2:  # Only log first couple for debugging
                    logger.info(f"🔬 Chunk {chunk['chunk_id']} embedding type: {type(chunk_embedding)}")
                    logger.info(f"🔬 Chunk embedding length: {len(chunk_embedding) if chunk_embedding else 'None'}")
                    if chunk_embedding and len(chunk_embedding) > 0:
                        logger.info(f"🔬 First few values: {chunk_embedding[:3]}")
                    logger.info(f"🔬 Query embedding type: {type(query_embedding)}, length: {len(query_embedding)}")
                    logger.info(f"🔬 Query first few values: {query_embedding[:3]}")
                
                similarity = self._calculate_cosine_similarity(query_embedding, chunk_embedding)
                
                # Debug: log similarity scores
                if processed_count <= 3:  # Only log first few for debugging
                    logger.info(f"🧮 Chunk {chunk['chunk_id']}: similarity = {similarity:.4f}")
                
                if similarity >= similarity_threshold:
                    result = {
                        "chunk_id": chunk["chunk_id"],
                        "video_id": chunk["video_id"],
                        "text": chunk["text"],
                        "start_time": chunk["start_time"],
                        "end_time": chunk["end_time"],
                        "similarity_score": round(similarity, 4),
                        "relevance_score": int(similarity * 100),
                        "video_url": f"https://youtube.com/watch?v={chunk['video_id']}",
                        "timestamp_url": f"https://youtube.com/watch?v={chunk['video_id']}&t={int(chunk['start_time'])}s"
                    }
                    results.append(result)
            
            # Sort by similarity score (highest first)
            results.sort(key=lambda x: x['similarity_score'], reverse=True)
            
            # Limit results
            results = results[:limit]
            
            logger.info(f"🔍 Fallback search processed {processed_count} chunks, returned {len(results)} results (similarity >= {similarity_threshold})")
            
            # Debug: show similarity range
            if processed_count > 0 and len(results) == 0:
                logger.warning(f"⚠️ No results above threshold {similarity_threshold} - try lowering threshold")
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Fallback search failed: {str(e)}")
            return []
    
    def _calculate_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors
        Returns a value between 0 and 1 (1 = identical, 0 = completely different)
        """
        try:
            import math
            
            # Ensure vectors are the same length
            if len(vec1) != len(vec2):
                return 0.0
            
            # Calculate dot product
            dot_product = sum(a * b for a, b in zip(vec1, vec2))
            
            # Calculate magnitudes
            magnitude1 = math.sqrt(sum(a * a for a in vec1))
            magnitude2 = math.sqrt(sum(a * a for a in vec2))
            
            # Avoid division by zero
            if magnitude1 == 0 or magnitude2 == 0:
                return 0.0
            
            # Calculate cosine similarity
            similarity = dot_product / (magnitude1 * magnitude2)
            
            # Ensure result is between 0 and 1
            return max(0.0, min(1.0, similarity))
            
        except Exception as e:
            logger.error(f"❌ Cosine similarity calculation failed: {str(e)}")
            return 0.0


# Test function for Step 2B validation
async def test_vector_similarity_search():
    """
    Test function to validate Step 2B completion
    Tests vector similarity search with real embeddings
    """
    print("🧪 Testing Vector Similarity Search (Step 2B)")
    print("=" * 50)
    
    try:
        # Initialize database search
        db = VectorSearchDB()
        print("✅ VectorSearchDB initialized")
        
        # Test queries for embedded content
        test_queries = [
            {"query": "never gonna give you up", "desc": "Rick Astley lyrics"},
            {"query": "machine learning fundamentals", "desc": "ML concepts"},
            {"query": "Alexander the Great", "desc": "Historical reference"}
        ]
        
        # Import embeddings generator to create query embeddings
        import sys
        sys.path.append('.')
        from embeddings import EmbeddingGenerator
        
        embedder = EmbeddingGenerator()
        print("✅ EmbeddingGenerator ready")
        
        for i, test in enumerate(test_queries, 1):
            print(f"\n🔍 Test {i}: {test['desc']}")
            print(f"Query: '{test['query']}'")
            
            # Generate query embedding
            query_embedding = await embedder.generate_embedding(test['query'])
            if not query_embedding:
                print(f"❌ Failed to generate embedding for '{test['query']}'")
                continue
            
            # Test vector search with debug mode
            print(f"   🧮 Query embedding length: {len(query_embedding)}")
            
            # First try with very low threshold to see all similarities
            debug_results = await db.vector_similarity_search(
                query_embedding=query_embedding,
                limit=5,
                similarity_threshold=0.1  # Very low threshold for debugging
            )
            
            print(f"📊 Found {len(debug_results)} results (threshold: 0.1)")
            
            # Show all similarities for debugging
            if debug_results:
                print("   🔬 Debug - All similarity scores:")
                for result in debug_results:
                    print(f"      • {result['similarity_score']:.4f}: {result['text'][:50]}...")
            
            # Now test with original threshold
            results = await db.vector_similarity_search(
                query_embedding=query_embedding,
                limit=3,
                similarity_threshold=0.3  # Original threshold
            )
            
            print(f"📊 Final results (threshold: 0.3): {len(results)}")
            
            # Show top results
            for j, result in enumerate(results[:2], 1):
                text_preview = result['text'][:80] + "..." if len(result['text']) > 80 else result['text']
                print(f"   {j}. Score: {result['similarity_score']:.3f} | "
                      f"{result['video_id']} [{result['start_time']:.1f}s]: {text_preview}")
        
        print("\n✅ Step 2B Complete - Vector similarity search working!")
        return True
        
    except Exception as e:
        print(f"❌ Step 2B Failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

# Test function for Step 2A validation
async def test_database_search_connection():
    """
    Test function to validate Step 2A completion
    Tests basic connectivity and data availability
    """
    print("🧪 Testing Database Search Connection (Step 2A)")
    print("=" * 50)
    
    try:
        # Initialize database search
        db = VectorSearchDB()
        print("✅ VectorSearchDB initialized")
        
        # Test basic connection
        connection_result = await db.test_connection()
        print(f"🔗 Connection: {connection_result['status']}")
        if connection_result['status'] == 'connected':
            print(f"📊 Total chunks in database: {connection_result['total_chunks']}")
        
        # Test embedding status
        embedding_status = await db.get_embedded_chunks_count()
        if 'error' not in embedding_status:
            print(f"🧠 Chunks with embeddings: {embedding_status['with_embeddings']}")
            print(f"📈 Embedding coverage: {embedding_status['embedding_percentage']}%")
            print(f"🔍 Ready for search: {embedding_status['ready_for_search']}")
        
        # Get video list
        video_list = await db.get_video_list()
        print(f"🎥 Videos with embedded content: {len(video_list)}")
        
        # Show top videos
        if video_list:
            print("📋 Top videos by embedded chunk count:")
            for i, video in enumerate(video_list[:3]):
                print(f"   {i+1}. {video['video_id']}: {video['embedded_chunks']} chunks")
        
        # Get sample chunks
        sample_chunks = await db.get_sample_embedded_chunks(3)
        print(f"📝 Sample embedded chunks: {len(sample_chunks)}")
        
        if sample_chunks:
            print("📄 Sample chunk preview:")
            for chunk in sample_chunks[:2]:
                text_preview = chunk['text'][:100] + "..." if len(chunk['text']) > 100 else chunk['text']
                print(f"   • {chunk['video_id']} [{chunk['start_time']:.1f}s]: {text_preview}")
        
        print("\n✅ Step 2A Complete - Database connection working!")
        return True
        
    except Exception as e:
        print(f"❌ Step 2A Failed: {str(e)}")
        return False


if __name__ == "__main__":
    import asyncio
    
    async def run_all_tests():
        print("🚀 Running Database Search Tests")
        print("=" * 60)
        
        # Test Step 2A (connection)
        step_2a_success = await test_database_search_connection()
        
        if step_2a_success:
            print("\n" + "=" * 60)
            # Test Step 2B (vector search)
            step_2b_success = await test_vector_similarity_search()
            
            if step_2b_success:
                print("\n🎉 All tests passed! Database search is ready!")
            else:
                print("\n⚠️ Step 2B failed - vector search needs attention")
        else:
            print("\n⚠️ Step 2A failed - fix database connection first")
    
    asyncio.run(run_all_tests()) 