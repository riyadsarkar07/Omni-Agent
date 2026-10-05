import { AIProvider } from './types';
import { sanitizeProviderError } from './secrets';

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    if (message.toLowerCase().includes('abort')) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function buildProviderHeaders(provider: AIProvider, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extra || {}),
  };
  const metadata = provider.metadata || {};
  if (metadata.customHeaders) {
    for (const [key, value] of Object.entries(metadata.customHeaders)) {
      const lower = key.toLowerCase();
      if (!key || lower === 'host' || lower === 'content-length') continue;
      headers[key] = value;
    }
  }
  const apiKey = (provider.apiKey || '').trim();
  if (provider.protocol === 'anthropic') {
    headers['anthropic-version'] = metadata.apiVersion || '2023-06-01';
    if (apiKey) headers['x-api-key'] = apiKey;
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (metadata.organizationId) {
    headers['OpenAI-Organization'] = metadata.organizationId;
  }
  return headers;
}

export async function readSafeError(res: Response): Promise<string> {
  let body = '';
  try {
    body = await res.text();
  } catch {
    body = '';
  }
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error?.message || parsed.message || parsed.error || body;
  } catch {
    // keep raw text
  }
  return sanitizeProviderError(`HTTP ${res.status}: ${String(detail || res.statusText || 'Request failed')}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
