#!/usr/bin/env python3
"""
Test script to validate the pronoun resolution fix
Tests the specific edge case: Percy Fawcett mentioned first, Paul Rosolie mentioned second,
"his thoughts on the amazon" should resolve to Paul Rosolie (most recent)
"""

import os
import sys
from pathlib import Path
from unittest.mock import Mock

# Add current directory to path for imports
sys.path.insert(0, os.getcwd())

# Load environment variables from .env.local
def load_env_local():
    env_file = Path("..") / ".env.local"
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    value = value.strip('"').strip("'")
                    os.environ[key] = value

load_env_local()

from app.services.semantic_rag import resolve_query_references, has_pronouns_or_references

# Try to get real LLM
try:
    from app.config.langchain_config import get_langchain_config
    from langchain_openai import ChatOpenAI
    
    config = get_langchain_config()
    llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.1)
    HAS_REAL_LLM = True
    print("✅ Using real OpenAI LLM for testing")
except Exception as e:
    print(f"❌ Could not load real LLM: {e}")
    HAS_REAL_LLM = False
    
    # Mock LLM
    class MockLLM:
        def invoke(self, prompt):
            response = Mock()
            response.content = "what are Paul Rosolie's thoughts on the amazon"
            return response
    
    llm = MockLLM()
    print("⚠️ Using mock LLM for testing")

def test_pronoun_resolution_fix():
    """Test the pronoun resolution fix with the real conversation context"""
    
    # Enhanced conversation context with chronological markers (like the fixed system provides)
    memory_context = """CONVERSATION HISTORY (CHRONOLOGICAL ORDER - MOST RECENT LAST):
Human: what about percy fawcetts best discoveries
AI: Percy Fawcett's best discoveries include his exploration of the Amazon rainforest and his belief in the existence of a lost city he called 'Z'. Fawcett's expeditions led to the discovery of archaeological artifacts and evidence of ancient civilizations in the Amazon, sparking intrigue and mystery around the region. His determination to uncover the truth behind the lost city of 'Z' captivated many, although the city itself remains a mystery to this day. Fawcett's legacy as an explorer and his adventurous spirit continue to inspire curiosity and exploration in the Amazon rainforest.
Human: who is paul rosolie?
AI: Paul Rosolie is an American conservationist, naturalist, explorer, author, and award-winning wildlife filmmaker known for his work in the Amazon rainforest, particularly in southeastern Peru. He gained recognition for his memoir *Mother of God* and for hosting the Discovery Channel's film *Eaten Alive*. Rosolie is also the founder of Jungle Keepers and Tamandua Expeditions, organizations dedicated to protecting Amazonian habitats. His work in conservation has been significant since he was 18 years old.

IMPORTANT FOR REFERENCE RESOLUTION: The conversation above shows the chronological order. When resolving pronouns like "he/she/his/her", always refer to the MOST RECENTLY mentioned person of that gender."""

    # Test question
    question = "what are his thoughts on the amazon"
    
    print("=== PRONOUN RESOLUTION FIX TEST ===")
    print(f"Question: '{question}'")
    print(f"Memory context length: {len(memory_context)} chars")
    print()
    
    # Check pronoun detection
    has_pronouns = has_pronouns_or_references(question)
    print(f"Has pronouns detected: {has_pronouns}")
    
    if has_pronouns:
        # Test pronoun resolution
        resolved_question = resolve_query_references(question, memory_context, llm)
        print(f"Resolved question: '{resolved_question}'")
        print()
        
        # Analyze result
        print("=== ANALYSIS ===")
        if "Paul Rosolie" in resolved_question:
            print("✅ SUCCESS: Correctly resolved to Paul Rosolie (most recent)")
            print("   The fix is working - prioritizing chronological recency")
        elif "Percy Fawcett" in resolved_question:
            print("❌ FAILURE: Incorrectly resolved to Percy Fawcett")
            print("   The LLM is still using semantic relevance over recency")
        else:
            print("❓ UNCLEAR: Resolution unclear or unchanged")
            print(f"   Full resolved question: '{resolved_question}'")
        
        print()
        print("Expected behavior:")
        print("- Percy Fawcett mentioned first (about discoveries)")  
        print("- Paul Rosolie mentioned SECOND (most recent)")
        print("- 'his thoughts' should refer to Paul Rosolie")
        print("- Even though Percy has more Amazon exploration context")
        
    else:
        print("❌ FAILURE: Pronouns not detected in question")

if __name__ == "__main__":
    test_pronoun_resolution_fix() 