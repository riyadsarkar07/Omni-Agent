import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AIProvider } from './types';
import {
  buildFallbackChain,
  DEFAULT_ROUTING_SETTINGS,
  findProviderForModel,
  normalizeRoutingSettings,
  providerSupports,
  resolvePrimaryTarget,
  selectAutoRoute,
  validateRoutingSettings,
} from './routing-policy';

function provider(partial: Partial<AIProvider> & Pick<AIProvider, 'id' | 'name'>): AIProvider {
  return {
    type: 'openai-compatible',
    protocol: 'openai',
    baseUrl: 'https://example.test/v1',
    enabled: true,
    defaultModel: partial.defaultModel || (partial.models && partial.models[0]) || 'model-a',
    models: partial.models || ['model-a'],
    capabilities: ['TEXT', 'STREAMING'],
    connectionStatus: 'Connected',
    ...partial,
  };
}

describe('routing settings', () => {
  it('normalizes and validates admin routing settings', () => {
    const parsed = validateRoutingSettings({
      autoRoutingEnabled: true,
      fallbackEnabled: true,
      preferredProviderId: ' omni ',
      preferredModel: 'route-a',
      fallbackCandidates: [
        { providerId: 'omni', model: 'route-b' },
        { providerId: 'omni', model: 'route-b' },
        { providerId: '' },
      ],
      maxRetries: 99,
      requestTimeoutMs: 50,
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.maxRetries, 4);
    assert.equal(parsed.value.requestTimeoutMs, 1000);
    assert.deepEqual(parsed.value.fallbackCandidates, [{ providerId: 'omni', model: 'route-b' }]);
    assert.equal(validateRoutingSettings('nope').ok, false);
    assert.equal(normalizeRoutingSettings(undefined).autoRoutingEnabled, false);
  });
});

describe('capability compatibility', () => {
  it('requires streaming/vision/tools only when requested', () => {
    const textOnly = provider({ id: 'p1', name: 'Text', capabilities: ['TEXT'] });
    const vision = provider({ id: 'p2', name: 'Vision', capabilities: ['TEXT', 'VISION', 'STREAMING'] });
    assert.equal(providerSupports(textOnly, { stream: true }), false);
    assert.equal(providerSupports(vision, { stream: true, vision: true }), true);
    assert.equal(providerSupports(textOnly, { tools: true }), false);
  });
});

describe('explicit model selection', () => {
  it('keeps an explicit provider/model and does not auto-switch', () => {
    const omni = provider({
      id: 'omni',
      name: 'OmniRoute',
      models: ['listed-a', 'listed-b', 'listed-c'],
      defaultModel: 'listed-a',
      catalogAvailabilityKnown: true,
      availableModels: ['listed-a'],
    });
    const other = provider({ id: 'other', name: 'Other', models: ['other-1'], defaultModel: 'other-1', isDefault: true });
    const target = resolvePrimaryTarget(
      [omni, other],
      { ...DEFAULT_ROUTING_SETTINGS, autoRoutingEnabled: true, preferredProviderId: 'other' },
      { explicitProviderId: 'omni', explicitModel: 'listed-b' }
    );
    assert.equal(target?.provider.id, 'omni');
    assert.equal(target?.model, 'listed-b');
    assert.equal(target?.reason, 'explicit');
  });

  it('does not treat a large catalog listing as verified availability', () => {
    const omni = provider({
      id: 'omni',
      name: 'OmniRoute',
      models: Array.from({ length: 20 }, (_, i) => `listed-${i}`),
      defaultModel: 'listed-0',
      catalogAvailabilityKnown: true,
      availableModels: ['listed-0', 'listed-1'],
    });
    const found = findProviderForModel([omni], 'listed-9');
    assert.equal(found, undefined);
    const verified = findProviderForModel([omni], 'listed-1');
    assert.equal(verified?.id, 'omni');
  });
});

describe('auto routing', () => {
  it('prefers verified availability and healthy providers', () => {
    const huge = provider({
      id: 'catalog',
      name: 'Huge Catalog',
      models: Array.from({ length: 50 }, (_, i) => `m${i}`),
      defaultModel: 'm0',
      catalogAvailabilityKnown: false,
      metadata: { health: { status: 'unknown', consecutiveFailures: 0 } },
    });
    const healthy = provider({
      id: 'omni',
      name: 'OmniRoute',
      models: ['alpha', 'beta'],
      defaultModel: 'alpha',
      catalogAvailabilityKnown: true,
      availableModels: ['alpha'],
      metadata: { health: { status: 'healthy', consecutiveFailures: 0, completionOk: true } },
    });
    const selected = selectAutoRoute(
      [huge, healthy],
      { ...DEFAULT_ROUTING_SETTINGS, autoRoutingEnabled: true, preferredProviderId: 'omni' },
      { stream: true }
    );
    assert.equal(selected?.provider.id, 'omni');
    assert.equal(selected?.model, 'alpha');
  });

  it('uses Auto only when enabled and no explicit provider/model is set', () => {
    const omni = provider({
      id: 'omni',
      name: 'OmniRoute',
      models: ['alpha'],
      defaultModel: 'alpha',
      catalogAvailabilityKnown: true,
      availableModels: ['alpha'],
      metadata: { health: { status: 'healthy', consecutiveFailures: 0, completionOk: true } },
    });
    const autoTarget = resolvePrimaryTarget(
      [omni],
      { ...DEFAULT_ROUTING_SETTINGS, autoRoutingEnabled: true },
      { auto: true }
    );
    assert.equal(autoTarget?.reason, 'auto');
    const explicitStillWins = resolvePrimaryTarget(
      [omni],
      { ...DEFAULT_ROUTING_SETTINGS, autoRoutingEnabled: true, preferredProviderId: 'omni' },
      { auto: true, explicitProviderId: 'omni', explicitModel: 'alpha' }
    );
    assert.equal(explicitStillWins?.reason, 'explicit');
  });

  it('does not auto-route when Auto is disabled even if requested', () => {
    const omni = provider({
      id: 'omni',
      name: 'OmniRoute',
      models: ['alpha'],
      defaultModel: 'alpha',
      isDefault: true,
    });
    const other = provider({ id: 'other', name: 'Other', models: ['beta'], defaultModel: 'beta' });
    const target = resolvePrimaryTarget(
      [omni, other],
      { ...DEFAULT_ROUTING_SETTINGS, autoRoutingEnabled: false, preferredProviderId: 'other' },
      { auto: true }
    );
    assert.equal(target?.provider.id, 'other');
    assert.equal(target?.reason, 'preferred');
  });

  it('skips unavailable providers', () => {
    const down = provider({
      id: 'down',
      name: 'Down',
      models: ['x'],
      metadata: { health: { status: 'unavailable', consecutiveFailures: 4, localUnreachable: true } },
    });
    const up = provider({
      id: 'up',
      name: 'Up',
      models: ['y'],
      defaultModel: 'y',
      metadata: { health: { status: 'healthy', consecutiveFailures: 0, completionOk: true } },
    });
    const selected = selectAutoRoute([down, up], { ...DEFAULT_ROUTING_SETTINGS, autoRoutingEnabled: true });
    assert.equal(selected?.provider.id, 'up');
  });
});

describe('fallback chain', () => {
  it('does not add fallbacks when fallback is disabled and no agent fallback is set', () => {
    const a = provider({ id: 'a', name: 'A', models: ['a1'] });
    const b = provider({ id: 'b', name: 'B', models: ['b1'] });
    const chain = buildFallbackChain(
      { provider: a, model: 'a1', reason: 'explicit' },
      [a, b],
      DEFAULT_ROUTING_SETTINGS,
      { explicitProviderId: 'a', explicitModel: 'a1' }
    );
    assert.equal(chain.length, 1);
  });

  it('adds configured fallbacks that support the requested capabilities', () => {
    const a = provider({ id: 'a', name: 'A', models: ['a1'], capabilities: ['TEXT', 'STREAMING'] });
    const b = provider({ id: 'b', name: 'B', models: ['b1'], capabilities: ['TEXT'] });
    const c = provider({ id: 'c', name: 'C', models: ['c1'], capabilities: ['TEXT', 'STREAMING'] });
    const chain = buildFallbackChain(
      { provider: a, model: 'a1', reason: 'explicit' },
      [a, b, c],
      {
        ...DEFAULT_ROUTING_SETTINGS,
        fallbackEnabled: true,
        fallbackCandidates: [
          { providerId: 'b', model: 'b1' },
          { providerId: 'c', model: 'c1' },
        ],
      },
      { requirements: { stream: true } }
    );
    assert.deepEqual(chain.map((item) => item.provider.id), ['a', 'c']);
  });
});
