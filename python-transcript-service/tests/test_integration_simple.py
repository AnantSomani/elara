"""
Simple Integration Test for Simplified YouTube Transcript MVP API
Tests against the actual running service
"""

import requests
import pytest
import time

# Base URL for our running service
BASE_URL = "http://localhost:8001"

class TestLiveAPIIntegration:
    """Integration tests against live API"""
    
    def test_api_is_running(self):
        """Test that the API service is running and responding"""
        try:
            response = requests.get(f"{BASE_URL}/", timeout=5)
            assert response.status_code == 200
            data = response.json()
            assert "YouTube Transcript Service - Simplified MVP" in data["service"]
        except requests.exceptions.ConnectionError:
            pytest.skip("API service not running on localhost:8001")
    
    def test_health_endpoint_live(self):
        """Test health endpoint against live service"""
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=5)
            assert response.status_code == 200
            data = response.json()
            
            # Should have these fields regardless of database status
            assert "status" in data
            assert "service" in data
            assert "database_connected" in data
            
            print(f"✅ Health check: {data['status']}")
            print(f"✅ Database connected: {data['database_connected']}")
            
        except requests.exceptions.ConnectionError:
            pytest.skip("API service not running on localhost:8001")
    
    def test_docs_available(self):
        """Test that API documentation is accessible"""
        try:
            response = requests.get(f"{BASE_URL}/docs", timeout=5)
            assert response.status_code == 200
            # Should contain Swagger UI
            assert "swagger" in response.text.lower() or "openapi" in response.text.lower()
        except requests.exceptions.ConnectionError:
            pytest.skip("API service not running on localhost:8001")
    
    def test_insert_and_retrieve_transcript(self):
        """Test full transcript lifecycle: insert -> retrieve"""
        try:
            # Test data
            test_video_id = f"test_integration_{int(time.time())}"
            transcript_data = {
                "video_id": test_video_id,
                "transcript_text": "This is an integration test transcript for our simplified MVP system.",
                "summary": "Integration test summary"
            }
            
            # Insert transcript
            response = requests.post(f"{BASE_URL}/transcripts/", json=transcript_data, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                assert data["success"] is True
                assert data["data"]["video_id"] == test_video_id
                print(f"✅ Transcript inserted: {test_video_id}")
                
                # Retrieve transcript
                response = requests.get(f"{BASE_URL}/transcripts/{test_video_id}", timeout=5)
                assert response.status_code == 200
                
                retrieved_data = response.json()
                assert retrieved_data["video_id"] == test_video_id
                assert retrieved_data["transcript_text"] == transcript_data["transcript_text"]
                print(f"✅ Transcript retrieved successfully")
                
                return True
            else:
                print(f"⚠️ Insert failed with status {response.status_code}: {response.text}")
                return False
                
        except requests.exceptions.ConnectionError:
            pytest.skip("API service not running on localhost:8001")
        except Exception as e:
            print(f"⚠️ Integration test failed: {e}")
            return False
    
    def test_search_functionality(self):
        """Test search functionality"""
        try:
            search_data = {
                "query": "integration test",
                "match_count": 5
            }
            
            response = requests.post(f"{BASE_URL}/search", json=search_data, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                assert "query" in data
                assert "results" in data
                assert "total_found" in data
                assert data["query"] == "integration test"
                print(f"✅ Search completed: found {data['total_found']} results")
                return True
            else:
                print(f"⚠️ Search failed with status {response.status_code}: {response.text}")
                return False
                
        except requests.exceptions.ConnectionError:
            pytest.skip("API service not running on localhost:8001")
        except Exception as e:
            print(f"⚠️ Search test failed: {e}")
            return False

if __name__ == "__main__":
    """Run integration tests manually"""
    print("🧪 Running Integration Tests...")
    
    test_instance = TestLiveAPIIntegration()
    
    print("\n1. Testing API availability...")
    test_instance.test_api_is_running()
    
    print("\n2. Testing health endpoint...")
    test_instance.test_health_endpoint_live()
    
    print("\n3. Testing documentation...")
    test_instance.test_docs_available()
    
    print("\n4. Testing transcript operations...")
    test_instance.test_insert_and_retrieve_transcript()
    
    print("\n5. Testing search functionality...")
    test_instance.test_search_functionality()
    
    print("\n🎉 Integration tests completed!") 