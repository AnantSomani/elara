// Database types for Supabase (extends existing podcast schema)
export interface Database {
  public: {
    Tables: {
      // Existing tables from main app
      podcasts: {
        Row: {
          id: string;
          listen_notes_id: string;
          title: string;
          author: string;
          image: string;
          description: string;
          website: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listen_notes_id: string;
          title: string;
          author: string;
          image: string;
          description: string;
          website: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listen_notes_id?: string;
          title?: string;
          author?: string;
          image?: string;
          description?: string;
          website?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      episodes: {
        Row: {
          id: string;
          podcast_id: string;
          listen_notes_id: string;
          title: string;
          description: string;
          audio_url: string;
          duration: number;
          pub_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          podcast_id: string;
          listen_notes_id: string;
          title: string;
          description: string;
          audio_url: string;
          duration: number;
          pub_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          podcast_id?: string;
          listen_notes_id?: string;
          title?: string;
          description?: string;
          audio_url?: string;
          duration?: number;
          pub_date?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      // New AI conversational tables
      conversations: {
        Row: {
          id: string;
          episode_id: string;
          host_id: string;
          user_id?: string;
          start_time: number;
          end_time?: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          host_id: string;
          user_id?: string;
          start_time: number;
          end_time?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          host_id?: string;
          user_id?: string;
          start_time?: number;
          end_time?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          episode_id: string;
          type: 'user' | 'ai' | 'system' | 'transcription';
          content: string;
          timestamp: number;
          audio_timestamp?: number;
          host_id?: string;
          metadata?: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          episode_id: string;
          type: 'user' | 'ai' | 'system' | 'transcription';
          content: string;
          timestamp: number;
          audio_timestamp?: number;
          host_id?: string;
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          episode_id?: string;
          type?: 'user' | 'ai' | 'system' | 'transcription';
          content?: string;
          timestamp?: number;
          audio_timestamp?: number;
          host_id?: string;
          metadata?: Record<string, any>;
          created_at?: string;
        };
      };
      transcriptions: {
        Row: {
          id: string;
          episode_id: string;
          text: string;
          start_time: number;
          end_time: number;
          confidence: number;
          speaker?: string;
          is_partial: boolean;
          words?: Record<string, any>[];
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          text: string;
          start_time: number;
          end_time: number;
          confidence: number;
          speaker?: string;
          is_partial?: boolean;
          words?: Record<string, any>[];
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          text?: string;
          start_time?: number;
          end_time?: number;
          confidence?: number;
          speaker?: string;
          is_partial?: boolean;
          words?: Record<string, any>[];
          created_at?: string;
        };
      };
      host_personalities: {
        Row: {
          id: string;
          name: string;
          description: string;
          conversation_style: Record<string, any>;
          knowledge: Record<string, any>;
          embedding?: number[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          conversation_style: Record<string, any>;
          knowledge: Record<string, any>;
          embedding?: number[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          conversation_style?: Record<string, any>;
          knowledge?: Record<string, any>;
          embedding?: number[];
          created_at?: string;
          updated_at?: string;
        };
      };
      host_statements: {
        Row: {
          id: string;
          host_id: string;
          episode_id: string;
          timestamp: number;
          context: string;
          statement: string;
          topic: string;
          sentiment: 'positive' | 'negative' | 'neutral';
          created_at: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          episode_id: string;
          timestamp: number;
          context: string;
          statement: string;
          topic: string;
          sentiment: 'positive' | 'negative' | 'neutral';
          created_at?: string;
        };
        Update: {
          id?: string;
          host_id?: string;
          episode_id?: string;
          timestamp?: number;
          context?: string;
          statement?: string;
          topic?: string;
          sentiment?: 'positive' | 'negative' | 'neutral';
          created_at?: string;
        };
      };
      audio_sessions: {
        Row: {
          id: string;
          episode_id: string;
          start_time: number;
          end_time?: number;
          config: Record<string, any>;
          transcription_config: Record<string, any>;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          start_time: number;
          end_time?: number;
          config: Record<string, any>;
          transcription_config: Record<string, any>;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          start_time?: number;
          end_time?: number;
          config?: Record<string, any>;
          transcription_config?: Record<string, any>;
          is_active?: boolean;
          created_at?: string;
        };
      };
      embeddings: {
        Row: {
          id: string;
          content_type: 'episode' | 'transcript' | 'personality';
          content_id: string;
          embedding: number[];
          metadata?: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_type: 'episode' | 'transcript' | 'personality';
          content_id: string;
          embedding: number[];
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_type?: 'episode' | 'transcript' | 'personality';
          content_id?: string;
          embedding?: number[];
          metadata?: Record<string, any>;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
} 