import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyProviderError, retryDelayMs } from './errors';

describe('classifyProviderError', () => {
  it('does not retry auth, permission, invalid-request, or missing-model errors', () => {
    assert.equal(classifyProviderError('HTTP 401: invalid api key').retryable, false);
    assert.equal(classifyProviderError('HTTP 401: invalid api key').category, 'auth');
    assert.equal(classifyProviderError('HTTP 403: forbidden').category, 'permission');
    assert.equal(classifyProviderError('HTTP 403: forbidden').retryable, false);
    assert.equal(classifyProviderError('HTTP 400: invalid_request').retryable, false);
    assert.equal(classifyProviderError("HTTP 404: Model 'x' was not found").category, 'model_unavailable');
    assert.equal(classifyProviderError("HTTP 404: Model 'x' was not found").retryable, false);
  });

  it('retries timeouts, network, 429, and 5xx', () => {
    assert.equal(classifyProviderError('Request timed out after 20000ms').category, 'timeout');
    assert.equal(classifyProviderError('Request timed out after 20000ms').retryable, true);
    assert.equal(classifyProviderError('Failed to fetch').category, 'network');
    assert.equal(classifyProviderError('Failed to fetch').retryable, true);
    assert.equal(classifyProviderError('HTTP 429: rate limit').category, 'rate_limit');
    assert.equal(classifyProviderError('HTTP 429: rate limit').retryable, true);
    assert.equal(classifyProviderError('HTTP 503: unavailable').category, 'retryable_http');
    assert.equal(classifyProviderError('HTTP 503: unavailable').retryable, true);
  });

  it('reads Retry-After from the error text', () => {
    const classified = classifyProviderError('HTTP 429: slow down retry-after: 2');
    assert.equal(classified.retryAfterMs, 2000);
    assert.equal(retryDelayMs(classified, 0), 2000);
  });
});
