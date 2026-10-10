import { AIProvider } from './types';
import { sanitizeProviderError } from './secrets';
import { getAppUrl } from '../config';
import { assertSafeProviderFetch, classifyProviderNetworkError, validateRedirectLocation } from './endpoint';

const MAX_SAME_HOST_REDIRECTS = 3;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const safety = await assertSafeProviderFetch(url);
    if (!safety.ok) {
      throw new Error(safety.error || 'That host is not allowed as a provider endpoint.');
    }

    let current = url;
    for (let hop = 0; hop <= MAX_SAME_HOST_REDIRECTS; hop++) {
      const res = await fetch(current, {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (res.status < 300 || res.status >= 400) {
        return res;
      }
      const location = res.headers.get('location');
      const redirect = validateRedirectLocation(current, location);
      if (!redirect.ok || !redirect.url) {
        throw new Error(redirect.error || 'Provider redirect was blocked.');
      }
      if (hop === MAX_SAME_HOST_REDIRECTS) {
        throw new Error('Provider redirected too many times. Redirects to private, loopback, or other hosts are blocked.');
      }
      const nextSafety = await assertSafeProviderFetch(redirect.url);
      if (!nextSafety.ok) {
        throw new Error(nextSafety.error || 'Redirect target is not allowed as a provider endpoint.');
      }
      current = redirect.url;
    }
    throw new Error('Provider redirect was blocked.');
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
