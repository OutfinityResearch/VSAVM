/**
 * Fact binary serialization tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { 
  createFactInstance,
  createProvenanceLink,
  serializeFactInstanceBinary,
  deserializeFactInstanceBinary,
  Polarity
} from '../../src/core/types/facts.mjs';
import { 
  createSymbolId, 
  createScopeId, 
  createSourceId 
} from '../../src/core/types/identifiers.mjs';
import { 
  stringAtom, 
  numberAtom,
  createInstant,
  TimePrecision
} from '../../src/core/types/terms.mjs';

describe('Fact binary serialization', () => {
  it('roundtrips a fact instance', () => {
    const predicate = createSymbolId('test', 'likes');
    const fact = createFactInstance(predicate, {
      subject: stringAtom('Alice'),
      object: stringAtom('Bob')
    }, {
      scopeId: createScopeId(['doc', 'p0']),
      provenance: [createProvenanceLink(createSourceId('test', 'binary'))]
    });

    const binary = serializeFactInstanceBinary(fact);
    const restored = deserializeFactInstanceBinary(binary);

    assert.strictEqual(restored.factId, fact.factId);
    assert.strictEqual(restored.polarity, Polarity.ASSERT);
    assert.strictEqual(restored.predicate.namespace, 'test');
    assert.strictEqual(restored.arguments.get('subject').value, 'alice');
  });

  it('roundtrips time and confidence', () => {
    const predicate = createSymbolId('test', 'observed_at');
    const fact = createFactInstance(predicate, {
      entity: stringAtom('sensor'),
      value: numberAtom(42)
    }, {
      scopeId: createScopeId(['doc', 's1']),
      time: createInstant(1700000000000, TimePrecision.SECOND),
      confidence: 0.75,
      polarity: Polarity.ASSERT,
      provenance: [createProvenanceLink(createSourceId('test', 'time'))]
    });

    const binary = serializeFactInstanceBinary(fact);
    const restored = deserializeFactInstanceBinary(binary);

    assert.strictEqual(restored.time.type, 'instant');
    assert.strictEqual(restored.confidence, 0.75);
  });
});
