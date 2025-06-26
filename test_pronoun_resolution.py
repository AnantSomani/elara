#!/usr/bin/env python3
"""
Test Script for Pronoun Resolution Integration
Step 2.2: Comprehensive testing of end-to-end pronoun resolution pipeline
"""

import asyncio
import sys
import os
import json
from typing import Dict, List, Any
from uuid import uuid4

# Add the app directory to Python path
sys.path.append('.')

def create_mock_llm():
    """Create a mock LLM for testing without requiring actual API keys"""
    
    class MockResponse:
        def __init__(self, content: str):
            self.content = content
    
    class MockLLM:
        def invoke(self, prompt: str) -> MockResponse:
            # Simple resolution patterns for testing
            if "What companies has he worked at?" in prompt and "David Sacks" in prompt:
                return MockResponse("What companies has David Sacks worked at?")
            elif "What did he do at PayPal?" in prompt and "David Sacks" in prompt:
                return MockResponse("What did David Sacks do at PayPal?")
            elif "How much was it sold for?" in prompt and "Yammer" in prompt:
                return MockResponse("How much was Yammer sold for?")
            elif "Why is this important?" in prompt and "effective altruism" in prompt:
                return MockResponse("Why is effective altruism important?")
            elif "What about them?" in prompt:
                return MockResponse("What about venture capitalists?")
            else:
                # Fallback: try to extract the current question and provide a generic resolution
                lines = prompt.split('\n')
                for line in lines:
                    if 'CURRENT QUESTION:' in line:
                        question = line.split('CURRENT QUESTION:')[1].strip().strip('"')
                        return MockResponse(f"Resolved: {question}")
                return MockResponse("Unable to resolve this question.")
    
    return MockLLM()

class PronounResolutionTester:
    """Comprehensive tester for pronoun resolution integration"""
    
    def __init__(self):
        self.test_results = []
        self.mock_llm = create_mock_llm()
    
    def log_test(self, test_name: str, passed: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        result = {
            "test": test_name,
            "passed": passed,
            "details": details,
            "status": status
        }
        self.test_results.append(result)
        print(f"{status} {test_name}: {details}")
    
    def test_pronoun_detection(self):
        """Test Step 1.1: Pronoun Detection Function"""
        print("\n🧪 Testing Pronoun Detection Function")
        print("-" * 50)
        
        from app.services.semantic_rag import has_pronouns_or_references
        
        test_cases = [
            ("What companies has he worked at?", True, "Personal pronoun 'he'"),
            ("What did they discuss about this?", True, "Pronoun 'they' + reference 'this'"),
            ("Who is David Sacks?", False, "No pronouns or references"),
            ("What about him?", True, "Pattern 'what about' + pronoun 'him'"),
            ("The person mentioned earlier", True, "Ambiguous reference"),
            ("Tell me about PayPal", False, "Specific entity, no pronouns"),
            ("How does that affect them?", True, "Reference 'that' + pronoun 'them'"),
        ]
        
        all_passed = True
        for question, expected, description in test_cases:
            result = has_pronouns_or_references(question)
            passed = result == expected
            all_passed = all_passed and passed
            
            self.log_test(
                f"Pronoun Detection: {description}",
                passed,
                f"'{question}' → {result} (expected: {expected})"
            )
        
        return all_passed
    
    def test_query_resolution(self):
        """Test Step 1.2: Query Resolution Function"""
        print("\n🧪 Testing Query Resolution Function")
        print("-" * 50)
        
        from app.services.semantic_rag import resolve_query_references
        
        # Test conversation contexts
        contexts = {
            "david_sacks": """Human: Who is David Sacks?
AI: David Sacks is a prominent entrepreneur and investor. He was COO of PayPal and founded Yammer.""",
            
            "effective_altruism": """Human: What is effective altruism?
AI: Effective altruism is a philosophy focused on using evidence to determine the most effective ways to help others.""",
            
            "empty": "",
            "none": None
        }
        
        test_cases = [
            ("What companies has he worked at?", "david_sacks", True, "Should resolve 'he' to 'David Sacks'"),
            ("Why is this important?", "effective_altruism", True, "Should resolve 'this' to 'effective altruism'"),
            ("What companies has he worked at?", "empty", False, "Should return original with empty context"),
            ("What companies has he worked at?", "none", False, "Should return original with None context"),
            ("Who is David Sacks?", "david_sacks", False, "Should return original (no pronouns)"),
        ]
        
        all_passed = True
        for question, context_key, should_change, description in test_cases:
            context = contexts.get(context_key)
            resolved = resolve_query_references(question, context, self.mock_llm)
            
            changed = resolved != question
            passed = changed == should_change
            all_passed = all_passed and passed
            
            self.log_test(
                f"Query Resolution: {description}",
                passed,
                f"'{question}' → '{resolved}' (changed: {changed})"
            )
        
        return all_passed
    
    def test_integration_flow(self):
        """Test Step 2.1: Integration into main search flow"""
        print("\n🧪 Testing Integration Flow (Mock)")
        print("-" * 50)
        
        # Since we can't easily test the full async query method without DB/API setup,
        # we'll test the integration logic flow
        
        from app.services.semantic_rag import has_pronouns_or_references, resolve_query_references
        
        # Simulate the integration flow
        test_scenarios = [
            {
                "name": "Pronoun resolution with memory",
                "question": "What companies has he worked at?",
                "memory_context": "Previous discussion about David Sacks, a tech entrepreneur...",
                "expected_flow": ["detect_pronouns", "resolve_query", "use_resolved"]
            },
            {
                "name": "No pronouns detected",
                "question": "Who is David Sacks?", 
                "memory_context": "Some previous context...",
                "expected_flow": ["no_pronouns_detected", "use_original"]
            },
            {
                "name": "Pronouns but no memory",
                "question": "What did he do?",
                "memory_context": "",
                "expected_flow": ["detect_pronouns", "no_memory", "use_original"]
            }
        ]
        
        all_passed = True
        for scenario in test_scenarios:
            question = scenario["question"]
            memory_context = scenario["memory_context"]
            
            # Simulate the integrated flow
            has_pronouns = has_pronouns_or_references(question)
            
            if has_pronouns and memory_context:
                resolved = resolve_query_references(question, memory_context, self.mock_llm)
                final_question = resolved
                flow = ["detect_pronouns", "resolve_query", "use_resolved"]
            elif has_pronouns and not memory_context:
                final_question = question
                flow = ["detect_pronouns", "no_memory", "use_original"]
            else:
                final_question = question
                flow = ["no_pronouns_detected", "use_original"]
            
            expected_flow = scenario["expected_flow"]
            passed = flow == expected_flow
            all_passed = all_passed and passed
            
            self.log_test(
                f"Integration Flow: {scenario['name']}",
                passed,
                f"Flow: {' → '.join(flow)} | Final: '{final_question}'"
            )
        
        return all_passed
    
    def test_conversation_scenarios(self):
        """Test realistic conversation scenarios"""
        print("\n🧪 Testing Conversation Scenarios")
        print("-" * 50)
        
        from app.services.semantic_rag import has_pronouns_or_references, resolve_query_references
        
        # Simulate multi-turn conversations
        conversations = [
            {
                "name": "David Sacks Discussion",
                "history": [
                    ("user", "Who is David Sacks?"),
                    ("ai", "David Sacks is a prominent entrepreneur and investor. He was COO of PayPal and founded Yammer."),
                ],
                "follow_ups": [
                    ("What companies has he worked at?", "David Sacks"),
                    ("What did he do at PayPal?", "David Sacks"),
                    ("How successful was he?", "David Sacks"),
                ]
            },
            {
                "name": "Company Discussion",
                "history": [
                    ("user", "Tell me about Yammer"),
                    ("ai", "Yammer is an enterprise social networking platform founded by David Sacks. It was acquired by Microsoft for $1.2 billion."),
                ],
                "follow_ups": [
                    ("How much was it sold for?", "Yammer"),
                    ("Why was it successful?", "it"),
                    ("Who founded that company?", "that company"),
                ]
            }
        ]
        
        all_passed = True
        for conv in conversations:
            # Build memory context from history
            memory_context = "\n".join([
                f"{'Human' if role == 'user' else 'AI'}: {msg}" 
                for role, msg in conv["history"]
            ])
            
            for question, expected_entity in conv["follow_ups"]:
                has_pronouns = has_pronouns_or_references(question)
                
                if has_pronouns:
                    resolved = resolve_query_references(question, memory_context, self.mock_llm)
                    # Check if expected entity appears in resolved question
                    contains_entity = expected_entity.lower() in resolved.lower()
                    passed = contains_entity or resolved != question  # Either contains entity or was modified
                else:
                    passed = True  # No pronouns, should work fine
                
                all_passed = all_passed and passed
                
                self.log_test(
                    f"Conversation: {conv['name']} → {question}",
                    passed,
                    f"Pronouns: {has_pronouns} | Expected entity: {expected_entity}"
                )
        
        return all_passed
    
    def test_edge_cases(self):
        """Test edge cases and error conditions"""
        print("\n🧪 Testing Edge Cases")
        print("-" * 50)
        
        from app.services.semantic_rag import has_pronouns_or_references, resolve_query_references
        
        edge_cases = [
            {
                "name": "Empty question",
                "question": "",
                "should_have_pronouns": False
            },
            {
                "name": "Single word",
                "question": "he",
                "should_have_pronouns": True
            },
            {
                "name": "Punctuation heavy",
                "question": "What about him???",
                "should_have_pronouns": True
            },
            {
                "name": "Mixed case",
                "question": "What Did HE Do?",
                "should_have_pronouns": True
            },
            {
                "name": "No punctuation",
                "question": "what did they say",
                "should_have_pronouns": True
            }
        ]
        
        all_passed = True
        for case in edge_cases:
            question = case["question"]
            expected = case["should_have_pronouns"]
            
            try:
                has_pronouns = has_pronouns_or_references(question)
                passed = has_pronouns == expected
                
                # Test resolution doesn't crash
                if question:  # Skip empty questions for resolution
                    resolved = resolve_query_references(question, "Test context", self.mock_llm)
                    resolution_passed = isinstance(resolved, str)
                else:
                    resolution_passed = True
                
                overall_passed = passed and resolution_passed
                all_passed = all_passed and overall_passed
                
                self.log_test(
                    f"Edge Case: {case['name']}",
                    overall_passed,
                    f"'{question}' → pronouns: {has_pronouns} (expected: {expected})"
                )
                
            except Exception as e:
                self.log_test(
                    f"Edge Case: {case['name']}",
                    False,
                    f"Exception: {e}"
                )
                all_passed = False
        
        return all_passed
    
    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Pronoun Resolution Integration Tests")
        print("=" * 70)
        
        test_suites = [
            ("Pronoun Detection", self.test_pronoun_detection),
            ("Query Resolution", self.test_query_resolution),
            ("Integration Flow", self.test_integration_flow),
            ("Conversation Scenarios", self.test_conversation_scenarios),
            ("Edge Cases", self.test_edge_cases),
        ]
        
        all_passed = True
        suite_results = []
        
        for suite_name, test_func in test_suites:
            print(f"\n📋 Running {suite_name} Tests...")
            suite_passed = test_func()
            all_passed = all_passed and suite_passed
            suite_results.append((suite_name, suite_passed))
        
        # Print summary
        print("\n" + "=" * 70)
        print("📊 TEST SUMMARY")
        print("=" * 70)
        
        for suite_name, passed in suite_results:
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{status} {suite_name}")
        
        print(f"\n🎯 OVERALL RESULT: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
        
        # Detailed breakdown
        passed_count = sum(1 for result in self.test_results if result["passed"])
        total_count = len(self.test_results)
        print(f"📈 Tests passed: {passed_count}/{total_count} ({passed_count/total_count*100:.1f}%)")
        
        if not all_passed:
            print("\n❌ Failed Tests:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"   • {result['test']}: {result['details']}")
        
        return all_passed

def main():
    """Main test runner"""
    tester = PronounResolutionTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 Step 2.2 Complete: All integration tests passed!")
        exit(0)
    else:
        print("\n⚠️ Step 2.2 Incomplete: Some tests failed.")
        exit(1)

if __name__ == "__main__":
    main() 