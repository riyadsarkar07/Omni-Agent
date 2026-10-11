import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeWithFallback } from './routing-runtime';
import { AIProvider } from './types';

function target(id: string, model = 'm1'): { provider: AIProvider; model: string; reason: string } {
  return {
    provider: {
      id,
      name: id,
      type: 'openai-compatible',
      protocol: 'openai',
      baseUrl: 'https://example.test/v1',
      enabled: true,
      defaultModel: model,
      models: [model],
      capabilities: ['TEXT', 'STREAMING'],
      connectionStatus: 'Connected',
    },
    model,
    reason: id === 'primary' ? 'explicit' : 'fallback',
  };
}

describe('executeWithFallback', () => {
  it('keeps explicit success without switching providers', async () => {
    const outcome = await executeWithFallback({
      chain: [target('primary'), target('backup')],
      maxRetries: 2,
      invoke: async (item) => item.provider.id,
      sleep: async () => undefined,
    });
    assert.equal(outcome.target.provider.id, 'primary');
    assert.equal(outcome.attempts.length, 1);
  });

  it('retries retryable 5xx then falls back, without looping', async () => {
    const calls: string[] = [];
    const outcome = await executeWithFallback({
      chain: [target('primary'), target('backup')],
      maxRetries: 1,
      invoke: async (item) => {
        calls.push(item.provider.id);
        if (item.provider.id === 'primary') throw new Error('HTTP 503: unavailable');
        return 'ok';
      },
      sleep: async () => undefined,
    });
    assert.deepEqual(calls, ['primary', 'primary', 'backup']);
    assert.equal(outcome.target.provider.id, 'backup');
  });

  it('does not retry 401/403/404 indefinitely or fall back on them', async () => {
    await assert.rejects(
      () =>
        executeWithFallback({
          chain: [target('primary'), target('backup')],
          maxRetries: 3,
          invoke: async () => {
            throw new Error('HTTP 401: invalid api key');
          },
          sleep: async () => undefined,
        }),
      /HTTP 401/
    );
  });

  it('falls back on timeout/network/429 and stops when all providers fail', async () => {
    await assert.rejects(
      () =>
        executeWithFallback({
          chain: [target('primary'), target('backup')],
          maxRetries: 0,
          invoke: async (item) => {
            throw new Error(item.provider.id === 'primary' ? 'Request timed out after 20ms' : 'HTTP 429: rate limit');
          },
          sleep: async () => undefined,
        }),
      /HTTP 429|timed out/
    );
  });

  it('does not restart after the first stream token', async () => {
    let started = false;
    await assert.rejects(
      () =>
        executeWithFallback({
          chain: [target('primary'), target('backup')],
          maxRetries: 2,
          streamStarted: () => started,
          invoke: async () => {
            started = true;
            throw new Error('HTTP 503: boom');
          },
          sleep: async () => undefined,
        }),
      (err: Error & { streamed?: boolean }) => {
        assert.equal(err.streamed, true);
        return /HTTP 503/.test(err.message);
      }
    );
  });
});
