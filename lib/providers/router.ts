import { AIProvider, GenerateParams, GenerateRouteOptions, NormalizedResponse, ConnectionTestResult } from './types';
import { GeminiAdapter, OpenAIAdapter, AnthropicAdapter, CustomHTTPAdapter } from './adapters';
import { DatabaseStore } from '../db/store';
import { sanitizeProviderError } from './secrets';
import { isValidHttpUrl } from './catalog';
import { validateProviderEndpoint } from './endpoint';
import { runOpenAICompatibleReadiness } from './readiness';
import { unknownCatalog, type ModelCatalog } from './model-catalog';
import {
  buildFallbackChain,
  normalizeRoutingSettings,
  resolvePrimaryTarget,
  type RouteRequest,
  type RouteTarget,
  type RoutingSettings,
} from './routing-policy';
import { executeWithFallback, type RouteAttempt } from './routing-runtime';
import { classifyProviderError } from './errors';

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

  static async loadRoutingContext(): Promise<{
    providers: AIProvider[];
    settings: RoutingSettings;
    fallback?: AIProvider;
  }> {
    const [listed, settings, fallback] = await Promise.all([
      DatabaseStore.listProviders(true),
      DatabaseStore.getPlatformSettings().catch(() => ({ routing: undefined })),
      DatabaseStore.getDefaultProvider(true).catch(() => null),
    ]);
    const providers = listed.map((p) => this.hydrateBuiltinSecrets(p));
    if (!providers.some((p) => p.id === 'gemini' || p.id === 'google-gemini' || p.id === 'native')) {
      providers.push(this.builtinGemini());
    }
    return {
      providers,
      settings: normalizeRoutingSettings(settings.routing),
      fallback: fallback ? this.hydrateBuiltinSecrets(fallback) : this.builtinGemini(),
    };
  }

  static async resolveRoute(
    providerId: string | undefined,
    model: string | undefined,
    options?: GenerateRouteOptions
  ): Promise<{ target: RouteTarget; chain: RouteTarget[]; settings: RoutingSettings; request: RouteRequest }> {
    const { providers, settings, fallback } = await this.loadRoutingContext();
    const request: RouteRequest = {
      explicitProviderId: options?.auto ? undefined : providerId,
      explicitModel: options?.auto ? undefined : model,
      auto: options?.auto,
      fallbackProviderId: options?.fallbackProviderId,
      fallbackModel: options?.fallbackModel,
      requirements: options?.requirements,
    };
    let target = resolvePrimaryTarget(providers, settings, request, fallback);
    if (!target && (providerId || model) && !options?.auto) {
      const provider = await this.resolveProvider(providerId, model);
      const resolvedModel = model || provider.defaultModel || '';
      if (resolvedModel) {
        target = { provider, model: resolvedModel, reason: 'explicit' };
      }
    }
    if (!target) {
      throw new Error('No enabled provider/model is available for this request.');
    }
    return {
      target,
      chain: buildFallbackChain(target, providers, settings, request),
      settings,
      request,
    };
  }

  static async generate(
    providerId: string | undefined,
    params: GenerateParams,
    fallbackProviderId?: string | GenerateRouteOptions
  ): Promise<NormalizedResponse> {
    const options: GenerateRouteOptions =
      typeof fallbackProviderId === 'string' ? { fallbackProviderId } : fallbackProviderId || {};
    const { target, chain, settings, request } = await this.resolveRoute(providerId, params.model, options);
    const requestedProviderId = request.explicitProviderId || null;
    const requestedModel = request.explicitModel || params.model || null;

    try {
      const outcome = await executeWithFallback({
        chain,
        maxRetries: settings.maxRetries,
        invoke: async (item) => {
          const provider = this.withRequestTimeout(item.provider, settings.requestTimeoutMs);
          return await this.dispatchGenerate(provider, { ...params, model: item.model });
        },
      });
      return {
        ...outcome.result,
        provider: outcome.target.provider.name,
        model: outcome.target.model,
        requestedProviderId: requestedProviderId || undefined,
        requestedModel: requestedModel || undefined,
        selectedProviderId: outcome.target.provider.id,
        selectedModel: outcome.target.model,
        fallbackAttempts: Math.max(0, outcome.attempts.length - 1),
        routingReason: outcome.target.reason,
        metadata: {
          ...(outcome.result.metadata || {}),
          routing: {
            reason: outcome.target.reason,
            attempts: outcome.attempts,
          },
        },
      };
    } catch (error: unknown) {
      throw this.wrapRouteError(error, requestedProviderId, requestedModel);
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
    fallbackProviderId?: string | GenerateRouteOptions
  ): Promise<ReadableStream<Uint8Array> & { route?: { providerId: string; model: string; reason: string } }> {
    const options: GenerateRouteOptions =
      typeof fallbackProviderId === 'string'
        ? { fallbackProviderId, requirements: { stream: true } }
        : { ...(fallbackProviderId || {}), requirements: { stream: true, ...(fallbackProviderId?.requirements || {}) } };
    const { chain, settings, request } = await this.resolveRoute(providerId, params.model, options);
    let streamStarted = false;

    try {
      const outcome = await executeWithFallback({
        chain,
        maxRetries: settings.maxRetries,
        streamStarted: () => streamStarted,
        invoke: async (item) => {
          const provider = this.withRequestTimeout(item.provider, settings.requestTimeoutMs);
          const stream = await this.dispatchStream(provider, { ...params, model: item.model });
          streamStarted = true;
          return Object.assign(stream, {
            route: { providerId: item.provider.id, model: item.model, reason: item.reason },
          });
        },
      });
      return Object.assign(outcome.result, {
        route: {
          providerId: outcome.target.provider.id,
          model: outcome.target.model,
          reason: outcome.target.reason,
          requestedProviderId: request.explicitProviderId || null,
          requestedModel: request.explicitModel || params.model || null,
          fallbackAttempts: Math.max(0, outcome.attempts.length - 1),
        },
      });
    } catch (error: unknown) {
      throw this.wrapRouteError(error, request.explicitProviderId, request.explicitModel || params.model);
    }
  }

  private static withRequestTimeout(provider: AIProvider, timeoutMs: number): AIProvider {
    return {
      ...provider,
      metadata: {
        ...(provider.metadata || {}),
        requestTimeoutMs: timeoutMs || provider.metadata?.requestTimeoutMs || 20000,
        maxRetries: 0,
      },
    };
  }

  private static wrapRouteError(error: unknown, requestedProviderId?: string | null, requestedModel?: string | null): Error {
    const classified = (error as { classified?: ReturnType<typeof classifyProviderError> }).classified
      || classifyProviderError(error);
    const attempts = ((error as { attempts?: RouteAttempt[] }).attempts || []) as RouteAttempt[];
    const message = sanitizeProviderError(classified.message || (error as Error).message || 'Provider request failed');
    return Object.assign(new Error(message), {
      classified,
      attempts,
      streamed: Boolean((error as { streamed?: boolean }).streamed),
      requestedProviderId: requestedProviderId || null,
      requestedModel: requestedModel || null,
      failureCategory: classified.category,
    });
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

  static async listCatalog(provider: AIProvider): Promise<ModelCatalog> {
    const hydrated = this.hydrateBuiltinSecrets(provider);
    switch (hydrated.protocol) {
      case 'gemini':
        return await GeminiAdapter.listCatalog(hydrated);
      case 'openai':
        return await OpenAIAdapter.listCatalog(hydrated);
      case 'anthropic':
        return await AnthropicAdapter.listCatalog(hydrated);
      case 'custom':
        return await CustomHTTPAdapter.listCatalog(hydrated);
      default:
        return unknownCatalog(hydrated.models || []);
    }
  }

  static async listModels(provider: AIProvider): Promise<string[]> {
    return (await this.listCatalog(provider)).ids;
  }
}
