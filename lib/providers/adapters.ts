import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  GenerateParams,
  NormalizedResponse,
  ConnectionTestResult,
} from './types';
import { joinProviderUrl, defaultOfficialBaseUrl } from './catalog';
import { buildProviderHeaders, fetchWithTimeout, readSafeError, sleep } from './http';
import { sanitizeProviderError } from './secrets';

// Standard helper to parse SSE lines
export async function* parseSSE(response: Response): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        yield cleaned;
      }
    }
    if (buffer) {
      const cleaned = buffer.trim();
      if (cleaned) yield cleaned;
    }
  } finally {
    reader.releaseLock();
  }
}

export class GeminiAdapter {
  private static getClient(apiKey?: string): GoogleGenAI {
    const key = (apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      throw new Error('GEMINI_API_KEY is not configured. Use a saved OpenAI-compatible provider instead.');
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-multi-provider',
        },
      },
    });
  }

  static async testConnection(provider: AIProvider): Promise<ConnectionTestResult> {
    try {
      const ai = this.getClient(provider.apiKey);
      const model = provider.defaultModel || provider.models[0] || 'gemini-3.8-flash';
      const response = await ai.models.generateContent({
        model,
        contents: 'ping',
        config: {
          maxOutputTokens: 5,
        },
      });

      if (response && response.text) {
        return {
          success: true,
          status: 'Connected',
          reachable: true,
          authenticated: true,
          modelAvailable: true,
        };
      }
      return {
        success: false,
        status: 'Model Unavailable',
        error: 'Empty response text',
        reachable: true,
        authenticated: true,
        modelAvailable: false,
      };
    } catch (err: unknown) {
      const msg = sanitizeProviderError((err as Error).message || '');
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('key is invalid')) {
        return {
          success: false,
          status: 'Authentication Failed',
          error: 'Invalid Google Gemini API Key',
          reachable: true,
          authenticated: false,
        };
      }
      return { success: false, status: 'Provider Unavailable', error: msg, reachable: false };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    try {
      const ai = this.getClient(provider.apiKey);
      const list = await ai.models.list();
      const items = Array.isArray(list) ? list : (list as { page?: unknown[] })?.page;
      if (items && Array.isArray(items) && items.length > 0) {
        return items
          .map((m) => {
            const row = m as { name?: string; id?: string };
            return row.name || row.id || '';
          })
          .filter((name: string) => name && !name.startsWith('models/preview'))
          .map((name: string) => name.replace('models/', ''));
      }
      return provider.models || [];
    } catch {
      return provider.models || [];
    }
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const ai = this.getClient(provider.apiKey);
    const model = params.model || provider.defaultModel || 'gemini-3.8-flash';

    // Map NormalizedMessages to Gemini contents
    const contents = params.messages.map((m) => {
      const mappedRole = m.role === 'model' ? 'model' : 'user';
      return {
        role: mappedRole as 'user' | 'model',
        parts: [{ text: m.content }],
      };
    });

    const config: any = {
      temperature: params.temperature ?? 0.7,
      topP: params.topP,
      topK: params.topK,
    };

    if (params.systemInstruction) {
      config.systemInstruction = params.systemInstruction;
    }
    if (params.maxOutputTokens && params.maxOutputTokens > 0) {
      config.maxOutputTokens = params.maxOutputTokens;
    }

    // Support tool declarations if provided
    if (params.tools && params.tools.length > 0) {
      config.tools = [{ functionDeclarations: params.tools }];
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    const latency = Date.now() - startTime;
    return {
      provider: provider.id,
      model,
      text: response.text || '',
      requestId: `gemini_${Math.random().toString(36).substring(7)}`,
      latency,
      usage: {
        promptTokens: Math.ceil((params.messages.reduce((a, b) => a + b.content.length, 0) || 0) / 4) + 60,
        candidateTokens: Math.ceil((response.text?.length || 0) / 4),
        totalTokens:
          Math.ceil((params.messages.reduce((a, b) => a + b.content.length, 0) || 0) / 4) +
          60 +
          Math.ceil((response.text?.length || 0) / 4),
      },
    };
  }

  static async generateStream(provider: AIProvider, params: GenerateParams): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    const ai = this.getClient(provider.apiKey);
    const model = params.model || provider.defaultModel || 'gemini-3.8-flash';

    const contents = params.messages.map((m) => {
      const mappedRole = m.role === 'model' ? 'model' : 'user';
      return {
        role: mappedRole as 'user' | 'model',
        parts: [{ text: m.content }],
      };
    });

    const config: any = {
      temperature: params.temperature ?? 0.7,
      topP: params.topP,
      topK: params.topK,
    };

    if (params.systemInstruction) {
      config.systemInstruction = params.systemInstruction;
    }
    if (params.maxOutputTokens && params.maxOutputTokens > 0) {
      config.maxOutputTokens = params.maxOutputTokens;
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const responseStream = await ai.models.generateContentStream({
            model,
            contents,
            config,
          });

          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'chunk',
                    text,
                  })}\n\n`
                )
              );
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
              })}\n\n`
            )
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: err.message || 'Stream processing failed',
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });
  }
}

export class OpenAIAdapter {
  static resolveBaseUrl(provider: AIProvider): string {
    const configured = (provider.baseUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    if (provider.type === 'openai') return defaultOfficialBaseUrl('openai');
    return '';
  }

  static getHeaders(provider: AIProvider) {
    return buildProviderHeaders(provider);
  }

  static timeoutMs(provider: AIProvider): number {
    return provider.metadata?.requestTimeoutMs || 20000;
  }

  static maxRetries(provider: AIProvider): number {
    return Math.min(4, Math.max(0, provider.metadata?.maxRetries ?? 1));
  }

  static async request(
    provider: AIProvider,
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const retries = this.maxRetries(provider);
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchWithTimeout(url, init, this.timeoutMs(provider));
        if (res.status >= 500 && attempt < retries) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        return res;
      } catch (err: unknown) {
        lastError = err as Error;
        if (attempt < retries) {
          await sleep(300 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastError || new Error('Provider request failed');
  }

  static async testConnection(provider: AIProvider): Promise<ConnectionTestResult> {
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) {
      return { success: false, status: 'Invalid Base URL', error: 'Base URL is required for OpenAI-compatible providers' };
    }

    const headers = this.getHeaders(provider);
    let reachable = false;
    let authenticated = false;
    let discovered: string[] = [];

    try {
      const modelsRes = await this.request(provider, joinProviderUrl(baseUrl, '/models'), {
        method: 'GET',
        headers,
      });
      reachable = true;
      if (modelsRes.ok) {
        authenticated = true;
        const data = await modelsRes.json();
        if (data && Array.isArray(data.data)) {
          discovered = data.data.map((m: { id?: string }) => m.id).filter(Boolean) as string[];
        }
      }
    } catch {
      // Some OpenAI-compatible gateways do not expose GET /models. Fall through to chat.
    }

    const model = provider.defaultModel || discovered[0] || provider.models[0];
    if (!model) {
      if (authenticated) {
        return {
          success: true,
          status: 'Connected',
          reachable: true,
          authenticated: true,
          modelAvailable: false,
          models: discovered,
          error: 'Provider reachable. Enter a Model ID to verify a specific model.',
        };
      }
      return {
        success: false,
        status: 'Configuration Error',
        error: 'A Model ID is required to test this provider',
        reachable,
        authenticated,
        models: discovered,
      };
    }

    try {
      const res = await this.request(provider, joinProviderUrl(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });

      if (res.status === 200) {
        return {
          success: true,
          status: 'Connected',
          reachable: true,
          authenticated: true,
          modelAvailable: true,
          models: discovered,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'Authentication Failed',
          error: 'Invalid API key provided',
          reachable: true,
          authenticated: false,
          models: discovered,
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          status: 'Model Unavailable',
          error: `Model '${model}' was not found on this provider`,
          reachable: true,
          authenticated: true,
          modelAvailable: false,
          models: discovered,
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          status: 'Rate Limited',
          error: 'Provider rate limit reached. Try again later.',
          reachable: true,
          authenticated: true,
          models: discovered,
        };
      }

      return {
        success: false,
        status: 'Provider Unavailable',
        error: await readSafeError(res),
        reachable: true,
        authenticated,
        models: discovered,
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'Invalid Base URL',
        error: sanitizeProviderError((err as Error).message || 'Connection failed'),
        reachable,
        authenticated,
        models: discovered,
      };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) return provider.models || [];
    try {
      const res = await this.request(provider, joinProviderUrl(baseUrl, '/models'), {
        method: 'GET',
        headers: this.getHeaders(provider),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.data)) {
          const ids = data.data
            .map((m: { id?: string }) => m.id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
          if (ids.length > 0) return ids;
        }
      }
      return provider.models || [];
    } catch {
      return provider.models || [];
    }
  }

  static buildMessages(params: GenerateParams) {
    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemInstruction) {
      messages.push({ role: 'system', content: params.systemInstruction });
    }
    params.messages.forEach((m) => {
      messages.push({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      });
    });
    return messages;
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) throw new Error('Base URL is required for OpenAI-compatible providers');
    const url = joinProviderUrl(baseUrl, '/chat/completions');
    const model = params.model || provider.defaultModel;
    if (!model) throw new Error('A Model ID is required');

    const body: Record<string, unknown> = {
      model,
      messages: this.buildMessages(params),
      temperature: params.temperature ?? provider.metadata?.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxOutputTokens ?? provider.metadata?.maxTokens,
    };

    const res = await this.request(provider, url, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(await readSafeError(res));
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const latency = Date.now() - startTime;

    return {
      provider: provider.id,
      model,
      text,
      requestId: data.id || `openai_${Math.random().toString(36).substring(7)}`,
      latency,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        candidateTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  static async generateStream(provider: AIProvider, params: GenerateParams): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) throw new Error('Base URL is required for OpenAI-compatible providers');
    const url = joinProviderUrl(baseUrl, '/chat/completions');
    const model = params.model || provider.defaultModel;
    if (!model) throw new Error('A Model ID is required');

    const body: Record<string, unknown> = {
      model,
      messages: this.buildMessages(params),
      temperature: params.temperature ?? provider.metadata?.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxOutputTokens ?? provider.metadata?.maxTokens,
      stream: true,
    };

    const res = await this.request(provider, url, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(await readSafeError(res));
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const sseLine of parseSSE(res)) {
            if (sseLine === 'data: [DONE]') {
              continue;
            }
            if (sseLine.startsWith('data: ')) {
              const dataStr = sseLine.slice(6);
              try {
                const chunkObj = JSON.parse(dataStr);
                const text = chunkObj.choices?.[0]?.delta?.content;
                if (text) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'chunk',
                        text,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Ignore parsing errors for custom comments
              }
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
              })}\n\n`
            )
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: err.message || 'Stream processing failed',
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });
  }
}

export class AnthropicAdapter {
  static resolveBaseUrl(provider: AIProvider): string {
    const configured = (provider.baseUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    if (provider.type === 'anthropic') return defaultOfficialBaseUrl('anthropic');
    return '';
  }

  static getHeaders(provider: AIProvider) {
    return buildProviderHeaders(provider);
  }

  static timeoutMs(provider: AIProvider): number {
    return provider.metadata?.requestTimeoutMs || 20000;
  }

  static async testConnection(provider: AIProvider): Promise<ConnectionTestResult> {
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) {
      return { success: false, status: 'Invalid Base URL', error: 'Base URL is required for Anthropic-compatible providers' };
    }
    const model = provider.defaultModel || provider.models[0];
    if (!model) {
      return { success: false, status: 'Configuration Error', error: 'A Model ID is required to test this provider' };
    }

    try {
      const url = joinProviderUrl(baseUrl, '/messages');
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: this.getHeaders(provider),
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5,
          }),
        },
        this.timeoutMs(provider)
      );

      if (res.status === 200) {
        return {
          success: true,
          status: 'Connected',
          reachable: true,
          authenticated: true,
          modelAvailable: true,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'Authentication Failed',
          error: 'Invalid Anthropic API key',
          reachable: true,
          authenticated: false,
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          status: 'Model Unavailable',
          error: `Model '${model}' was not found`,
          reachable: true,
          authenticated: true,
          modelAvailable: false,
        };
      }

      if (res.status === 429) {
        return { success: false, status: 'Rate Limited', error: 'Provider rate limit reached', reachable: true, authenticated: true };
      }

      return {
        success: false,
        status: 'Provider Unavailable',
        error: await readSafeError(res),
        reachable: true,
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'Invalid Base URL',
        error: sanitizeProviderError((err as Error).message || 'Connection failed'),
      };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) return provider.models || [];
    try {
      const res = await fetchWithTimeout(
        joinProviderUrl(baseUrl, '/models'),
        { method: 'GET', headers: this.getHeaders(provider) },
        this.timeoutMs(provider)
      );
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const ids = rows
          .map((m: { id?: string; name?: string }) => m.id || m.name)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        if (ids.length > 0) return ids;
      }
    } catch {
      // Discovery is optional
    }
    return provider.models || [];
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) throw new Error('Base URL is required for Anthropic-compatible providers');
    const url = joinProviderUrl(baseUrl, '/messages');
    const model = params.model || provider.defaultModel;
    if (!model) throw new Error('A Model ID is required');

    // Anthropic messages cannot contain 'system' role, it must be root-level parameter
    const messages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxOutputTokens || provider.metadata?.maxTokens || 1024,
      temperature: params.temperature ?? provider.metadata?.temperature ?? 0.7,
    };

    if (params.systemInstruction) {
      body.system = params.systemInstruction;
    }

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: this.getHeaders(provider),
        body: JSON.stringify(body),
      },
      this.timeoutMs(provider)
    );

    if (!res.ok) {
      throw new Error(await readSafeError(res));
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const latency = Date.now() - startTime;

    return {
      provider: provider.id,
      model,
      text,
      requestId: data.id || `anthropic_${Math.random().toString(36).substring(7)}`,
      latency,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        candidateTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  static async generateStream(provider: AIProvider, params: GenerateParams): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    const baseUrl = this.resolveBaseUrl(provider);
    if (!baseUrl) throw new Error('Base URL is required for Anthropic-compatible providers');
    const url = joinProviderUrl(baseUrl, '/messages');
    const model = params.model || provider.defaultModel;
    if (!model) throw new Error('A Model ID is required');

    const messages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxOutputTokens || provider.metadata?.maxTokens || 1024,
      temperature: params.temperature ?? provider.metadata?.temperature ?? 0.7,
      stream: true,
    };

    if (params.systemInstruction) {
      body.system = params.systemInstruction;
    }

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: this.getHeaders(provider),
        body: JSON.stringify(body),
      },
      this.timeoutMs(provider)
    );

    if (!res.ok) {
      throw new Error(await readSafeError(res));
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const sseLine of parseSSE(res)) {
            if (sseLine.startsWith('data: ')) {
              const dataStr = sseLine.slice(6);
              try {
                const chunkObj = JSON.parse(dataStr);
                if (chunkObj.type === 'content_block_delta' && chunkObj.delta?.text) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'chunk',
                        text: chunkObj.delta.text,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Ignore parsing errors for comments or incomplete chunks
              }
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
              })}\n\n`
            )
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: err.message || 'Stream processing failed',
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });
  }
}

export class CustomHTTPAdapter {
  static timeoutMs(provider: AIProvider): number {
    return provider.metadata?.requestTimeoutMs || 20000;
  }

  static async testConnection(provider: AIProvider): Promise<ConnectionTestResult> {
    if (!provider.baseUrl) {
      return { success: false, status: 'Invalid Base URL', error: 'Base URL is required' };
    }
    try {
      const url = provider.baseUrl;
      const res = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: buildProviderHeaders(provider),
        },
        this.timeoutMs(provider)
      );

      if (res.status >= 200 && res.status < 400) {
        return { success: true, status: 'Connected', reachable: true, authenticated: true };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'Authentication Failed',
          error: `Authentication failed (${res.status})`,
          reachable: true,
          authenticated: false,
        };
      }

      return {
        success: false,
        status: 'Provider Unavailable',
        error: await readSafeError(res),
        reachable: true,
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'Invalid Base URL',
        error: sanitizeProviderError((err as Error).message || 'Connection failed'),
      };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    if (!provider.baseUrl) return provider.models || [];
    try {
      const modelsUrl = joinProviderUrl(provider.baseUrl.replace(/\/+$/, ''), '/models');
      const res = await fetchWithTimeout(
        modelsUrl,
        { method: 'GET', headers: buildProviderHeaders(provider) },
        this.timeoutMs(provider)
      );
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const ids = rows
          .map((m: { id?: string; name?: string }) => m.id || m.name)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        if (ids.length > 0) return ids;
      }
    } catch {
      // Discovery is optional
    }
    return provider.models || [];
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const url = provider.baseUrl;
    if (!url) throw new Error('Base URL is required for custom HTTP providers');

    const payload = {
      model: params.model,
      prompt: params.messages[params.messages.length - 1]?.content || '',
      messages: params.messages,
      system: params.systemInstruction,
      temperature: params.temperature ?? provider.metadata?.temperature,
    };

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: buildProviderHeaders(provider),
        body: JSON.stringify(payload),
      },
      this.timeoutMs(provider)
    );

    if (!res.ok) {
      throw new Error(await readSafeError(res));
    }

    const data = await res.json();
    const text = data.text || data.response || data.choices?.[0]?.text || data.choices?.[0]?.message?.content || JSON.stringify(data);
    const latency = Date.now() - startTime;

    return {
      provider: provider.id,
      model: params.model,
      text,
      requestId: `custom_${Math.random().toString(36).substring(7)}`,
      latency,
      usage: {
        promptTokens: Math.ceil((params.messages.reduce((a, b) => a + b.content.length, 0) || 0) / 4),
        candidateTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((params.messages.reduce((a, b) => a + b.content.length, 0) || 0) / 4) + Math.ceil(text.length / 4),
      },
    };
  }

  static async generateStream(provider: AIProvider, params: GenerateParams): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    // Default fallback to unary request and yield it in a single chunk
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const result = await CustomHTTPAdapter.generate(provider, params);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'chunk',
                text: result.text,
              })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
              })}\n\n`
            )
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: err.message || 'Stream processing failed',
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });
  }
}
