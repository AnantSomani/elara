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
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        Perform semantic RAG query on existing transcript chunks
        
        Args:
            question: User's question
            video_id: Optional filter by specific video
            top_k: Number of relevant chunks to retrieve
            
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
            llm = config.llm
            
            # Perform similarity search directly
            logger.info(f"⚡ [REQ:{self.request_id}] Performing semantic search...")
            relevant_docs = vector_store.similarity_search(question, k=top_k, video_id=video_id)
            
            if not relevant_docs:
                logger.warning(f"🔍 [REQ:{self.request_id}] No relevant documents found")
                return {
                    "answer": "I couldn't find any relevant information in the transcript data for your question.",
                    "sources": [],
                    "metadata": {
                        "processing_time_ms": int((time.time() - start_time) * 1000),
                        "source_count": 0,
                        "video_id": video_id,
                        "retrieval_method": "semantic",
                        "request_id": self.request_id
                    }
                }
            
            # Prepare context for LLM (clean, no source attribution)
            context_parts = []
            for doc in relevant_docs:
                context_parts.append(doc.page_content)
            
            context = "\n\n".join(context_parts)
            
            # Create prompt (clean, no source references)
            prompt_text = f"""You are Elara, an AI assistant that helps users understand YouTube video content.

Use the following transcript content to answer the user's question. Provide a clear, helpful response based on what you find in the content.

Transcript content:
{context}

Question: {question}

Answer based on the transcript content above. Be conversational and helpful.

Also, do not make long winded responses. Keep it short and concise. Make sure that you answer the question to the best of your ability. Do not talk about a transcript or  source, but isstead the content or podcast, depending on what the format is. Also, use outside knowledhe that is unrelated to the prompt if necessary."""
            
            # Get LLM response
            logger.info(f"🤖 [REQ:{self.request_id}] Generating answer with LLM...")
            response = llm.invoke(prompt_text)
            answer = response.content if hasattr(response, 'content') else str(response)
            
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
            
            logger.info(f"✅ [REQ:{self.request_id}] Query completed in {processing_time_ms}ms")
            logger.info(f"📊 [REQ:{self.request_id}] Retrieved {len(sources)} source chunks")
            
            return {
                "answer": answer,
                "sources": sources,
                "metadata": {
                    "processing_time_ms": processing_time_ms,
                    "source_count": len(sources),
                    "video_id": video_id,
                    "retrieval_method": "semantic",
                    "request_id": self.request_id
                }
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
                    "retrieval_method": "semantic",
                    "request_id": self.request_id,
                    "error": str(e)
                }
            }
    
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