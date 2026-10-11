import { AIProvider } from './types';
import { catalogFromProvider } from './model-catalog';
import { classifyProviderError, type ProviderErrorCategory } from './errors';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export interface ProviderHealthSnapshot {
  status: ProviderHealthStatus;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureCategory?: ProviderErrorCategory | null;
  lastFailureMessage?: string | null;
  latencyMs?: number | null;
  consecutiveFailures?: number;
  rateLimited?: boolean;
  timedOut?: boolean;
  catalogListed?: number;
  catalogAvailable?: number;
  catalogAvailabilityKnown?: boolean;
  modelsListOk?: boolean;
  completionOk?: boolean | null;
  localUnreachable?: boolean;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function emptyHealth(): ProviderHealthSnapshot {
  return {
    status: 'unknown',
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureCategory: null,
    lastFailureMessage: null,
    latencyMs: null,
    consecutiveFailures: 0,
    rateLimited: false,
    timedOut: false,
    catalogListed: 0,
    catalogAvailable: 0,
    catalogAvailabilityKnown: false,
    modelsListOk: false,
    completionOk: null,
    localUnreachable: false,
  };
}

export function readHealth(provider?: Pick<AIProvider, 'metadata' | 'connectionStatus' | 'lastTested' | 'latencyMs' | 'models'> | null): ProviderHealthSnapshot {
  const stored = provider?.metadata?.health;
  const catalog = provider ? catalogFromProvider(provider) : { ids: [], availableIds: [], availabilityKnown: false };
  const base = emptyHealth();
  if (!stored || typeof stored !== 'object') {
    return {
      ...base,
      lastCheckedAt: provider?.lastTested || null,
      latencyMs: provider?.latencyMs ?? null,
      catalogListed: catalog.ids.length,
      catalogAvailable: catalog.availableIds.length,
      catalogAvailabilityKnown: catalog.availabilityKnown,
      status: provider?.connectionStatus === 'Connected' ? 'unknown' : provider?.connectionStatus === 'Untested' ? 'unknown' : 'unknown',
    };
  }
  return {
    ...base,
    ...stored,
    catalogListed: stored.catalogListed ?? catalog.ids.length,
    catalogAvailable: stored.catalogAvailable ?? catalog.availableIds.length,
    catalogAvailabilityKnown: stored.catalogAvailabilityKnown ?? catalog.availabilityKnown,
    latencyMs: stored.latencyMs ?? provider?.latencyMs ?? null,
    lastCheckedAt: stored.lastCheckedAt ?? provider?.lastTested ?? null,
  };
}

export function providerHealthStatus(health?: ProviderHealthSnapshot | null): ProviderHealthStatus {
  return health?.status || 'unknown';
}

export function isLocalOmniRoute(provider: Pick<AIProvider, 'name' | 'baseUrl' | 'type'>): boolean {
  const name = (provider.name || '').toLowerCase();
  const url = (provider.baseUrl || '').toLowerCase();
  if (name.includes('omniroute')) return true;
  try {
    const host = new URL(provider.baseUrl || '').hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return true;
  } catch {
    if (url.includes('localhost') || url.includes('127.0.0.1')) return true;
  }
  return false;
}

export function deriveHealthStatus(input: {
  reachable?: boolean;
  authenticated?: boolean;
  modelsListOk?: boolean;
  completionOk?: boolean | null;
  rateLimited?: boolean;
  timedOut?: boolean;
  localUnreachable?: boolean;
  consecutiveFailures?: number;
}): ProviderHealthStatus {
  if (input.localUnreachable || input.reachable === false) return 'unavailable';
  if (input.authenticated === false) return 'unavailable';
  if (input.timedOut && input.completionOk !== true) return 'degraded';
  if (input.rateLimited) return 'degraded';
  if ((input.consecutiveFailures || 0) >= 3) return 'unavailable';
  if ((input.consecutiveFailures || 0) >= 1) return 'degraded';
  if (input.completionOk === true) return 'healthy';
  if (input.modelsListOk) return 'unknown';
  return 'unknown';
}

export function healthFromTest(provider: AIProvider, result: {
  success: boolean;
  status?: string;
  error?: string;
  reachable?: boolean;
  authenticated?: boolean;
  modelAvailable?: boolean;
  chatVerified?: boolean;
  models?: string[];
  availableModels?: string[];
  availabilityKnown?: boolean;
  latencyMs?: number | null;
}): ProviderHealthSnapshot {
  const previous = readHealth(provider);
  const now = new Date().toISOString();
  const classified = result.error ? classifyProviderError(result.error) : null;
  const modelsListOk = Boolean(result.reachable && result.authenticated && (result.models?.length || result.success));
  const completionOk = result.chatVerified === true
    ? true
    : result.chatVerified === false
      ? false
      : result.modelAvailable === true
        ? true
        : result.modelAvailable === false
          ? false
          : null;
  const rateLimited = classified?.category === 'rate_limit' || result.status === 'Rate Limited';
  const timedOut = classified?.category === 'timeout';
  const localUnreachable = isLocalOmniRoute(provider) && (result.reachable === false || classified?.category === 'network');
  const failed = !result.success && completionOk !== true;
  const consecutiveFailures = failed ? (previous.consecutiveFailures || 0) + 1 : 0;
  const catalog = catalogFromProvider({
    ...provider,
    models: result.models?.length ? result.models : provider.models,
    availableModels: result.availableModels,
    catalogAvailabilityKnown: result.availabilityKnown,
  });

  const snapshot: ProviderHealthSnapshot = {
    status: deriveHealthStatus({
      reachable: result.reachable,
      authenticated: result.authenticated,
      modelsListOk,
      completionOk,
      rateLimited,
      timedOut,
      localUnreachable,
      consecutiveFailures,
    }),
    lastCheckedAt: now,
    lastSuccessAt: result.success ? now : previous.lastSuccessAt || null,
    lastFailureAt: failed ? now : previous.lastFailureAt || null,
    lastFailureCategory: failed ? classified?.category || 'unknown' : previous.lastFailureCategory || null,
    lastFailureMessage: failed ? classified?.message || result.error || null : previous.lastFailureMessage || null,
    latencyMs: asNumber(result.latencyMs) ?? previous.latencyMs ?? null,
    consecutiveFailures,
    rateLimited,
    timedOut,
    catalogListed: catalog.ids.length,
    catalogAvailable: catalog.availableIds.length,
    catalogAvailabilityKnown: catalog.availabilityKnown,
    modelsListOk,
    completionOk,
    localUnreachable,
  };
  return snapshot;
}

export function publicHealth(snapshot: ProviderHealthSnapshot): ProviderHealthSnapshot {
  return {
    ...snapshot,
    lastFailureMessage: snapshot.lastFailureMessage
      ? snapshot.lastFailureMessage.replace(/(sk-[a-zA-Z0-9_-]{8,}|Bearer\s+\S+)/gi, '[redacted]')
      : snapshot.lastFailureMessage,
  };
}
