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
        
        self.llm = ChatOpenAI(
            openai_api_key=self.openai_api_key,
            model="gpt-4o-mini",
            temperature=0.1,
            max_tokens=500
        )
        
        # Create simple vector store
        self.vector_store = SimpleVectorStore(
            connection_string=self.connection_string,
            embeddings=self.embeddings
        )
        
        logger.info("✅ LangChain configured with existing psycopg2 setup")
    
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