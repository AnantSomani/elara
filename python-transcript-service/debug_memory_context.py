import os
import sys
from unittest.mock import Mock

# Mock the LLM for testing
class MockLLM:
    def invoke(self, prompt):
        response = Mock()
        # Simulate what the LLM might return for pronoun resolution
        if "what are his thoughts on the amazon" in prompt:
            # This should resolve to Paul Rosolie based on context
            response.content = "what are Paul Rosolie's thoughts on the amazon"
        return response

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
    
    print("\n=== ANALYSIS ===")
    print("The conversation context shows:")
    print("1. Percy Fawcett mentioned first")
    print("2. Paul Rosolie mentioned MOST RECENTLY")
    print("3. 'his thoughts on the amazon' should refer to Paul Rosolie")
    print("4. Both are male (he/him), so proximity/recency should determine resolution")

if __name__ == "__main__":
    test_simple_pronoun_resolution()
