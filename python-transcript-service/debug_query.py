#!/usr/bin/env python3

"""
Debug script to test Supabase query issues with embeddings
"""

import os
import requests
import json

# Set up environment (using the same values from your .env)
SUPABASE_URL = "https://yuecfzzsvpndsqgczfbv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1ZWNmenpzdnBuZHNxZ2N6ZmJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODY0Mzg0MywiZXhwIjoyMDY0MjE5ODQzfQ.M-qBCKr99kvEn-Hx8fCXKHjc2XoKNwS2leo6ZTIYm3s"

headers = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json"
}

def test_query(description, url, params):
    """Test a Supabase query and report results"""
    print(f"\n🔍 Testing: {description}")
    print(f"URL: {url}")
    print(f"Params: {params}")
    
    try:
        response = requests.get(url, headers=headers, params=params)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Results: {len(data)} records")
            
            # Show first result details if any
            if data:
                first_item = data[0]
                print(f"First record keys: {list(first_item.keys())}")
                
                # Check embedding specifically
                if 'embedding' in first_item:
                    embedding = first_item['embedding']
                    if embedding is None:
                        print(f"Embedding: NULL")
                    elif isinstance(embedding, list):
                        print(f"Embedding: List with {len(embedding)} dimensions")
                        print(f"First few values: {embedding[:5]}")
                    else:
                        print(f"Embedding: {type(embedding)} - {str(embedding)[:100]}")
                else:
                    print("No 'embedding' field in response")
            return True, data
        else:
            print(f"Error: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"Exception: {str(e)}")
        return False, None

def main():
    print("🐛 Debugging Supabase Embedding Queries")
    print("=" * 50)
    
    base_url = f"{SUPABASE_URL}/rest/v1/youtube_transcript_chunks"
    video_id = "dQw4w9WgXcQ"
    
    # Test 1: Get all chunks for the video (basic connectivity)
    test_query(
        "All chunks for Rick Astley video",
        base_url,
        {
            "select": "chunk_id,video_id,text",
            "video_id": f"eq.{video_id}"
        }
    )
    
    # Test 2: Get chunks with specific embedding column
    test_query(
        "Chunks with embedding column included",
        base_url,
        {
            "select": "chunk_id,video_id,embedding",
            "video_id": f"eq.{video_id}"
        }
    )
    
    # Test 3: Our original validation query
    test_query(
        "Original validation query (chunks with embeddings)",
        base_url,
        {
            "select": "chunk_id,video_id,embedding", 
            "video_id": f"eq.{video_id}",
            "embedding": "not.is.null"
        }
    )
    
    # Test 4: Alternative null check syntax
    test_query(
        "Alternative null check (neq.null)",
        base_url,
        {
            "select": "chunk_id,video_id,embedding",
            "video_id": f"eq.{video_id}",
            "embedding": "neq.null"
        }
    )
    
    # Test 5: Count query like in our status check
    test_query(
        "Count total chunks",
        base_url,
        {
            "select": "count",
            "video_id": f"eq.{video_id}"
        }
    )
    
    # Test 6: Count chunks with embeddings
    test_query(
        "Count chunks with embeddings",
        base_url,
        {
            "select": "count",
            "video_id": f"eq.{video_id}",
            "embedding": "not.is.null"
        }
    )

if __name__ == "__main__":
    main() 