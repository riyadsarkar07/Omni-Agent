import crypto from 'crypto';
import { getApiKeyHashSecret, isProduction } from '../config';

const PREFIX = 'enc:v1:';
const SALT = 'omniagent-provider-secret-v1';

function resolveSecretMaterial(): string {
  const configured = getApiKeyHashSecret();
  if (configured) return configured;
  if (isProduction()) {
    throw new Error('Missing Vercel secret API_KEY_HASH_SECRET. Add it, redeploy, then save the provider.');
  }
  return 'omniagent-dev-only-not-for-production';
}

function deriveKey(): Buffer {
  return crypto.scryptSync(resolveSecretMaterial(), SALT, 32);
}

export function encryptProviderSecret(plain: string): string {
  if (!plain) return '';
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

export function decryptProviderSecret(value: string): string {
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return value;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function hasStoredProviderSecret(value?: string | null): boolean {
  return Boolean(value && value.length > 0);
}

const SECRET_PATTERN =
  /(sk-[a-zA-Z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+|enc:v1:[A-Za-z0-9+/=]+)/gi;

export function sanitizeProviderError(message: string, maxLength = 600): string {
  if (!message) return 'Connection failed';
  const cleaned = message
    .replace(/\/\/([^/@\s]+):([^/@\s]+)@/g, '//[redacted]:[redacted]@')
    .replace(SECRET_PATTERN, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}...`;
}
