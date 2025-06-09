export interface Message {
  id: string;
  type: 'user' | 'ai' | 'system' | 'transcription';
  content: string;
  timestamp: number;
  episodeId: string;
  audioTimestamp?: number; // When in the episode this was said/asked
  hostId?: string;
  metadata?: {
    confidence?: number; // For transcription accuracy
    responseTime?: number; // AI response time in ms
    contextUsed?: string[]; // What context was used for this response
    personality?: string; // Which host personality was used
  };
}

export interface ConversationContext {
  episodeId: string;
  hostId: string;
  currentTimestamp: number;
  recentTranscription: TranscriptionSegment[];
  conversationHistory: Message[];
  episodeMetadata: {
    title: string;
    description: string;
    duration: number;
    publishDate: string;
  };
  hostPersonality?: HostPersonality;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string;
  episodeId: string;
}

export interface HostPersonality {
  id: string;
  name: string;
  description: string;
  conversationStyle: {
    tone: 'casual' | 'formal' | 'technical' | 'humorous';
    verbosity: 'concise' | 'detailed' | 'verbose';
    expertise: string[];
    commonPhrases: string[];
    personality_traits: string[];
  };
  knowledge: {
    topics: string[];
    recurring_themes: string[];
    opinions: Record<string, string>;
    past_statements: HostStatement[];
  };
  embedding?: number[]; // Vector embedding for similarity search
  createdAt: string;
  updatedAt: string;
}

export interface HostStatement {
  episodeId: string;
  timestamp: number;
  context: string;
  statement: string;
  topic: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface ChatSession {
  id: string;
  userId?: string;
  episodeId: string;
  hostId: string;
  startTime: number;
  endTime?: number;
  messages: Message[];
  context: ConversationContext;
  isActive: boolean;
}

export interface AIResponse {
  message: string;
  confidence: number;
  responseTime: number;
  contextUsed: string[];
  personality: string;
  suggestions?: string[]; // Follow-up question suggestions
}

export interface ConversationState {
  isListening: boolean;
  isTranscribing: boolean;
  isProcessing: boolean;
  currentSession?: ChatSession;
  error?: string;
} 