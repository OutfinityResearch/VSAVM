/**
 * Hypervector serialization tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { serializeHyperVector, deserializeHyperVector } from '../../src/vsa/serialization.mjs';

describe('Hypervector serialization', () => {
  it('roundtrips float encoding', () => {
    const vector = { dimensions: 4, data: new Float32Array([1, -1, 0.5, 0]) };
    const binary = serializeHyperVector(vector, { encoding: 'float' });
    const restored = deserializeHyperVector(binary);

    assert.strictEqual(restored.dimensions, 4);
    assert.strictEqual(restored.encoding, 'float');
    assert.ok(restored.data instanceof Float32Array);
    assert.strictEqual(restored.data[0], 1);
    assert.strictEqual(restored.data[1], -1);
  });

  it('roundtrips binary encoding', () => {
    const vector = { dimensions: 8, data: [1, 0, 1, 0, 1, 0, 0, 1] };
    const binary = serializeHyperVector(vector, { encoding: 'binary' });
    const restored = deserializeHyperVector(binary);

    assert.strictEqual(restored.dimensions, 8);
    assert.strictEqual(restored.encoding, 'binary');
    assert.ok(restored.data instanceof Uint8Array);
    assert.strictEqual(restored.data.length, 1);
  });
});
