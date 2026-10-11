import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectModelIds, ensureDefaultModel, parseModelCatalog } from './model-catalog';

describe('parseModelCatalog', () => {
  it('keeps every listed OpenAI-style id and does not claim they are active', () => {
    const catalog = parseModelCatalog({
      data: [{ id: 'omni/alpha' }, { id: 'omni/beta' }, { id: 'omni/gamma' }],
    });
    assert.deepEqual(catalog.ids, ['omni/alpha', 'omni/beta', 'omni/gamma']);
    assert.equal(catalog.availabilityKnown, false);
    assert.deepEqual(catalog.availableIds, []);
  });

  it('keeps inactive ids in the catalog and only marks API-active ones available', () => {
    const catalog = parseModelCatalog({
      data: [
        { id: 'route-a', active: true },
        { id: 'route-b', active: false },
        { id: 'route-c', enabled: true },
        { id: 'route-d', status: 'disabled' },
      ],
    });
    assert.deepEqual(catalog.ids, ['route-a', 'route-b', 'route-c', 'route-d']);
    assert.equal(catalog.availabilityKnown, true);
    assert.deepEqual(catalog.availableIds, ['route-a', 'route-c']);
  });

  it('does not treat model names as availability filters', () => {
    const catalog = parseModelCatalog({
      data: [
        { id: 'preview-inactive-model', name: 'inactive preview' },
        { id: 'gpt-4-preview' },
        { name: 'models/preview-special' },
      ],
    });
    assert.deepEqual(catalog.ids, ['preview-inactive-model', 'gpt-4-preview', 'models/preview-special']);
    assert.equal(catalog.availabilityKnown, false);
    assert.deepEqual(catalog.availableIds, []);
  });

  it('accepts string rows and models arrays without dropping valid ids', () => {
    const catalog = parseModelCatalog({
      models: ['alpha', { model: 'beta' }, { name: 'gamma' }, ''],
    });
    assert.deepEqual(catalog.ids, ['alpha', 'beta', 'gamma']);
    assert.equal(catalog.availabilityKnown, false);
  });

  it('reads permission.allow_sampling when present', () => {
    const catalog = parseModelCatalog({
      data: [
        { id: 'usable', permission: [{ allow_sampling: true }] },
        { id: 'blocked', permission: [{ allow_sampling: false }] },
      ],
    });
    assert.deepEqual(catalog.ids, ['usable', 'blocked']);
    assert.equal(catalog.availabilityKnown, true);
    assert.deepEqual(catalog.availableIds, ['usable']);
  });

  it('deduplicates ids in listed order', () => {
    const catalog = parseModelCatalog({
      data: [{ id: 'one' }, { id: 'two' }, { name: 'one' }],
    });
    assert.deepEqual(catalog.ids, ['one', 'two']);
  });

  it('returns an empty unknown catalog for invalid payloads', () => {
    assert.deepEqual(parseModelCatalog(null), { ids: [], availableIds: [], availabilityKnown: false });
    assert.deepEqual(parseModelCatalog('nope'), { ids: [], availableIds: [], availabilityKnown: false });
  });
});

describe('collectModelIds', () => {
  it('returns listed ids without dropping inactive catalog entries', () => {
    assert.deepEqual(
      collectModelIds({
        data: [
          { id: 'keep-me', active: false },
          { id: 'also-keep', active: true },
        ],
      }),
      ['keep-me', 'also-keep']
    );
  });
});

describe('ensureDefaultModel', () => {
  it('preserves listed ids and prepends a missing default model', () => {
    assert.deepEqual(ensureDefaultModel(['a', 'b'], 'default'), ['default', 'a', 'b']);
    assert.deepEqual(ensureDefaultModel(['default', 'a'], 'default'), ['default', 'a']);
  });
});
