import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { OpenAIAdapter } from './adapters';
import { ModelRouter } from './router';
import { joinProviderUrl } from './catalog';
import { setCloudRuntimeOverride } from './endpoint';
import type { AIProvider } from './types';

const ORIGINAL_FETCH = globalThis.fetch;

function omniProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    id: 'omniroute-local',
    name: 'OmniRoute',
    type: 'openai-compatible',
    protocol: 'openai',
    baseUrl: 'http://localhost:20128/v1',
    apiKey: 'omni-test-key',
    enabled: true,
    defaultModel: 'omni-fast',
    models: [],
    capabilities: ['TEXT', 'STREAMING'],
    connectionStatus: 'Untested',
    metadata: { requestTimeoutMs: 4000, maxRetries: 0 },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  setCloudRuntimeOverride(undefined);
});

describe('OpenAI compatible OmniRoute adapter', { concurrency: false }, () => {
  it('lists models from GET /v1/models with the configured bearer token', async () => {
    setCloudRuntimeOverride(false);
    const seen: Array<{ url: string; auth: string | null }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      seen.push({ url, auth: headers.get('authorization') });
      assert.equal(url, 'http://localhost:20128/v1/models');
      return jsonResponse(200, { data: [{ id: 'omni-fast' }, { id: 'omni-pro' }] });
    }) as typeof fetch;

    const result = await OpenAIAdapter.testConnection(omniProvider());
    assert.equal(result.success, true);
    assert.equal(result.status, 'Connected');
    assert.equal(result.reachable, true);
    assert.equal(result.authenticated, true);
    assert.deepEqual(result.models, ['omni-fast', 'omni-pro']);
    assert.equal(seen[0]?.auth, 'Bearer omni-test-key');

    const listed = await OpenAIAdapter.listModels(omniProvider());
    assert.deepEqual(listed, ['omni-fast', 'omni-pro']);
  });

  it('distinguishes 401 from network failure', async () => {
    setCloudRuntimeOverride(false);
    globalThis.fetch = (async () => jsonResponse(401, { error: { message: 'invalid api key' } })) as typeof fetch;
    const authFail = await OpenAIAdapter.testConnection(omniProvider());
    assert.equal(authFail.success, false);
    assert.equal(authFail.status, 'Authentication Failed');
    assert.equal(authFail.reachable, true);
    assert.equal(authFail.authenticated, false);
    assert.match(authFail.error || '', /401/);
  });

  it('explains localhost fetch failures without treating the key as wrong', async () => {
    setCloudRuntimeOverride(false);
    globalThis.fetch = (async () => {
      const err = new Error('fetch failed');
      (err as Error & { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
      throw err;
    }) as typeof fetch;
    const failed = await OpenAIAdapter.testConnection(omniProvider());
    assert.equal(failed.success, false);
    assert.equal(failed.status, 'Provider Unavailable');
    assert.equal(failed.reachable, false);
    assert.match(
      failed.error || '',
      /not treated as invalid|network failure, not an API-key|Connection refused|Could not reach OmniRoute/i
    );
    assert.doesNotMatch(failed.error || '', /invalid api key/i);
  });

  it('blocks localhost OmniRoute from a Vercel runtime', async () => {
    setCloudRuntimeOverride(true);
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return jsonResponse(200, { data: [] });
    }) as typeof fetch;
    const blocked = await OpenAIAdapter.testConnection(omniProvider());
    assert.equal(fetched, false);
    assert.equal(blocked.success, false);
    assert.match(blocked.error || '', /Vercel cannot access OmniRoute/);
  });

  it('routes chat completions through the OpenAI-compatible adapter', async () => {
    setCloudRuntimeOverride(false);
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith('/models')) {
        return jsonResponse(200, { data: [{ id: 'omni-fast' }] });
      }
      assert.equal(url, joinProviderUrl('http://localhost:20128/v1', '/chat/completions'));
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.model, 'omni-fast');
      return jsonResponse(200, {
        id: 'chat_1',
        choices: [{ message: { content: 'pong' } }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      });
    }) as typeof fetch;

    const generated = await OpenAIAdapter.generate(omniProvider(), {
      model: 'omni-fast',
      messages: [{ role: 'user', content: 'ping' }],
    });
    assert.equal(generated.text, 'pong');
    assert.equal(generated.provider, 'omniroute-local');
    assert.ok(seen.includes('http://localhost:20128/v1/chat/completions'));
  });

  it('surfaces unsupported model errors from chat completions', async () => {
    setCloudRuntimeOverride(false);
    globalThis.fetch = (async () => jsonResponse(404, { error: { message: 'model not found' } })) as typeof fetch;
    await assert.rejects(
      () =>
        OpenAIAdapter.generate(omniProvider({ defaultModel: 'missing-model' }), {
          model: 'missing-model',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      /not found/
    );
  });

  it('uses the existing router for openai-compatible providers', async () => {
    setCloudRuntimeOverride(false);
    globalThis.fetch = (async () =>
      jsonResponse(200, {
        id: 'chat_2',
        choices: [{ message: { content: 'routed' } }],
        usage: {},
      })) as typeof fetch;
    const original = ModelRouter.resolveProvider.bind(ModelRouter);
    ModelRouter.resolveProvider = (async () => omniProvider()) as typeof ModelRouter.resolveProvider;
    try {
      const res = await ModelRouter.generate('omniroute-local', {
        model: 'omni-fast',
        messages: [{ role: 'user', content: 'hi' }],
      });
      assert.equal(res.text, 'routed');
    } finally {
      ModelRouter.resolveProvider = original;
    }
  });
});
