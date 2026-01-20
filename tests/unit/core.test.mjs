/**
 * Basic unit tests for VSAVM core functionality
 * Uses Node.js built-in test runner (node --test)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import { VSAVM, createDefaultVSAVM } from '../../src/index.mjs';
import { 
  createSymbolId, 
  createScopeId,
  symbolIdToString,
  scopeIdToString 
} from '../../src/core/types/identifiers.mjs';
import { 
  stringAtom, 
  numberAtom,
  termsEqual 
} from '../../src/core/types/terms.mjs';
import { 
  createFactInstance, 
  createProvenanceLink,
  Polarity 
} from '../../src/core/types/facts.mjs';
import { createSourceId } from '../../src/core/types/identifiers.mjs';

describe('Identifiers', () => {
  test('SymbolId creation and serialization', () => {
    const sym = createSymbolId('vsavm.core', 'is_a');
    assert.strictEqual(sym.namespace, 'vsavm.core');
    assert.strictEqual(sym.name, 'is_a');
    assert.strictEqual(symbolIdToString(sym), 'vsavm.core:is_a');
  });

  test('ScopeId creation and containment', () => {
    const scope = createScopeId(['doc', 'section', 'para']);
    assert.strictEqual(scopeIdToString(scope), 'doc/section/para');
  });
});

describe('Terms', () => {
  test('String atom creation', () => {
    const atom = stringAtom('hello');
    assert.strictEqual(atom.type, 'string');
    assert.strictEqual(atom.value, 'hello');
  });

  test('Number atom creation', () => {
    const atom = numberAtom(42.5);
    assert.strictEqual(atom.type, 'number');
    assert.strictEqual(atom.value, 42.5);
  });

  test('Terms equality', () => {
    const a = stringAtom('test');
    const b = stringAtom('test');
    const c = stringAtom('other');
    
    assert.ok(termsEqual(a, b));
    assert.ok(!termsEqual(a, c));
  });
});

describe('Facts', () => {
  test('Fact creation with automatic factId', () => {
    const pred = createSymbolId('test', 'likes');
    const fact = createFactInstance(pred, {
      subject: stringAtom('Alice'),
      object: stringAtom('Bob')
    }, {
      scopeId: createScopeId(['test']),
      provenance: [createProvenanceLink(createSourceId('test', 'unit_test'))]
    });
    
    assert.ok(fact.factId);
    assert.strictEqual(fact.polarity, Polarity.ASSERT);
    assert.ok(fact.arguments instanceof Map);
    assert.strictEqual(fact.arguments.get('subject').value, 'alice');
  });

  test('Same content produces same factId', () => {
    const pred = createSymbolId('test', 'knows');
    const args = { a: stringAtom('X'), b: stringAtom('Y') };
    
    const fact1 = createFactInstance(pred, args, {
      scopeId: createScopeId(['s1']),
      provenance: [createProvenanceLink(createSourceId('test', 't1'))]
    });
    
    const fact2 = createFactInstance(pred, args, {
      scopeId: createScopeId(['s2']),
      provenance: [createProvenanceLink(createSourceId('test', 't2'))]
    });
    
    assert.strictEqual(fact1.factId, fact2.factId);
  });
});

describe('VSAVM Integration', () => {
  test('Create and initialize VSAVM', async () => {
    const vm = createDefaultVSAVM();
    await vm.initialize();
    
    const stats = await vm.getStats();
    assert.strictEqual(stats.vsaStrategy, 'mock');
    assert.strictEqual(stats.storageStrategy, 'memory');
    assert.strictEqual(stats.factCount, 0);
    
    await vm.close();
  });

  test('Assert and query facts', async () => {
    const vm = createDefaultVSAVM();
    await vm.initialize();
    
    const pred = createSymbolId('test', 'color');
    const fact = createFactInstance(pred, {
      entity: stringAtom('apple'),
      color: stringAtom('red')
    }, {
      scopeId: createScopeId(['test']),
      provenance: [createProvenanceLink(createSourceId('test', 'test'))]
    });
    
    await vm.assertFact(fact);
    
    const stats = await vm.getStats();
    assert.strictEqual(stats.factCount, 1);
    
    const results = await vm.queryFacts({ predicate: 'test:color' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].factId, fact.factId);
    
    await vm.close();
  });
});

describe('VSA Operations', () => {
  test('MockVSA generates deterministic vectors', async () => {
    const { MockVSA } = await import('../../src/vsa/strategies/mock-vsa.mjs');
    
    const vsa = new MockVSA(100);
    const v1 = vsa.generate('test');
    const v2 = vsa.generate('test');
    
    assert.strictEqual(vsa.similarity(v1, v2), 1);
  });

  test('MockVSA bundle and similarity', async () => {
    const { MockVSA } = await import('../../src/vsa/strategies/mock-vsa.mjs');
    
    const vsa = new MockVSA(100);
    const a = vsa.generate('a');
    const b = vsa.generate('b');
    const bundled = vsa.bundle([a, b]);
    
    // Bundled should be somewhat similar to both
    const simA = vsa.similarity(bundled, a);
    const simB = vsa.similarity(bundled, b);
    
    assert.ok(simA > 0);
    assert.ok(simB > 0);
  });
});

describe('Memory Store', () => {
  test('Snapshot and restore', async () => {
    const { MemoryStore } = await import('../../src/storage/strategies/memory-store.mjs');
    
    const store = new MemoryStore();
    await store.initialize();
    
    const pred = createSymbolId('test', 'fact');
    const fact = createFactInstance(pred, { x: stringAtom('1') }, {
      scopeId: createScopeId(['test']),
      provenance: [createProvenanceLink(createSourceId('test', 't'))]
    });
    
    await store.assertFact(fact);
    assert.strictEqual(await store.count(), 1);
    
    const snapId = await store.createSnapshot();
    
    await store.clear();
    assert.strictEqual(await store.count(), 0);
    
    await store.restoreSnapshot(snapId);
    assert.strictEqual(await store.count(), 1);
    
    await store.close();
  });
});
