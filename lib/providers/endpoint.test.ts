import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  assertSafeProviderFetch,
  classifyProviderNetworkError,
  isLoopbackHostname,
  isPrivateIPv4,
  localhostCloudError,
  setCloudRuntimeOverride,
  setDnsLookupOverride,
  statusFromHttp,
  validateProviderEndpoint,
  validateRedirectLocation,
} from './endpoint';

afterEach(() => {
  setCloudRuntimeOverride(undefined);
  setDnsLookupOverride(undefined);
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
    assert.equal(isPrivateIPv4('100.64.0.1'), true);
    assert.equal(validateProviderEndpoint('http://127.0.0.1:20128/v1').ok, false);
    assert.equal(validateProviderEndpoint('http://192.168.1.12:20128/v1').ok, false);
    assert.equal(validateProviderEndpoint('http://169.254.169.254/latest/meta-data').ok, false);
    assert.equal(validateProviderEndpoint('http://metadata.google.internal/').ok, false);
    assert.equal(validateProviderEndpoint('https://168.63.129.16/v1').ok, false);
    assert.equal(validateProviderEndpoint('http://2130706433/v1').ok, false);
  });

  it('rejects credentials embedded in the Base URL', () => {
    setCloudRuntimeOverride(true);
    const result = validateProviderEndpoint('https://user:secret@omniroute.example.com/v1');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /must not include credentials/);
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
    assert.equal(local.kind, 'network');

    setCloudRuntimeOverride(true);
    const cloud = classifyProviderNetworkError(new Error('fetch failed'), 'http://localhost:20128/v1/models');
    assert.match(cloud.error, /Vercel cannot access OmniRoute/);
    assert.equal(cloud.error, localhostCloudError('http://localhost:20128/v1/models'));
    assert.equal(cloud.kind, 'localhost-cloud');

    const timeout = classifyProviderNetworkError(new Error('aborted'), 'https://omniroute.example.com/v1/models', 8000);
    assert.match(timeout.error, /Timed out after 8000ms/);
    assert.equal(timeout.kind, 'timeout');

    const dns = classifyProviderNetworkError(new Error('getaddrinfo ENOTFOUND'), 'https://missing.example.com/v1/models');
    assert.equal(dns.kind, 'dns');

    const tls = classifyProviderNetworkError(new Error('unable to verify the first certificate'), 'https://omniroute.example.com/v1/models');
    assert.equal(tls.kind, 'tls');
    assert.match(tls.error, /TLS verification is not disabled/);
  });

  it('maps HTTP statuses to connection diagnostics', () => {
    assert.equal(statusFromHttp(401).connection, 'Authentication Failed');
    assert.equal(statusFromHttp(401).authenticated, false);
    assert.equal(statusFromHttp(401).kind, 'auth');
    assert.equal(statusFromHttp(403).connection, 'Authentication Failed');
    assert.equal(statusFromHttp(404).connection, 'Model Unavailable');
    assert.equal(statusFromHttp(429).connection, 'Rate Limited');
    assert.equal(statusFromHttp(500).connection, 'Provider Unavailable');
    assert.equal(statusFromHttp(200).connection, 'Connected');
    assert.equal(statusFromHttp(302).kind, 'redirect');
  });

  it('blocks redirects to private, loopback, metadata, or other hosts', () => {
    setCloudRuntimeOverride(true);
    const toLoopback = validateRedirectLocation('https://omniroute.example.com/v1/models', 'http://127.0.0.1:20128/v1/models');
    assert.equal(toLoopback.ok, false);
    assert.match(toLoopback.error || '', /blocked|Vercel cannot access OmniRoute/);

    const toMetadata = validateRedirectLocation('https://omniroute.example.com/v1/models', 'http://169.254.169.254/latest/meta-data');
    assert.equal(toMetadata.ok, false);

    const crossHost = validateRedirectLocation('https://omniroute.example.com/v1/models', 'https://evil.example.net/v1/models');
    assert.equal(crossHost.ok, false);
    assert.equal(crossHost.kind, 'redirect');

    const sameHost = validateRedirectLocation('https://omniroute.example.com/v1/models', '/v1/models/');
    assert.equal(sameHost.ok, true);
  });

  it('blocks DNS rebinding to private or metadata addresses in cloud runtimes', async () => {
    setCloudRuntimeOverride(true);
    setDnsLookupOverride(async () => [{ address: '127.0.0.1' }]);
    const rebound = await assertSafeProviderFetch('https://omniroute.example.com/v1');
    assert.equal(rebound.ok, false);
    assert.match(rebound.error || '', /DNS rebinding/);

    setDnsLookupOverride(async () => [{ address: '169.254.169.254' }]);
    const metadata = await assertSafeProviderFetch('https://omniroute.example.com/v1');
    assert.equal(metadata.ok, false);

    setDnsLookupOverride(async () => [{ address: '8.8.8.8' }]);
    const publicAddr = await assertSafeProviderFetch('https://omniroute.example.com/v1');
    assert.equal(publicAddr.ok, true);
  });
});
