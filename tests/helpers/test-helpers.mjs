/**
 * Test helpers for VSAVM
 * Factory functions and assertions for unit tests
 */

import { 
  createSymbolId, 
  createEntityId, 
  createScopeId,
  createSourceId 
} from '../../src/core/types/identifiers.mjs';
import { 
  stringAtom, 
  numberAtom, 
  entityAtom 
} from '../../src/core/types/terms.mjs';
import { 
  createFactInstance, 
  createProvenanceLink,
  Polarity 
} from '../../src/core/types/facts.mjs';

/**
 * Create a simple test fact
 * @param {string} predicate - e.g., "is_a"
 * @param {Object} args - e.g., { subject: "dog", object: "animal" }
 * @param {Object} [options]
 * @returns {Object}
 */
export function createTestFact(predicate, args, options = {}) {
  const pred = createSymbolId('test', predicate);
  
  // Convert simple args to atoms
  const argMap = {};
  for (const [slot, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      argMap[slot] = stringAtom(value);
    } else if (typeof value === 'number') {
      argMap[slot] = numberAtom(value);
    } else {
      argMap[slot] = value;
    }
  }
  
  return createFactInstance(pred, argMap, {
    polarity: options.polarity ?? Polarity.ASSERT,
    scopeId: options.scopeId ?? createScopeId(['test']),
    provenance: options.provenance ?? [
      createProvenanceLink(createSourceId('test', 'test_source'))
    ],
    time: options.time,
    confidence: options.confidence,
    qualifiers: options.qualifiers
  });
}

/**
 * Create a test entity
 * @param {string} name
 * @returns {Object}
 */
export function createTestEntity(name) {
  return entityAtom(createEntityId('test', name));
}

/**
 * Create a test scope
 * @param  {...string} segments
 * @returns {Object}
 */
export function createTestScope(...segments) {
  return createScopeId(segments);
}

/**
 * Assert that two facts have the same ID
 * @param {Object} factA
 * @param {Object} factB
 */
export function assertSameFactId(factA, factB) {
  if (factA.factId !== factB.factId) {
    throw new Error(`Expected same factId: ${factA.factId} !== ${factB.factId}`);
  }
}

/**
 * Assert that two facts have different IDs
 * @param {Object} factA
 * @param {Object} factB
 */
export function assertDifferentFactId(factA, factB) {
  if (factA.factId === factB.factId) {
    throw new Error(`Expected different factId: ${factA.factId} === ${factB.factId}`);
  }
}

/**
 * Assert approximate equality for floats
 * @param {number} actual
 * @param {number} expected
 * @param {number} [epsilon=0.001]
 */
export function assertApproxEqual(actual, expected, epsilon = 0.001) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`Expected ${expected} ± ${epsilon}, got ${actual}`);
  }
}

/**
 * Create a batch of test facts
 * @param {number} count
 * @param {string} [predicateBase='fact']
 * @returns {Object[]}
 */
export function createTestFactBatch(count, predicateBase = 'fact') {
  const facts = [];
  for (let i = 0; i < count; i++) {
    facts.push(createTestFact(predicateBase, {
      id: `${i}`,
      value: `value_${i}`
    }));
  }
  return facts;
}
