export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini' | 'custom';

export type ProviderKind =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'custom-http'
  | 'conduit'
  | 'other';

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

export interface ProviderMetadata {
  organizationId?: string;
  apiVersion?: string;
  customHeaders?: Record<string, string>;
  requestTimeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  streamingEnabled?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  model: string;
  capabilities: ProviderCapability[];
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  metadata?: ProviderMetadata;
}

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderKind;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey?: string;
  hasApiKey?: boolean;
  enabled: boolean;
  defaultModel: string;
  models: string[];
  capabilities: ProviderCapability[];
  lastTested?: string | null;
  connectionStatus: ConnectionStatus;
  latencyMs?: number | null;
  usageCount?: number;
  errorRate?: number;
  isDefault?: boolean;
  isSystem?: boolean;
  scope?: 'global' | 'personal';
  ownerId?: string;
  metadata?: ProviderMetadata;
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

export interface ConnectionTestResult {
  success: boolean;
  status: ConnectionStatus;
  error?: string;
  reachable?: boolean;
  authenticated?: boolean;
  modelAvailable?: boolean;
  models?: string[];
  latencyMs?: number;
}
