import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  classifyProviderNetworkError,
  isLoopbackHostname,
  isPrivateIPv4,
  localhostCloudError,
  setCloudRuntimeOverride,
  statusFromHttp,
  validateProviderEndpoint,
} from './endpoint';

afterEach(() => {
  setCloudRuntimeOverride(undefined);
});

describe('provider endpoint validation', () => {
  it('allows local OmniRoute during local development', () => {
    setCloudRuntimeOverride(false);
    const result = validateProviderEndpoint('http://localhost:20128/v1');
    assert.equal(result.ok, true);
    assert.equal(result.loopback, true);
    assert.equal(result.normalized, 'http://localhost:20128/v1');
  });

  it('rejects localhost when running on Vercel and does not invent a public URL', () => {
    setCloudRuntimeOverride(true);
    const result = validateProviderEndpoint('http://localhost:20128/v1');
    assert.equal(result.ok, false);
    assert.equal(result.status, 'Provider Unavailable');
    assert.match(result.error || '', /Vercel cannot access OmniRoute/);
    assert.match(result.error || '', /will not be invented/);
    assert.equal(result.error?.includes('https://omni'), false);
  });

  it('blocks private and metadata hosts in cloud runtimes', () => {
    setCloudRuntimeOverride(true);
    assert.equal(isLoopbackHostname('127.0.0.1'), true);
    assert.equal(isPrivateIPv4('10.0.0.8'), true);
    assert.equal(validateProviderEndpoint('http://127.0.0.1:20128/v1').ok, false);
    assert.equal(validateProviderEndpoint('http://192.168.1.12:20128/v1').ok, false);
    assert.equal(validateProviderEndpoint('http://169.254.169.254/latest/meta-data').ok, false);
    assert.equal(validateProviderEndpoint('http://metadata.google.internal/').ok, false);
  });

  it('requires HTTPS for public production endpoints', () => {
    setCloudRuntimeOverride(true);
    const httpPublic = validateProviderEndpoint('http://omniroute.example.com/v1');
    assert.equal(httpPublic.ok, false);
    assert.match(httpPublic.error || '', /HTTPS/);
    const httpsPublic = validateProviderEndpoint('https://omniroute.example.com/v1');
    assert.equal(httpsPublic.ok, true);
    assert.equal(httpsPublic.normalized, 'https://omniroute.example.com/v1');
  });

  it('classifies fetch failures as network errors, not invalid API keys', () => {
    setCloudRuntimeOverride(false);
    const local = classifyProviderNetworkError(new Error('fetch failed'), 'http://localhost:20128/v1/models');
    assert.equal(local.status, 'Provider Unavailable');
    assert.equal(local.reachable, false);
    assert.match(local.error, /network failure, not an API-key/);

    setCloudRuntimeOverride(true);
    const cloud = classifyProviderNetworkError(new Error('fetch failed'), 'http://localhost:20128/v1/models');
    assert.match(cloud.error, /Vercel cannot access OmniRoute/);
    assert.equal(cloud.error, localhostCloudError('http://localhost:20128/v1/models'));

    const timeout = classifyProviderNetworkError(new Error('aborted'), 'https://omniroute.example.com/v1/models', 8000);
    assert.match(timeout.error, /Timed out after 8000ms/);
  });

  it('maps HTTP statuses to connection diagnostics', () => {
    assert.equal(statusFromHttp(401).connection, 'Authentication Failed');
    assert.equal(statusFromHttp(401).authenticated, false);
    assert.equal(statusFromHttp(403).connection, 'Authentication Failed');
    assert.equal(statusFromHttp(404).connection, 'Model Unavailable');
    assert.equal(statusFromHttp(429).connection, 'Rate Limited');
    assert.equal(statusFromHttp(500).connection, 'Provider Unavailable');
    assert.equal(statusFromHttp(200).connection, 'Connected');
  });
});
