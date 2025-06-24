"""
Semantic RAG Service for Phase 1
Uses LangChain to perform semantic search on existing youtube_transcript_chunks
"""

import logging
import time
import requests
import os
import json
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
            # Initialize attribution tracking
            attribution_tracker = {
                'external_used': False,
                'external_info_length': 0,
                'transcript_chunks': [],
                'full_transcripts': [],
                'semantic_similarities': [],
                'external_trigger_reason': None,
                'context_composition': {}
            }
            
            # Get LangChain config with our simple setup
            config = get_langchain_config()
            vector_store = config.vector_store
            
            # Perform hybrid search (FTS + semantic)
            logger.info(f"🔍 [REQ:{self.request_id}] Performing hybrid search...")
            relevant_docs = vector_store.hybrid_search(question, video_id=video_id)
            
            # Track document types for attribution
            for doc in relevant_docs:
                source_type = doc.metadata.get('source_type', 'unknown')
                if source_type == 'chunk':
                    attribution_tracker['transcript_chunks'].append(doc)
                    attribution_tracker['semantic_similarities'].append(doc.metadata.get('similarity', 0))
                elif source_type == 'full_transcript':
                    attribution_tracker['full_transcripts'].append(doc)
            
            # NEW: Check if external search is needed
            external_info = ""
            external_search_needed = self._needs_external_search(question, relevant_docs)
            if external_search_needed:
                attribution_tracker['external_used'] = True
                
                # Get video title for context if available
                video_title = ""
                if relevant_docs:
                    # Try to get video title from first document's metadata
                    video_title = relevant_docs[0].metadata.get('video_title', '')
                
                # Fetch external information
                external_info = self._fetch_external_info(question, video_title)
                attribution_tracker['external_info_length'] = len(external_info)
                
                # Determine why external search was triggered for attribution
                if not relevant_docs:
                    attribution_tracker['external_trigger_reason'] = "no_transcript_content"
                elif len(attribution_tracker['transcript_chunks']) == 0 and len(attribution_tracker['full_transcripts']) == 0:
                    attribution_tracker['external_trigger_reason'] = "no_relevant_content"
                elif attribution_tracker['semantic_similarities'] and max(attribution_tracker['semantic_similarities']) < 0.5:
                    attribution_tracker['external_trigger_reason'] = "low_quality_matches"
                else:
                    attribution_tracker['external_trigger_reason'] = "external_only_query"
            
            # REMOVED: No more hardcoded "couldn't find relevant information" responses
            # External search will always be triggered as fallback if transcript fails
            
            # Prepare context based on available information
            if not relevant_docs and external_info:
                # Use only external info when no transcript docs available
                context = f"ADDITIONAL CONTEXT FROM WEB SEARCH:\n{external_info}"
                logger.info(f"🌐 [REQ:{self.request_id}] Using external search results only (no transcript data)")
                attribution_tracker['context_composition'] = {'external_only': True}
            else:
                # Prepare hybrid context for LLM (different formatting for FTS vs chunks)
                context = self._prepare_hybrid_context(relevant_docs, external_info)
                
                # Track context composition for attribution
                total_content_length = len(context)
                external_content_length = len(external_info) if external_info else 0
                transcript_content_length = total_content_length - external_content_length
                
                attribution_tracker['context_composition'] = {
                    'total_length': total_content_length,
                    'transcript_length': transcript_content_length,
                    'external_length': external_content_length,
                    'transcript_percentage': round((transcript_content_length / total_content_length) * 100, 1) if total_content_length > 0 else 0,
                    'external_percentage': round((external_content_length / total_content_length) * 100, 1) if total_content_length > 0 else 0
                }
            
            # Select optimal LLM model based on context and query
            llm, model_info = config.get_adaptive_llm(context, question, performance_mode)
            
            # Create prompt (clean, no source references)
            if not relevant_docs and external_info:
                # Prompt for external-only context
                prompt_text = f"""You are Elara, an AI assistant that provides helpful and accurate information.

I found relevant information from web sources to help answer your question:

Content:
{context}

Question: {question}

Answer the question based on the information above. Be conversational, helpful, and concise. Provide a clear and accurate response."""
            else:
                # Standard prompt for transcript + external context
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
            
            # NEW: Add external search metrics
            external_search_triggered = self._needs_external_search(question, relevant_docs)
            response_metadata.update({
                "external_search": {
                    "triggered": external_search_triggered,
                    "success": bool(external_info),
                    "response_length": len(external_info) if external_info else 0,
                    "used_in_context": bool(external_info)
                }
            })
            
            # NEW: Add pipeline attribution
            pipeline_attribution = self._calculate_pipeline_attribution(attribution_tracker)
            response_metadata["pipeline_attribution"] = pipeline_attribution
            
            # Log attribution for development debugging
            logger.info(f"🔬 [ATTRIBUTION] {pipeline_attribution['explanation']}")
            logger.info(f"📊 [SOURCE-BREAKDOWN] Transcript: {pipeline_attribution['content_breakdown']['transcript_percentage']}% | "
                       f"External: {pipeline_attribution['content_breakdown']['external_percentage']}% | "
                       f"Primary: {pipeline_attribution['primary_source']}")
            
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
    
    def _calculate_pipeline_attribution(self, attribution_tracker: dict) -> dict:
        """
        Calculate RAG pipeline attribution based on source usage
        
        Args:
            attribution_tracker: Dictionary containing source tracking data
            
        Returns:
            Dict containing pipeline attribution details
        """
        total_transcript_chunks = len(attribution_tracker['transcript_chunks'])
        total_full_transcripts = len(attribution_tracker['full_transcripts'])
        external_used = attribution_tracker['external_used']
        
        # Determine primary source
        primary_source = "transcript"
        if attribution_tracker['context_composition'].get('external_only'):
            primary_source = "external"
        elif external_used and attribution_tracker['context_composition'].get('external_percentage', 0) > 50:
            primary_source = "hybrid_external_heavy"
        elif external_used:
            primary_source = "hybrid_transcript_heavy"
        
        # Calculate composition
        composition = {
            "semantic_chunks": total_transcript_chunks,
            "full_transcripts": total_full_transcripts,
            "external_search": 1 if external_used else 0
        }
        
        # Calculate quality metrics
        avg_similarity = 0
        if attribution_tracker['semantic_similarities']:
            avg_similarity = sum(attribution_tracker['semantic_similarities']) / len(attribution_tracker['semantic_similarities'])
        
        # Determine explanation
        explanation = self._get_attribution_explanation(
            primary_source, 
            composition, 
            attribution_tracker['external_trigger_reason'],
            avg_similarity
        )
        
        return {
            "primary_source": primary_source,
            "composition": composition,
            "content_breakdown": {
                "transcript_percentage": attribution_tracker['context_composition'].get('transcript_percentage', 0),
                "external_percentage": attribution_tracker['context_composition'].get('external_percentage', 0)
            },
            "quality_metrics": {
                "avg_semantic_similarity": round(avg_similarity, 3),
                "max_semantic_similarity": round(max(attribution_tracker['semantic_similarities']), 3) if attribution_tracker['semantic_similarities'] else 0,
                "transcript_relevance": "high" if avg_similarity > 0.7 else "medium" if avg_similarity > 0.5 else "low"
            },
            "explanation": explanation,
            "external_search_trigger": attribution_tracker['external_trigger_reason']
        }
    
    def _get_attribution_explanation(self, primary_source: str, composition: dict, external_trigger: str, avg_similarity: float) -> str:
        """Generate human-readable explanation for attribution"""
        
        if primary_source == "external":
            if external_trigger == "no_transcript_content":
                return "No transcript content available - used external search only"
            elif external_trigger == "no_relevant_content":
                return "No relevant transcript content found - used external search only"
            elif external_trigger == "low_quality_matches":
                return f"Low transcript relevance (avg: {avg_similarity:.2f}) - used external search only"
            else:
                return "External-only query detected - used external search only"
        
        elif primary_source == "hybrid_external_heavy":
            return f"Hybrid approach with external search providing majority of context ({composition['external_search']} external + {composition['semantic_chunks']} transcript chunks)"
        
        elif primary_source == "hybrid_transcript_heavy":
            return f"Hybrid approach with transcript providing majority of context ({composition['semantic_chunks']} transcript chunks + {composition['external_search']} external)"
        
        else:  # transcript
            if composition['semantic_chunks'] > 0 and composition['full_transcripts'] > 0:
                return f"Transcript-based response using {composition['semantic_chunks']} semantic chunks + {composition['full_transcripts']} full transcripts"
            elif composition['semantic_chunks'] > 0:
                return f"Transcript-based response using {composition['semantic_chunks']} semantic chunks (avg relevance: {avg_similarity:.2f})"
            elif composition['full_transcripts'] > 0:
                return f"Transcript-based response using {composition['full_transcripts']} full transcript(s)"
            else:
                return "Transcript-based response"
    
    def _needs_external_search(self, question: str, docs: list) -> bool:
        """
        Balanced logic: Use transcript when available, external search as smart fallback
        
        Args:
            question: User's question
            docs: Retrieved documents from hybrid search
            
        Returns:
            bool: True if external search should be triggered
        """
        
        # Check for transcript results
        transcript_chunks = [d for d in docs if d.metadata.get('source_type') == 'chunk']
        full_transcripts = [d for d in docs if d.metadata.get('source_type') == 'full_transcript']
        
        has_transcript_content = len(transcript_chunks) > 0 or len(full_transcripts) > 0
        
        # Check quality of transcript results
        good_transcript_quality = False
        if transcript_chunks:
            avg_similarity = sum(d.metadata.get('similarity', 0) for d in transcript_chunks) / len(transcript_chunks)
            good_transcript_quality = avg_similarity >= 0.5
        elif full_transcripts:
            # Full transcript is always considered good quality for broad context
            good_transcript_quality = True
        
        # Always prioritize good transcript content
        if has_transcript_content and good_transcript_quality:
            logger.info(f"📄 [TRANSCRIPT-PRIORITY] Using transcript for '{question[:50]}...'")
            return False
        
        # For clearly external queries, use external search even if transcript exists
        question_lower = question.lower()
        external_only_keywords = [
            'who is', 'biography of', 'net worth of', 'age of', 'born when',
            'current news', 'latest news', 'today\'s', 'recent news', 
            'stock price', 'market cap', 'current value'
        ]
        
        has_external_only_keywords = any(keyword in question_lower for keyword in external_only_keywords)
        
        if has_external_only_keywords:
            logger.info(f"🌐 [EXTERNAL-SEARCH] Triggered for '{question[:50]}...' - Reason: external_only_keywords")
            return True
        
        # FALLBACK: If transcript search failed or low quality, ALWAYS try external search
        # This eliminates the "couldn't find relevant information" response
        if not has_transcript_content or not good_transcript_quality:
            reasons = []
            if not has_transcript_content:
                reasons.append("no_transcript_content")
            if not good_transcript_quality:
                reasons.append("low_quality_transcript")
                
            logger.info(f"🌐 [EXTERNAL-SEARCH] Fallback triggered for '{question[:50]}...' - Reasons: {', '.join(reasons)}")
            return True
        
        # Default: transcript content is sufficient
        logger.info(f"📄 [TRANSCRIPT-SUFFICIENT] Using transcript for '{question[:50]}...'")
        return False

    def _fetch_external_info(self, question: str, video_title: str = "") -> str:
        """
        Fetch external information using Perplexity API
        
        Args:
            question: User's question
            video_title: Title of the video for context
            
        Returns:
            str: External information or empty string if failed
        """
        
        # Check if API key is available
        api_key = os.getenv('PERPLEXITY_API_KEY')
        if not api_key:
            logger.warning("🔑 [EXTERNAL-SEARCH] No Perplexity API key found")
            return ""
        
        # Build context-aware prompt
        if video_title:
            context_prompt = f"""
Context: The user is asking about content related to a video titled "{video_title}".

Question: {question}

Please provide a concise, factual answer (2-3 sentences) that would help someone understand this topic better. Focus on key facts and recent information.
            """.strip()
        else:
            context_prompt = f"""
Question: {question}

Please provide a concise, factual answer (2-3 sentences) with key facts and recent information.
            """.strip()
        
        try:
            logger.info(f"🌐 [PERPLEXITY] Calling API for: {question[:50]}...")
            
            # Make API request
            response = requests.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "sonar",  # Current Perplexity model name
                    "messages": [
                        {"role": "user", "content": context_prompt}
                    ],
                    "max_tokens": 300,  # Keep responses concise
                    "temperature": 0.2   # More factual, less creative
                },
                timeout=5  # 5 second timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                external_info = result['choices'][0]['message']['content'].strip()
                
                logger.info(f"✅ [PERPLEXITY] Success - {len(external_info)} chars returned")
                return external_info
                
            else:
                logger.error(f"❌ [PERPLEXITY] API error {response.status_code}: {response.text}")
                return ""
                
        except requests.exceptions.Timeout:
            logger.warning(f"⏰ [PERPLEXITY] Timeout (5s) for: {question[:50]}...")
            return ""
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ [PERPLEXITY] Request failed: {e}")
            return ""
            
        except Exception as e:
            logger.error(f"❌ [PERPLEXITY] Unexpected error: {e}")
            return ""

    def _prepare_hybrid_context(self, relevant_docs: List[Document], external_info: str = "") -> str:
        """
        Prepare context from mixed document types with optional external information
        
        Args:
            relevant_docs: List of documents from hybrid search
            external_info: Optional external search results
            
        Returns:
            Formatted context string for LLM
        """
        context_parts = []
        
        # Process transcript documents (existing logic)
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
        
        # NEW: Add external information if available
        if external_info:
            logger.info(f"🌐 [REQ:{self.request_id}] Including external context ({len(external_info)} chars)")
            context_parts.append(f"ADDITIONAL CONTEXT:\n{external_info}")
        
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