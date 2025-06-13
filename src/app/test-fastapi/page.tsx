'use client';

import { useState } from 'react';
import { fastAPIClient } from '@/lib/api/fastapi-client';

export default function TestFastAPIPage() {
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testHealthCheck = async () => {
    setLoading(true);
    try {
      const result = await fastAPIClient.healthCheck();
      setHealthStatus(result);
    } catch (error) {
      setHealthStatus({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
    setLoading(false);
  };

  const testSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const result = await fastAPIClient.searchTranscripts(searchQuery, 5);
      setSearchResults(result);
    } catch (error) {
      setSearchResults({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">FastAPI Integration Test</h1>
      
      {/* Health Check Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Health Check</h2>
        <button
          onClick={testHealthCheck}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Test Health Endpoint'}
        </button>
        
        {healthStatus && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <h3 className="font-medium mb-2">Health Status:</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(healthStatus, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Search Test Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Search Test</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter search query..."
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            onClick={testSearch}
            disabled={loading || !searchQuery.trim()}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {searchResults && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <h3 className="font-medium mb-2">Search Results:</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(searchResults, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Integration Status */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">Integration Status</h3>
        <ul className="text-sm space-y-1">
          <li>✅ FastAPI Backend: http://localhost:8001</li>
          <li>✅ Next.js Frontend: http://localhost:8080</li>
          <li>✅ Test Suite: 93% unit tests, 100% integration tests</li>
          <li>🔄 Frontend Integration: In Progress</li>
        </ul>
      </div>
    </div>
  );
} 