/**
 * Canonicalizer Strategy Interface
 * Per DS006: Pluggable canonicalization for term normalization
 */

/**
 * Base Canonicalizer Strategy class
 * Implementations: StrictCanonicalizer, FuzzyCanonicalizer, IdentityCanonicalizer
 */
export class CanonicalizerStrategy {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Canonicalize a term (deterministic)
   * @param {Object} term
   * @returns {Object} Canonical term
   */
  canonicalize(term) {
    throw new Error('Not implemented: canonicalize');
  }

  /**
   * Check if two terms are canonically equivalent
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  areEquivalent(a, b) {
    throw new Error('Not implemented: areEquivalent');
  }

  /**
   * Generate stable hash for canonical term
   * @param {Object} term
   * @returns {string}
   */
  hash(term) {
    throw new Error('Not implemented: hash');
  }
}
