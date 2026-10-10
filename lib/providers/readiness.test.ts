import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ModelRouter } from './router';
import { setCloudRuntimeOverride, setDnsLookupOverride } from './endpoint';
import type { AIProvider } from './types';

const ORIGINAL_FETCH = globalThis.fetch;

function remoteProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    id: 'omniroute-prod',
    name: 'OmniRoute Production',
    type: 'openai-compatible',
    protocol: 'openai',
    baseUrl: 'https://omniroute.example.com/v1',
    apiKey: 'omni-test-key',
    enabled: true,
    defaultModel: 'omni-fast',
    models: [],
    capabilities: ['TEXT', 'STREAMING'],
    connectionStatus: 'Untested',
    metadata: { requestTimeoutMs: 4000, maxRetries: 0, streamingEnabled: true },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(): Response {
  const body = [
    'data: {"choices":[{"delta":{"content":"pong"}}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  setCloudRuntimeOverride(undefined);
  setDnsLookupOverride(undefined);
});

describe('OmniRoute production readiness', { concurrency: false }, () => {
  it('does not report success until GET /models and a real chat completion succeed', async () => {
    setCloudRuntimeOverride(true);
    setDnsLookupOverride(async () => [{ address: '93.184.216.34' }]);
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return jsonResponse(500, { error: { message: 'upstream down' } });
    }) as typeof fetch;

    const failed = await ModelRouter.testConnection(remoteProvider());
    assert.equal(failed.success, false);
    assert.equal(failed.chatVerified, false);
    assert.ok(failed.checks?.some((check) => check.id === 'models' && !check.passed));
    assert.equal(seen.includes('https://omniroute.example.com/v1/chat/completions'), false);
  });

  it('verifies models, chat, and SSE against a public HTTPS OmniRoute endpoint', async () => {
    setCloudRuntimeOverride(true);
    setDnsLookupOverride(async () => [{ address: '93.184.216.34' }]);
    const seen: Array<{ url: string; auth: string | null; stream?: boolean }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const body = String(init?.body || '');
      seen.push({ url, auth: headers.get('authorization'), stream: body.includes('"stream":true') });
      if (url.endsWith('/models')) {
        return jsonResponse(200, { data: [{ id: 'omni-fast' }] });
      }
      if (body.includes('"stream":true')) {
        return sseResponse();
      }
      return jsonResponse(200, {
        id: 'chat_prod',
        choices: [{ message: { content: 'pong' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }) as typeof fetch;

    const result = await ModelRouter.testConnection(remoteProvider());
    assert.equal(result.success, true);
    assert.equal(result.reachable, true);
    assert.equal(result.authenticated, true);
    assert.equal(result.chatVerified, true);
    assert.equal(result.streamingVerified, true);
    assert.deepEqual(result.models, ['omni-fast']);
    assert.equal(
      seen.every((row) => row.auth === 'Bearer omni-test-key'),
      true
    );
    assert.ok(seen.some((row) => row.url === 'https://omniroute.example.com/v1/models'));
    assert.ok(seen.some((row) => row.url === 'https://omniroute.example.com/v1/chat/completions' && !row.stream));
    assert.ok(seen.some((row) => row.url === 'https://omniroute.example.com/v1/chat/completions' && row.stream));
    assert.ok(result.checks?.every((check) => check.passed));
  });

  it('keeps localhost OmniRoute available only in local development', async () => {
    setCloudRuntimeOverride(false);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return jsonResponse(200, { data: [{ id: 'omni-fast' }] });
      }
      const body = String(init?.body || '');
      if (body.includes('"stream":true')) return sseResponse();
      return jsonResponse(200, { choices: [{ message: { content: 'pong' } }], usage: {} });
    }) as typeof fetch;

    const local = await ModelRouter.testConnection({
      ...remoteProvider(),
      id: 'omniroute-local',
      baseUrl: 'http://localhost:20128/v1',
    });
    assert.equal(local.success, true);
    assert.equal(local.chatVerified, true);

    setCloudRuntimeOverride(true);
    const blocked = await ModelRouter.testConnection({
      ...remoteProvider(),
      baseUrl: 'http://localhost:20128/v1',
    });
    assert.equal(blocked.success, false);
    assert.match(blocked.error || '', /Vercel cannot access OmniRoute/);
    assert.equal(blocked.chatVerified, false);
  });
});
