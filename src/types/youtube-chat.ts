export interface YouTubeTranscript {
  text: string
  start: number
  duration: number
}

export interface YouTubeTranscriptResult {
  videoId: string
  transcript: YouTubeTranscript[]
  isAvailable: boolean
  fetchedAt: number
}

export interface ProcessedVideo {
  videoId: string
  title: string
  channelTitle: string
  duration: string
  transcript: YouTubeTranscript[] | null
  processedContext?: string
  embeddings?: number[][]
  isProcessed: boolean
  processedAt: number
  cost: number
}

export interface YouTubeRAGContext {
  videoId: string
  relevantSections: string[]
  confidence: number
  source: 'transcript' | 'metadata' | 'fallback'
}

export interface CachedVideo {
  videoId: string
  data: ProcessedVideo
  ttl: number
  accessCount: number
  lastAccessed: number
}

export enum ProcessingTier {
  BASIC = 'basic',
  STANDARD = 'standard', 
  PREMIUM = 'premium'
}

export interface ProcessingCost {
  tier: ProcessingTier
  cost: number
  timestamp: number
}

export interface YouTubeChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  videoId?: string
  cost?: number
} 