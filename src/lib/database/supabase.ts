import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Lazy initialization functions to prevent build-time environment variable issues
function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  return url;
}

function getSupabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
  return key;
}

function getSupabaseServiceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  return key;
}

// Cached client instances
let _supabase: ReturnType<typeof createClient<Database>> | null = null;
let _supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null;

// Client for browser/client-side operations
export const supabase = (() => {
  if (!_supabase) {
    _supabase = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return _supabase;
});

// Admin client for server-side operations with elevated permissions
export const supabaseAdmin = (() => {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient<Database>(getSupabaseUrl(), getSupabaseServiceKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabaseAdmin;
});

// Database table names for AI features
export const TABLES = {
  // Existing tables from main app
  PODCASTS: 'podcasts',
  EPISODES: 'episodes',
  
  // New AI conversational tables
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  TRANSCRIPTIONS: 'transcriptions',
  HOST_PERSONALITIES: 'host_personalities',
  HOST_STATEMENTS: 'host_statements',
  AUDIO_SESSIONS: 'audio_sessions',
  EMBEDDINGS: 'embeddings',
} as const;

// Helper functions for common database operations
export const dbHelpers = {
  // Get podcast data
  async getPodcast(podcastId: string) {
    const { data, error } = await supabase()
      .from(TABLES.PODCASTS)
      .select('*')
      .eq('id', podcastId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get episode data
  async getEpisode(episodeId: string) {
    const { data, error } = await supabase()
      .from(TABLES.EPISODES)
      .select('*')
      .eq('id', episodeId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get host personality
  async getHostPersonality(hostId: string) {
    const { data, error } = await supabase()
      .from(TABLES.HOST_PERSONALITIES)
      .select('*')
      .eq('id', hostId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Save conversation
  async saveConversation(conversation: any) {
    const { data, error } = await supabase()
      .from(TABLES.CONVERSATIONS)
      .insert(conversation)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Save message
  async saveMessage(message: any) {
    const { data, error } = await supabase()
      .from(TABLES.MESSAGES)
      .insert(message)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Save transcription
  async saveTranscription(transcription: any) {
    const { data, error } = await supabase()
      .from(TABLES.TRANSCRIPTIONS)
      .insert(transcription)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Search transcriptions by text
  async searchTranscriptions(query: string, episodeId?: string) {
    let queryBuilder = supabase()
      .from(TABLES.TRANSCRIPTIONS)
      .select('*')
      .textSearch('text', query);
    
    if (episodeId) {
      queryBuilder = queryBuilder.eq('episode_id', episodeId);
    }
    
    const { data, error } = await queryBuilder.order('start_time', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  // Get recent conversation history
  async getConversationHistory(episodeId: string, limit = 10) {
    const { data, error } = await supabase()
      .from(TABLES.MESSAGES)
      .select('*')
      .eq('episode_id', episodeId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data?.reverse() || [];
  },

  // Get host statements for personality
  async getHostStatements(hostId: string, topic?: string) {
    let queryBuilder = supabase()
      .from(TABLES.HOST_STATEMENTS)
      .select('*')
      .eq('host_id', hostId);
    
    if (topic) {
      queryBuilder = queryBuilder.eq('topic', topic);
    }
    
    const { data, error } = await queryBuilder.order('timestamp', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },
};

export default supabase; 