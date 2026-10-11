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

export interface ProviderModelCatalogMeta {
  availableIds?: string[];
  availabilityKnown?: boolean;
  listedCount?: number;
  discoveredAt?: string;
}

export interface ProviderMetadata {
  organizationId?: string;
  apiVersion?: string;
  customHeaders?: Record<string, string>;
  requestTimeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  streamingEnabled?: boolean;
  modelCatalog?: ProviderModelCatalogMeta;
  health?: import('./health').ProviderHealthSnapshot;
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
  availableModels?: string[];
  catalogAvailabilityKnown?: boolean;
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

export interface NormalizedContentPart {
  type: 'text' | 'image';
  text?: string;
  mimeType?: string;
  data?: string;
}

export interface NormalizedMessage {
  role: 'user' | 'model' | 'system' | 'tool';
  content: string;
  parts?: NormalizedContentPart[];
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
  requestedProviderId?: string;
  requestedModel?: string;
  selectedProviderId?: string;
  selectedModel?: string;
  fallbackAttempts?: number;
  routingReason?: string;
}

export interface GenerateRouteOptions {
  fallbackProviderId?: string;
  fallbackModel?: string;
  auto?: boolean;
  requirements?: RouteRequirementsLike;
}

export interface RouteRequirementsLike {
  capabilities?: ProviderCapability[];
  stream?: boolean;
  tools?: boolean;
  vision?: boolean;
  files?: boolean;
}

export interface RouteSummary {
  providerId: string;
  providerName: string;
  model: string;
  reason: string;
  requestedProviderId?: string | null;
  requestedModel?: string | null;
  fallbackAttempts: number;
  attempts?: Array<{ providerId: string; model: string; reason: string; category?: string }>;
}

export type ReadinessCheckId =
  | 'endpoint'
  | 'models'
  | 'chat'
  | 'stream';

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  passed: boolean;
  skipped?: boolean;
  detail?: string;
  kind?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  status: ConnectionStatus;
  error?: string;
  reachable?: boolean;
  authenticated?: boolean;
  modelAvailable?: boolean;
  models?: string[];
  availableModels?: string[];
  availabilityKnown?: boolean;
  latencyMs?: number;
  kind?: string;
  streamingVerified?: boolean;
  chatVerified?: boolean;
  checks?: ReadinessCheck[];
}
