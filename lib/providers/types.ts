export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini' | 'custom';

export type ProviderCapability =
  | 'TEXT'
  | 'VISION'
  | 'AUDIO_INPUT'
  | 'AUDIO_OUTPUT'
  | 'IMAGE_GENERATION'
  | 'VIDEO_GENERATION'
  | 'MUSIC_GENERATION'
  | 'TRANSCRIPTION'
  | 'TOOL_CALLING'
  | 'FUNCTION_CALLING'
  | 'STRUCTURED_OUTPUT'
  | 'STREAMING';

export type ConnectionStatus =
  | 'Connected'
  | 'Authentication Failed'
  | 'Invalid Base URL'
  | 'Provider Unavailable'
  | 'Model Unavailable'
  | 'Rate Limited'
  | 'Configuration Error'
  | 'Untested';

export interface AIProvider {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey?: string; // Stored server-side, never returned in full to client
  hasApiKey?: boolean; // Flag to tell client if key is configured without exposing it
  enabled: boolean;
  defaultModel: string;
  models: string[];
  capabilities: ProviderCapability[];
  lastTested?: string | null;
  connectionStatus: ConnectionStatus;
  latencyMs?: number | null;
  usageCount?: number;
  errorRate?: number;
  created_at?: string;
  updated_at?: string;
}

export interface NormalizedMessage {
  role: 'user' | 'model' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    name: string;
    response: Record<string, unknown>;
  }>;
}

export interface GenerateParams {
  model: string;
  messages: NormalizedMessage[];
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stream?: boolean;
  tools?: any[];
  responseFormat?: 'text' | 'json';
}

export interface NormalizedResponse {
  provider: string;
  model: string;
  text: string;
  usage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  requestId: string;
  latency: number;
  metadata?: Record<string, any>;
}
