/**
 * VSA Strategy Interface
 * Per DS006: Pluggable VSA implementation for hypervector operations
 */

/**
 * @typedef {Object} HyperVector
 * @property {number} dimensions
 * @property {ArrayBuffer|Float32Array|Uint8Array} data
 */

/**
 * Base VSA Strategy class
 * Implementations: BinarySparseVSA, BipolarDenseVSA, HolographicVSA, MockVSA
 */
export class VSAStrategy {
  /**
   * @param {string} name - Strategy name
   * @param {number} dimensions - Vector dimensionality
   * @param {number} [similarityThreshold=0.35]
   */
  constructor(name, dimensions, similarityThreshold = 0.35) {
    this.name = name;
    this.dimensions = dimensions;
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Generate deterministic hypervector from seed string
   * @param {string} seed
   * @returns {Object} HyperVector
   */
  generate(seed) {
    throw new Error('Not implemented: generate');
  }

  /**
   * Bundle multiple vectors (superposition/addition)
   * @param {Object[]} vectors - Array of HyperVectors
   * @returns {Object} HyperVector
   */
  bundle(vectors) {
    throw new Error('Not implemented: bundle');
  }

  /**
   * Bind two vectors (role assignment/multiplication)
   * @param {Object} a
   * @param {Object} b
   * @returns {Object} HyperVector
   */
  bind(a, b) {
    throw new Error('Not implemented: bind');
  }

  /**
   * Unbind (inverse of bind)
   * @param {Object} bound
   * @param {Object} key
   * @returns {Object} HyperVector
   */
  unbind(bound, key) {
    throw new Error('Not implemented: unbind');
  }

  /**
   * Compute similarity between two vectors (0 to 1)
   * @param {Object} a
   * @param {Object} b
   * @returns {number}
   */
  similarity(a, b) {
    throw new Error('Not implemented: similarity');
  }

  /**
   * Check if two vectors are similar enough
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  isSimilar(a, b) {
    return this.similarity(a, b) >= this.similarityThreshold;
  }

  /**
   * Create an empty/zero vector
   * @returns {Object} HyperVector
   */
  zero() {
    throw new Error('Not implemented: zero');
  }
}
