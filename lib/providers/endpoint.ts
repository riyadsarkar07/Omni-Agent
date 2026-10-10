import { isValidHttpUrl, normalizeProviderBaseUrl } from './catalog';
import type { ConnectionStatus } from './types';

const PRIVATE_IPV4 = [
  { base: [0, 0, 0, 0], mask: 8 },
  { base: [10, 0, 0, 0], mask: 8 },
  { base: [127, 0, 0, 0], mask: 8 },
  { base: [169, 254, 0, 0], mask: 16 },
  { base: [172, 16, 0, 0], mask: 12 },
  { base: [192, 168, 0, 0], mask: 16 },
];

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

export interface EndpointValidation {
  ok: boolean;
  status: ConnectionStatus;
  error?: string;
  url?: URL;
  normalized?: string;
  loopback?: boolean;
  cloudRuntime?: boolean;
}

let cloudRuntimeOverride: boolean | undefined;

export function setCloudRuntimeOverride(value: boolean | undefined): void {
  cloudRuntimeOverride = value;
}

export function isCloudRuntime(): boolean {
  if (cloudRuntimeOverride !== undefined) return cloudRuntimeOverride;
  return Boolean(process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    return Number(part);
  });
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function ipv4ToInt(parts: number[]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === 'localhost.localdomain' || host === '::1' || host === '0:0:0:0:0:0:0:1') {
    return true;
  }
  const ipv4 = parseIPv4(host);
  if (ipv4 && ipv4[0] === 127) return true;
  if (host.startsWith('::ffff:')) {
    const mapped = parseIPv4(host.slice('::ffff:'.length));
    if (mapped && mapped[0] === 127) return true;
  }
  return false;
}

export function isPrivateIPv4(hostname: string): boolean {
  const parts = parseIPv4(hostname);
  if (!parts) return false;
  const value = ipv4ToInt(parts);
  return PRIVATE_IPV4.some((range) => {
    const base = ipv4ToInt(range.base);
    const mask = range.mask === 0 ? 0 : (~((1 << (32 - range.mask)) - 1)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

export function isPrivateIPv6(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes(':')) return false;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  if (host.startsWith('::ffff:')) {
    const mapped = parseIPv4(host.slice('::ffff:'.length));
    return Boolean(mapped && isPrivateIPv4(host.slice('::ffff:'.length)));
  }
  return false;
}

function isBlockedMetadataHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.internal')) return true;
  if (host === '169.254.169.254') return true;
  return false;
}

export function localhostCloudError(baseUrl: string): string {
  let host = baseUrl;
  try {
    const parsed = new URL(baseUrl);
    host = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    host = (baseUrl || '').trim();
  }
  return (
    `${host} is not reachable from this cloud deployment. Vercel cannot access OmniRoute on your computer. ` +
    `For local development, run OmniAgent on the same machine as OmniRoute at http://localhost:20128/v1. ` +
    `For production, host OmniRoute (or expose it through an HTTPS endpoint you control) and save that public Base URL on this provider. ` +
    `A public URL will not be invented or substituted for localhost.`
  );
}

export function validateProviderEndpoint(rawUrl: string, options?: { requireHttpsInCloud?: boolean }): EndpointValidation {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, status: 'Invalid Base URL', error: 'Base URL is required for OpenAI-compatible providers' };
  }
  if (!isValidHttpUrl(trimmed)) {
    return { ok: false, status: 'Invalid Base URL', error: 'Base URL must be a valid http or https URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, status: 'Invalid Base URL', error: 'Base URL must be a valid http or https URL' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const cloudRuntime = isCloudRuntime();
  const loopback = isLoopbackHostname(hostname);

  if (isBlockedMetadataHost(hostname) || hostname === '169.254.169.254') {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error: 'That host is not allowed as a provider endpoint.',
      loopback,
      cloudRuntime,
    };
  }

  if (loopback && cloudRuntime) {
    return {
      ok: false,
      status: 'Provider Unavailable',
      error: localhostCloudError(trimmed),
      loopback: true,
      cloudRuntime: true,
    };
  }

  if (cloudRuntime && (isPrivateIPv4(hostname) || isPrivateIPv6(hostname) || hostname.endsWith('.local'))) {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error:
        'Private-network provider URLs are blocked in this deployment to prevent SSRF. Use a publicly reachable HTTPS OmniRoute Base URL.',
      loopback,
      cloudRuntime,
    };
  }

  const requireHttps = options?.requireHttpsInCloud !== false;
  if (cloudRuntime && requireHttps && parsed.protocol !== 'https:' && !loopback) {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error:
        'Production OmniRoute must use a publicly reachable HTTPS Base URL. Local http://localhost:20128/v1 is only valid when OmniAgent runs on the same computer.',
      loopback,
      cloudRuntime,
    };
  }

  return {
    ok: true,
    status: 'Connected',
    url: parsed,
    normalized: normalizeProviderBaseUrl(trimmed),
    loopback,
    cloudRuntime,
  };
}

function errorText(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeText = cause ? errorText(cause) : '';
    return `${err.name} ${err.message} ${err.stack || ''} ${causeText}`.trim();
  }
  if (typeof err === 'object') {
    const record = err as { code?: string; message?: string; cause?: unknown };
    return `${record.code || ''} ${record.message || ''} ${errorText(record.cause)}`.trim();
  }
  return String(err);
}

export function classifyProviderNetworkError(
  err: unknown,
  url: string,
  timeoutMs?: number
): { status: ConnectionStatus; error: string; reachable: boolean } {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  const host = parsed ? parsed.host : url;
  const loopback = parsed ? isLoopbackHostname(parsed.hostname) : /localhost|127\.0\.0\.1/i.test(url);
  const combined = errorText(err).toLowerCase();

  if (loopback && isCloudRuntime()) {
    return { status: 'Provider Unavailable', error: localhostCloudError(url), reachable: false };
  }

  const name = err instanceof Error ? err.name : '';
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    combined.includes('aborted') ||
    combined.includes('timed out after') ||
    combined.includes('request timed out')
  ) {
    return {
      status: 'Provider Unavailable',
      error: `Timed out after ${timeoutMs || 20000}ms contacting ${host}. The API key was not treated as invalid — the host did not respond in time.`,
      reachable: false,
    };
  }

  if (combined.includes('econnrefused') || combined.includes('connection refused')) {
    return {
      status: 'Provider Unavailable',
      error: loopback
        ? `Connection refused at ${host}. Start OmniRoute locally and confirm GET ${parsed ? `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}` : url}/models responds.`
        : `Connection refused at ${host}. Nothing is listening on that address from this environment.`,
      reachable: false,
    };
  }

  if (combined.includes('enotfound') || combined.includes('getaddrinfo') || combined.includes('dns')) {
    return {
      status: 'Provider Unavailable',
      error: `DNS lookup failed for ${host}. Check the Base URL hostname.`,
      reachable: false,
    };
  }

  if (combined.includes('cert') || combined.includes('ssl') || combined.includes('tls') || combined.includes('unable to verify')) {
    return {
      status: 'Provider Unavailable',
      error: `TLS verification failed for ${host}. Use a valid HTTPS certificate; TLS verification is not disabled.`,
      reachable: false,
    };
  }

  if (loopback) {
    return {
      status: 'Provider Unavailable',
      error:
        `Could not reach OmniRoute at ${host}. Start OmniRoute on this computer and verify GET ${parsed ? `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}` : 'http://localhost:20128/v1'}/models with Authorization: Bearer <your key>. This is a network failure, not an API-key rejection.`,
      reachable: false,
    };
  }

  const raw = err instanceof Error ? err.message : 'fetch failed';
  return {
    status: 'Provider Unavailable',
    error:
      `Network error contacting ${host}: ${raw === 'fetch failed' ? 'the host was not reachable from this environment' : raw}. ` +
      `This is a connectivity failure, not an API-key rejection. Vercel cannot use a localhost OmniRoute URL; save a separately configured public HTTPS Base URL for production.`,
    reachable: false,
  };
}

export function statusFromHttp(status: number): {
  connection: ConnectionStatus;
  reachable: boolean;
  authenticated: boolean;
  error?: string;
} {
  if (status === 401 || status === 403) {
    return {
      connection: 'Authentication Failed',
      reachable: true,
      authenticated: false,
      error: `Provider rejected the API key (HTTP ${status}).`,
    };
  }
  if (status === 404) {
    return {
      connection: 'Model Unavailable',
      reachable: true,
      authenticated: true,
      error: 'Endpoint or model was not found (HTTP 404). Check that the Base URL ends at /v1 and the model id exists.',
    };
  }
  if (status === 429 || status === 402) {
    return {
      connection: 'Rate Limited',
      reachable: true,
      authenticated: true,
      error: 'API key accepted, but the provider is rate-limited right now.',
    };
  }
  if (status >= 500) {
    return {
      connection: 'Provider Unavailable',
      reachable: true,
      authenticated: true,
      error: `Provider returned HTTP ${status}.`,
    };
  }
  if (status >= 200 && status < 300) {
    return { connection: 'Connected', reachable: true, authenticated: true };
  }
  return {
    connection: 'Provider Unavailable',
    reachable: true,
    authenticated: false,
    error: `Provider returned HTTP ${status}.`,
  };
}
