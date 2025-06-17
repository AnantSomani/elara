#!/usr/bin/env python3
"""
Debug Embedding Retrieval - Check REST API Response Format
This script checks how embeddings are retrieved and formatted through Supabase REST API
"""

import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables 
load_dotenv()
load_dotenv('.env.local')
load_dotenv('../.env.local')

def debug_embedding_retrieval():
    """
    Debug exactly how embeddings are retrieved via Supabase REST API
    """
    print('🔍 Debug: Embedding Retrieval via REST API')
    print('=' * 50)
    
    # Get connection details (same as database_search.py)
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_key:
        print("❌ Missing Supabase environment variables")
        return False
    
    # HTTP headers (same as database_search.py)
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    print(f"🔗 Testing REST API embedding retrieval...")
    print(f"   URL: {supabase_url}")
    
    try:
        # Get embeddings via REST API (same as _fallback_search method)
        url = f"{supabase_url}/rest/v1/youtube_transcript_chunks"
        params = {
            "select": "chunk_id,video_id,text,embedding",
            "embedding": "not.is.null",
            "limit": 2  # Just get 2 for debugging
        }
        
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        chunks = response.json()
        print(f"✅ Retrieved {len(chunks)} chunks")
        
        # Analyze each chunk's embedding
        for i, chunk in enumerate(chunks, 1):
            print(f"\n🔬 Chunk {i} Analysis:")
            print(f"   - Chunk ID: {chunk['chunk_id']}")
            print(f"   - Video ID: {chunk['video_id']}")
            print(f"   - Text preview: {chunk['text'][:50]}...")
            
            # Deep analysis of embedding
            embedding = chunk.get('embedding')
            
            print(f"   - Embedding type: {type(embedding)}")
            print(f"   - Embedding value type: {type(embedding).__name__}")
            
            if embedding is not None:
                print(f"   - Embedding length: {len(embedding) if hasattr(embedding, '__len__') else 'No length'}")
                
                # Check if it's a list
                if isinstance(embedding, list):
                    print(f"   ✅ Embedding is a LIST")
                    print(f"   - First 5 values: {embedding[:5]}")
                    print(f"   - Element types: {[type(x).__name__ for x in embedding[:3]]}")
                    
                    # Check if elements are floats
                    if len(embedding) > 0:
                        first_element = embedding[0]
                        if isinstance(first_element, (int, float)):
                            print(f"   ✅ Elements are numeric: {type(first_element).__name__}")
                        else:
                            print(f"   ❌ Elements are NOT numeric: {type(first_element).__name__}")
                            print(f"   - First element value: {repr(first_element)}")
                    
                elif isinstance(embedding, str):
                    print(f"   ❌ Embedding is a STRING")
                    print(f"   - String length: {len(embedding)}")
                    print(f"   - String preview: {embedding[:100]}...")
                    
                    # Try to parse as JSON
                    try:
                        parsed = json.loads(embedding)
                        print(f"   🔧 JSON parsing successful: {type(parsed).__name__}")
                        if isinstance(parsed, list) and len(parsed) > 0:
                            print(f"   - Parsed length: {len(parsed)}")
                            print(f"   - First 3 values: {parsed[:3]}")
                    except json.JSONDecodeError:
                        print(f"   ❌ JSON parsing failed")
                
                else:
                    print(f"   ⚠️  Unknown embedding type: {type(embedding)}")
                    print(f"   - Raw value: {repr(embedding)}")
            
            # Test cosine similarity calculation
            if embedding and isinstance(embedding, list) and len(embedding) > 0:
                print(f"   🧮 Testing similarity calculation...")
                
                # Create a dummy query vector of same length
                query_vector = [0.1] * len(embedding)
                
                try:
                    # Calculate dot product
                    dot_product = sum(a * b for a, b in zip(query_vector, embedding))
                    print(f"   - Dot product: {dot_product:.6f}")
                    
                    # Calculate magnitudes
                    import math
                    magnitude1 = math.sqrt(sum(a * a for a in query_vector))
                    magnitude2 = math.sqrt(sum(a * a for a in embedding))
                    print(f"   - Query magnitude: {magnitude1:.6f}")
                    print(f"   - Embedding magnitude: {magnitude2:.6f}")
                    
                    # Calculate similarity
                    if magnitude1 > 0 and magnitude2 > 0:
                        similarity = dot_product / (magnitude1 * magnitude2)
                        print(f"   ✅ Cosine similarity: {similarity:.6f}")
                    else:
                        print(f"   ❌ Zero magnitude detected")
                        
                except Exception as sim_e:
                    print(f"   ❌ Similarity calculation failed: {sim_e}")
        
        return True
        
    except Exception as e:
        print(f"❌ REST API retrieval failed: {str(e)}")
        return False

if __name__ == "__main__":
    debug_embedding_retrieval() 