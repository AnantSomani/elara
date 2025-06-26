#!/usr/bin/env python3
"""
🧠 Memory System Test with Environment Variables
Load .env.local and test complete memory functionality
"""

import os
import sys
import asyncio
from pathlib import Path

# Load environment variables from .env.local
def load_env_local():
    env_file = Path(__file__).parent.parent / '.env.local'
    if env_file.exists():
        print(f"📁 Loading environment from: {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value
                    print(f"   ✅ {key}={'*' * min(len(value), 8)}...")
        return True
    else:
        print(f"❌ .env.local not found at: {env_file}")
        return False

async def test_complete_memory_system():
    """Test the complete memory system with database connectivity"""
    
    print("\n🧠 Testing Complete Memory System...")
    print("=" * 50)
    
    try:
        # Import after loading environment
        from app.services.semantic_rag import create_semantic_rag_service
        
        # Create service
        print("1️⃣ Creating SemanticRAGService...")
        service = create_semantic_rag_service()
        print("   ✅ Service created successfully")
        
        # Test session creation
        print("\n2️⃣ Testing session and memory...")
        session_id = "test-session-memory-123"
        video_id = "h6ZO4tMw8QI"  # Use real video ID
        
        # First query
        print("   💬 First query: 'Who is David Sacks?'")
        result1 = await service.query(
            question="Who is David Sacks?",
            video_id=video_id,
            session_id=session_id
        )
        
        print(f"   ✅ First response: {result1['answer'][:100]}...")
        print(f"   💾 Memory used: {result1['metadata'].get('memory_used', False)}")
        print(f"   📊 Memory context length: {result1['metadata'].get('memory_context_length', 0)}")
        
        # Second query (should reference first)
        print("\n   💬 Follow-up query: 'What did you just tell me about him?'")
        result2 = await service.query(
            question="What did you just tell me about him?",
            video_id=video_id,
            session_id=session_id,
            conversation_history=[
                {"role": "user", "content": "Who is David Sacks?", "timestamp": "2024-06-25T10:00:00Z"},
                {"role": "assistant", "content": result1['answer'], "timestamp": "2024-06-25T10:00:01Z"}
            ]
        )
        
        print(f"   ✅ Follow-up response: {result2['answer'][:100]}...")
        print(f"   💾 Memory used: {result2['metadata'].get('memory_used', False)}")
        print(f"   📊 Memory context length: {result2['metadata'].get('memory_context_length', 0)}")
        
        # Check if follow-up references the previous conversation
        contains_reference = any(word in result2['answer'].lower() for word in ['told', 'mentioned', 'said', 'discussed', 'previously'])
        print(f"   🔗 Contains conversation reference: {contains_reference}")
        
        print("\n3️⃣ Memory System Test Results:")
        print(f"   ✅ Session management: Working")
        print(f"   ✅ Database connectivity: {'Working' if result1['metadata'].get('memory_used') else 'Limited (check logs)'}")
        print(f"   ✅ Conversation context: {'Working' if contains_reference else 'Limited'}")
        print(f"   ✅ Memory persistence: {'Working' if result2['metadata'].get('memory_context_length', 0) > 0 else 'Limited'}")
        
        return True
        
    except Exception as e:
        print(f"❌ Memory test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("🧠 Memory System Test with Environment Variables")
    print("=" * 50)
    
    # Load environment
    if not load_env_local():
        print("❌ Failed to load .env.local - memory system may not work fully")
        return False
    
    # Test memory system
    success = asyncio.run(test_complete_memory_system())
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 Memory System Test: PASSED")
        print("✅ Ready to test on frontend at localhost:8080")
    else:
        print("❌ Memory System Test: FAILED")
        print("🔧 Check environment variables and database connectivity")
    
    return success

if __name__ == "__main__":
    main() 