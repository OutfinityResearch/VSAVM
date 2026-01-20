/**
 * Binary Sparse VSA Strategy
 * Per DS006: Binary sparse hypervector implementation
 */

import { VSAStrategy } from '../../core/interfaces/vsa-strategy.mjs';
import { stringToSeed } from '../../core/hash.mjs';

/**
 * Binary sparse hypervectors
 * Each vector is represented as a set of active indices (sparse representation)
 */
export class BinarySparseVSA extends VSAStrategy {
  /**
   * @param {number} [dimensions=10000]
   * @param {number} [sparsity=0.5] - Fraction of dimensions that are 1
   * @param {number} [similarityThreshold=0.35]
   */
  constructor(dimensions = 10000, sparsity = 0.5, similarityThreshold = 0.35) {
    super('binary-sparse', dimensions, similarityThreshold);
    this.sparsity = sparsity;
    this.activeCount = Math.floor(dimensions * sparsity);
  }

  /**
   * Generate a sparse binary vector from seed
   * Returns set of active indices
   */
  generate(seed) {
    const numericSeed = stringToSeed(seed);
    const active = new Set();
    
    // Use Fisher-Yates-like selection for uniform distribution
    let state = numericSeed;
    const candidates = [];
    
    // Generate enough pseudo-random indices
    for (let i = 0; i < this.activeCount * 2; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      candidates.push(state % this.dimensions);
    }
    
    // Take unique ones
    for (const idx of candidates) {
      active.add(idx);
      if (active.size >= this.activeCount) break;
    }
    
    // Fill remaining if needed
    state = numericSeed ^ 0xDEADBEEF;
    while (active.size < this.activeCount) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      active.add(state % this.dimensions);
    }
    
    return {
      dimensions: this.dimensions,
      data: active,
      encoding: 'sparse-binary'
    };
  }

  /**
   * Bundle by majority vote (OR for two vectors)
   */
  bundle(vectors) {
    if (vectors.length === 0) return this.zero();
    if (vectors.length === 1) return vectors[0];
    
    // Count occurrences per dimension
    const counts = new Map();
    
    for (const vec of vectors) {
      for (const idx of vec.data) {
        counts.set(idx, (counts.get(idx) || 0) + 1);
      }
    }
    
    // Keep dimensions with majority votes
    const threshold = vectors.length / 2;
    const result = new Set();
    
    for (const [idx, count] of counts) {
      if (count > threshold) {
        result.add(idx);
      }
    }
    
    // Trim or expand to target sparsity
    const resultArray = [...result].sort((a, b) => {
      const countDiff = (counts.get(b) || 0) - (counts.get(a) || 0);
      return countDiff !== 0 ? countDiff : a - b;
    });
    
    const finalSet = new Set(resultArray.slice(0, this.activeCount));
    
    return {
      dimensions: this.dimensions,
      data: finalSet,
      encoding: 'sparse-binary'
    };
  }

  /**
   * Bind by XOR (symmetric difference)
   */
  bind(a, b) {
    const result = new Set();
    
    // XOR: elements in a or b but not both
    for (const idx of a.data) {
      if (!b.data.has(idx)) {
        result.add(idx);
      }
    }
    for (const idx of b.data) {
      if (!a.data.has(idx)) {
        result.add(idx);
      }
    }
    
    return {
      dimensions: this.dimensions,
      data: result,
      encoding: 'sparse-binary'
    };
  }

  /**
   * Unbind is same as bind (XOR is self-inverse)
   */
  unbind(bound, key) {
    return this.bind(bound, key);
  }

  /**
   * Jaccard similarity (intersection over union)
   */
  similarity(a, b) {
    let intersection = 0;
    
    for (const idx of a.data) {
      if (b.data.has(idx)) {
        intersection++;
      }
    }
    
    const union = a.data.size + b.data.size - intersection;
    
    if (union === 0) return 1;
    return intersection / union;
  }

  /**
   * Zero vector (empty set)
   */
  zero() {
    return {
      dimensions: this.dimensions,
      data: new Set(),
      encoding: 'sparse-binary'
    };
  }

  /**
   * Convert to dense binary array (for storage/interop)
   */
  toDense(vector) {
    const dense = new Uint8Array(Math.ceil(this.dimensions / 8));
    
    for (const idx of vector.data) {
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      dense[byteIdx] |= (1 << bitIdx);
    }
    
    return dense;
  }

  /**
   * Convert from dense binary array
   */
  fromDense(dense) {
    const active = new Set();
    
    for (let byteIdx = 0; byteIdx < dense.length; byteIdx++) {
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        if (dense[byteIdx] & (1 << bitIdx)) {
          const idx = byteIdx * 8 + bitIdx;
          if (idx < this.dimensions) {
            active.add(idx);
          }
        }
      }
    }
    
    return {
      dimensions: this.dimensions,
      data: active,
      encoding: 'sparse-binary'
    };
  }
}
