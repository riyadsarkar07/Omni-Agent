/**
 * Universal AI Agent Platform - TypeScript / JavaScript Client SDK
 * Production-ready SDK for integrating custom Gemini-powered AI Agents
 * into any backend, service, or serverless environment.
 */

export interface UniversalAgentConfig {
  baseURL: string;
  apiKey: string;
  defaultAgentId?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ChatOptions {
  message: string;
  agentId?: string;
  conversationId?: string;
  overrideModel?: 'gemini-3.8-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite' | 'gemini-flash-latest';
  thinkingLevel?: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF';
  timeoutMs?: number;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  model: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  usage: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
}

export interface StreamChunk {
  type: 'start' | 'chunk' | 'done' | 'error';
  text?: string;
  conversationId?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  error?: string;
}

export class UniversalAgentError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = 'UniversalAgentError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class UniversalAgent {
  private baseURL: string;
  private apiKey: string;
  private defaultAgentId?: string;
  private timeoutMs: number;
  private customHeaders: Record<string, string>;

  constructor(config: UniversalAgentConfig) {
    if (!config.apiKey) {
      throw new UniversalAgentError('UniversalAgent initialization failed: "apiKey" is required.');
    }
    // Normalize baseURL: strip trailing slashes
    this.baseURL = (config.baseURL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.defaultAgentId = config.defaultAgentId;
    this.timeoutMs = config.timeoutMs || 45000;
    this.customHeaders = config.headers || {};
  }

  /**
   * Send a message to the AI Agent and receive a structured JSON response.
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const url = `${this.baseURL}/chat`;
    const agentId = options.agentId || this.defaultAgentId;
    const timeout = options.timeoutMs || this.timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...this.customHeaders,
        },
        body: JSON.stringify({
          message: options.message,
          agentId,
          conversationId: options.conversationId,
          overrideModel: options.overrideModel,
          thinkingLevel: options.thinkingLevel,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errData: any;
        try {
          errData = await response.json();
        } catch {
          errData = { error: response.statusText };
        }
        throw new UniversalAgentError(
          errData.message || errData.error || `HTTP ${response.status} chat request failed`,
          response.status,
          errData
        );
      }

      return (await response.json()) as ChatResponse;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as Error).name === 'AbortError') {
        throw new UniversalAgentError(`Request timed out after ${timeout}ms`, 408);
      }
      if (err instanceof UniversalAgentError) throw err;
      throw new UniversalAgentError((err as Error).message || 'Network request failed');
    }
  }

  /**
   * Stream the AI response in real-time using an AsyncGenerator.
   */
  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const url = `${this.baseURL}/chat/stream`;
    const agentId = options.agentId || this.defaultAgentId;
    const timeout = options.timeoutMs || this.timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...this.customHeaders,
      },
      body: JSON.stringify({
        message: options.message,
        agentId,
        conversationId: options.conversationId,
        overrideModel: options.overrideModel,
        thinkingLevel: options.thinkingLevel,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok || !response.body) {
      let errData: any;
      try {
        errData = await response.json();
      } catch {
        errData = { error: response.statusText };
      }
      throw new UniversalAgentError(
        errData.message || errData.error || `Stream failed with status ${response.status}`,
        response.status,
        errData
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr) as StreamChunk;
                yield parsed;
              } catch {
                // Ignore malformed SSE chunk
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Retrieve list of accessible agents
   */
  async listAgents(): Promise<Array<{ id: string; name: string; model: string; description: string }>> {
    const res = await fetch(`${this.baseURL}/agents`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...this.customHeaders,
      },
    });
    if (!res.ok) throw new UniversalAgentError('Failed to list agents', res.status);
    const data = await res.json();
    return data.agents;
  }

  /**
   * Check platform health
   */
  async health(): Promise<{ status: string; version: string; uptime: number }> {
    const res = await fetch(`${this.baseURL}/health`);
    if (!res.ok) throw new UniversalAgentError('Health check failed', res.status);
    return res.json();
  }
}
