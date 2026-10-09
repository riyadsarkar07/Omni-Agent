import { ClassifiedChatError, ChatErrorKind } from './types';

export function sanitizeErrorMessage(raw: string): string {
  let msg = String(raw || 'Something went wrong');
  msg = msg.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]');
  msg = msg.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]');
  msg = msg.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  msg = msg.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+/gi, '$1=[redacted]');
  msg = msg.replace(/ua_(live|test)_[A-Za-z0-9]+/g, '[redacted]');
  if (msg.length > 280) msg = `${msg.slice(0, 277)}...`;
  return msg;
}

export function classifyChatError(raw: string, status?: number): ClassifiedChatError {
  const text = sanitizeErrorMessage(raw);
  const lower = text.toLowerCase();

  const make = (kind: ChatErrorKind, title: string, description: string): ClassifiedChatError => ({
    kind,
    title,
    description,
  });

  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|unauthenticated|forbidden|session expired|not authorized|account disabled/.test(lower)
  ) {
    return make('auth', 'Authentication error', 'Your session expired or this project is not authorized. Sign in again and retry.');
  }
  if (status === 429 || /rate limit|too many requests|quota/.test(lower)) {
    return make('rate_limit', 'Rate limit reached', 'This provider is throttling requests. Wait a moment, then retry or switch models.');
  }
  if (/failed to fetch|networkerror|network request failed|offline|load failed/.test(lower)) {
    return make('network', 'Network error', 'The request did not reach OmniAgent. Check your connection and retry.');
  }
  if (/timeout|timed out|deadline/.test(lower)) {
    return make('timeout', 'Request timed out', 'The provider took too long to respond. Retry or choose a faster model.');
  }
  if (/model.*(not found|unavailable|does not exist|invalid)|unknown model/.test(lower)) {
    return make('model_unavailable', 'Model unavailable', 'The selected model is not available on this provider. Choose another model.');
  }
  if (/provider.*(unavailable|not found|disabled)|econnrefused|enotfound|connection refused/.test(lower)) {
    return make('provider_unavailable', 'Provider unavailable', 'This provider could not be reached. Switch provider or try again later.');
  }
  if (/does not support image input|vision unsupported|image was not sent/.test(lower)) {
    return make('model_unavailable', 'Vision not supported', text);
  }
  return make('api', 'API error', text || 'The provider returned an error. Retry or change model.');
}
