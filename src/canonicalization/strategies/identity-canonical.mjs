/**
 * Identity Canonicalizer Strategy
 * Per DS006: Pass-through canonicalizer for testing
 * Returns terms unchanged, useful for debugging and testing
 */

import { CanonicalizerStrategy } from '../../core/interfaces/canonicalizer-strategy.mjs';
import { termToString, isAtom, isStruct } from '../../core/types/terms.mjs';
import { computeHash } from '../../core/hash.mjs';

/**
 * Identity canonicalizer - returns terms unchanged
 * Useful for testing and debugging
 */
export class IdentityCanonicalizer extends CanonicalizerStrategy {
  constructor() {
    super('identity');
  }

  /**
   * Return term unchanged
   * @param {Object} term
   * @returns {Object} Same term (identity)
   */
  canonicalize(term) {
    // Deep clone to prevent mutation issues
    return this._cloneTerm(term);
  }

  /**
   * Check if two terms are equal (exact match)
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  areEquivalent(a, b) {
    return this.hash(a) === this.hash(b);
  }

  /**
   * Generate hash from term string representation
   * @param {Object} term
   * @returns {string}
   */
  hash(term) {
    const str = termToString(term);
    return computeHash(str);
  }

  /**
   * Deep clone a term
   * @private
   */
  _cloneTerm(term) {
    if (!term) return term;

    if (isAtom(term)) {
      return {
        type: term.type,
        value: this._cloneValue(term.value)
      };
    }

    if (isStruct(term)) {
      const clonedSlots = new Map();
      for (const [name, value] of term.slots) {
        clonedSlots.set(name, this._cloneTerm(value));
      }
      return {
        structType: { ...term.structType },
        slots: clonedSlots
      };
    }

    // Unknown term type, return as-is
    return term;
  }

  /**
   * Clone a value (handles objects and primitives)
   * @private
   */
  _cloneValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return [...value];
    return { ...value };
  }
}

export default IdentityCanonicalizer;
