import crypto from 'crypto';
import { getApiKeyHashSecret, isProduction } from '../config';

function resolveHashSecret(): string {
  const configured = getApiKeyHashSecret();
  if (configured) {
    return configured;
  }
  if (isProduction()) {
    throw new Error('Missing required production secret: API_KEY_HASH_SECRET');
  }
  return 'omniagent-dev-only-not-for-production';
}

export interface GeneratedKeyResult {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
}

/**
 * Generates a secure random API key.
 * Format: ua_live_<32 hex bytes> or ua_test_<32 hex bytes>
 */
export function generateApiKey(environment: 'production' | 'development' = 'production'): GeneratedKeyResult {
  const prefix = environment === 'production' ? 'ua_live_' : 'ua_test_';
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `${prefix}${randomBytes}`;
  const keyPrefix = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
  const keyHash = hashApiKey(rawKey);

  return {
    rawKey,
    keyPrefix,
    keyHash,
  };
}

/**
 * Computes deterministic SHA-256 hash with salt for secure storage & fast lookup.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHmac('sha256', resolveHashSecret()).update(rawKey.trim()).digest('hex');
}

/**
 * Safe constant-time string comparison to prevent timing attacks.
 */
export function verifyApiKeyHash(providedKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(providedKey);
  const a = Buffer.from(computedHash, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Simple in-memory rate limiter per key / IP / project
 */
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();

export function checkRateLimit(
  identifier: string,
  limitRpm = 60
): { allowed: boolean; remaining: number; resetSeconds: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const bucket = rateLimitMap.get(identifier) || {
    tokens: limitRpm,
    lastRefill: now,
  };

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= windowMs) {
    bucket.tokens = limitRpm;
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    rateLimitMap.set(identifier, bucket);
    const resetSeconds = Math.max(1, Math.ceil((bucket.lastRefill + windowMs - now) / 1000));
    return {
      allowed: true,
      remaining: bucket.tokens,
      resetSeconds,
    };
  }

  const resetSeconds = Math.max(1, Math.ceil((bucket.lastRefill + windowMs - now) / 1000));
  return {
    allowed: false,
    remaining: 0,
    resetSeconds,
  };
}
