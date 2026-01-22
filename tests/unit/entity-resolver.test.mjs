/**
 * Entity resolver tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { resolveEntity } from '../../src/canonicalization/normalizers/entity-resolver.mjs';
import { createEntityId } from '../../src/core/types/identifiers.mjs';

describe('Entity resolver', () => {
  it('resolves exact match', () => {
    const candidates = [
      { entityId: createEntityId('test', 'alice'), name: 'Alice' },
      { entityId: createEntityId('test', 'bob'), name: 'Bob' }
    ];

    const result = resolveEntity('Alice', {}, candidates);
    assert.ok(result.entityId);
    assert.strictEqual(result.method, 'exact_match');
    assert.strictEqual(result.entityId.localId, 'alice');
  });

  it('creates new entity when no match', () => {
    const result = resolveEntity('Carol', { source: 'unit' }, []);
    assert.ok(result.entityId);
    assert.strictEqual(result.method, 'new_entity');
    assert.strictEqual(result.entityId.source, 'unit');
  });
});
