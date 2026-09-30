export type GeminiModelId =
  | 'gemini-3.8-flash'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite'
  | 'gemini-flash-latest'
  | 'gemini-3.5-flash';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: 'admin' | 'developer' | 'viewer';
  created_at: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  rate_limit_rpm: number;
  is_active: boolean;
  default_provider_id?: string;
  default_model?: string;
  fallback_provider_id?: string;
  fallback_model?: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  project_id: string;
  name: string;
  description: string;
  model: string; // Dynamic model support
  provider_id?: string; // Associated provider ID
  fallback_provider_id?: string;
  fallback_model?: string;
  system_instructions: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_output_tokens?: number;
  thinking_level?: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF';
  memory_enabled: boolean;
  tools_enabled: string[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  environment: 'production' | 'development';
  rate_limit_rpm: number;
  last_used_at: string | null;
  expires_at: string | null;
  status: 'active' | 'revoked';
  created_at: string;
}

export interface Conversation {
  id: string;
  project_id: string;
  agent_id: string;
  title: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'model' | 'system' | 'tool';
  content: string;
  tool_calls?: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  tool_results?: Array<{
    name: string;
    response: Record<string, unknown>;
  }>;
  tokens_used?: number;
  created_at: string;
}

export interface UsageLog {
  id: string;
  project_id: string;
  agent_id: string | null;
  api_key_id: string | null;
  endpoint: string;
  model: string;
  prompt_tokens: number;
  candidate_tokens: number;
  total_tokens: number;
  status_code: number;
  latency_ms: number;
  error_message: string | null;
  ip_address?: string;
  created_at: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  project_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details?: Record<string, unknown>;
  created_at: string;
}
