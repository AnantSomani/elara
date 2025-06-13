"""
Unit Tests for Simplified YouTube Transcript MVP API
Tests all endpoints, database operations, and error handling
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import HTTPException
import asyncpg

# Import our app and models
from app.main import app, get_db, enrich_metadata_background
from app.models_simplified import (
    TranscriptIn, SearchQuery, SystemStats, HealthResponse
)

# Create test client
client = TestClient(app)

# Mock database connection for testing
@pytest.fixture
async def mock_db():
    """Create a mock database connection for testing"""
    mock_conn = AsyncMock(spec=asyncpg.Connection)
    return mock_conn

@pytest.fixture
def override_get_db(mock_db):
    """Override the get_db dependency with mock"""
    async def mock_get_db():
        yield mock_db
    
    app.dependency_overrides[get_db] = mock_get_db
    yield mock_db
    app.dependency_overrides.clear()

class TestHealthEndpoint:
    """Test suite for health check endpoint"""
    
    def test_health_check_success(self, override_get_db):
        """Test successful health check with database connectivity"""
        # Mock database responses
        override_get_db.fetchval.side_effect = [1, 5, 3]  # SELECT 1, transcript count, metadata count
        
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "healthy"
        assert data["service"] == "YouTube Transcript Service - MVP"
        assert data["version"] == "2.0.0"
        assert data["database_connected"] is True
        assert data["stats"]["total_transcripts"] == 5
        assert data["stats"]["complete_metadata"] == 3

    def test_health_check_database_failure(self, override_get_db):
        """Test health check when database is unavailable"""
        # Mock database to raise exception
        override_get_db.fetchval.side_effect = Exception("Database connection failed")
        
        response = client.get("/health")
        
        assert response.status_code == 200  # Still returns 200 but status unhealthy
        data = response.json()
        
        assert data["status"] == "unhealthy"
        assert data["database_connected"] is False
        assert data["stats"] is None

class TestTranscriptEndpoints:
    """Test suite for transcript CRUD operations"""
    
    def test_insert_transcript_success(self, override_get_db):
        """Test successful transcript insertion"""
        # Mock database operations
        override_get_db.execute.return_value = None
        
        transcript_data = {
            "video_id": "test_video_123",
            "transcript_text": "This is a test transcript for our MVP system.",
            "summary": "Test transcript summary"
        }
        
        response = client.post("/transcripts/", json=transcript_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert data["message"] == "Transcript inserted successfully"
        assert data["data"]["video_id"] == "test_video_123"
        
        # Verify database calls
        assert override_get_db.execute.call_count == 2  # Insert transcript + metadata

    def test_insert_transcript_validation_error(self):
        """Test transcript insertion with invalid data"""
        # Missing required fields
        transcript_data = {
            "video_id": "test_video_123"
            # Missing transcript_text
        }
        
        response = client.post("/transcripts/", json=transcript_data)
        
        assert response.status_code == 422  # Validation error

    def test_get_transcript_success(self, override_get_db):
        """Test successful transcript retrieval"""
        # Mock database response
        mock_row = {
            "video_id": "test_video_123",
            "transcript_text": "Test transcript content",
            "summary": "Test summary",
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00"
        }
        override_get_db.fetchrow.return_value = mock_row
        
        response = client.get("/transcripts/test_video_123")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["video_id"] == "test_video_123"
        assert data["transcript_text"] == "Test transcript content"
        assert data["summary"] == "Test summary"

    def test_get_transcript_not_found(self, override_get_db):
        """Test transcript retrieval when transcript doesn't exist"""
        # Mock database to return None
        override_get_db.fetchrow.return_value = None
        
        response = client.get("/transcripts/nonexistent_video")
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"] == "Transcript not found"

    def test_transcript_database_error(self, override_get_db):
        """Test transcript operations when database fails"""
        # Mock database to raise exception
        override_get_db.execute.side_effect = Exception("Database error")
        
        transcript_data = {
            "video_id": "test_video_123",
            "transcript_text": "Test transcript"
        }
        
        response = client.post("/transcripts/", json=transcript_data)
        
        assert response.status_code == 500
        assert "Failed to insert transcript" in response.json()["detail"]

class TestSearchEndpoint:
    """Test suite for search functionality"""
    
    def test_search_transcripts_success(self, override_get_db):
        """Test successful transcript search"""
        # Mock database response
        mock_results = [
            {
                "video_id": "video1",
                "title": "Test Video 1",
                "transcript_text": "This contains the search term",
                "similarity": 0.8
            },
            {
                "video_id": "video2", 
                "title": "Test Video 2",
                "transcript_text": "This also contains the search term",
                "similarity": 0.7
            }
        ]
        override_get_db.fetch.return_value = mock_results
        
        search_data = {
            "query": "search term",
            "match_count": 5
        }
        
        response = client.post("/search", json=search_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["query"] == "search term"
        assert len(data["results"]) == 2
        assert data["total_found"] == 2
        assert data["processing_time_ms"] > 0
        
        # Check first result
        assert data["results"][0]["video_id"] == "video1"
        assert data["results"][0]["title"] == "Test Video 1"

    def test_search_no_results(self, override_get_db):
        """Test search when no results found"""
        # Mock database to return empty list
        override_get_db.fetch.return_value = []
        
        search_data = {
            "query": "nonexistent term",
            "match_count": 5
        }
        
        response = client.post("/search", json=search_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["query"] == "nonexistent term"
        assert len(data["results"]) == 0
        assert data["total_found"] == 0

    def test_search_validation_error(self):
        """Test search with invalid parameters"""
        search_data = {
            "query": "test",
            "match_count": 100  # Exceeds max limit of 50
        }
        
        response = client.post("/search", json=search_data)
        
        assert response.status_code == 422  # Validation error

class TestMetadataEndpoints:
    """Test suite for metadata operations"""
    
    def test_get_metadata_success(self, override_get_db):
        """Test successful metadata retrieval"""
        mock_metadata = {
            "video_id": "test_video_123",
            "title": "Test Video Title",
            "published_at": "2024-01-01T00:00:00",
            "channel_id": "UC123",
            "channel_title": "Test Channel",
            "duration_seconds": 300,
            "thumbnail_url": "https://example.com/thumb.jpg",
            "metadata_status": "complete",
            "updated_at": "2024-01-01T00:00:00"
        }
        override_get_db.fetchrow.return_value = mock_metadata
        
        response = client.get("/metadata/test_video_123")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["video_id"] == "test_video_123"
        assert data["title"] == "Test Video Title"
        assert data["metadata_status"] == "complete"

    def test_get_metadata_not_found(self, override_get_db):
        """Test metadata retrieval when metadata doesn't exist"""
        override_get_db.fetchrow.return_value = None
        
        response = client.get("/metadata/nonexistent_video")
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"] == "Metadata not found"

    def test_get_metadata_status(self, override_get_db):
        """Test metadata status counts endpoint"""
        mock_status_counts = [
            {"metadata_status": "complete", "count": 5},
            {"metadata_status": "pending", "count": 2},
            {"metadata_status": "placeholder", "count": 3}
        ]
        override_get_db.fetch.return_value = mock_status_counts
        
        response = client.get("/metadata-status")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["complete"] == 5
        assert data["pending"] == 2
        assert data["placeholder"] == 3

class TestBatchOperations:
    """Test suite for batch operations"""
    
    def test_batch_insert_transcripts(self, override_get_db):
        """Test batch transcript insertion"""
        override_get_db.execute.return_value = None
        
        batch_data = {
            "transcripts": [
                {
                    "video_id": "video1",
                    "transcript_text": "First transcript"
                },
                {
                    "video_id": "video2", 
                    "transcript_text": "Second transcript"
                }
            ],
            "enrich_metadata": False  # Skip background tasks in test
        }
        
        response = client.post("/transcripts/batch", json=batch_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] is True
        assert data["data"]["inserted_count"] == 2
        
        # Verify database calls (2 transcripts × 2 operations each)
        assert override_get_db.execute.call_count == 4

class TestBackgroundTasks:
    """Test suite for background metadata enrichment"""
    
    @patch('app.main.requests.get')
    @patch('app.main.db_pool')
    async def test_enrich_metadata_success(self, mock_db_pool, mock_requests_get):
        """Test successful metadata enrichment from YouTube API"""
        # Mock YouTube API response
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "items": [{
                "snippet": {
                    "title": "Test Video Title",
                    "publishedAt": "2024-01-01T00:00:00Z",
                    "channelId": "UC123",
                    "channelTitle": "Test Channel",
                    "thumbnails": {
                        "default": {
                            "url": "https://example.com/thumb.jpg"
                        }
                    }
                },
                "contentDetails": {
                    "duration": "PT5M0S"  # 5 minutes
                }
            }]
        }
        mock_requests_get.return_value = mock_response
        
        # Mock database pool
        mock_db_conn = AsyncMock()
        mock_db_pool.acquire.return_value.__aenter__.return_value = mock_db_conn
        
        # Set environment variable for test
        with patch.dict('os.environ', {'YOUTUBE_API_KEY': 'test_api_key'}):
            await enrich_metadata_background("test_video_123")
        
        # Verify database update was called
        assert mock_db_conn.execute.call_count == 2  # Status update + metadata update

    @patch('app.main.db_pool')
    async def test_enrich_metadata_no_api_key(self, mock_db_pool):
        """Test metadata enrichment when no API key is provided"""
        with patch.dict('os.environ', {}, clear=True):
            # Should not raise exception, just log warning
            await enrich_metadata_background("test_video_123")
        
        # Should not make any database calls
        assert not mock_db_pool.acquire.called

class TestRootEndpoint:
    """Test suite for root endpoint"""
    
    def test_root_endpoint(self):
        """Test API root endpoint"""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["service"] == "YouTube Transcript Service - Simplified MVP"
        assert data["version"] == "2.0.0"
        assert "endpoints" in data
        assert "/health" in data["endpoints"]["health"]

class TestErrorHandling:
    """Test suite for error handling"""
    
    def test_database_not_available(self):
        """Test when database dependency fails"""
        # Override get_db to raise exception
        def failing_get_db():
            raise HTTPException(status_code=500, detail="Database not available")
        
        app.dependency_overrides[get_db] = failing_get_db
        
        response = client.get("/health")
        
        assert response.status_code == 500
        
        # Clean up
        app.dependency_overrides.clear()

    def test_invalid_json_request(self):
        """Test handling of malformed JSON requests"""
        response = client.post("/transcripts/", data="invalid json")
        
        assert response.status_code == 422

# Integration test with actual database (optional, requires DATABASE_URL)
@pytest.mark.integration
class TestDatabaseIntegration:
    """Integration tests with real database (requires DATABASE_URL)"""
    
    @pytest.mark.asyncio
    async def test_database_connectivity(self):
        """Test actual database connection (integration test)"""
        import os
        if not os.getenv("DATABASE_URL"):
            pytest.skip("DATABASE_URL not set, skipping integration test")
        
        # This would test with real database
        response = client.get("/health")
        assert response.status_code == 200

# Performance tests
class TestPerformance:
    """Test performance characteristics"""
    
    def test_health_check_response_time(self, override_get_db):
        """Test that health check responds quickly"""
        import time
        
        override_get_db.fetchval.side_effect = [1, 0, 0]
        
        start_time = time.time()
        response = client.get("/health")
        end_time = time.time()
        
        assert response.status_code == 200
        assert (end_time - start_time) < 1.0  # Should respond in under 1 second

    def test_search_response_time(self, override_get_db):
        """Test that search responds within reasonable time"""
        import time
        
        override_get_db.fetch.return_value = []
        
        search_data = {"query": "test", "match_count": 10}
        
        start_time = time.time()
        response = client.post("/search", json=search_data)
        end_time = time.time()
        
        assert response.status_code == 200
        data = response.json()
        assert data["processing_time_ms"] > 0
        assert (end_time - start_time) < 2.0  # Should respond in under 2 seconds

if __name__ == "__main__":
    # Run tests with: python -m pytest tests/test_simplified_api.py -v
    pass 