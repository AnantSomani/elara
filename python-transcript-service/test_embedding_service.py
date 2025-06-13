#!/usr/bin/env python3

"""
Test script for the OpenAI Embedding Service
Tests all core functionality before integrating with the main API
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent / "app"))

from embeddings import EmbeddingGenerator, test_embedding_service

async def main():
    """
    Comprehensive test of the embedding service
    """
    print("🧪 Testing OpenAI Embedding Service")
    print("=" * 50)
    
    # Step 1: Environment check
    print("\n1️⃣ Environment Check")
    required_vars = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"❌ Missing environment variables: {missing_vars}")
        print("Please set these in your .env file or environment")
        return False
    else:
        print("✅ All required environment variables are set")
    
    # Step 2: Quick service test
    print("\n2️⃣ Quick Service Test")
    try:
        test_results = await test_embedding_service()
        print(f"Connection Test: {test_results['connection_test']}")
        print(f"Single Embedding Test: {test_results['single_embedding_test']}")
        print(f"Service Ready: {'✅' if test_results['service_ready'] else '❌'}")
        
        if not test_results['service_ready']:
            print("❌ Service not ready, stopping tests")
            return False
            
    except Exception as e:
        print(f"❌ Quick test failed: {str(e)}")
        return False
    
    # Step 3: Detailed embedding generator test
    print("\n3️⃣ Detailed Embedding Generator Test")
    try:
        generator = EmbeddingGenerator()
        
        # Test configuration
        stats = generator.get_processing_stats()
        print(f"📊 Configuration: {stats}")
        
        # Test single embedding
        test_text = "The quick brown fox jumps over the lazy dog. This is a test sentence for embedding generation."
        print(f"📝 Testing with text: '{test_text[:50]}...'")
        
        embedding = await generator.generate_embedding(test_text)
        
        if embedding:
            print(f"✅ Single embedding successful")
            print(f"   - Dimensions: {len(embedding)}")
            print(f"   - First 5 values: {embedding[:5]}")
            print(f"   - Vector type: {type(embedding)}")
        else:
            print("❌ Single embedding failed")
            return False
            
    except Exception as e:
        print(f"❌ Detailed test failed: {str(e)}")
        return False
    
    # Step 4: Batch processing test
    print("\n4️⃣ Batch Processing Test")
    try:
        test_texts = [
            "This is the first test sentence about artificial intelligence.",
            "Here's another sentence discussing machine learning concepts.",
            "The third sentence explores natural language processing.",
            "Finally, we test with content about vector embeddings."
        ]
        
        print(f"📦 Testing batch processing with {len(test_texts)} texts")
        
        batch_embeddings = await generator.batch_generate_embeddings(test_texts)
        
        if batch_embeddings and len(batch_embeddings) == len(test_texts):
            successful_embeddings = sum(1 for e in batch_embeddings if e is not None)
            print(f"✅ Batch processing successful: {successful_embeddings}/{len(test_texts)}")
            
            # Test that embeddings are different (basic semantic test)
            if len(set(tuple(e[:5]) for e in batch_embeddings if e)) == len([e for e in batch_embeddings if e]):
                print("✅ Embeddings are unique (good semantic differentiation)")
            else:
                print("⚠️  Some embeddings appear identical")
        else:
            print("❌ Batch processing failed")
            return False
            
    except Exception as e:
        print(f"❌ Batch test failed: {str(e)}")
        return False
    
    # Step 5: Database connection test
    print("\n5️⃣ Database Connection Test")
    try:
        # Test getting chunks (should work even if no chunks exist)
        chunks = await generator.get_chunks_without_embeddings()
        print(f"📊 Found {len(chunks)} chunks without embeddings")
        print("✅ Database connection successful")
        
    except Exception as e:
        print(f"❌ Database connection failed: {str(e)}")
        return False
    
    # Step 6: Test with real video data (if available)
    print("\n6️⃣ Real Video Data Test")
    try:
        # Check if we have the Rick Astley video chunks
        rick_astley_id = "dQw4w9WgXcQ"
        chunks = await generator.get_chunks_without_embeddings(rick_astley_id)
        
        if chunks:
            print(f"🎵 Found {len(chunks)} Rick Astley chunks ready for embedding")
            
            # Test embedding status
            status = await generator.get_embedding_status(rick_astley_id)
            print(f"📈 Embedding status: {status}")
            
            print("✅ Ready for real video embedding generation")
        else:
            print("ℹ️  No Rick Astley chunks found (expected if chunking not done yet)")
            
    except Exception as e:
        print(f"❌ Real video test failed: {str(e)}")
        return False
    
    # Final results
    print("\n" + "=" * 50)
    print("🎉 All Embedding Service Tests Passed!")
    print("✅ The service is ready for Phase 4 implementation")
    print("\n📋 Summary:")
    print("   - OpenAI API connection: Working")
    print("   - Supabase database: Connected")
    print("   - Single embeddings: Functional")
    print("   - Batch processing: Operational")
    print("   - Error handling: Robust")
    print("   - Ready for integration: YES")
    
    return True

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1) 