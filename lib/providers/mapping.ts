import { AIProvider, ProviderCapability, ProviderKind, ProviderMetadata, ProviderProtocol } from './types';
import { decryptProviderSecret, hasStoredProviderSecret } from './secrets';
import { kindFromProtocol } from './catalog';

type RawProviderRow = Record<string, unknown> & Partial<AIProvider>;

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function asCapabilities(value: unknown): ProviderCapability[] {
  return asStringArray(value) as ProviderCapability[];
}

function asMetadata(value: unknown): ProviderMetadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ProviderMetadata;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed as ProviderMetadata;
    } catch {
      return {};
    }
  }
  return {};
}

export function mapRowToProvider(row: RawProviderRow, includeSecret = false): AIProvider {
  const protocol = (row.protocol as ProviderProtocol) || 'openai';
  const type = kindFromProtocol(protocol, (row.type as ProviderKind) || undefined);
  const storedKey = String(row.api_key ?? row.apiKey ?? '');
  const decrypted = includeSecret ? decryptProviderSecret(storedKey) : undefined;
  return {
    id: String(row.id),
    name: String(row.name || 'Untitled Provider'),
    type,
    protocol,
    baseUrl: String(row.base_url ?? row.baseUrl ?? ''),
    apiKey: decrypted,
    hasApiKey: hasStoredProviderSecret(storedKey),
    enabled: row.enabled !== false,
    defaultModel: String(row.default_model ?? row.defaultModel ?? ''),
    models: asStringArray(row.models),
    capabilities: asCapabilities(row.capabilities).length
      ? asCapabilities(row.capabilities)
      : ['TEXT', 'STREAMING'],
    lastTested: (row.last_tested as string | null | undefined) ?? row.lastTested ?? null,
    connectionStatus: (row.connection_status as AIProvider['connectionStatus']) || row.connectionStatus || 'Untested',
    latencyMs: (row.latency_ms as number | null | undefined) ?? row.latencyMs ?? null,
    usageCount: (row.usage_count as number | undefined) ?? row.usageCount ?? 0,
    errorRate: Number((row.error_rate as number | undefined) ?? row.errorRate ?? 0),
    isDefault: Boolean(row.is_default ?? row.isDefault),
    isSystem: Boolean(row.is_system ?? row.isSystem),
    scope: (row.scope as AIProvider['scope']) || 'global',
    ownerId: (row.owner_id as string | undefined) ?? row.ownerId,
    metadata: asMetadata(row.metadata),
    created_at: (row.created_at as string | undefined) ?? row.created_at,
    updated_at: (row.updated_at as string | undefined) ?? row.updated_at,
  };
}

export function toPublicProvider(provider: AIProvider): AIProvider {
  return {
    ...provider,
    apiKey: undefined,
    hasApiKey: Boolean(provider.hasApiKey),
  };
}

export function toDbProviderRow(provider: AIProvider, encryptedKey: string) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    protocol: provider.protocol,
    base_url: provider.baseUrl,
    api_key: encryptedKey,
    enabled: provider.enabled,
    default_model: provider.defaultModel,
    models: provider.models,
    capabilities: provider.capabilities,
    connection_status: provider.connectionStatus,
    last_tested: provider.lastTested,
    latency_ms: provider.latencyMs,
    usage_count: provider.usageCount || 0,
    error_rate: provider.errorRate || 0,
    is_default: Boolean(provider.isDefault),
    is_system: Boolean(provider.isSystem),
    scope: provider.scope || 'global',
    owner_id: provider.ownerId || null,
    metadata: provider.metadata || {},
    updated_at: provider.updated_at,
  };
}
