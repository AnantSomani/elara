#!/usr/bin/env python3
"""
Test script for External Search Integration
Tests the new Perplexity API integration in SemanticRAGService
"""

import os
import sys
import asyncio
from dotenv import load_dotenv

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.services.semantic_rag import SemanticRAGService

# Load environment variables
load_dotenv()

async def test_external_search():
    """Test external search integration with various query types"""
    
    print("🧪 Testing External Search Integration")
    print("=" * 50)
    
    # Check if API key is available
    api_key = os.getenv('PERPLEXITY_API_KEY')
    if not api_key:
        print("⚠️  WARNING: No PERPLEXITY_API_KEY found in environment")
        print("   External search will be triggered but will fail gracefully")
        print()
    else:
        print("✅ Perplexity API key found")
        print()
    
    # Initialize the service
    rag_service = SemanticRAGService()
    
    # Test queries - mix of external search triggers and transcript queries
    test_queries = [
        {
            "query": "Who is Elon Musk?",
            "expected_external": True,
            "description": "External keyword trigger test"
        },
        {
            "query": "What are Tesla's latest sales statistics?",
            "expected_external": True,
            "description": "External keyword + stats trigger test"
        },
        {
            "query": "Define artificial intelligence",
            "expected_external": True,
            "description": "Definition trigger test"
        },
        {
            "query": "What did the speaker say about innovation?",
            "expected_external": False,
            "description": "Transcript-sufficient query test"
        },
        {
            "query": "How much does SpaceX cost?",
            "expected_external": True,
            "description": "Cost/stats trigger test"
        }
    ]
    
    results = []
    
    for i, test_case in enumerate(test_queries, 1):
        query = test_case["query"]
        expected_external = test_case["expected_external"]
        description = test_case["description"]
        
        print(f"Test {i}: {description}")
        print(f"Query: '{query}'")
        print(f"Expected external search: {expected_external}")
        
        try:
            # Run the query
            result = await rag_service.query(query, video_id=None)
            
            # Extract metadata
            metadata = result.get("metadata", {})
            external_search = metadata.get("external_search", {})
            
            # Check results
            triggered = external_search.get("triggered", False)
            success = external_search.get("success", False)
            response_length = external_search.get("response_length", 0)
            
            print(f"✅ External search triggered: {triggered}")
            print(f"✅ External search success: {success}")
            print(f"✅ External response length: {response_length} chars")
            print(f"✅ Processing time: {metadata.get('processing_time_ms', 0)}ms")
            print(f"✅ Answer length: {len(result.get('answer', ''))}")
            
            # Validate expectations
            if triggered == expected_external:
                print(f"✅ PASS: External search triggering as expected")
            else:
                print(f"❌ FAIL: Expected external={expected_external}, got {triggered}")
            
            results.append({
                "query": query,
                "triggered": triggered,
                "success": success,
                "expected": expected_external,
                "passed": triggered == expected_external
            })
            
            # Show partial answer
            answer = result.get("answer", "")
            if answer:
                preview = answer[:100] + "..." if len(answer) > 100 else answer
                print(f"💬 Answer preview: {preview}")
            
            print("-" * 30)
            
        except Exception as e:
            print(f"❌ ERROR: {e}")
            results.append({
                "query": query,
                "triggered": False,
                "success": False,
                "expected": expected_external,
                "passed": False,
                "error": str(e)
            })
            print("-" * 30)
    
    # Summary
    print("\n📊 TEST SUMMARY")
    print("=" * 50)
    
    total_tests = len(results)
    passed_tests = sum(1 for r in results if r["passed"])
    
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success rate: {passed_tests/total_tests*100:.1f}%")
    
    print("\n📋 DETAILED RESULTS:")
    for result in results:
        status = "✅ PASS" if result["passed"] else "❌ FAIL"
        print(f"{status}: {result['query'][:50]}...")
        if result.get("error"):
            print(f"    Error: {result['error']}")
    
    print(f"\n🎯 Integration test {'COMPLETED SUCCESSFULLY' if passed_tests == total_tests else 'COMPLETED WITH ISSUES'}")
    
    return passed_tests == total_tests

if __name__ == "__main__":
    success = asyncio.run(test_external_search())
    sys.exit(0 if success else 1) 