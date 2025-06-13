/**
 * YouTube Transcript Database Schema
 * 
 * Clean, purpose-built schema for YouTube transcript storage,
 * full-text search, vector embeddings, and multi-modal RAG system.
 */

export interface YouTubeDatabase {
  public: {
    Tables: {
      // ============================================================================
      // CORE YOUTUBE CONTENT TABLES
      // ============================================================================
      
      /**
       * YouTube channels/creators metadata
       */
      youtube_channels: {
        Row: {
          id: string; // YouTube channel ID (e.g., "UC_x5XG1OV2P6uZZ5FSM9Ttw")
          name: string;
          description: string | null;
          custom_url: string | null; // @channelname
          thumbnail_url: string | null;
          
          // Channel statistics
          subscriber_count: number | null;
          video_count: number | null;
          view_count: number | null;
          
          // AI-extracted metadata
          category: string | null;
          topics: string[]; // AI-extracted topics
          expertise_areas: string[]; // AI-determined expertise
          content_style: string | null; // educational, entertainment, etc.
          
          // FTS optimization - generated column
          search_vector: unknown; // tsvector type
          
          // Timestamps
          created_at: string;
          updated_at: string;
          last_crawled_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          custom_url?: string | null;
          thumbnail_url?: string | null;
          subscriber_count?: number | null;
          video_count?: number | null;
          view_count?: number | null;
          category?: string | null;
          topics?: string[];
          expertise_areas?: string[];
          content_style?: string | null;
          created_at?: string;
          updated_at?: string;
          last_crawled_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          custom_url?: string | null;
          thumbnail_url?: string | null;
          subscriber_count?: number | null;
          video_count?: number | null;
          view_count?: number | null;
          category?: string | null;
          topics?: string[];
          expertise_areas?: string[];
          content_style?: string | null;
          updated_at?: string;
          last_crawled_at?: string | null;
        };
      };

      /**
       * YouTube videos metadata
       */
      youtube_videos: {
        Row: {
          id: string; // YouTube video ID (e.g., "dQw4w9WgXcQ")
          channel_id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          
          // Video statistics
          duration_seconds: number;
          view_count: number | null;
          like_count: number | null;
          comment_count: number | null;
          
          // Video metadata
          published_at: string;
          language: string | null;
          category: string | null;
          tags: string[];
          
          // Content flags
          has_captions: boolean;
          has_auto_captions: boolean;
          is_live: boolean;
          is_private: boolean;
          
          // Processing status
          transcript_status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_available';
          transcript_error: string | null;
          
          // FTS optimization - generated column
          search_vector: unknown; // tsvector type
          
          // Timestamps
          created_at: string;
          updated_at: string;
          last_processed_at: string | null;
        };
        Insert: {
          id: string;
          channel_id: string;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          duration_seconds: number;
          view_count?: number | null;
          like_count?: number | null;
          comment_count?: number | null;
          published_at: string;
          language?: string | null;
          category?: string | null;
          tags?: string[];
          has_captions?: boolean;
          has_auto_captions?: boolean;
          is_live?: boolean;
          is_private?: boolean;
          transcript_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'not_available';
          transcript_error?: string | null;
          created_at?: string;
          updated_at?: string;
          last_processed_at?: string | null;
        };
        Update: {
          id?: string;
          channel_id?: string;
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          duration_seconds?: number;
          view_count?: number | null;
          like_count?: number | null;
          comment_count?: number | null;
          published_at?: string;
          language?: string | null;
          category?: string | null;
          tags?: string[];
          has_captions?: boolean;
          has_auto_captions?: boolean;
          is_live?: boolean;
          is_private?: boolean;
          transcript_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'not_available';
          transcript_error?: string | null;
          updated_at?: string;
          last_processed_at?: string | null;
        };
      };

      // ============================================================================
      // TRANSCRIPT STORAGE TABLES
      // ============================================================================

      /**
       * Complete YouTube video transcripts with FTS support
       */
      youtube_transcripts: {
        Row: {
          id: string;
          video_id: string;
          channel_id: string;
          
          // Transcript content
          content: string; // Full transcript text
          segment_count: number;
          total_duration: number; // in seconds
          
          // Processing metadata
          language: string;
          format: 'json' | 'text' | 'srt' | 'vtt' | 'fts';
          source: 'auto' | 'manual' | 'community';
          confidence_score: number | null; // Average confidence
          
          // Processing details
          processing_time_ms: number | null;
          api_version: string | null;
          
          // FTS optimization - generated column  
          content_vector: unknown; // tsvector type for full content search
          
          // Timestamps
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          channel_id: string;
          content: string;
          segment_count: number;
          total_duration: number;
          language: string;
          format: 'json' | 'text' | 'srt' | 'vtt' | 'fts';
          source: 'auto' | 'manual' | 'community';
          confidence_score?: number | null;
          processing_time_ms?: number | null;
          api_version?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          channel_id?: string;
          content?: string;
          segment_count?: number;
          total_duration?: number;
          language?: string;
          format?: 'json' | 'text' | 'srt' | 'vtt' | 'fts';
          source?: 'auto' | 'manual' | 'community';
          confidence_score?: number | null;
          processing_time_ms?: number | null;
          api_version?: string | null;
          updated_at?: string;
        };
      };

      /**
       * Individual transcript segments for granular search
       */
      youtube_transcript_segments: {
        Row: {
          id: string;
          transcript_id: string;
          video_id: string; // Denormalized for direct access
          
          // Segment content
          text: string;
          start_time: number; // in seconds
          end_time: number; // in seconds
          duration: number; // end_time - start_time
          
          // Segment metadata
          segment_index: number; // Order within transcript
          speaker: string | null; // If speaker identification available
          confidence: number | null; // Individual segment confidence
          
          // Enhanced search fields
          keywords: string[]; // Extracted keywords for this segment
          topics: string[]; // AI-extracted topics
          
          // Timestamps
          created_at: string;
        };
        Insert: {
          id?: string;
          transcript_id: string;
          video_id: string;
          text: string;
          start_time: number;
          end_time: number;
          duration: number;
          segment_index: number;
          speaker?: string | null;
          confidence?: number | null;
          keywords?: string[];
          topics?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          transcript_id?: string;
          video_id?: string;
          text?: string;
          start_time?: number;
          end_time?: number;
          duration?: number;
          segment_index?: number;
          speaker?: string | null;
          confidence?: number | null;
          keywords?: string[];
          topics?: string[];
        };
      };

      // ============================================================================
      // VECTOR EMBEDDINGS TABLES
      // ============================================================================

      /**
       * Vector embeddings for semantic search
       */
      youtube_embeddings: {
        Row: {
          id: string;
          content_type: 'transcript_full' | 'transcript_chunk' | 'video_metadata' | 'channel_metadata';
          content_id: string; // References transcript_id, segment_id, video_id, or channel_id
          
          // Embedding data
          embedding: number[]; // Vector embedding (1536 dimensions for OpenAI)
          model: string; // e.g., "text-embedding-3-small"
          embedding_version: string; // Track model versions
          
          // Chunk information (for transcript chunks)
          chunk_index: number | null;
          chunk_text: string | null;
          chunk_token_count: number | null;
          
          // Context metadata
          metadata: Record<string, any>; // Flexible metadata storage
          
          // Timestamps
          created_at: string;
        };
        Insert: {
          id?: string;
          content_type: 'transcript_full' | 'transcript_chunk' | 'video_metadata' | 'channel_metadata';
          content_id: string;
          embedding: number[];
          model: string;
          embedding_version: string;
          chunk_index?: number | null;
          chunk_text?: string | null;
          chunk_token_count?: number | null;
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_type?: 'transcript_full' | 'transcript_chunk' | 'video_metadata' | 'channel_metadata';
          content_id?: string;
          embedding?: number[];
          model?: string;
          embedding_version?: string;
          chunk_index?: number | null;
          chunk_text?: string | null;
          chunk_token_count?: number | null;
          metadata?: Record<string, any>;
        };
      };

      // ============================================================================
      // SEARCH & CACHE TABLES
      // ============================================================================

      /**
       * Search query cache for performance
       */
      youtube_search_cache: {
        Row: {
          id: string;
          query_hash: string; // MD5 hash of normalized query
          query_text: string;
          query_type: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
          
          // Cached results
          results: Record<string, any>; // JSON results
          result_count: number;
          
          // Cache metadata
          search_strategy: Record<string, any>; // Which engines were used
          execution_time_ms: number;
          
          // Cache management
          expires_at: string;
          hit_count: number; // Track cache usage
          
          // Timestamps
          created_at: string;
          last_accessed_at: string;
        };
        Insert: {
          id?: string;
          query_hash: string;
          query_text: string;
          query_type: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
          results: Record<string, any>;
          result_count: number;
          search_strategy: Record<string, any>;
          execution_time_ms: number;
          expires_at: string;
          hit_count?: number;
          created_at?: string;
          last_accessed_at?: string;
        };
        Update: {
          id?: string;
          query_hash?: string;
          query_text?: string;
          query_type?: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
          results?: Record<string, any>;
          result_count?: number;
          search_strategy?: Record<string, any>;
          execution_time_ms?: number;
          expires_at?: string;
          hit_count?: number;
          last_accessed_at?: string;
        };
      };

      /**
       * Web search cache (Tavily results)
       */
      youtube_web_cache: {
        Row: {
          id: string;
          query_hash: string;
          query_text: string;
          
          // Web search results
          results: Record<string, any>; // Tavily API response
          result_count: number;
          search_provider: 'tavily' | 'google' | 'other';
          
          // Cache metadata
          expires_at: string;
          is_fresh: boolean; // Whether results are still current
          
          // Timestamps
          created_at: string;
          last_refreshed_at: string;
        };
        Insert: {
          id?: string;
          query_hash: string;
          query_text: string;
          results: Record<string, any>;
          result_count: number;
          search_provider: 'tavily' | 'google' | 'other';
          expires_at: string;
          is_fresh?: boolean;
          created_at?: string;
          last_refreshed_at?: string;
        };
        Update: {
          id?: string;
          query_hash?: string;
          query_text?: string;
          results?: Record<string, any>;
          result_count?: number;
          search_provider?: 'tavily' | 'google' | 'other';
          expires_at?: string;
          is_fresh?: boolean;
          last_refreshed_at?: string;
        };
      };

      // ============================================================================
      // ANALYTICS & MONITORING TABLES
      // ============================================================================

      /**
       * Search analytics and performance monitoring
       */
      youtube_search_analytics: {
        Row: {
          id: string;
          session_id: string | null; // User session if available
          
          // Query information
          query_text: string;
          query_type: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
          query_intent: string | null; // AI-classified intent
          
          // Search execution
          engines_used: string[]; // Which search engines were used
          total_results: number;
          execution_time_ms: number;
          
          // Result interaction
          clicked_results: string[]; // Result IDs that were clicked
          user_satisfaction: number | null; // 1-5 rating if available
          
          // Performance metrics
          cache_hit: boolean;
          error_occurred: boolean;
          error_message: string | null;
          
          // Timestamps
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          query_text: string;
          query_type: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
          query_intent?: string | null;
          engines_used: string[];
          total_results: number;
          execution_time_ms: number;
          clicked_results?: string[];
          user_satisfaction?: number | null;
          cache_hit?: boolean;
          error_occurred?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          query_text?: string;
          query_type?: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
          query_intent?: string | null;
          engines_used?: string[];
          total_results?: number;
          execution_time_ms?: number;
          clicked_results?: string[];
          user_satisfaction?: number | null;
          cache_hit?: boolean;
          error_occurred?: boolean;
          error_message?: string | null;
        };
      };
    };

    Views: {
      /**
       * Convenient view for video search with channel info
       */
      youtube_video_search: {
        Row: {
          video_id: string;
          video_title: string;
          video_description: string;
          channel_id: string;
          channel_name: string;
          channel_description: string;
          duration_seconds: number;
          published_at: string;
          has_transcript: boolean;
          transcript_language: string | null;
          segment_count: number | null;
        };
      };

      /**
       * View for transcript search with video and channel context
       */
      youtube_transcript_search: {
        Row: {
          transcript_id: string;
          video_id: string;
          video_title: string;
          channel_id: string;
          channel_name: string;
          content: string;
          segment_count: number;
          language: string;
          created_at: string;
        };
      };
    };

    Functions: {
      /**
       * Vector similarity search function
       */
      match_youtube_embeddings: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          content_types?: string[];
        };
        Returns: {
          id: string;
          content_id: string;
          content_type: string;
          similarity: number;
          chunk_text: string | null;
          metadata: Record<string, any>;
        }[];
      };

      /**
       * Hybrid search function (FTS + Vector)
       */
      hybrid_search_youtube: {
        Args: {
          search_query: string;
          embedding?: number[];
          fts_weight?: number;
          vector_weight?: number;
          limit?: number;
        };
        Returns: {
          id: string;
          content_type: string;
          content: string;
          relevance_score: number;
          source: string;
          metadata: Record<string, any>;
        }[];
      };

      /**
       * Get video recommendations based on content similarity
       */
      get_similar_videos: {
        Args: {
          video_id: string;
          similarity_threshold?: number;
          limit?: number;
        };
        Returns: {
          video_id: string;
          title: string;
          channel_name: string;
          similarity_score: number;
        }[];
      };
    };

    Enums: {
      transcript_status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_available';
      content_type: 'transcript_full' | 'transcript_chunk' | 'video_metadata' | 'channel_metadata';
      search_provider: 'tavily' | 'google' | 'other';
      query_type: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
    };
  };
}

// ============================================================================
// TYPESCRIPT HELPERS AND UTILITIES
// ============================================================================

/**
 * Convenience type aliases
 */
export type YouTubeChannel = YouTubeDatabase['public']['Tables']['youtube_channels']['Row'];
export type YouTubeVideo = YouTubeDatabase['public']['Tables']['youtube_videos']['Row'];
export type YouTubeTranscript = YouTubeDatabase['public']['Tables']['youtube_transcripts']['Row'];
export type YouTubeTranscriptSegment = YouTubeDatabase['public']['Tables']['youtube_transcript_segments']['Row'];
export type YouTubeEmbedding = YouTubeDatabase['public']['Tables']['youtube_embeddings']['Row'];
export type YouTubeSearchCache = YouTubeDatabase['public']['Tables']['youtube_search_cache']['Row'];

/**
 * Insert types for creating new records
 */
export type YouTubeChannelInsert = YouTubeDatabase['public']['Tables']['youtube_channels']['Insert'];
export type YouTubeVideoInsert = YouTubeDatabase['public']['Tables']['youtube_videos']['Insert'];
export type YouTubeTranscriptInsert = YouTubeDatabase['public']['Tables']['youtube_transcripts']['Insert'];
export type YouTubeTranscriptSegmentInsert = YouTubeDatabase['public']['Tables']['youtube_transcript_segments']['Insert'];
export type YouTubeEmbeddingInsert = YouTubeDatabase['public']['Tables']['youtube_embeddings']['Insert'];

/**
 * Update types for modifying existing records
 */
export type YouTubeChannelUpdate = YouTubeDatabase['public']['Tables']['youtube_channels']['Update'];
export type YouTubeVideoUpdate = YouTubeDatabase['public']['Tables']['youtube_videos']['Update'];
export type YouTubeTranscriptUpdate = YouTubeDatabase['public']['Tables']['youtube_transcripts']['Update'];

/**
 * Search result types
 */
export interface YouTubeSearchResult {
  id: string;
  type: 'video' | 'transcript' | 'channel';
  title: string;
  content: string;
  relevanceScore: number;
  source: 'fts' | 'vector' | 'hybrid' | 'web' | 'metadata';
  metadata: {
    videoId?: string;
    channelId?: string;
    timestamp?: number;
    duration?: number;
    url?: string;
  };
}

/**
 * Multi-modal search configuration
 */
export interface YouTubeSearchConfig {
  includeFTS: boolean;
  includeVector: boolean;
  includeWeb: boolean;
  includeMetadata: boolean;
  ftsWeight: number;
  vectorWeight: number;
  webWeight: number;
  metadataWeight: number;
  maxResults: number;
  cacheResults: boolean;
}

/**
 * Default search configuration
 */
export const DEFAULT_YOUTUBE_SEARCH_CONFIG: YouTubeSearchConfig = {
  includeFTS: true,
  includeVector: true,
  includeWeb: true,
  includeMetadata: true,
  ftsWeight: 0.3,
  vectorWeight: 0.4,
  webWeight: 0.2,
  metadataWeight: 0.1,
  maxResults: 20,
  cacheResults: true,
}; 