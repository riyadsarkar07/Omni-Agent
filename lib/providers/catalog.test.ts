import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { joinProviderUrl, normalizeProviderBaseUrl } from './catalog';

describe('provider URL normalization', () => {
  it('keeps OmniRoute /v1 and does not duplicate path segments', () => {
    assert.equal(normalizeProviderBaseUrl('http://localhost:20128/v1'), 'http://localhost:20128/v1');
    assert.equal(normalizeProviderBaseUrl('http://localhost:20128/v1/'), 'http://localhost:20128/v1');
    assert.equal(normalizeProviderBaseUrl('http://localhost:20128/v1/models'), 'http://localhost:20128/v1');
    assert.equal(normalizeProviderBaseUrl('http://localhost:20128/v1/chat/completions'), 'http://localhost:20128/v1');
    assert.equal(joinProviderUrl('http://localhost:20128/v1', '/models'), 'http://localhost:20128/v1/models');
    assert.equal(joinProviderUrl('http://localhost:20128/v1/', '/v1/models'), 'http://localhost:20128/v1/models');
    assert.equal(joinProviderUrl('http://localhost:20128/v1/models', '/models'), 'http://localhost:20128/v1/models');
    assert.equal(
      joinProviderUrl('http://localhost:20128/v1', '/chat/completions'),
      'http://localhost:20128/v1/chat/completions'
    );
  });

  it('normalizes OpenRouter to /api/v1 without duplicating /models', () => {
    assert.equal(normalizeProviderBaseUrl('https://openrouter.ai'), 'https://openrouter.ai/api/v1');
    assert.equal(joinProviderUrl('https://openrouter.ai/api/v1', '/models'), 'https://openrouter.ai/api/v1/models');
  });
});
