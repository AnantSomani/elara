"""
LangChain Configuration for Elara RAG System
Uses existing PostgreSQL/psycopg2 setup (no conflicts)
"""

import os
import logging
from typing import List, Dict, Any
from urllib.parse import urlparse
import psycopg2

from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.documents import Document

# Configure logging
logger = logging.getLogger(__name__)

class SimpleVectorStore:
    """Simple vector store that uses your existing psycopg2 setup"""
    
    def __init__(self, connection_string: str, embeddings: OpenAIEmbeddings):
        self.connection_string = connection_string
        self.embeddings = embeddings
        
    def similarity_search(self, query: str, k: int = 4, video_id: str = None) -> List[Document]:
        """Search for similar documents using existing table structure"""
        try:
            # Get query embedding
            query_embedding = self.embeddings.embed_query(query)
            
            # Connect and search using your existing table
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    if video_id:
                        # Filter by specific video
                        cur.execute("""
                            SELECT 
                                text,
                                video_id,
                                chunk_index,
                                start_time,
                                end_time,
                                1 - (embedding <=> %s::vector) as similarity
                            FROM youtube_transcript_chunks 
                            WHERE video_id = %s
                            ORDER BY embedding <=> %s::vector
                            LIMIT %s
                        """, (query_embedding, video_id, query_embedding, k))
                    else:
                        # Search across all videos
                        cur.execute("""
                            SELECT 
                                text,
                                video_id,
                                chunk_index,
                                start_time,
                                end_time,
                                1 - (embedding <=> %s::vector) as similarity
                            FROM youtube_transcript_chunks 
                            ORDER BY embedding <=> %s::vector
                            LIMIT %s
                        """, (query_embedding, query_embedding, k))
                    
                    results = cur.fetchall()
                    
                    documents = []
                    for row in results:
                        content, video_id, chunk_index, start_time, end_time, similarity = row
                        
                        doc = Document(
                            page_content=content,
                            metadata={
                                "video_id": video_id,
                                "chunk_index": chunk_index,
                                "start_time": start_time,
                                "end_time": end_time,
                                "similarity": float(similarity)
                            }
                        )
                        documents.append(doc)
                    
                    return documents
                    
        except Exception as e:
            logger.error(f"Error in similarity search: {e}")
            return []
    
    def fulltext_search(self, query: str, video_id: str = None) -> List[Document]:
        """
        Search full transcript using PostgreSQL FTS
        
        Args:
            query: Search query text
            video_id: Required - video to search within
            
        Returns:
            List[Document]: Full transcript documents with FTS ranking
        """
        if not video_id:
            logger.warning("FTS search requires video_id, skipping")
            return []
            
        try:
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    # Search full transcript content using PostgreSQL FTS
                    cur.execute("""
                        SELECT 
                            content,
                            video_id,
                            ts_rank(to_tsvector('english', content), plainto_tsquery('english', %s)) as rank,
                            segment_count,
                            total_duration
                        FROM youtube_transcripts 
                        WHERE video_id = %s
                        AND to_tsvector('english', content) @@ plainto_tsquery('english', %s)
                        ORDER BY rank DESC
                        LIMIT 1
                    """, (query, video_id, query))
                    
                    results = cur.fetchall()
                    documents = []
                    
                    for row in results:
                        content, vid_id, rank, segment_count, duration = row
                        
                        # Create document with full transcript
                        doc = Document(
                            page_content=content,
                            metadata={
                                "video_id": vid_id,
                                "source_type": "full_transcript",
                                "fts_rank": float(rank),
                                "chunk_index": None,
                                "start_time": None,
                                "end_time": None,
                                "segment_count": segment_count,
                                "total_duration": float(duration) if duration else None,
                                "search_method": "fts"
                            }
                        )
                        documents.append(doc)
                    
                    logger.info(f"📝 FTS found {len(documents)} full transcript(s) for video {video_id}")
                    return documents
                    
        except Exception as e:
            logger.error(f"❌ Error in FTS search: {e}")
            return []
    
    def hybrid_search(self, query: str, video_id: str = None) -> List[Document]:
        """
        Combine FTS full transcript + similarity-filtered chunks with performance monitoring
        
        Args:
            query: Search query text
            video_id: Optional video filter
            
        Returns:
            List[Document]: Combined FTS + semantic results
        """
        import time
        
        search_start = time.time()
        metrics = {
            "query_length": len(query),
            "video_id": video_id,
            "timestamp": time.time()
        }
        
        try:
            logger.info(f"🔍 [HYBRID] Starting search for: '{query[:50]}...' (video: {video_id})")
            
            # Step 1: Get semantic chunks with high similarity (0.75+ threshold)
            semantic_start = time.time()
            logger.info("⚡ [SEMANTIC] Fetching chunks...")
            semantic_docs = self.similarity_search(query, k=10, video_id=video_id)
            semantic_time = (time.time() - semantic_start) * 1000
            
            # Filter chunks by similarity threshold and collect metrics
            relevant_chunks = []
            similarity_scores = []
            for doc in semantic_docs:
                similarity = doc.metadata.get("similarity", 0)
                similarity_scores.append(similarity)
                if similarity > 0.75:
                    doc.metadata["source_type"] = "chunk"
                    doc.metadata["search_method"] = "semantic"
                    relevant_chunks.append(doc)
            
            # Calculate semantic metrics
            metrics.update({
                "semantic_total_chunks": len(semantic_docs),
                "semantic_relevant_chunks": len(relevant_chunks),
                "semantic_time_ms": round(semantic_time, 2),
                "avg_similarity": round(sum(similarity_scores) / len(similarity_scores), 3) if similarity_scores else 0,
                "max_similarity": round(max(similarity_scores), 3) if similarity_scores else 0,
                "min_similarity": round(min(similarity_scores), 3) if similarity_scores else 0
            })
            
            logger.info(f"📊 [SEMANTIC] {len(relevant_chunks)}/{len(semantic_docs)} chunks above 0.75 threshold "
                       f"(avg: {metrics['avg_similarity']}, max: {metrics['max_similarity']}) in {semantic_time:.0f}ms")
            
            # Step 2: Get full transcript via FTS (for broader context)
            fts_start = time.time()
            logger.info("📝 [FTS] Fetching full transcript...")
            fts_docs = self.fulltext_search(query, video_id=video_id)
            fts_time = (time.time() - fts_start) * 1000
            
            # Calculate FTS metrics
            fts_ranks = [doc.metadata.get("fts_rank", 0) for doc in fts_docs]
            metrics.update({
                "fts_docs_found": len(fts_docs),
                "fts_time_ms": round(fts_time, 2),
                "fts_avg_rank": round(sum(fts_ranks) / len(fts_ranks), 4) if fts_ranks else 0,
                "fts_max_rank": round(max(fts_ranks), 4) if fts_ranks else 0
            })
            
            logger.info(f"📝 [FTS] Found {len(fts_docs)} transcript(s) "
                       f"(avg rank: {metrics['fts_avg_rank']}) in {fts_time:.0f}ms")
            
            # Step 3: Combine results - FTS first (context), then chunks (specifics)
            all_docs = fts_docs + relevant_chunks
            
            # Step 4: Add hybrid search metadata and performance data
            total_time = (time.time() - search_start) * 1000
            metrics.update({
                "total_docs": len(all_docs),
                "total_time_ms": round(total_time, 2),
                "success": True
            })
            
            for doc in all_docs:
                doc.metadata["hybrid_search"] = True
                doc.metadata["query"] = query
                doc.metadata["search_metrics"] = metrics
            
            # Performance summary log
            logger.info(f"✅ [HYBRID] Complete: {len(fts_docs)} transcript + {len(relevant_chunks)} chunks "
                       f"= {len(all_docs)} total docs in {total_time:.0f}ms")
            logger.info(f"🎯 [PERFORMANCE] Semantic: {semantic_time:.0f}ms | FTS: {fts_time:.0f}ms | "
                       f"Total: {total_time:.0f}ms | Efficiency: {len(all_docs)/total_time*1000:.1f} docs/sec")
            
            return all_docs
            
        except Exception as e:
            error_time = (time.time() - search_start) * 1000
            metrics.update({
                "error": str(e),
                "total_time_ms": round(error_time, 2),
                "success": False
            })
            
            logger.warning(f"⚠️ [HYBRID] Search failed after {error_time:.0f}ms: {e}")
            logger.info("🔄 [FALLBACK] Attempting semantic-only search")
            
            # Graceful fallback to semantic search only
            try:
                fallback_start = time.time()
                fallback_docs = self.similarity_search(query, k=5, video_id=video_id)
                fallback_time = (time.time() - fallback_start) * 1000
                
                for doc in fallback_docs:
                    doc.metadata["source_type"] = "chunk"
                    doc.metadata["search_method"] = "semantic_fallback"
                    doc.metadata["search_metrics"] = {
                        **metrics,
                        "fallback_time_ms": round(fallback_time, 2),
                        "fallback_docs": len(fallback_docs)
                    }
                
                logger.info(f"🔄 [FALLBACK] Success: {len(fallback_docs)} docs in {fallback_time:.0f}ms")
                return fallback_docs
                
            except Exception as fallback_error:
                total_error_time = (time.time() - search_start) * 1000
                logger.error(f"❌ [FALLBACK] Also failed after {total_error_time:.0f}ms: {fallback_error}")
                return []

class LangChainConfig:
    """Simple LangChain configuration using existing database setup"""
    
    def __init__(self):
        self.supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.db_password = os.getenv("SUPABASE_DB_PASSWORD")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        if not all([self.supabase_url, self.db_password, self.openai_api_key]):
            raise ValueError("Missing required environment variables")
        
        # Build connection string
        supabase_url_clean = self.supabase_url.replace('https://', '')
        project_id = supabase_url_clean.split('.')[0]
        
        self.connection_string = (
            f"postgresql://postgres:{self.db_password}"
            f"@db.{project_id}.supabase.co:5432/postgres"
        )
        
        # Initialize components
        self.embeddings = OpenAIEmbeddings(
            openai_api_key=self.openai_api_key,
            model="text-embedding-ada-002"  # Match your existing embeddings
        )
        
        # Initialize multiple LLM instances for adaptive selection
        self.llm_fast = ChatOpenAI(
            openai_api_key=self.openai_api_key,
            model="gpt-3.5-turbo",
            temperature=0.1,
            max_tokens=500
        )
        
        self.llm_quality = ChatOpenAI(
            openai_api_key=self.openai_api_key,
            model="gpt-4o-mini",
            temperature=0.1,
            max_tokens=500
        )
        
        # Default to quality model for backward compatibility
        self.llm = self.llm_quality
        
        # Create simple vector store
        self.vector_store = SimpleVectorStore(
            connection_string=self.connection_string,
            embeddings=self.embeddings
        )
        
        logger.info("✅ LangChain configured with adaptive model selection")
    
    def select_optimal_model(self, context: str, query: str, performance_mode: str = "balanced") -> tuple:
        """
        Select optimal LLM model based on context size, query complexity, and performance mode
        
        Args:
            context: The context text to be sent to LLM
            query: User's query
            performance_mode: "speed", "quality", or "balanced"
            
        Returns:
            tuple: (selected_llm, model_name, selection_reason)
        """
        context_length = len(context)
        estimated_tokens = context_length // 4  # Rough estimate: 4 chars per token
        
        # Analyze query complexity
        complexity_keywords = [
            "analyze", "compare", "explain why", "reasoning", "complex", 
            "detailed", "comprehensive", "elaborate", "multiple", "various"
        ]
        is_complex_query = any(keyword in query.lower() for keyword in complexity_keywords)
        
        # Performance mode overrides
        if performance_mode == "speed":
            return self.llm_fast, "gpt-3.5-turbo", f"Speed mode (forced fast model)"
        elif performance_mode == "quality":
            return self.llm_quality, "gpt-4o-mini", f"Quality mode (forced quality model)"
        
        # Balanced mode - adaptive selection
        if estimated_tokens > 6000:
            # Large context - use quality model for better handling
            return self.llm_quality, "gpt-4o-mini", f"Large context ({estimated_tokens} tokens)"
        elif estimated_tokens < 1500 and not is_complex_query:
            # Small context + simple query - use fast model
            return self.llm_fast, "gpt-3.5-turbo", f"Small context ({estimated_tokens} tokens) + simple query"
        elif is_complex_query:
            # Complex query - use quality model regardless of context size
            return self.llm_quality, "gpt-4o-mini", f"Complex query detected"
        else:
            # Medium context + simple query - use fast model for speed
            return self.llm_fast, "gpt-3.5-turbo", f"Medium context ({estimated_tokens} tokens) + simple query"
    
    def get_adaptive_llm(self, context: str, query: str, performance_mode: str = "balanced") -> tuple:
        """
        Get the optimal LLM for the given context and query
        
        Returns:
            tuple: (llm_instance, model_info_dict)
        """
        selected_llm, model_name, reason = self.select_optimal_model(context, query, performance_mode)
        
        model_info = {
            "model_name": model_name,
            "selection_reason": reason,
            "estimated_tokens": len(context) // 4,
            "performance_mode": performance_mode
        }
        
        logger.info(f"🤖 [MODEL-SELECTION] Using {model_name}: {reason}")
        
        return selected_llm, model_info
    
    def test_connection(self) -> Dict[str, Any]:
        """Test database connection"""
        try:
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) FROM youtube_transcript_chunks")
                    count = cur.fetchone()[0]
                    return {
                        "status": "success",
                        "chunk_count": count,
                        "message": f"Connected successfully, found {count} chunks"
                    }
        except Exception as e:
            return {
                "status": "error", 
                "message": str(e)
            }

# Global instance
_langchain_config = None

def get_langchain_config() -> LangChainConfig:
    """Get or create LangChain configuration"""
    global _langchain_config
    if _langchain_config is None:
        _langchain_config = LangChainConfig()
    return _langchain_config 