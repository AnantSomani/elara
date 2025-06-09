export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  chunkSize: number; // Size of audio chunks for processing
  bufferSize: number;
}

export interface AudioChunk {
  id: string;
  data: ArrayBuffer;
  timestamp: number;
  duration: number;
  sampleRate: number;
  episodeId: string;
  sequenceNumber: number;
}

export interface TranscriptionConfig {
  language: string;
  model: 'base' | 'enhanced' | 'premium';
  realTime: boolean;
  enableSpeakerDetection: boolean;
  enablePunctuation: boolean;
  enableTimestamps: boolean;
  confidenceThreshold: number;
}

export interface TranscriptionResult {
  id: string;
  text: string;
  confidence: number;
  startTime: number;
  endTime: number;
  words: WordResult[];
  speaker?: string;
  episodeId: string;
  isPartial: boolean; // Whether this is a partial or final result
}

export interface WordResult {
  text: string;
  confidence: number;
  startTime: number;
  endTime: number;
}

export interface AudioProcessorState {
  isActive: boolean;
  isRecording: boolean;
  currentChunk?: AudioChunk;
  processingQueue: AudioChunk[];
  transcriptionResults: TranscriptionResult[];
  error?: string;
}

export interface AudioVisualizationData {
  frequencies: number[];
  waveform: number[];
  volume: number;
  timestamp: number;
}

export interface SpeakerDetectionResult {
  speakerId: string;
  confidence: number;
  startTime: number;
  endTime: number;
  isHost: boolean;
  name?: string;
}

export interface AudioSession {
  id: string;
  episodeId: string;
  startTime: number;
  endTime?: number;
  config: AudioConfig;
  transcriptionConfig: TranscriptionConfig;
  chunks: AudioChunk[];
  transcriptionResults: TranscriptionResult[];
  speakers: SpeakerDetectionResult[];
  isActive: boolean;
}

export interface AudioProcessor {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  processChunk: (chunk: AudioChunk) => Promise<TranscriptionResult>;
  getVisualizationData: () => AudioVisualizationData;
  getCurrentState: () => AudioProcessorState;
} 