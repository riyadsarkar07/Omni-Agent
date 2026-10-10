import { AIProvider } from './types';
import { sanitizeProviderError } from './secrets';
import { getAppUrl } from '../config';
import { classifyProviderNetworkError } from './endpoint';

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
    const classified = classifyProviderNetworkError(err, url, timeoutMs);
    throw new Error(classified.error);
  } finally {
    clearTimeout(timer);
  }
}

function hostnameOf(baseUrl?: string): string {
  try {
    return new URL((baseUrl || '').trim()).hostname.toLowerCase();
  } catch {
    return '';
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

  const host = hostnameOf(provider.baseUrl);
  if (host.includes('openrouter.ai')) {
    if (!headers['HTTP-Referer'] && !headers['http-referer']) {
      headers['HTTP-Referer'] = getAppUrl();
    }
    if (!headers['X-Title'] && !headers['x-title']) {
      headers['X-Title'] = 'OmniAgent';
    }
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
