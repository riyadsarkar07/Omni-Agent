import { AIProvider, ProviderCapability } from './types';
import { catalogFromProvider } from './model-catalog';
import { providerHealthStatus, type ProviderHealthSnapshot } from './health';

export interface FallbackCandidate {
  providerId: string;
  model?: string;
}

export interface RoutingSettings {
  autoRoutingEnabled: boolean;
  fallbackEnabled: boolean;
  preferredProviderId: string | null;
  preferredModel: string | null;
  fallbackCandidates: FallbackCandidate[];
  maxRetries: number;
  requestTimeoutMs: number;
}

export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = {
  autoRoutingEnabled: false,
  fallbackEnabled: false,
  preferredProviderId: null,
  preferredModel: null,
  fallbackCandidates: [],
  maxRetries: 1,
  requestTimeoutMs: 20000,
};

export interface RouteRequirements {
  capabilities?: ProviderCapability[];
  stream?: boolean;
  tools?: boolean;
  vision?: boolean;
  files?: boolean;
}

export interface RouteTarget {
  provider: AIProvider;
  model: string;
  reason: string;
}

export interface RouteRequest {
  explicitProviderId?: string;
  explicitModel?: string;
  auto?: boolean;
  fallbackProviderId?: string;
  fallbackModel?: string;
  requirements?: RouteRequirements;
}

function uniqueCandidates(items: FallbackCandidate[]): FallbackCandidate[] {
  const seen = new Set<string>();
  const out: FallbackCandidate[] = [];
  for (const item of items) {
    const providerId = String(item.providerId || '').trim();
    if (!providerId) continue;
    const model = String(item.model || '').trim() || undefined;
    const key = `${providerId}::${model || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ providerId, model });
  }
  return out;
}

export function normalizeRoutingSettings(raw?: unknown): RoutingSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<RoutingSettings>) : {};
  const maxRetries = Number(value.maxRetries);
  const requestTimeoutMs = Number(value.requestTimeoutMs);
  return {
    autoRoutingEnabled: value.autoRoutingEnabled === true,
    fallbackEnabled: value.fallbackEnabled === true,
    preferredProviderId: typeof value.preferredProviderId === 'string' && value.preferredProviderId.trim()
      ? value.preferredProviderId.trim()
      : null,
    preferredModel: typeof value.preferredModel === 'string' && value.preferredModel.trim()
      ? value.preferredModel.trim()
      : null,
    fallbackCandidates: uniqueCandidates(Array.isArray(value.fallbackCandidates) ? value.fallbackCandidates : []),
    maxRetries: Number.isFinite(maxRetries) ? Math.min(4, Math.max(0, Math.floor(maxRetries))) : DEFAULT_ROUTING_SETTINGS.maxRetries,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs)
      ? Math.min(120000, Math.max(1000, Math.floor(requestTimeoutMs)))
      : DEFAULT_ROUTING_SETTINGS.requestTimeoutMs,
  };
}

export function validateRoutingSettings(raw: unknown): { ok: boolean; error?: string; value: RoutingSettings } {
  if (raw === undefined || raw === null || typeof raw === 'object') {
    return { ok: true, value: normalizeRoutingSettings(raw) };
  }
  return { ok: false, error: 'Routing settings must be an object', value: DEFAULT_ROUTING_SETTINGS };
}

export function requiredCapabilities(requirements?: RouteRequirements): ProviderCapability[] {
  const needed = new Set<ProviderCapability>(requirements?.capabilities || ['TEXT']);
  if (requirements?.stream) needed.add('STREAMING');
  if (requirements?.tools) {
    needed.add('TOOL_CALLING');
  }
  if (requirements?.vision || requirements?.files) needed.add('VISION');
  return Array.from(needed);
}

export function providerSupports(provider: AIProvider, requirements?: RouteRequirements): boolean {
  const caps = new Set(provider.capabilities || []);
  for (const needed of requiredCapabilities(requirements)) {
    if (needed === 'TEXT') continue;
    if (needed === 'STREAMING' && provider.metadata?.streamingEnabled === false) return false;
    if (!caps.has(needed) && !(needed === 'FUNCTION_CALLING' && caps.has('TOOL_CALLING'))) return false;
  }
  return true;
}

export function isModelListed(provider: AIProvider, model: string): boolean {
  const id = (model || '').trim();
  if (!id) return false;
  if (provider.defaultModel === id) return true;
  return (provider.models || []).includes(id);
}

export function isModelPreferredAvailable(provider: AIProvider, model: string): boolean {
  const id = (model || '').trim();
  if (!id || !isModelListed(provider, id)) return false;
  const catalog = catalogFromProvider(provider);
  if (!catalog.availabilityKnown) return true;
  return catalog.availableIds.includes(id);
}

export function selectableModels(provider: AIProvider): string[] {
  const catalog = catalogFromProvider(provider);
  if (catalog.availabilityKnown && catalog.availableIds.length > 0) {
    return catalog.availableIds;
  }
  const preferred: string[] = [];
  if (provider.defaultModel) preferred.push(provider.defaultModel);
  return preferred.length ? preferred : catalog.ids.slice(0, 1);
}

function healthOf(provider: AIProvider): ProviderHealthSnapshot | undefined {
  return provider.metadata?.health;
}

function healthRank(provider: AIProvider): number {
  const status = providerHealthStatus(healthOf(provider));
  if (status === 'unavailable') return 0;
  if (status === 'unknown') return 1;
  if (status === 'degraded') return 2;
  return 3;
}

export function scoreProvider(provider: AIProvider, settings: RoutingSettings, model: string): number {
  let score = healthRank(provider) * 100;
  if (settings.preferredProviderId && provider.id === settings.preferredProviderId) score += 40;
  if (settings.preferredModel && model === settings.preferredModel) score += 30;
  if (provider.isDefault) score += 20;
  if (isModelPreferredAvailable(provider, model)) score += 15;
  const health = healthOf(provider);
  if (health?.consecutiveFailures) score -= Math.min(40, health.consecutiveFailures * 8);
  if (typeof health?.latencyMs === 'number') score -= Math.min(20, Math.floor(health.latencyMs / 500));
  if (health?.rateLimited) score -= 25;
  if (!provider.enabled) score -= 1000;
  return score;
}

export function findProviderForModel(providers: AIProvider[], model: string, requirements?: RouteRequirements): AIProvider | undefined {
  const id = (model || '').trim();
  if (!id) return undefined;
  const eligible = providers.filter((p) => p.enabled && providerSupports(p, requirements) && isModelListed(p, id));
  const verified = eligible.filter((p) => isModelPreferredAvailable(p, id));
  const pool = verified.length ? verified : eligible.filter((p) => !catalogFromProvider(p).availabilityKnown);
  return pool.sort((a, b) => scoreProvider(b, DEFAULT_ROUTING_SETTINGS, id) - scoreProvider(a, DEFAULT_ROUTING_SETTINGS, id))[0];
}

export function selectAutoRoute(
  providers: AIProvider[],
  settings: RoutingSettings,
  requirements?: RouteRequirements
): RouteTarget | null {
  const enabled = providers.filter((p) => p.enabled && providerSupports(p, requirements));
  const options: RouteTarget[] = [];

  for (const provider of enabled) {
    if (providerHealthStatus(healthOf(provider)) === 'unavailable') continue;
    const models = selectableModels(provider);
    const preferred = settings.preferredModel && isModelPreferredAvailable(provider, settings.preferredModel)
      ? settings.preferredModel
      : models[0];
    if (!preferred) continue;
    options.push({
      provider,
      model: preferred,
      reason: 'auto',
    });
  }

  if (!options.length) return null;
  options.sort((a, b) => scoreProvider(b.provider, settings, b.model) - scoreProvider(a.provider, settings, a.model));
  const best = options[0];
  return { ...best, reason: 'auto' };
}

export function resolvePrimaryTarget(
  providers: AIProvider[],
  settings: RoutingSettings,
  request: RouteRequest,
  fallbackProvider?: AIProvider
): RouteTarget | null {
  const enabled = providers.filter((p) => p.enabled);
  const explicitModel = (request.explicitModel || '').trim();
  const explicitProviderId = (request.explicitProviderId || '').trim();
  const useAuto = request.auto === true && settings.autoRoutingEnabled && !explicitProviderId && !explicitModel;

  if (useAuto) {
    return selectAutoRoute(enabled, settings, request.requirements);
  }

  if (explicitProviderId) {
    const provider = enabled.find((p) => p.id === explicitProviderId);
    if (!provider) return null;
    const model =
      (explicitModel && isModelListed(provider, explicitModel) ? explicitModel : '') ||
      provider.defaultModel ||
      selectableModels(provider)[0] ||
      '';
    if (!model) return null;
    return { provider, model, reason: 'explicit' };
  }

  if (explicitModel) {
    const provider = findProviderForModel(enabled, explicitModel, request.requirements);
    if (!provider) return null;
    return { provider, model: explicitModel, reason: 'explicit-model' };
  }

  if (settings.preferredProviderId) {
    const preferred = enabled.find((p) => p.id === settings.preferredProviderId);
    if (preferred && providerSupports(preferred, request.requirements)) {
      const model =
        (settings.preferredModel && isModelPreferredAvailable(preferred, settings.preferredModel)
          ? settings.preferredModel
          : selectableModels(preferred)[0]) || preferred.defaultModel;
      if (model) return { provider: preferred, model, reason: 'preferred' };
    }
  }

  if (fallbackProvider && fallbackProvider.enabled) {
    const model = fallbackProvider.defaultModel || selectableModels(fallbackProvider)[0];
    if (model) return { provider: fallbackProvider, model, reason: 'default' };
  }

  const auto = selectAutoRoute(enabled, { ...settings, autoRoutingEnabled: true }, request.requirements);
  return auto ? { ...auto, reason: 'default' } : null;
}

export function buildFallbackChain(
  primary: RouteTarget,
  providers: AIProvider[],
  settings: RoutingSettings,
  request: RouteRequest
): RouteTarget[] {
  const chain: RouteTarget[] = [primary];
  const enabled = providers.filter((p) => p.enabled);
  const allowSwitch = settings.fallbackEnabled || Boolean(request.fallbackProviderId);

  if (!allowSwitch) return chain;

  const extras: FallbackCandidate[] = [];
  if (request.fallbackProviderId) {
    extras.push({ providerId: request.fallbackProviderId, model: request.fallbackModel });
  }
  if (settings.fallbackEnabled) extras.push(...settings.fallbackCandidates);

  for (const item of uniqueCandidates(extras)) {
    const provider = enabled.find((p) => p.id === item.providerId);
    if (!provider || provider.id === primary.provider.id) continue;
    if (!providerSupports(provider, request.requirements)) continue;
    if (providerHealthStatus(healthOf(provider)) === 'unavailable') continue;
    const model =
      (item.model && isModelPreferredAvailable(provider, item.model) ? item.model : '') ||
      selectableModels(provider)[0] ||
      provider.defaultModel;
    if (!model) continue;
    chain.push({ provider, model, reason: 'fallback' });
  }

  return chain;
}
