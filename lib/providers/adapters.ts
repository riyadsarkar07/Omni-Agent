import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  GenerateParams,
  NormalizedResponse,
  ConnectionStatus,
  ProviderCapability,
} from './types';

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
    const key = apiKey || process.env.GEMINI_API_KEY || '';
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-multi-provider',
        },
      },
    });
  }

  static async testConnection(provider: AIProvider): Promise<{ success: boolean; status: ConnectionStatus; error?: string }> {
    try {
      const ai = this.getClient(provider.apiKey);
      const model = provider.defaultModel || 'gemini-3.8-flash';
      const response = await ai.models.generateContent({
        model,
        contents: 'ping',
        config: {
          maxOutputTokens: 5,
        },
      });

      if (response && response.text) {
        return { success: true, status: 'Connected' };
      }
      return { success: false, status: 'Model Unavailable', error: 'Empty response text' };
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('key is invalid')) {
        return { success: false, status: 'Authentication Failed', error: 'Invalid Google Gemini API Key' };
      }
      return { success: false, status: 'Provider Unavailable', error: msg };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    try {
      const ai = this.getClient(provider.apiKey);
      const list = await ai.models.list();
      if (list && Array.isArray(list)) {
        return list
          .map((m: any) => m.name || m.id)
          .filter((name: string) => name && !name.startsWith('models/preview'))
          .map((name: string) => name.replace('models/', ''));
      }
      return provider.models || ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];
    } catch {
      return provider.models || ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];
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
  static getHeaders(provider: AIProvider) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }
    return headers;
  }

  static async testConnection(provider: AIProvider): Promise<{ success: boolean; status: ConnectionStatus; error?: string }> {
    try {
      const url = `${provider.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
      const model = provider.defaultModel || 'gpt-4o-mini';

      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(provider),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });

      if (res.status === 200) {
        return { success: true, status: 'Connected' };
      }

      if (res.status === 401) {
        return { success: false, status: 'Authentication Failed', error: 'Invalid API key provided' };
      }

      if (res.status === 404) {
        return { success: false, status: 'Model Unavailable', error: `Endpoint or Model '${model}' not found` };
      }

      const bodyText = await res.text();
      return { success: false, status: 'Provider Unavailable', error: `HTTP ${res.status}: ${bodyText}` };
    } catch (err: any) {
      return { success: false, status: 'Invalid Base URL', error: err.message || 'Connection failed' };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    try {
      const url = `${provider.baseUrl || 'https://api.openai.com/v1'}/models`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(provider),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.data)) {
          return data.data
            .map((m: any) => m.id)
            .filter((id: string) => id.includes('gpt') || id.includes('claude') || id.includes('llama') || id.includes('gemini') || id.includes('mistral') || id.includes('deepseek'));
        }
      }
      return provider.models || ['gpt-4o', 'gpt-4o-mini', 'o1-mini'];
    } catch {
      return provider.models || ['gpt-4o', 'gpt-4o-mini', 'o1-mini'];
    }
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const url = `${provider.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
    const model = params.model || provider.defaultModel || 'gpt-4o-mini';

    // Map messages to OpenAI format
    const messages = [];
    if (params.systemInstruction) {
      messages.push({ role: 'system', content: params.systemInstruction });
    }
    params.messages.forEach((m) => {
      messages.push({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      });
    });

    const body: any = {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxOutputTokens,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI Error (${res.status}): ${errorText}`);
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
    const url = `${provider.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
    const model = params.model || provider.defaultModel || 'gpt-4o-mini';

    const messages = [];
    if (params.systemInstruction) {
      messages.push({ role: 'system', content: params.systemInstruction });
    }
    params.messages.forEach((m) => {
      messages.push({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      });
    });

    const body: any = {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxOutputTokens,
      stream: true,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI Stream Error (${res.status}): ${errorText}`);
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
  static getHeaders(provider: AIProvider) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (provider.apiKey) {
      headers['x-api-key'] = provider.apiKey;
    }
    return headers;
  }

  static async testConnection(provider: AIProvider): Promise<{ success: boolean; status: ConnectionStatus; error?: string }> {
    try {
      const url = `${provider.baseUrl || 'https://api.anthropic.com/v1'}/messages`;
      const model = provider.defaultModel || 'claude-3-5-haiku-latest';

      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(provider),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });

      if (res.status === 200) {
        return { success: true, status: 'Connected' };
      }

      if (res.status === 401) {
        return { success: false, status: 'Authentication Failed', error: 'Invalid Anthropic API key' };
      }

      if (res.status === 404) {
        return { success: false, status: 'Model Unavailable', error: `Anthropic Model '${model}' not found` };
      }

      const bodyText = await res.text();
      return { success: false, status: 'Provider Unavailable', error: `HTTP ${res.status}: ${bodyText}` };
    } catch (err: any) {
      return { success: false, status: 'Invalid Base URL', error: err.message || 'Connection failed' };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    return (
      provider.models || [
        'claude-3-5-sonnet-latest',
        'claude-3-5-haiku-latest',
        'claude-3-opus-latest',
      ]
    );
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const url = `${provider.baseUrl || 'https://api.anthropic.com/v1'}/messages`;
    const model = params.model || provider.defaultModel || 'claude-3-5-haiku-latest';

    // Anthropic messages cannot contain 'system' role, it must be root-level parameter
    const messages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.content,
      }));

    const body: any = {
      model,
      messages,
      max_tokens: params.maxOutputTokens || 1024,
      temperature: params.temperature ?? 0.7,
    };

    if (params.systemInstruction) {
      body.system = params.systemInstruction;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic Error (${res.status}): ${errorText}`);
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
    const url = `${provider.baseUrl || 'https://api.anthropic.com/v1'}/messages`;
    const model = params.model || provider.defaultModel || 'claude-3-5-haiku-latest';

    const messages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.content,
      }));

    const body: any = {
      model,
      messages,
      max_tokens: params.maxOutputTokens || 1024,
      temperature: params.temperature ?? 0.7,
      stream: true,
    };

    if (params.systemInstruction) {
      body.system = params.systemInstruction;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic Stream Error (${res.status}): ${errorText}`);
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
  static async testConnection(provider: AIProvider): Promise<{ success: boolean; status: ConnectionStatus; error?: string }> {
    try {
      const url = provider.baseUrl;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(provider.apiKey ? { 'Authorization': `Bearer ${provider.apiKey}` } : {}),
        },
      });

      if (res.status >= 200 && res.status < 400) {
        return { success: true, status: 'Connected' };
      }

      if (res.status === 401 || res.status === 403) {
        return { success: false, status: 'Authentication Failed', error: `Auth failed: status ${res.status}` };
      }

      const txt = await res.text();
      return { success: false, status: 'Provider Unavailable', error: `HTTP ${res.status}: ${txt.slice(0, 100)}` };
    } catch (err: any) {
      return { success: false, status: 'Invalid Base URL', error: err.message || 'Connection failed' };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    return provider.models || ['custom-model-1'];
  }

  static async generate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    const startTime = Date.now();
    const url = provider.baseUrl;

    // Custom HTTP endpoints require custom payload mappings or generic JSON mapping
    const payload = {
      model: params.model,
      prompt: params.messages[params.messages.length - 1]?.content || '',
      system: params.systemInstruction,
      temperature: params.temperature,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Custom HTTP Error (${res.status}): ${errorText}`);
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
