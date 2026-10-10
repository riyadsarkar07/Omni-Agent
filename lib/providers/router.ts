import { AIProvider, GenerateParams, NormalizedResponse, ConnectionTestResult } from './types';
import { GeminiAdapter, OpenAIAdapter, AnthropicAdapter, CustomHTTPAdapter } from './adapters';
import { DatabaseStore } from '../db/store';
import { sanitizeProviderError } from './secrets';
import { isValidHttpUrl } from './catalog';
import { validateProviderEndpoint } from './endpoint';
import { runOpenAICompatibleReadiness } from './readiness';

function isGeminiModelId(model?: string): boolean {
  const value = (model || '').toLowerCase();
  return value.startsWith('gemini') || value.includes('gemini-');
}

function isBuiltinGeminiId(providerId?: string): boolean {
  return !providerId || providerId === 'gemini' || providerId === 'google-gemini' || providerId === 'native';
}

export class ModelRouter {
  static async resolveProvider(providerId?: string, model?: string): Promise<AIProvider> {
    if (providerId && !isBuiltinGeminiId(providerId)) {
      try {
        const provider = await DatabaseStore.getProvider(providerId, true);
        if (provider && provider.enabled) {
          return this.hydrateBuiltinSecrets(provider);
        }
      } catch (err) {
        console.warn(`Failed to retrieve provider ${providerId}`);
      }
    }

    if (model && !isGeminiModelId(model)) {
      const providers = await DatabaseStore.listProviders(true);
      const match =
        providers.find((p) => p.enabled && !isBuiltinGeminiId(p.id) && (p.defaultModel === model || (p.models || []).includes(model))) ||
        providers.find((p) => p.enabled && p.protocol !== 'gemini' && !isBuiltinGeminiId(p.id));
      if (match) {
        return this.hydrateBuiltinSecrets(match);
      }
      throw new Error('No saved OpenAI-compatible provider matches this model. Save a provider (Base URL, API key, Model ID) first.');
    }

    const defaultConfigured = await DatabaseStore.getDefaultProvider(true);
    if (defaultConfigured && defaultConfigured.enabled && !isBuiltinGeminiId(defaultConfigured.id)) {
      return this.hydrateBuiltinSecrets(defaultConfigured);
    }

    return this.builtinGemini();
  }

  static builtinGemini(): AIProvider {
    return {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'gemini',
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: process.env.GEMINI_API_KEY || '',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      enabled: true,
      isSystem: true,
      isDefault: true,
      defaultModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      models: [
        'gemini-3.8-flash',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-3.5-flash',
      ],
      capabilities: [
        'TEXT',
        'VISION',
        'STREAMING',
        'TOOL_CALLING',
        'FUNCTION_CALLING',
        'TRANSCRIPTION',
        'VIDEO_GENERATION',
        'MUSIC_GENERATION',
      ],
      connectionStatus: 'Untested',
      metadata: { streamingEnabled: true },
    };
  }

  static hydrateBuiltinSecrets(provider: AIProvider): AIProvider {
    if (provider.protocol === 'gemini' && !provider.apiKey) {
      return { ...provider, apiKey: process.env.GEMINI_API_KEY || '', hasApiKey: Boolean(process.env.GEMINI_API_KEY) };
    }
    return provider;
  }

  static validateConfig(provider: Partial<AIProvider>): { ok: boolean; error?: string } {
    if (!provider.name?.trim()) {
      return { ok: false, error: 'Provider name is required' };
    }
    const protocol = provider.protocol || 'openai';
    const needsUrl = protocol !== 'gemini' || Boolean(provider.baseUrl);
    if (protocol !== 'gemini' && !provider.baseUrl?.trim() && provider.type !== 'openai' && provider.type !== 'anthropic' && provider.type !== 'gemini') {
      return { ok: false, error: 'Base URL is required for this provider type' };
    }
    if (needsUrl && provider.baseUrl) {
      if (!isValidHttpUrl(provider.baseUrl)) {
        return { ok: false, error: 'Base URL must be a valid http or https URL' };
      }
      if (protocol !== 'gemini') {
        const endpoint = validateProviderEndpoint(provider.baseUrl);
        if (!endpoint.ok) {
          return { ok: false, error: endpoint.error };
        }
      }
    }
    return { ok: true };
  }

  static async generate(
    providerId: string | undefined,
    params: GenerateParams,
    fallbackProviderId?: string
  ): Promise<NormalizedResponse> {
    const provider = await this.resolveProvider(providerId, params.model);

    try {
      return await this.dispatchGenerate(provider, params);
    } catch (error: unknown) {
      const message = sanitizeProviderError((error as Error).message || 'Provider request failed');
      console.error(`Primary provider ${provider.id} failed`);
      if (fallbackProviderId && fallbackProviderId !== provider.id) {
        const fallback = await this.resolveProvider(fallbackProviderId);
        return await this.dispatchGenerate(fallback, {
          ...params,
          model: params.model || fallback.defaultModel,
        });
      }
      throw new Error(message);
    }
  }

  private static async dispatchGenerate(provider: AIProvider, params: GenerateParams): Promise<NormalizedResponse> {
    switch (provider.protocol) {
      case 'gemini':
        return await GeminiAdapter.generate(provider, params);
      case 'openai':
        return await OpenAIAdapter.generate(provider, params);
      case 'anthropic':
        return await AnthropicAdapter.generate(provider, params);
      case 'custom':
        return await CustomHTTPAdapter.generate(provider, params);
      default:
        throw new Error(`Unsupported provider protocol: ${provider.protocol}`);
    }
  }

  static async generateStream(
    providerId: string | undefined,
    params: GenerateParams,
    fallbackProviderId?: string
  ): Promise<ReadableStream<Uint8Array>> {
    const provider = await this.resolveProvider(providerId, params.model);

    try {
      return await this.dispatchStream(provider, params);
    } catch (error: unknown) {
      if (fallbackProviderId && fallbackProviderId !== provider.id) {
        const fallback = await this.resolveProvider(fallbackProviderId);
        return await this.dispatchStream(fallback, {
          ...params,
          model: params.model || fallback.defaultModel,
        });
      }
      throw error;
    }
  }

  private static async dispatchStream(provider: AIProvider, params: GenerateParams): Promise<ReadableStream<Uint8Array>> {
    switch (provider.protocol) {
      case 'gemini':
        return await GeminiAdapter.generateStream(provider, params);
      case 'openai':
        return await OpenAIAdapter.generateStream(provider, params);
      case 'anthropic':
        return await AnthropicAdapter.generateStream(provider, params);
      case 'custom':
        return await CustomHTTPAdapter.generateStream(provider, params);
      default:
        throw new Error(`Unsupported provider protocol: ${provider.protocol}`);
    }
  }

  static async testConnection(provider: AIProvider): Promise<ConnectionTestResult> {
    const hydrated = this.hydrateBuiltinSecrets(provider);
    switch (hydrated.protocol) {
      case 'gemini':
        return await GeminiAdapter.testConnection(hydrated);
      case 'openai':
        return await runOpenAICompatibleReadiness(hydrated);
      case 'anthropic':
        return await AnthropicAdapter.testConnection(hydrated);
      case 'custom':
        return await CustomHTTPAdapter.testConnection(hydrated);
      default:
        return { success: false, status: 'Configuration Error', error: `Unsupported protocol: ${hydrated.protocol}` };
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    const hydrated = this.hydrateBuiltinSecrets(provider);
    switch (hydrated.protocol) {
      case 'gemini':
        return await GeminiAdapter.listModels(hydrated);
      case 'openai':
        return await OpenAIAdapter.listModels(hydrated);
      case 'anthropic':
        return await AnthropicAdapter.listModels(hydrated);
      case 'custom':
        return await CustomHTTPAdapter.listModels(hydrated);
      default:
        return hydrated.models || [];
    }
  }
}
