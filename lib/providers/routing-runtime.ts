import { retryDelayMs, type ClassifiedProviderError } from './errors';
import { classifyProviderError } from './errors';
import type { RouteTarget } from './routing-policy';

export interface RouteAttempt {
  providerId: string;
  model: string;
  reason: string;
  category?: ClassifiedProviderError['category'];
  retryable?: boolean;
  error?: string;
}

export interface FallbackOutcome<T> {
  result: T;
  target: RouteTarget;
  attempts: RouteAttempt[];
}

export async function executeWithFallback<T>(options: {
  chain: RouteTarget[];
  maxRetries: number;
  invoke: (target: RouteTarget) => Promise<T>;
  canFallback?: (target: RouteTarget, classified: ClassifiedProviderError) => boolean;
  streamStarted?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<FallbackOutcome<T>> {
  const sleep = options.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts: RouteAttempt[] = [];
  const maxRetries = Math.min(4, Math.max(0, options.maxRetries));
  let lastError: ClassifiedProviderError | null = null;

  for (let index = 0; index < options.chain.length; index++) {
    const target = options.chain[index];
    const isPrimary = index === 0;
    const retries = isPrimary ? maxRetries : Math.min(1, maxRetries);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await options.invoke(target);
        attempts.push({
          providerId: target.provider.id,
          model: target.model,
          reason: target.reason,
        });
        return { result, target, attempts };
      } catch (error: unknown) {
        const classified = classifyProviderError(error);
        lastError = classified;
        attempts.push({
          providerId: target.provider.id,
          model: target.model,
          reason: target.reason,
          category: classified.category,
          retryable: classified.retryable,
          error: classified.message,
        });

        if (options.streamStarted?.()) {
          throw Object.assign(new Error(classified.message), { classified, attempts, streamed: true });
        }

        const allowRetry = classified.retryable && attempt < retries;
        if (allowRetry) {
          await sleep(retryDelayMs(classified, attempt));
          continue;
        }

        const next = options.chain[index + 1];
        const allowFallback = Boolean(next) && classified.retryable && (options.canFallback ? options.canFallback(next, classified) : true);
        if (allowFallback) break;
        throw Object.assign(new Error(classified.message), { classified, attempts });
      }
    }
  }

  const message = lastError?.message || 'All eligible providers failed';
  throw Object.assign(new Error(message), { classified: lastError, attempts });
}

export function summarizeAttempts(attempts: RouteAttempt[]): string {
  if (!attempts.length) return 'No provider attempts were recorded.';
  return attempts
    .map((attempt, index) => {
      const status = attempt.error ? `${attempt.category || 'failed'}` : 'ok';
      return `${index + 1}. ${attempt.providerId}/${attempt.model} (${attempt.reason}, ${status})`;
    })
    .join('; ');
}
