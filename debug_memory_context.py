import os
import sys
from unittest.mock import Mock
from pathlib import Path

# Load environment variables from .env.local
def load_env_local():
    env_file = Path("..") / ".env.local"
    print(f"Looking for .env.local at: {env_file.absolute()}")
    if env_file.exists():
        print(f"Found .env.local, loading...")
        with open(env_file, 'r') as f:
            loaded_vars = 0
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip('"').strip("'")
                    os.environ[key] = value
                    loaded_vars += 1
                    if key == "OPENAI_API_KEY":
                        print(f"Loaded OPENAI_API_KEY: {value[:8]}...")
        print(f"Loaded {loaded_vars} environment variables from {env_file}")
    else:
        print(f"No .env.local found at {env_file}")
    
    # Check if API key is now available
    api_key = os.getenv("OPENAI_API_KEY")
    print(f"OPENAI_API_KEY after loading: {'YES' if api_key else 'NO'}")
    return api_key

# Load environment first
api_key = load_env_local()

# Try to test with real OpenAI API
try:
    from openai import OpenAI
    HAS_OPENAI = True
    if api_key:
        client = OpenAI(api_key=api_key)
        print(f"✅ OpenAI client initialized with API key: {api_key[:8]}...")
    else:
        HAS_OPENAI = False
        print("❌ No OpenAI API key found")
except ImportError:
    HAS_OPENAI = False
    print("❌ OpenAI not available, using mock only")

# Mock the LLM for testing
class MockLLM:
    def invoke(self, prompt):
        response = Mock()
        # Simulate what the LLM might return for pronoun resolution
        if "what are his thoughts on the amazon" in prompt:
            # This should resolve to Paul Rosolie based on context
            response.content = "what are Paul Rosolie's thoughts on the amazon"
        return response

def test_real_openai_resolution(prompt):
    """Test with real OpenAI API"""
    if not HAS_OPENAI:
        print("OpenAI API not available")
        return "N/A"
    
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=50
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error calling OpenAI: {e}")
        return "Error"

def test_simple_pronoun_resolution():
    """Simple test of pronoun resolution logic"""
    
    # Simulate the memory context that would be passed
    memory_context = """Human: what about percy fawcetts best discoveries
AI: Percy Fawcett's best discoveries include his exploration of the Amazon rainforest and his belief in the existence of a lost city he called 'Z'. Fawcett's expeditions led to the discovery of archaeological artifacts and evidence of ancient civilizations in the Amazon, sparking intrigue and mystery around the region. His determination to uncover the truth behind the lost city of 'Z' captivated many, although the city itself remains a mystery to this day. Fawcett's legacy as an explorer and his adventurous spirit continue to inspire curiosity and exploration in the Amazon rainforest.
Human: who is paul rosolie?
AI: Paul Rosolie is an American conservationist, naturalist, explorer, author, and award-winning wildlife filmmaker known for his work in the Amazon rainforest, particularly in southeastern Peru. He gained recognition for his memoir *Mother of God* and for hosting the Discovery Channel's film *Eaten Alive*. Rosolie is also the founder of Jungle Keepers and Tamandua Expeditions, organizations dedicated to protecting Amazonian habitats. His work in conservation has been significant since he was 18 years old."""

    print("=== MEMORY CONTEXT ===")
    print(f"Length: {len(memory_context)} chars")
    print(memory_context)
    print("\n" + "="*60 + "\n")
    
    # Test the pronoun resolution prompt
    question = "what are his thoughts on the amazon"
    
    resolution_prompt = f"""You are helping resolve ambiguous references in a user's question based on previous conversation context.

CONVERSATION CONTEXT:
{memory_context}

CURRENT QUESTION: "{question}"

Your task: Rewrite the question to replace pronouns and ambiguous references with specific entities from the conversation context.

Rules:
1. Replace pronouns (he/she/they/him/her/them/it) with the specific person/entity they refer to
2. Replace ambiguous references (this/that/the person/the company) with specific names
3. Keep the original question structure and intent
4. If you cannot determine what a pronoun refers to, leave it unchanged
5. Only use information explicitly mentioned in the conversation context
6. Return ONLY the resolved question, no explanations

Examples:
- "What companies has he worked at?" → "What companies has David Sacks worked at?" (if David Sacks was discussed)
- "Why is this important?" → "Why is effective altruism important?" (if effective altruism was the topic)
- "How does that affect them?" → "How does climate change affect developing countries?" (if those were discussed)

Resolved question:"""

    print("=== PRONOUN RESOLUTION PROMPT ===")
    print(resolution_prompt)
    print("\n" + "="*60 + "\n")
    
    # Test with mock LLM
    mock_llm = MockLLM()
    response = mock_llm.invoke(resolution_prompt)
    print(f"Mock LLM Response: '{response.content}'")
    
    # Test with real OpenAI API
    if HAS_OPENAI:
        print("\n=== REAL OPENAI API TEST ===")
        real_response = test_real_openai_resolution(resolution_prompt)
        print(f"Real OpenAI Response: '{real_response}'")
    
    print("\n=== ANALYSIS ===")
    print("The conversation context shows:")
    print("1. Percy Fawcett mentioned first")
    print("2. Paul Rosolie mentioned MOST RECENTLY")
    print("3. 'his thoughts on the amazon' should refer to Paul Rosolie")
    print("4. Both are male (he/him), so proximity/recency should determine resolution")
    
    if HAS_OPENAI and real_response != "N/A" and real_response != "Error":
        if "Paul Rosolie" in real_response:
            print("✅ OpenAI correctly resolved to Paul Rosolie")
        elif "Percy Fawcett" in real_response:
            print("❌ OpenAI incorrectly resolved to Percy Fawcett")
        else:
            print("❓ OpenAI response unclear")
            print(f"   Full response: '{real_response}'")

if __name__ == "__main__":
    test_simple_pronoun_resolution() 