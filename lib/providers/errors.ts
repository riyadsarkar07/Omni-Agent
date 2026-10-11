export type ProviderErrorCategory =
  | 'auth'
  | 'permission'
  | 'invalid_request'
  | 'model_unavailable'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'provider_unavailable'
  | 'retryable_http'
  | 'unknown';

export interface ClassifiedProviderError {
  category: ProviderErrorCategory;
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
  message: string;
}

const RETRYABLE: ProviderErrorCategory[] = ['rate_limit', 'timeout', 'network', 'provider_unavailable', 'retryable_http'];

export function parseHttpStatus(message: string): number | undefined {
  const match = /HTTP\s+(\d{3})/i.exec(message || '');
  if (!match) return undefined;
  return Number(match[1]);
}

export function parseRetryAfterMs(message: string, headers?: Headers | Record<string, string>): number | undefined {
  const headerValue =
    headers instanceof Headers
      ? headers.get('retry-after') || headers.get('Retry-After')
      : headers?.['retry-after'] || headers?.['Retry-After'];
  const fromHeader = parseRetryAfterValue(headerValue);
  if (fromHeader !== undefined) return fromHeader;
  const match = /retry-after[:\s]+(\d+)/i.exec(message || '');
  if (!match) return undefined;
  return parseRetryAfterValue(match[1]);
}

function parseRetryAfterValue(value?: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.max(0, seconds * 1000));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.min(60_000, Math.max(0, date - Date.now()));
  return undefined;
}

export function classifyProviderError(error: unknown, headers?: Headers | Record<string, string>): ClassifiedProviderError {
  const raw = error instanceof Error ? error.message : String(error || 'Provider request failed');
  const message = raw.replace(/\s+/g, ' ').trim() || 'Provider request failed';
  const status = parseHttpStatus(message);
  const lower = message.toLowerCase();
  const retryAfterMs = parseRetryAfterMs(message, headers);

  let category: ProviderErrorCategory = 'unknown';
  if (status === 401 || /api[_-]?key|unauthorized|invalid key|authentication failed/.test(lower)) category = 'auth';
  else if (status === 403 || /forbidden|permission|not allowed/.test(lower)) category = 'permission';
  else if (status === 404 || /model.*(not found|unavailable|does not exist|unknown)|unknown model/.test(lower)) {
    category = 'model_unavailable';
  } else if (status === 400 || /invalid[_ ]request|unsupported|bad request/.test(lower)) category = 'invalid_request';
  else if (status === 429 || status === 402 || /rate limit|too many requests|quota/.test(lower)) category = 'rate_limit';
  else if (status === 408 || /timed out|timeout|deadline/.test(lower)) category = 'timeout';
  else if (/failed to fetch|networkerror|econnrefused|enotfound|offline|socket/.test(lower)) category = 'network';
  else if (status && status >= 500 && status <= 599) category = 'retryable_http';
  else if (/provider unavailable|connection refused|unreachable/.test(lower)) category = 'provider_unavailable';

  return {
    category,
    retryable: RETRYABLE.includes(category),
    status,
    retryAfterMs,
    message,
  };
}

export function retryDelayMs(classified: ClassifiedProviderError, attempt: number): number {
  if (classified.retryAfterMs !== undefined) return classified.retryAfterMs;
  const base = classified.category === 'rate_limit' ? 800 : 300;
  return Math.min(8_000, base * (attempt + 1));
}

export function describeFailure(classified: ClassifiedProviderError): string {
  switch (classified.category) {
    case 'auth':
      return 'Authentication failed. Check the stored API key.';
    case 'permission':
      return 'The provider refused this request. Check account permissions.';
    case 'invalid_request':
      return 'The request was rejected as invalid and was not retried.';
    case 'model_unavailable':
      return 'The selected model was not found on this provider.';
    case 'rate_limit':
      return 'The provider is rate-limited. Retry later or enable fallback.';
    case 'timeout':
      return 'The provider timed out.';
    case 'network':
      return 'The provider could not be reached.';
    case 'provider_unavailable':
      return 'The provider is unavailable.';
    case 'retryable_http':
      return 'The provider returned a retryable server error.';
    default:
      return classified.message;
  }
}
