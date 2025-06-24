"""
Semantic RAG Service for Phase 1
Uses LangChain to perform semantic search on existing youtube_transcript_chunks
"""

import logging
import time
from typing import List, Dict, Any, Optional
from uuid import uuid4

from langchain.chains import RetrievalQA
from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate

from .langchain_config import get_langchain_config

# Configure logging
logger = logging.getLogger(__name__)

class SemanticRAGService:
    """
    Semantic RAG service using LangChain + existing PostgreSQL setup
    Creates fresh instances per request to avoid memory leaks
    """
    
    def __init__(self):
        self.request_id = str(uuid4())[:8]
        logger.info(f"🚀 [REQ:{self.request_id}] SemanticRAGService initialized")
    
    async def query(
        self, 
        question: str, 
        video_id: Optional[str] = None,
        top_k: int = 5,
        performance_mode: str = "balanced"
    ) -> Dict[str, Any]:
        """
        Perform semantic RAG query on existing transcript chunks with adaptive model selection
        
        Args:
            question: User's question
            video_id: Optional filter by specific video
            top_k: Number of relevant chunks to retrieve
            performance_mode: "speed", "quality", or "balanced" for model selection
            
        Returns:
            Dict with answer, sources, and metadata
        """
        start_time = time.time()
        
        logger.info(f"🔍 [REQ:{self.request_id}] Semantic query: '{question[:100]}...'")
        if video_id:
            logger.info(f"📹 [REQ:{self.request_id}] Filtering by video: {video_id}")
        
        try:
            # Get LangChain config with our simple setup
            config = get_langchain_config()
            vector_store = config.vector_store
            
            # Perform hybrid search (FTS + semantic)
            logger.info(f"🔍 [REQ:{self.request_id}] Performing hybrid search...")
            relevant_docs = vector_store.hybrid_search(question, video_id=video_id)
            
            if not relevant_docs:
                logger.warning(f"🔍 [REQ:{self.request_id}] No relevant documents found")
                
                # Still provide model selection info even when no docs found
                config = get_langchain_config()
                empty_context = ""
                llm, model_info = config.get_adaptive_llm(empty_context, question, performance_mode)
                
                return {
                    "answer": "I couldn't find any relevant information in the transcript data for your question.",
                    "sources": [],
                    "metadata": {
                        "processing_time_ms": int((time.time() - start_time) * 1000),
                        "source_count": 0,
                        "video_id": video_id,
                        "retrieval_method": "hybrid",
                        "request_id": self.request_id,
                        "context_length": 0,
                        "answer_length": 0,
                        "compression_ratio": 0,
                        "llm_time_ms": 0,
                        "model_selection": model_info
                    }
                }
            
            # Prepare hybrid context for LLM (different formatting for FTS vs chunks)
            context = self._prepare_hybrid_context(relevant_docs)
            
            # Select optimal LLM model based on context and query
            llm, model_info = config.get_adaptive_llm(context, question, performance_mode)
            
            # Create prompt (clean, no source references)
            prompt_text = f"""You are Elara, an AI assistant that helps users understand YouTube video content.

You have access to both the complete transcript and the most relevant sections based on the user's question. Use this information to provide a clear, helpful response.

Content:
{context}

Question: {question}

Answer based on the content above. Use the full transcript for overall context and the relevant sections for specific details. Be conversational and helpful.

Also, do not make long winded responses. Keep it short and concise. Make sure that you answer the question to the best of your ability. Do not talk about a transcript or source, but instead the content or podcast, depending on what the format is. Also, use outside knowledge that is unrelated to the prompt if necessary."""
            
            # Get LLM response with selected model
            llm_start_time = time.time()
            logger.info(f"🤖 [REQ:{self.request_id}] Generating answer with {model_info['model_name']}...")
            response = llm.invoke(prompt_text)
            answer = response.content if hasattr(response, 'content') else str(response)
            llm_time = (time.time() - llm_start_time) * 1000
            
            # Extract source information
            sources = []
            for doc in relevant_docs:
                source_info = {
                    "text": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content,
                    "metadata": doc.metadata,
                    "video_id": doc.metadata.get("video_id"),
                    "start_time": doc.metadata.get("start_time"),
                    "end_time": doc.metadata.get("end_time"),
                    "chunk_index": doc.metadata.get("chunk_index"),
                    "similarity": doc.metadata.get("similarity", 0.0)
                }
                sources.append(source_info)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            # Enhanced performance logging
            logger.info(f"✅ [REQ:{self.request_id}] Query completed in {processing_time_ms}ms")
            logger.info(f"📊 [REQ:{self.request_id}] Retrieved {len(sources)} sources")
            
            # Extract and log search metrics if available
            if relevant_docs and hasattr(relevant_docs[0], 'metadata') and 'search_metrics' in relevant_docs[0].metadata:
                search_metrics = relevant_docs[0].metadata['search_metrics']
                logger.info(f"🔍 [SEARCH-METRICS] Semantic: {search_metrics.get('semantic_time_ms', 0):.0f}ms | "
                           f"FTS: {search_metrics.get('fts_time_ms', 0):.0f}ms | "
                           f"Chunks: {search_metrics.get('semantic_relevant_chunks', 0)}/{search_metrics.get('semantic_total_chunks', 0)} | "
                           f"Transcripts: {search_metrics.get('fts_docs_found', 0)}")
                logger.info(f"📈 [SIMILARITY-STATS] Avg: {search_metrics.get('avg_similarity', 0)} | "
                           f"Max: {search_metrics.get('max_similarity', 0)} | "
                           f"FTS Rank: {search_metrics.get('fts_avg_rank', 0)}")
            
            # Log context preparation and model selection metrics
            context_length = len(context)
            answer_length = len(answer)
            logger.info(f"📝 [CONTEXT-METRICS] Context: {context_length:,} chars | Answer: {answer_length} chars | "
                       f"Compression: {answer_length/context_length*100:.1f}%" if context_length > 0 else "Compression: N/A")
            logger.info(f"🤖 [MODEL-METRICS] {model_info['model_name']} | LLM Time: {llm_time:.0f}ms | "
                       f"Reason: {model_info['selection_reason']}")
            
            # Prepare enhanced metadata with performance metrics
            response_metadata = {
                "processing_time_ms": processing_time_ms,
                "source_count": len(sources),
                "video_id": video_id,
                "retrieval_method": "hybrid",
                "request_id": self.request_id,
                "context_length": len(context),
                "answer_length": len(answer),
                "compression_ratio": round(len(answer)/len(context)*100, 1) if len(context) > 0 else 0,
                "llm_time_ms": round(llm_time, 2),
                "model_selection": model_info
            }
            
            # Add search performance metrics if available
            if relevant_docs and hasattr(relevant_docs[0], 'metadata') and 'search_metrics' in relevant_docs[0].metadata:
                search_metrics = relevant_docs[0].metadata['search_metrics']
                response_metadata.update({
                    "search_performance": {
                        "semantic_time_ms": search_metrics.get('semantic_time_ms', 0),
                        "fts_time_ms": search_metrics.get('fts_time_ms', 0),
                        "total_search_time_ms": search_metrics.get('total_time_ms', 0),
                        "semantic_chunks_found": search_metrics.get('semantic_total_chunks', 0),
                        "semantic_chunks_relevant": search_metrics.get('semantic_relevant_chunks', 0),
                        "fts_docs_found": search_metrics.get('fts_docs_found', 0),
                        "avg_similarity": search_metrics.get('avg_similarity', 0),
                        "max_similarity": search_metrics.get('max_similarity', 0),
                        "fts_avg_rank": search_metrics.get('fts_avg_rank', 0),
                        "efficiency_docs_per_sec": round(len(sources) / (search_metrics.get('total_time_ms', 1) / 1000), 1)
                    }
                })
            
            return {
                "answer": answer,
                "sources": sources,
                "metadata": response_metadata
            }
            
        except Exception as e:
            processing_time_ms = int((time.time() - start_time) * 1000)
            logger.error(f"❌ [REQ:{self.request_id}] Semantic query failed: {e}")
            
            return {
                "answer": f"I apologize, but I encountered an error while processing your question: {str(e)}",
                "sources": [],
                "metadata": {
                    "processing_time_ms": processing_time_ms,
                    "source_count": 0,
                    "video_id": video_id,
                    "retrieval_method": "hybrid",
                    "request_id": self.request_id,
                    "error": str(e)
                }
            }
    
    def _prepare_hybrid_context(self, relevant_docs: List[Document]) -> str:
        """
        Prepare context from mixed document types (FTS + semantic chunks)
        
        Args:
            relevant_docs: List of documents from hybrid search
            
        Returns:
            Formatted context string for LLM
        """
        context_parts = []
        
        for doc in relevant_docs:
            source_type = doc.metadata.get("source_type", "chunk")
            
            if source_type == "full_transcript":
                # Full transcript gets special formatting for broader context
                logger.info(f"📄 [REQ:{self.request_id}] Including full transcript context ({len(doc.page_content)} chars)")
                context_parts.append(f"FULL TRANSCRIPT CONTENT:\n{doc.page_content}")
                
            elif source_type == "chunk":
                # Chunks get section formatting for specific details
                logger.info(f"📝 [REQ:{self.request_id}] Including relevant chunk (similarity: {doc.metadata.get('similarity', 'N/A')})")
                context_parts.append(f"RELEVANT SECTION:\n{doc.page_content}")
                
            else:
                # Fallback for any other document types
                context_parts.append(doc.page_content)
        
        logger.info(f"🔗 [REQ:{self.request_id}] Combined context: {len(context_parts)} sections")
        return "\n\n" + "="*50 + "\n\n".join(context_parts) + "\n\n" + "="*50
    
    async def test_retrieval(self, test_query: str = "What is this video about?") -> Dict[str, Any]:
        """
        Test the retrieval system with a simple query
        Useful for debugging and health checks
        """
        logger.info(f"🧪 [REQ:{self.request_id}] Testing retrieval with: '{test_query}'")
        
        try:
            config = get_langchain_config()
            vector_store = config.vector_store
            
            # Simple similarity search (no LLM)
            docs = vector_store.similarity_search(test_query, k=3)
            
            logger.info(f"✅ [REQ:{self.request_id}] Test retrieval found {len(docs)} documents")
            
            return {
                "success": True,
                "document_count": len(docs),
                "sample_docs": [
                    {
                        "text": doc.page_content[:100] + "...",
                        "metadata": doc.metadata
                    }
                    for doc in docs[:2]  # Show first 2 for debugging
                ]
            }
            
        except Exception as e:
            logger.error(f"❌ [REQ:{self.request_id}] Test retrieval failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# Factory function for creating service instances
def create_semantic_rag_service() -> SemanticRAGService:
    """Create a new SemanticRAGService instance"""
    return SemanticRAGService() 