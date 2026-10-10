import {
  ProviderCapability,
  ProviderKind,
  ProviderProtocol,
} from './types';

export interface ProviderTypeOption {
  id: ProviderKind;
  label: string;
  protocol: ProviderProtocol;
  placeholderUrl: string;
  defaultCapabilities: ProviderCapability[];
  description: string;
}

export const PROVIDER_TYPE_OPTIONS: ProviderTypeOption[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    placeholderUrl: 'https://api.openai.com/v1',
    defaultCapabilities: ['TEXT', 'VISION', 'STREAMING', 'TOOL_CALLING', 'FUNCTION_CALLING', 'STRUCTURED_OUTPUT'],
    description: 'Official OpenAI API',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic',
    placeholderUrl: 'https://api.anthropic.com/v1',
    defaultCapabilities: ['TEXT', 'VISION', 'STREAMING', 'STRUCTURED_OUTPUT'],
    description: 'Official Anthropic Messages API',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'gemini',
    placeholderUrl: 'https://generativelanguage.googleapis.com',
    defaultCapabilities: ['TEXT', 'VISION', 'STREAMING', 'TOOL_CALLING', 'FUNCTION_CALLING'],
    description: 'Google Gemini native API',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    protocol: 'openai',
    placeholderUrl: 'http://localhost:20128/v1',
    defaultCapabilities: ['TEXT', 'STREAMING', 'TOOL_CALLING', 'FUNCTION_CALLING'],
    description: 'Any OpenAI-compatible gateway (OmniRoute, OpenRouter, Groq, Together, local, etc.)',
  },
  {
    id: 'anthropic-compatible',
    label: 'Anthropic Compatible',
    protocol: 'anthropic',
    placeholderUrl: 'https://api.example.com/v1',
    defaultCapabilities: ['TEXT', 'STREAMING'],
    description: 'Any Anthropic-compatible Messages endpoint',
  },
  {
    id: 'custom-http',
    label: 'Custom HTTP API',
    protocol: 'custom',
    placeholderUrl: 'https://api.example.com',
    defaultCapabilities: ['TEXT', 'STREAMING'],
    description: 'Generic JSON HTTP completion endpoint',
  },
  {
    id: 'conduit',
    label: 'Conduit',
    protocol: 'openai',
    placeholderUrl: 'https://your-conduit-host/v1',
    defaultCapabilities: ['TEXT', 'STREAMING', 'TOOL_CALLING'],
    description: 'Conduit OpenAI-compatible gateway',
  },
  {
    id: 'other',
    label: 'Other',
    protocol: 'openai',
    placeholderUrl: 'https://api.example.com/v1',
    defaultCapabilities: ['TEXT', 'STREAMING'],
    description: 'Other configured OpenAI-compatible provider',
  },
];

export function getProviderTypeOption(kind?: string): ProviderTypeOption {
  return PROVIDER_TYPE_OPTIONS.find((item) => item.id === kind) || PROVIDER_TYPE_OPTIONS[3];
}

export function protocolFromKind(kind?: string, fallback?: ProviderProtocol): ProviderProtocol {
  if (kind) return getProviderTypeOption(kind).protocol;
  return fallback || 'openai';
}

export function kindFromProtocol(protocol?: ProviderProtocol, existing?: ProviderKind): ProviderKind {
  if (existing) return existing;
  if (protocol === 'anthropic') return 'anthropic';
  if (protocol === 'gemini') return 'gemini';
  if (protocol === 'custom') return 'custom-http';
  return 'openai-compatible';
}

export function normalizeProviderBaseUrl(baseUrl: string): string {
  let base = (baseUrl || '').trim().replace(/\/+$/, '');
  base = base.replace(/\/(chat\/completions|messages|completions|models|embeddings|key)$/i, '');
  try {
    const parsed = new URL(base);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('openrouter.ai') && !parsed.pathname.includes('/api/')) {
      parsed.pathname = '/api/v1';
      return parsed.toString().replace(/\/+$/, '');
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return base;
  }
}

export function joinProviderUrl(baseUrl: string, path: string): string {
  const base = normalizeProviderBaseUrl(baseUrl);
  let suffix = path.replace(/^\/+/, '');
  if (!base) return `/${suffix}`;
  try {
    const parsed = new URL(base);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const suffixParts = suffix.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    while (suffixParts.length && pathParts[pathParts.length - 1] === suffixParts[0]) {
      suffixParts.shift();
    }
    suffix = suffixParts.join('/');
    parsed.pathname = suffix ? `${pathname === '/' ? '' : pathname}/${suffix}` : pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    if (!suffix) return base;
    const baseTail = base.split('/').pop() || '';
    const suffixHead = suffix.split('/')[0];
    if (baseTail && baseTail.toLowerCase() === suffixHead.toLowerCase()) {
      const rest = suffix.split('/').slice(1).join('/');
      return rest ? `${base}/${rest}` : base;
    }
    return `${base}/${suffix}`;
  }
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function slugifyProviderId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base || 'provider'}-${rand}`;
}

export function defaultOfficialBaseUrl(kind: ProviderKind): string {
  if (kind === 'openai') return 'https://api.openai.com/v1';
  if (kind === 'anthropic') return 'https://api.anthropic.com/v1';
  if (kind === 'gemini') return 'https://generativelanguage.googleapis.com';
  return '';
}
