import { lookup as dnsLookup } from 'node:dns/promises';
import { isValidHttpUrl, normalizeProviderBaseUrl } from './catalog';
import type { ConnectionStatus } from './types';

const PRIVATE_IPV4 = [
  { base: [0, 0, 0, 0], mask: 8 },
  { base: [10, 0, 0, 0], mask: 8 },
  { base: [100, 64, 0, 0], mask: 10 },
  { base: [127, 0, 0, 0], mask: 8 },
  { base: [169, 254, 0, 0], mask: 16 },
  { base: [172, 16, 0, 0], mask: 12 },
  { base: [192, 168, 0, 0], mask: 16 },
  { base: [198, 18, 0, 0], mask: 15 },
];

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  'metadata',
  'metadata.aws.internal',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

const BLOCKED_IPV4 = new Set(['169.254.169.254', '168.63.129.16', '100.100.100.200']);

export type ProviderErrorKind =
  | 'ok'
  | 'localhost-cloud'
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'ssrf'
  | 'redirect'
  | 'connection-refused'
  | 'network'
  | 'auth'
  | 'http';

export interface EndpointValidation {
  ok: boolean;
  status: ConnectionStatus;
  error?: string;
  url?: URL;
  normalized?: string;
  loopback?: boolean;
  cloudRuntime?: boolean;
  kind?: ProviderErrorKind;
}

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string }>>;

let cloudRuntimeOverride: boolean | undefined;
let dnsLookupOverride: DnsLookupFn | undefined;

export function setCloudRuntimeOverride(value: boolean | undefined): void {
  cloudRuntimeOverride = value;
}

export function setDnsLookupOverride(fn: DnsLookupFn | undefined): void {
  dnsLookupOverride = fn;
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

function stripHostBrackets(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = stripHostBrackets(hostname);
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
  const host = stripHostBrackets(hostname);
  if (!host.includes(':')) return false;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  if (host.startsWith('ff')) return true;
  if (host.startsWith('::ffff:')) {
    const mappedHost = host.slice('::ffff:'.length);
    return Boolean(parseIPv4(mappedHost) && (isPrivateIPv4(mappedHost) || BLOCKED_IPV4.has(mappedHost)));
  }
  return false;
}

function isBlockedMetadataHost(hostname: string): boolean {
  const host = stripHostBrackets(hostname);
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.internal')) return true;
  if (BLOCKED_IPV4.has(host)) return true;
  if (host === 'fd00:ec2::254') return true;
  return false;
}

export function isAmbiguousIpv4Hostname(hostname: string): boolean {
  const host = stripHostBrackets(hostname);
  if (/^\d+$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  return false;
}

export function isBlockedResolvedAddress(address: string): boolean {
  const host = stripHostBrackets(address);
  if (isLoopbackHostname(host)) return true;
  if (isPrivateIPv4(host)) return true;
  if (isPrivateIPv6(host)) return true;
  if (isBlockedMetadataHost(host)) return true;
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
    `${host} is not reachable from this cloud deployment. Vercel cannot access OmniRoute on your Windows PC through localhost. ` +
    `For local development, run OmniAgent on the same machine as OmniRoute at http://localhost:20128/v1. ` +
    `For production, save a separately configured public HTTPS Base URL (Cloudflare Tunnel or a locked-down VPS). ` +
    `A public URL will not be invented or substituted for localhost.`
  );
}

export function validateProviderEndpoint(rawUrl: string, options?: { requireHttpsInCloud?: boolean }): EndpointValidation {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, status: 'Invalid Base URL', error: 'Base URL is required for OpenAI-compatible providers', kind: 'ssrf' };
  }
  if (!isValidHttpUrl(trimmed)) {
    return { ok: false, status: 'Invalid Base URL', error: 'Base URL must be a valid http or https URL', kind: 'ssrf' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, status: 'Invalid Base URL', error: 'Base URL must be a valid http or https URL', kind: 'ssrf' };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error: 'Provider Base URLs must not include credentials. Store the API key in the server-side key field instead.',
      kind: 'ssrf',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const cloudRuntime = isCloudRuntime();
  const loopback = isLoopbackHostname(hostname);

  if (isAmbiguousIpv4Hostname(hostname)) {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error: 'Numeric or encoded IP hostnames are not allowed as provider endpoints.',
      loopback,
      cloudRuntime,
      kind: 'ssrf',
    };
  }

  if (isBlockedMetadataHost(hostname) || BLOCKED_IPV4.has(stripHostBrackets(hostname))) {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error: 'That host is not allowed as a provider endpoint.',
      loopback,
      cloudRuntime,
      kind: 'ssrf',
    };
  }

  if (loopback && cloudRuntime) {
    return {
      ok: false,
      status: 'Provider Unavailable',
      error: localhostCloudError(trimmed),
      loopback: true,
      cloudRuntime: true,
      kind: 'localhost-cloud',
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
      kind: 'ssrf',
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
      kind: 'ssrf',
    };
  }

  return {
    ok: true,
    status: 'Connected',
    url: parsed,
    normalized: normalizeProviderBaseUrl(trimmed),
    loopback,
    cloudRuntime,
    kind: 'ok',
  };
}

export interface RedirectValidation {
  ok: boolean;
  error?: string;
  status?: ConnectionStatus;
  url?: string;
  crossHost?: boolean;
  kind?: ProviderErrorKind;
}

export function validateRedirectLocation(fromUrl: string, location: string | null): RedirectValidation {
  if (!location || !location.trim()) {
    return {
      ok: false,
      status: 'Provider Unavailable',
      error: 'Provider returned a redirect without a Location header.',
      kind: 'redirect',
    };
  }
  let next: URL;
  try {
    next = new URL(location, fromUrl);
  } catch {
    return {
      ok: false,
      status: 'Invalid Base URL',
      error: 'Provider redirected to an invalid URL.',
      kind: 'redirect',
    };
  }
  const endpoint = validateProviderEndpoint(next.toString());
  if (!endpoint.ok) {
    return {
      ok: false,
      status: endpoint.status,
      error: `Redirect to ${next.origin} was blocked. ${endpoint.error || 'Unsafe redirect target.'}`,
      kind: endpoint.kind === 'localhost-cloud' ? 'localhost-cloud' : 'ssrf',
    };
  }
  let fromHost = '';
  try {
    fromHost = new URL(fromUrl).hostname.toLowerCase();
  } catch {
    fromHost = '';
  }
  const crossHost = Boolean(fromHost && fromHost !== next.hostname.toLowerCase());
  if (crossHost) {
    return {
      ok: false,
      status: 'Provider Unavailable',
      error: 'Provider redirected to a different host. Cross-host redirects are blocked to prevent credential leakage and SSRF.',
      kind: 'redirect',
      crossHost: true,
    };
  }
  return { ok: true, url: next.toString(), crossHost: false, kind: 'ok' };
}

async function resolveHostnameAddresses(hostname: string): Promise<string[]> {
  if (dnsLookupOverride) {
    const rows = await dnsLookupOverride(hostname);
    return rows.map((row) => row.address);
  }
  const result = await dnsLookup(hostname, { all: true, verbatim: true });
  const rows = Array.isArray(result) ? result : [result];
  return rows.map((row) => row.address);
}

export async function assertSafeProviderFetch(rawUrl: string): Promise<EndpointValidation> {
  const endpoint = validateProviderEndpoint(rawUrl);
  if (!endpoint.ok) return endpoint;
  const parsed = endpoint.url;
  if (!parsed) return endpoint;
  const hostname = parsed.hostname;
  if (parseIPv4(hostname) || hostname.includes(':')) {
    if (isCloudRuntime() && isBlockedResolvedAddress(hostname)) {
      return {
        ok: false,
        status: 'Invalid Base URL',
        error: 'That resolved address is not allowed as a provider endpoint.',
        kind: 'ssrf',
        loopback: endpoint.loopback,
        cloudRuntime: true,
      };
    }
    return endpoint;
  }
  if (!isCloudRuntime()) return endpoint;
  try {
    const addresses = await Promise.race([
      resolveHostnameAddresses(hostname),
      new Promise<string[]>((_, reject) => {
        setTimeout(() => reject(new Error('DNS lookup timed out')), 5000);
      }),
    ]);
    if (!addresses.length) {
      return {
        ok: false,
        status: 'Provider Unavailable',
        error: `DNS lookup failed for ${hostname}. Check the Base URL hostname.`,
        kind: 'dns',
        loopback: endpoint.loopback,
        cloudRuntime: true,
      };
    }
    const blocked = addresses.find((address) => isBlockedResolvedAddress(address));
    if (blocked) {
      return {
        ok: false,
        status: 'Invalid Base URL',
        error: `DNS rebinding blocked: ${hostname} resolved to a private, loopback, link-local, or cloud-metadata address. Use a public HTTPS OmniRoute endpoint.`,
        kind: 'ssrf',
        loopback: endpoint.loopback,
        cloudRuntime: true,
      };
    }
    return endpoint;
  } catch {
    return {
      ok: false,
      status: 'Provider Unavailable',
      error: `DNS lookup failed for ${hostname}. Check the Base URL hostname.`,
      kind: 'dns',
      loopback: endpoint.loopback,
      cloudRuntime: true,
    };
  }
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
): { status: ConnectionStatus; error: string; reachable: boolean; kind: ProviderErrorKind } {
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
    return { status: 'Provider Unavailable', error: localhostCloudError(url), reachable: false, kind: 'localhost-cloud' };
  }

  if (
    combined.includes('dns rebinding') ||
    combined.includes('not allowed as a provider') ||
    combined.includes('private-network provider') ||
    combined.includes('numeric or encoded ip') ||
    combined.includes('must use a publicly reachable') ||
    combined.includes('must not include credentials')
  ) {
    return {
      status: 'Invalid Base URL',
      error: err instanceof Error ? err.message : 'That host is not allowed as a provider endpoint.',
      reachable: false,
      kind: 'ssrf',
    };
  }

  if (
    combined.includes('cross-host redirect') ||
    combined.includes('unsafe redirect') ||
    combined.includes('redirected to') ||
    combined.includes('redirect to') ||
    combined.includes('redirected too many')
  ) {
    return {
      status: 'Provider Unavailable',
      error: err instanceof Error ? err.message : 'Provider redirect was blocked.',
      reachable: false,
      kind: 'redirect',
    };
  }

  const name = err instanceof Error ? err.name : '';
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    combined.includes('aborted') ||
    combined.includes('timed out after') ||
    combined.includes('request timed out') ||
    combined.includes('dns lookup timed out')
  ) {
    return {
      status: 'Provider Unavailable',
      error: `Timed out after ${timeoutMs || 20000}ms contacting ${host}. The API key was not treated as invalid — the host did not respond in time.`,
      reachable: false,
      kind: 'timeout',
    };
  }

  if (combined.includes('econnrefused') || combined.includes('connection refused')) {
    return {
      status: 'Provider Unavailable',
      error: loopback
        ? `Connection refused at ${host}. Start OmniRoute locally and confirm GET ${parsed ? `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}` : url}/models responds.`
        : `Connection refused at ${host}. Nothing is listening on that address from this environment.`,
      reachable: false,
      kind: 'connection-refused',
    };
  }

  if (combined.includes('enotfound') || combined.includes('getaddrinfo') || combined.includes('dns lookup failed') || combined.includes('dns')) {
    return {
      status: 'Provider Unavailable',
      error: `DNS lookup failed for ${host}. Check the Base URL hostname.`,
      reachable: false,
      kind: 'dns',
    };
  }

  if (combined.includes('cert') || combined.includes('ssl') || combined.includes('tls') || combined.includes('unable to verify')) {
    return {
      status: 'Provider Unavailable',
      error: `TLS verification failed for ${host}. Use a valid HTTPS certificate; TLS verification is not disabled.`,
      reachable: false,
      kind: 'tls',
    };
  }

  if (loopback) {
    return {
      status: 'Provider Unavailable',
      error:
        `Could not reach OmniRoute at ${host}. Start OmniRoute on this computer and verify GET ${parsed ? `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}` : 'http://localhost:20128/v1'}/models with Authorization: Bearer <your key>. This is a network failure, not an API-key rejection.`,
      reachable: false,
      kind: 'network',
    };
  }

  const raw = err instanceof Error ? err.message : 'fetch failed';
  return {
    status: 'Provider Unavailable',
    error:
      `Network error contacting ${host}: ${raw === 'fetch failed' ? 'the host was not reachable from this environment' : raw}. ` +
      `This is a connectivity failure, not an API-key rejection. Vercel cannot use a localhost OmniRoute URL; save a separately configured public HTTPS Base URL for production.`,
    reachable: false,
    kind: 'network',
  };
}

export function statusFromHttp(status: number): {
  connection: ConnectionStatus;
  reachable: boolean;
  authenticated: boolean;
  error?: string;
  kind: ProviderErrorKind;
} {
  if (status === 401 || status === 403) {
    return {
      connection: 'Authentication Failed',
      reachable: true,
      authenticated: false,
      error: `Provider rejected the API key (HTTP ${status}).`,
      kind: 'auth',
    };
  }
  if (status === 404) {
    return {
      connection: 'Model Unavailable',
      reachable: true,
      authenticated: true,
      error: 'Endpoint or model was not found (HTTP 404). Check that the Base URL ends at /v1 and the model id exists.',
      kind: 'http',
    };
  }
  if (status === 429 || status === 402) {
    return {
      connection: 'Rate Limited',
      reachable: true,
      authenticated: true,
      error: 'API key accepted, but the provider is rate-limited right now.',
      kind: 'http',
    };
  }
  if (status >= 300 && status < 400) {
    return {
      connection: 'Provider Unavailable',
      reachable: true,
      authenticated: false,
      error: `Provider returned HTTP ${status} redirect.`,
      kind: 'redirect',
    };
  }
  if (status >= 500) {
    return {
      connection: 'Provider Unavailable',
      reachable: true,
      authenticated: true,
      error: `Provider returned HTTP ${status}.`,
      kind: 'http',
    };
  }
  if (status >= 200 && status < 300) {
    return { connection: 'Connected', reachable: true, authenticated: true, kind: 'ok' };
  }
  return {
    connection: 'Provider Unavailable',
    reachable: true,
    authenticated: false,
    error: `Provider returned HTTP ${status}.`,
    kind: 'http',
  };
}
