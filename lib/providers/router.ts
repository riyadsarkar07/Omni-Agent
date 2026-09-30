import { AIProvider, GenerateParams, NormalizedResponse } from './types';
import { GeminiAdapter, OpenAIAdapter, AnthropicAdapter, CustomHTTPAdapter } from './adapters';
import { DatabaseStore } from '../db/store';

export class ModelRouter {
  /**
   * Resolve a provider config by its ID, falling back to Gemini if not found or if id is "gemini"
   */
  static async resolveProvider(providerId?: string): Promise<AIProvider> {
    if (providerId && providerId !== 'gemini' && providerId !== 'google-gemini') {
      try {
        const provider = await DatabaseStore.getProvider(providerId);
        if (provider && provider.enabled) {
          return provider;
        }
      } catch (err) {
        console.warn(`Failed to retrieve provider ${providerId}:`, err);
      }
    }

    // Default Fallback: Gemini Provider
    return {
      id: 'gemini',
      name: 'Google Gemini',
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: process.env.GEMINI_API_KEY || '',
      enabled: true,
      defaultModel: 'gemini-3.8-flash',
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
      connectionStatus: 'Connected',
    };
  }

  /**
   * Unary content generation routed to the correct adapter
   */
  static async generate(providerId: string | undefined, params: GenerateParams): Promise<NormalizedResponse> {
    const provider = await this.resolveProvider(providerId);

    // If a fallback is configured and active, and the main request fails, we handle fallback
    try {
      return await this.dispatchGenerate(provider, params);
    } catch (error: any) {
      console.error(`Primary provider ${provider.id} failed:`, error);
      throw error;
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

  /**
   * Streaming generation routed to the correct adapter
   */
  static async generateStream(providerId: string | undefined, params: GenerateParams): Promise<ReadableStream<Uint8Array>> {
    const provider = await this.resolveProvider(providerId);

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

  /**
   * Standard connection testing routed to the correct adapter
   */
  static async testConnection(provider: AIProvider): Promise<{ success: boolean; status: string; error?: string }> {
    switch (provider.protocol) {
      case 'gemini':
        return await GeminiAdapter.testConnection(provider);
      case 'openai':
        return await OpenAIAdapter.testConnection(provider);
      case 'anthropic':
        return await AnthropicAdapter.testConnection(provider);
      case 'custom':
        return await CustomHTTPAdapter.testConnection(provider);
      default:
        return { success: false, status: 'Configuration Error', error: `Unsupported protocol: ${provider.protocol}` };
    }
  }

  /**
   * Dynamic model discovery
   */
  static async listModels(provider: AIProvider): Promise<string[]> {
    switch (provider.protocol) {
      case 'gemini':
        return await GeminiAdapter.listModels(provider);
      case 'openai':
        return await OpenAIAdapter.listModels(provider);
      case 'anthropic':
        return await AnthropicAdapter.listModels(provider);
      case 'custom':
        return await CustomHTTPAdapter.listModels(provider);
      default:
        return provider.models || [];
    }
  }
}
