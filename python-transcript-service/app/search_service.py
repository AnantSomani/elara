#!/usr/bin/env python3
"""
Elara Search Service - MVP Implementation
Integrates with existing Phase 4 embedding infrastructure
"""

import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from dotenv import load_dotenv

# Load environment variables from .env or .env.local
# Look in current directory and parent directories
load_dotenv()  # This will load .env
load_dotenv('.env.local')  # This will load .env.local if it exists
load_dotenv('../.env.local')  # Check parent directory too

# Import existing infrastructure
from embeddings import EmbeddingGenerator
from models import SearchQuery, SearchResult, SearchResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Elara Search API", 
    version="0.1.0",
    description="Semantic search service for YouTube transcript content"
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Will configure properly later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global embedding generator instance
embedding_generator = None

def get_embedding_generator():
    """Get initialized embedding generator instance"""
    global embedding_generator
    if embedding_generator is None:
        try:
            embedding_generator = EmbeddingGenerator()
            logger.info("✅ EmbeddingGenerator initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize EmbeddingGenerator: {str(e)}")
            raise HTTPException(500, f"Failed to initialize embedding service: {str(e)}")
    return embedding_generator

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "elara-search",
        "version": "0.1.0",
        "port": 3030,
        "environment": os.getenv("ENVIRONMENT", "development")
    }

@app.get("/test-embeddings")
async def test_embeddings_connection():
    """Test endpoint to verify embeddings integration"""
    try:
        generator = get_embedding_generator()
        
        # Test with simple query
        test_query = "machine learning"
        start_time = time.time()
        
        logger.info(f"🧪 Testing embedding generation with query: '{test_query}'")
        embedding = await generator.generate_embedding(test_query)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        if embedding is None:
            raise HTTPException(500, "Failed to generate embedding")
        
        return {
            "status": "success",
            "test_query": test_query,
            "embedding_dimensions": len(embedding),
            "embedding_sample": embedding[:5],  # First 5 values for verification
            "processing_time_ms": processing_time,
            "message": "✅ Embedding generation working correctly"
        }
        
    except Exception as e:
        logger.error(f"❌ Embedding test failed: {str(e)}")
        raise HTTPException(500, f"Embedding test failed: {str(e)}")

@app.post("/api/search/test")
async def test_search_endpoint(query: SearchQuery):
    """Test search endpoint - validates query processing without database"""
    try:
        generator = get_embedding_generator()
        start_time = time.time()
        
        logger.info(f"🔍 Test search for query: '{query.query}'")
        
        # Validate query
        if not query.query or len(query.query.strip()) < 2:
            raise HTTPException(400, "Query too short - minimum 2 characters")
        
        if len(query.query) > 500:
            raise HTTPException(400, "Query too long - maximum 500 characters")
        
        # Generate embedding for the query
        embedding = await generator.generate_embedding(query.query)
        if embedding is None:
            raise HTTPException(500, "Failed to generate query embedding")
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Return test response (no actual database search yet)
        return {
            "status": "success",
            "query": query.query,
            "embedding_dimensions": len(embedding),
            "processing_time_ms": processing_time,
            "message": "✅ Query processing working - database search coming in Step 2",
            "next_step": "Database vector similarity search implementation"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Test search failed: {str(e)}")
        raise HTTPException(500, f"Test search failed: {str(e)}")

@app.get("/api/search/config")
def get_search_config():
    """Get current search configuration"""
    try:
        generator = get_embedding_generator()
        return {
            "embedding_model": generator.model,
            "embedding_dimensions": generator.dimensions,
            "batch_size": generator.batch_size,
            "max_retries": generator.max_retries,
            "status": "ready"
        }
    except Exception as e:
        logger.error(f"❌ Config check failed: {str(e)}")
        raise HTTPException(500, f"Config check failed: {str(e)}")

@app.get("/api/search/database-status")
async def get_database_status():
    """Get database and embedding status"""
    try:
        from database_search import VectorSearchDB
        
        db = VectorSearchDB()
        
        # Get connection status
        connection_status = await db.test_connection()
        embedding_status = await db.get_embedded_chunks_count()
        video_list = await db.get_video_list()
        
        return {
            "database_connection": connection_status["status"],
            "total_chunks": embedding_status.get("total_chunks", 0),
            "embedded_chunks": embedding_status.get("with_embeddings", 0),
            "embedding_coverage": f"{embedding_status.get('embedding_percentage', 0)}%",
            "videos_available": len(video_list),
            "ready_for_search": embedding_status.get("ready_for_search", False),
            "video_summary": video_list[:3] if video_list else []
        }
    except Exception as e:
        logger.error(f"❌ Database status check failed: {str(e)}")
        raise HTTPException(500, f"Database status check failed: {str(e)}")

@app.post("/search")
async def search_content(query: SearchQuery):
    """Main search endpoint - performs semantic search on embedded content"""
    try:
        from database_search import VectorSearchDB
        
        generator = get_embedding_generator()
        db = VectorSearchDB()
        start_time = time.time()
        
        logger.info(f"🔍 Searching for: '{query.query}'")
        
        # Validate query
        if not query.query or len(query.query.strip()) < 2:
            raise HTTPException(400, "Query too short - minimum 2 characters")
        
        if len(query.query) > 500:
            raise HTTPException(400, "Query too long - maximum 500 characters")
        
        # Generate embedding for the search query
        query_embedding = await generator.generate_embedding(query.query)
        if query_embedding is None:
            raise HTTPException(500, "Failed to generate query embedding")
        
        # Perform vector similarity search using the correct field names from SearchQuery
        results = await db.vector_similarity_search(
            query_embedding=query_embedding,
            limit=query.match_count,
            similarity_threshold=query.match_threshold,
            video_ids=None  # Not supported in current SearchQuery model
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Convert results to SearchResult format (matching the existing model)
        search_results = []
        for result in results:
            search_result = SearchResult(
                video_id=result["video_id"],
                title=f"Video {result['video_id'][:8]}... [{result['start_time']:.1f}s]",  # Placeholder title
                transcript_text=result["text"],
                similarity=result["similarity_score"]
            )
            search_results.append(search_result)
        
        # Create response using existing SearchResponse model
        response = SearchResponse(
            query=query.query,
            results=search_results,
            total_found=len(search_results),
            processing_time_ms=processing_time
        )
        
        logger.info(f"✅ Search completed: {len(search_results)} results in {processing_time}ms")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Search failed: {str(e)}")
        raise HTTPException(500, f"Search failed: {str(e)}")

# Development server
if __name__ == "__main__":
    print("🚀 Starting Elara Search Service")
    print("=" * 50)
    print(f"Service: Elara Search API v0.1.0")
    print(f"Port: 3030")
    print(f"Environment: {os.getenv('ENVIRONMENT', 'development')}")
    print(f"OpenAI Model: text-embedding-3-small")
    print("=" * 50)
    
    # Check environment variables
    openai_key = os.getenv("OPENAI_API_KEY")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    
    print(f"🔑 OpenAI API Key: {'✅ Found' if openai_key else '❌ Missing'}")
    print(f"🔗 Supabase URL: {'✅ Found' if supabase_url else '❌ Missing'}")
    print(f"🔑 Supabase Key: {'✅ Found' if supabase_key else '❌ Missing'}")
    
    try:
        # Test initialization
        test_generator = EmbeddingGenerator()
        print("✅ EmbeddingGenerator initialization successful")
    except Exception as e:
        print(f"❌ EmbeddingGenerator initialization failed: {e}")
        print("⚠️  Check your .env.local file and API keys")
        print(f"⚠️  Looking for .env.local in: {os.getcwd()}")
    
    uvicorn.run(
        "search_service:app",
        host="0.0.0.0",
        port=3030,
        reload=True,
        log_level="info"
    ) 