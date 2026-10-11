import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveHealthStatus, healthFromTest, isLocalOmniRoute, publicHealth } from './health';
import { AIProvider } from './types';

const omni: AIProvider = {
  id: 'omni',
  name: 'OmniRoute Production',
  type: 'openai-compatible',
  protocol: 'openai',
  baseUrl: 'http://127.0.0.1:4000/v1',
  enabled: true,
  defaultModel: 'alpha',
  models: ['alpha', 'beta'],
  capabilities: ['TEXT'],
  connectionStatus: 'Untested',
};

describe('provider health', () => {
  it('does not mark a provider healthy solely because /v1/models succeeded', () => {
    const snapshot = healthFromTest(omni, {
      success: true,
      reachable: true,
      authenticated: true,
      modelAvailable: false,
      models: Array.from({ length: 50 }, (_, i) => `m${i}`),
      availabilityKnown: false,
      latencyMs: 12,
    });
    assert.equal(snapshot.modelsListOk, true);
    assert.equal(snapshot.completionOk, false);
    assert.notEqual(snapshot.status, 'healthy');
  });

  it('marks local OmniRoute unavailable when the local server cannot be reached', () => {
    assert.equal(isLocalOmniRoute(omni), true);
    const snapshot = healthFromTest(omni, {
      success: false,
      reachable: false,
      authenticated: false,
      error: 'Failed to fetch',
    });
    assert.equal(snapshot.status, 'unavailable');
    assert.equal(snapshot.localUnreachable, true);
  });

  it('redacts secrets from client-visible diagnostics', () => {
    const snapshot = publicHealth({
      status: 'unavailable',
      lastFailureMessage: 'HTTP 401: Bearer sk-secret-token-value rejected',
      consecutiveFailures: 1,
    });
    assert.equal(snapshot.lastFailureMessage?.includes('sk-secret'), false);
    assert.match(snapshot.lastFailureMessage || '', /redacted/i);
  });

  it('treats completion success as healthy and rate-limits as degraded', () => {
    assert.equal(deriveHealthStatus({ completionOk: true, modelsListOk: true, reachable: true, authenticated: true }), 'healthy');
    assert.equal(deriveHealthStatus({ completionOk: true, rateLimited: true, reachable: true, authenticated: true }), 'degraded');
  });
});
