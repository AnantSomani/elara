#!/usr/bin/env python3
"""
Test Similarity Search Fix
This script tests whether the JSON parsing fix resolves the 0.0000 similarity issue
"""

import asyncio
import sys
import os
from dotenv import load_dotenv

# Load environment variables 
load_dotenv()
load_dotenv('.env.local')
load_dotenv('../.env.local')

sys.path.append('.')

async def test_similarity_fix():
    """
    Test the similarity search fix with real queries
    """
    print('🧪 Testing Similarity Search Fix')
    print('=' * 50)
    
    try:
        # Import modules
        from database_search import VectorSearchDB
        from embeddings import EmbeddingGenerator
        
        # Initialize components
        db = VectorSearchDB()
        embedder = EmbeddingGenerator()
        
        print("✅ Components initialized")
        
        # Test with a query that should match Rick Astley content
        test_query = "never gonna give you up"
        print(f"\n🔍 Testing query: '{test_query}'")
        
        # Generate query embedding
        print("   🧮 Generating query embedding...")
        query_embedding = await embedder.generate_embedding(test_query)
        
        if not query_embedding:
            print("❌ Failed to generate embedding")
            return False
            
        print(f"   ✅ Query embedding generated: {len(query_embedding)} dimensions")
        
        # Test with very low threshold to see if we get ANY results
        print(f"\n   🔍 Testing with low threshold (0.1)...")
        results = await db._fallback_search(
            query_embedding=query_embedding,
            limit=5,
            similarity_threshold=0.1  # Very low threshold
        )
        
        print(f"\n📊 Results with threshold 0.1:")
        print(f"   - Found {len(results)} results")
        
        if results:
            print("   ✅ SUCCESS! Non-zero similarities found:")
            for i, result in enumerate(results[:3], 1):
                print(f"   {i}. Score: {result['similarity_score']:.4f} | Text: {result['text'][:60]}...")
            
            # Test with higher threshold
            print(f"\n   🔍 Testing with normal threshold (0.3)...")
            results_normal = await db._fallback_search(
                query_embedding=query_embedding,
                limit=3,
                similarity_threshold=0.3
            )
            
            print(f"📊 Results with threshold 0.3: {len(results_normal)} results")
            for i, result in enumerate(results_normal, 1):
                print(f"   {i}. Score: {result['similarity_score']:.4f} | Text: {result['text'][:60]}...")
                
        else:
            print("   ❌ Still getting 0.0000 similarities - fix may not be working")
            return False
        
        # Test another query
        print(f"\n🔍 Testing second query: 'machine learning'")
        ml_embedding = await embedder.generate_embedding("machine learning")
        
        if ml_embedding:
            ml_results = await db._fallback_search(
                query_embedding=ml_embedding,
                limit=3,
                similarity_threshold=0.1
            )
            
            print(f"📊 ML query results: {len(ml_results)} results")
            for i, result in enumerate(ml_results[:2], 1):
                print(f"   {i}. Score: {result['similarity_score']:.4f} | Text: {result['text'][:60]}...")
        
        print(f"\n✅ Similarity search fix appears to be working!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_similarity_fix())
    if success:
        print("\n🎉 Fix verified - similarity search is now working!")
    else:
        print("\n❌ Fix failed - needs further investigation") 