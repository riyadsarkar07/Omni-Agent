export interface PlaygroundMessage {
  id: string;
  role: 'user' | 'model' | 'tool';
  text: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
  latencyMs?: number;
  tokens?: number;
  model?: string;
  provider?: string;
  isStreaming?: boolean;
  stopped?: boolean;
}

export type PlaygroundTab = 'chatbot' | 'music' | 'video' | 'transcribe';

export type ChatErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'api';

export interface ClassifiedChatError {
  kind: ChatErrorKind;
  title: string;
  description: string;
}
