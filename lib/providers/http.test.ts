import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fetchWithTimeout } from './http';
import { setCloudRuntimeOverride, setDnsLookupOverride } from './endpoint';
import { sanitizeProviderError } from './secrets';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  setCloudRuntimeOverride(undefined);
  setDnsLookupOverride(undefined);
});

describe('provider HTTP client', { concurrency: false }, () => {
  it('follows same-host redirects after validating the target', async () => {
    setCloudRuntimeOverride(true);
    setDnsLookupOverride(async () => [{ address: '93.184.216.34' }]);
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      assert.equal(init?.redirect, 'manual');
      if (url === 'https://omniroute.example.com/v1/models') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://omniroute.example.com/v1/models/' },
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const res = await fetchWithTimeout('https://omniroute.example.com/v1/models', { method: 'GET' }, 4000);
    assert.equal(res.status, 200);
    assert.deepEqual(urls, [
      'https://omniroute.example.com/v1/models',
      'https://omniroute.example.com/v1/models/',
    ]);
  });

  it('blocks redirects to loopback or metadata hosts', async () => {
    setCloudRuntimeOverride(true);
    setDnsLookupOverride(async () => [{ address: '93.184.216.34' }]);
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1:20128/v1/models' },
      })) as typeof fetch;

    await assert.rejects(
      () => fetchWithTimeout('https://omniroute.example.com/v1/models', { method: 'GET' }, 4000),
      /blocked|Vercel cannot access OmniRoute|not allowed|SSRF/i
    );
  });

  it('redacts secrets in provider errors', () => {
    const cleaned = sanitizeProviderError('HTTP 401: Bearer omni-secret-key-123456 and api_key=sk-abcdefghijklmnop');
    assert.equal(cleaned.includes('omni-secret-key-123456'), false);
    assert.equal(cleaned.includes('sk-abcdefghijklmnop'), false);
    assert.match(cleaned, /\[redacted\]/);
  });
});
