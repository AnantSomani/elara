const FASTAPI_BASE_URL = process.env.FASTAPI_URL || 'http://localhost:8001';

interface FastAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

interface SearchResult {
  transcript_id: string;
  content: string;
  relevance_score: number;
  metadata?: {
    title?: string;
    channel?: string;
    duration?: number;
  };
}

interface TranscriptData {
  transcript_id: string;
  youtube_url: string;
  content: string;
  metadata?: {
    title?: string;
    channel?: string;
    duration?: number;
    word_count?: number;
  };
  processed_at?: string;
}

export class FastAPIClient {
  private baseURL: string;

  constructor(baseURL: string = FASTAPI_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<FastAPIResponse<T>> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`FastAPI request failed for ${endpoint}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }

  // Search transcripts
  async searchTranscripts(
    query: string,
    limit: number = 10
  ): Promise<FastAPIResponse<SearchResult[]>> {
    return this.request<SearchResult[]>('/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    });
  }

  // Get all transcripts
  async getTranscripts(
    skip: number = 0,
    limit: number = 50
  ): Promise<FastAPIResponse<TranscriptData[]>> {
    return this.request<TranscriptData[]>(`/transcripts?skip=${skip}&limit=${limit}`);
  }

  // Get specific transcript by ID
  async getTranscript(transcriptId: string): Promise<FastAPIResponse<TranscriptData>> {
    return this.request<TranscriptData>(`/transcripts/${transcriptId}`);
  }

  // Add new transcript from YouTube URL
  async addTranscript(
    youtubeUrl: string
  ): Promise<FastAPIResponse<{ transcript_id: string }>> {
    return this.request('/transcripts/from-youtube/', {
      method: 'POST',
      body: JSON.stringify({ youtube_url: youtubeUrl }),
    });
  }

  // Delete transcript
  async deleteTranscript(transcriptId: string): Promise<FastAPIResponse<{ message: string }>> {
    return this.request(`/transcripts/${transcriptId}`, {
      method: 'DELETE',
    });
  }
}

// Singleton instance
export const fastAPIClient = new FastAPIClient();

// Helper functions for common operations
export async function searchWithFastAPI(query: string, limit = 10) {
  return fastAPIClient.searchTranscripts(query, limit);
}

export async function getTranscriptsFromFastAPI(skip = 0, limit = 50) {
  return fastAPIClient.getTranscripts(skip, limit);
}

export async function addTranscriptToFastAPI(youtubeUrl: string) {
  return fastAPIClient.addTranscript(youtubeUrl);
} 