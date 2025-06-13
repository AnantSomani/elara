#!/usr/bin/env python3

import requests
import json
import time

def test_chunking_api():
    """Test the chunking API endpoints"""
    
    base_url = "http://localhost:8001"
    
    print("🧪 Testing Chunking API Endpoints")
    print("=" * 50)
    
    # Test 1: Health check
    print("1️⃣  Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Health check passed")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False
    
    # Test 2: Fetch transcript first
    print("\n2️⃣  Testing transcript fetch...")
    video_id = "dQw4w9WgXcQ"  # Rick Astley
    
    try:
        fetch_data = {"video_id": video_id}
        response = requests.post(
            f"{base_url}/api/fetch-transcript",
            json=fetch_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Transcript fetch successful")
            print(f"   Segments: {result.get('segments_count', 0)}")
            print(f"   Characters: {result.get('total_characters', 0)}")
        else:
            print(f"⚠️  Transcript fetch response: {response.status_code}")
            print(f"   Message: {response.text}")
            # Continue anyway - might already exist
    except Exception as e:
        print(f"⚠️  Transcript fetch error: {e}")
        # Continue anyway
    
    # Test 3: Process chunks
    print("\n3️⃣  Testing chunk processing...")
    
    try:
        chunk_data = {
            "video_id": video_id,
            "chunk_duration": 45,
            "overlap_duration": 10
        }
        
        response = requests.post(
            f"{base_url}/api/process-chunks",
            json=chunk_data,
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Chunk processing successful")
            print(f"   Chunks created: {result.get('chunks_created', 0)}")
            print(f"   Total words: {result.get('total_words', 0)}")
            print(f"   Avg words/chunk: {result.get('avg_words_per_chunk', 0)}")
            
            # Show sample chunks
            chunks = result.get('chunks', [])
            if chunks:
                print(f"\n📋 Sample chunks (first {min(3, len(chunks))}):")
                for i, chunk in enumerate(chunks[:3]):
                    print(f"   Chunk {chunk.get('chunk_index', i)}: "
                          f"{chunk.get('start_time', 0):.1f}-{chunk.get('end_time', 0):.1f}s "
                          f"({chunk.get('word_count', 0)} words)")
        else:
            print(f"❌ Chunk processing failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Chunk processing error: {e}")
        return False
    
    # Test 4: Retrieve chunks
    print("\n4️⃣  Testing chunk retrieval...")
    
    try:
        response = requests.get(
            f"{base_url}/api/chunks/{video_id}?limit=5&offset=0",
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Chunk retrieval successful")
            chunks = result.get('chunks', [])
            pagination = result.get('pagination', {})
            
            print(f"   Retrieved: {len(chunks)} chunks")
            print(f"   Total chunks: {pagination.get('total_chunks', 0)}")
            print(f"   Has more: {pagination.get('has_more', False)}")
        else:
            print(f"❌ Chunk retrieval failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Chunk retrieval error: {e}")
        return False
    
    print("\n🎉 All tests completed successfully!")
    return True

if __name__ == "__main__":
    # Give server time to start
    print("⏳ Waiting for server to start...")
    time.sleep(5)
    
    success = test_chunking_api()
    if success:
        print("\n✅ Phase 3 Chunking API Test: PASSED")
    else:
        print("\n❌ Phase 3 Chunking API Test: FAILED") 