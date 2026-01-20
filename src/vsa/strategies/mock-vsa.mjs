/**
 * Mock VSA Strategy for Testing
 * Per DS006: Deterministic mock for unit tests
 */

import { VSAStrategy } from '../../core/interfaces/vsa-strategy.mjs';
import { stringToSeed } from '../../core/hash.mjs';

/**
 * Mock VSA that uses deterministic hashing for reproducible tests
 */
export class MockVSA extends VSAStrategy {
  constructor(dimensions = 1000, similarityThreshold = 0.35) {
    super('mock', dimensions, similarityThreshold);
    this.cache = new Map();
  }

  /**
   * Generate a deterministic hypervector from seed
   * Uses seeded pseudo-random number generator
   */
  generate(seed) {
    // Check cache
    if (this.cache.has(seed)) {
      return this.cache.get(seed);
    }
    
    const data = new Float32Array(this.dimensions);
    const numericSeed = stringToSeed(seed);
    
    // Simple LCG for deterministic generation
    let state = numericSeed;
    for (let i = 0; i < this.dimensions; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      // Generate value in [-1, 1]
      data[i] = (state / 0x3fffffff) - 1;
    }
    
    // Normalize to unit length
    const norm = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < this.dimensions; i++) {
      data[i] /= norm;
    }
    
    const vector = { dimensions: this.dimensions, data };
    this.cache.set(seed, vector);
    return vector;
  }

  /**
   * Bundle vectors by element-wise sum and normalize
   */
  bundle(vectors) {
    if (vectors.length === 0) {
      return this.zero();
    }
    
    if (vectors.length === 1) {
      return vectors[0];
    }
    
    const result = new Float32Array(this.dimensions);
    
    for (const vec of vectors) {
      for (let i = 0; i < this.dimensions; i++) {
        result[i] += vec.data[i];
      }
    }
    
    // Normalize
    const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        result[i] /= norm;
      }
    }
    
    return { dimensions: this.dimensions, data: result };
  }

  /**
   * Bind vectors by element-wise multiplication
   */
  bind(a, b) {
    const result = new Float32Array(this.dimensions);
    
    for (let i = 0; i < this.dimensions; i++) {
      result[i] = a.data[i] * b.data[i];
    }
    
    // Normalize
    const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        result[i] /= norm;
      }
    }
    
    return { dimensions: this.dimensions, data: result };
  }

  /**
   * Unbind is same as bind for this mock (XOR-like)
   */
  unbind(bound, key) {
    return this.bind(bound, key);
  }

  /**
   * Cosine similarity
   */
  similarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < this.dimensions; i++) {
      dot += a.data[i] * b.data[i];
      normA += a.data[i] * a.data[i];
      normB += b.data[i] * b.data[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dot / (normA * normB);
  }

  /**
   * Create zero vector
   */
  zero() {
    return {
      dimensions: this.dimensions,
      data: new Float32Array(this.dimensions)
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}
