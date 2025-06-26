#!/usr/bin/env python3
"""
Test the pronoun resolution fix by calling the actual API
"""

import requests
import json

def test_pronoun_resolution():
    """Test pronoun resolution with the real API"""
    
    # API endpoint
    url = "http://localhost:8001/rag/basic"
    
    # Test data - simulate the conversation that leads to the issue
    session_id = "test_pronoun_session"
    video_id = "SLkI2yiMvKo"  # The video from your conversation
    
    print("=== PRONOUN RESOLUTION API TEST ===")
    print(f"Session ID: {session_id}")
    print(f"Video ID: {video_id}")
    print()
    
    # Step 1: Ask about Percy Fawcett (first person)
    print("Step 1: Asking about Percy Fawcett...")
    response1 = requests.post(url, json={
        "query": "what about percy fawcetts best discoveries",
        "video_id": video_id,
        "session_id": session_id
    })
    
    if response1.status_code == 200:
        result1 = response1.json()
        print(f"✅ Response 1: {result1['answer'][:100]}...")
    else:
        print(f"❌ Error in step 1: {response1.status_code}")
        return
    
    print()
    
    # Step 2: Ask about Paul Rosolie (second person - most recent)
    print("Step 2: Asking about Paul Rosolie...")
    response2 = requests.post(url, json={
        "query": "who is paul rosolie?",
        "video_id": video_id,
        "session_id": session_id
    })
    
    if response2.status_code == 200:
        result2 = response2.json()
        print(f"✅ Response 2: {result2['answer'][:100]}...")
    else:
        print(f"❌ Error in step 2: {response2.status_code}")
        return
    
    print()
    
    # Step 3: Test pronoun resolution - "his thoughts" should refer to Paul Rosolie
    print("Step 3: Testing pronoun resolution...")
    print("Question: 'what are his thoughts on the amazon'")
    print("Expected: Should resolve to Paul Rosolie (most recent person)")
    
    response3 = requests.post(url, json={
        "query": "what are his thoughts on the amazon",
        "video_id": video_id,
        "session_id": session_id
    })
    
    if response3.status_code == 200:
        result3 = response3.json()
        answer = result3['answer']
        
        print(f"✅ Response 3: {answer}")
        print()
        
        # Analyze the response
        print("=== ANALYSIS ===")
        if "Paul Rosolie" in answer or "Rosolie" in answer:
            print("✅ SUCCESS: The response mentions Paul Rosolie")
            print("   The pronoun resolution fix is working!")
        elif "Percy Fawcett" in answer or "Fawcett" in answer:
            print("❌ FAILURE: The response mentions Percy Fawcett")
            print("   The pronoun resolution is still incorrect")
        else:
            print("❓ UNCLEAR: Cannot determine which person was referenced")
            print("   Need to check the response content manually")
        
        # Check for debugging info in response
        if 'debug_info' in result3:
            debug = result3['debug_info']
            if 'pronoun_resolution' in debug:
                print(f"🔍 Pronoun resolution: {debug['pronoun_resolution']}")
        
    else:
        print(f"❌ Error in step 3: {response3.status_code}")

if __name__ == "__main__":
    test_pronoun_resolution() 