#!/usr/bin/env python3
"""
Test script to verify if the summarization feature is working
"""

import requests
import json
import time

def test_summarization_feature():
    """Test if summarization queries are properly detected and handled"""
    
    base_url = "http://localhost:8001"
    
    # Test cases for summarization
    test_cases = [
        {
            "question": "Summarize this video",
            "video_id": "jdlBu4vEv8Q",  # This should be a real video ID in your database
            "expected_behavior": "Direct transcript fetch, no hybrid search"
        },
        {
            "question": "What is this video about?",
            "video_id": "jdlBu4vEv8Q",
            "expected_behavior": "Direct transcript fetch, no hybrid search"
        },
        {
            "question": "Give me a summary",
            "video_id": "jdlBu4vEv8Q",
            "expected_behavior": "Direct transcript fetch, no hybrid search"
        },
        {
            "question": "What are the main points?",
            "video_id": "jdlBu4vEv8Q",
            "expected_behavior": "Direct transcript fetch, no hybrid search"
        }
    ]
    
    print("🧪 Testing Summarization Feature")
    print("=" * 50)
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\nTest {i}: '{test_case['question']}'")
        print(f"Expected: {test_case['expected_behavior']}")
        
        try:
            # Make API request
            response = requests.post(
                f"{base_url}/query",
                json={
                    "question": test_case["question"],
                    "video_id": test_case["video_id"],
                    "session_id": f"test_session_{i}"
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Check if summarization was detected
                sources = result.get("sources", [])
                metadata = result.get("metadata", {})
                
                print(f"✅ Status: {response.status_code}")
                print(f"📊 Sources found: {len(sources)}")
                print(f"⏱️  Processing time: {metadata.get('processing_time_ms', 'Unknown')}ms")
                
                # Look for direct transcript indicators
                direct_transcript_used = any(
                    source.get("metadata", {}).get("source_type") == "full_transcript_direct" 
                    for source in sources
                )
                
                if direct_transcript_used:
                    print("🎯 SUCCESS: Direct transcript was used (summarization working!)")
                else:
                    print("⚠️  WARNING: Regular search was used instead of direct transcript")
                    print(f"   Source types: {[s.get('metadata', {}).get('source_type') for s in sources]}")
                
                # Show first part of answer
                answer = result.get("answer", "")
                print(f"💬 Answer preview: {answer[:100]}...")
                
            else:
                print(f"❌ Error: {response.status_code}")
                print(f"   Response: {response.text}")
                
        except Exception as e:
            print(f"❌ Exception: {e}")
        
        print("-" * 40)

def test_health_check():
    """Test if the service is running"""
    try:
        response = requests.get("http://localhost:8001/health", timeout=5)
        if response.status_code == 200:
            print("✅ Service is running")
            return True
        else:
            print(f"❌ Service health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Service is not accessible: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Checking if service is running...")
    
    if test_health_check():
        print("\n🧪 Starting summarization tests...")
        test_summarization_feature()
    else:
        print("❌ Cannot test - service is not running")
        print("Please start the service with: uvicorn app.main:app --host localhost --port 8001") 