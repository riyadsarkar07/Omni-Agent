export interface ModelCatalog {
  ids: string[];
  availableIds: string[];
  availabilityKnown: boolean;
}

const ACTIVE_STATUS = new Set(['active', 'available', 'ready', 'online', 'enabled']);
const INACTIVE_STATUS = new Set(['inactive', 'disabled', 'unavailable', 'offline', 'deprecated']);

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function modelIdFromRow(row: unknown): string {
  if (typeof row === 'string') return row.trim();
  if (!row || typeof row !== 'object') return '';
  const rec = row as { id?: unknown; model?: unknown; name?: unknown };
  for (const value of [rec.id, rec.model, rec.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function rowAvailability(row: unknown): boolean | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as {
    active?: unknown;
    available?: unknown;
    enabled?: unknown;
    is_active?: unknown;
    status?: unknown;
    permission?: unknown;
  };

  if (typeof rec.active === 'boolean') return rec.active;
  if (typeof rec.available === 'boolean') return rec.available;
  if (typeof rec.enabled === 'boolean') return rec.enabled;
  if (typeof rec.is_active === 'boolean') return rec.is_active;

  if (typeof rec.status === 'string') {
    const status = rec.status.trim().toLowerCase();
    if (ACTIVE_STATUS.has(status)) return true;
    if (INACTIVE_STATUS.has(status)) return false;
  }

  if (Array.isArray(rec.permission)) {
    const flags = rec.permission
      .map((item) => (item && typeof item === 'object' ? (item as { allow_sampling?: unknown }).allow_sampling : undefined))
      .filter((flag): flag is boolean => typeof flag === 'boolean');
    if (flags.includes(true)) return true;
    if (flags.length > 0 && flags.every((flag) => flag === false)) return false;
  }

  return null;
}

export function unknownCatalog(ids: string[]): ModelCatalog {
  return {
    ids: uniqueIds(ids.filter(Boolean)),
    availableIds: [],
    availabilityKnown: false,
  };
}

export function parseModelCatalog(payload: unknown): ModelCatalog {
  if (!payload || typeof payload !== 'object') return unknownCatalog([]);
  const data = payload as { data?: unknown; models?: unknown };
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

  const ids: string[] = [];
  const availableIds: string[] = [];
  let availabilityKnown = false;

  for (const row of rows) {
    const id = modelIdFromRow(row);
    if (!id) continue;
    ids.push(id);
    const available = rowAvailability(row);
    if (available !== null) availabilityKnown = true;
    if (available === true) availableIds.push(id);
  }

  return {
    ids: uniqueIds(ids),
    availableIds: uniqueIds(availableIds),
    availabilityKnown,
  };
}

export function collectModelIds(payload: unknown): string[] {
  return parseModelCatalog(payload).ids;
}

export function ensureDefaultModel(ids: string[], defaultModel?: string): string[] {
  const model = (defaultModel || '').trim();
  if (!model) return uniqueIds(ids);
  if (ids.includes(model)) return uniqueIds(ids);
  return uniqueIds([model, ...ids]);
}

export function catalogMetadata(catalog: ModelCatalog, discoveredAt = new Date().toISOString()) {
  return {
    availableIds: catalog.availableIds,
    availabilityKnown: catalog.availabilityKnown,
    listedCount: catalog.ids.length,
    discoveredAt,
  };
}

export function catalogFromProvider(provider: {
  models?: string[];
  defaultModel?: string;
  availableModels?: string[];
  catalogAvailabilityKnown?: boolean;
  metadata?: { modelCatalog?: { availableIds?: string[]; availabilityKnown?: boolean } };
}): ModelCatalog {
  const ids = ensureDefaultModel(provider.models || [], provider.defaultModel);
  const availableIds = provider.availableModels || provider.metadata?.modelCatalog?.availableIds || [];
  const availabilityKnown = Boolean(
    provider.catalogAvailabilityKnown ?? provider.metadata?.modelCatalog?.availabilityKnown
  );
  return { ids, availableIds, availabilityKnown };
}
