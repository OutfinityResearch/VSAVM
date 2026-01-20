/**
 * Pattern Generators
 * General pattern generation for compression and learning tests
 */

/**
 * Generate repeating pattern
 * @param {Array} pattern - Base pattern
 * @param {number} repetitions - Number of repetitions
 * @returns {Array}
 */
export function repeatPattern(pattern, repetitions) {
  const result = [];
  for (let i = 0; i < repetitions; i++) {
    result.push(...pattern);
  }
  return result;
}

/**
 * Generate alternating pattern
 * @param {*} a - First value
 * @param {*} b - Second value
 * @param {number} length - Total length
 * @returns {Array}
 */
export function alternatingPattern(a, b, length) {
  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(i % 2 === 0 ? a : b);
  }
  return result;
}

/**
 * Generate cyclic pattern with period
 * @param {Array} cycle - Values in one cycle
 * @param {number} length - Total length
 * @returns {Array}
 */
export function cyclicPattern(cycle, length) {
  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(cycle[i % cycle.length]);
  }
  return result;
}

/**
 * Generate nested structure pattern
 * @param {number} depth - Nesting depth
 * @param {number} width - Children per node
 * @returns {Object}
 */
export function nestedPattern(depth, width) {
  if (depth === 0) {
    return { type: 'leaf', value: 1 };
  }
  
  const children = [];
  for (let i = 0; i < width; i++) {
    children.push(nestedPattern(depth - 1, width));
  }
  
  return { type: 'node', children };
}

/**
 * Generate compression test cases
 * @returns {Array<{name: string, data: *, expectedRatio: number}>}
 */
export function generateCompressionTestCases() {
  return [
    {
      name: 'highly_repetitive',
      data: repeatPattern([1, 2, 3], 100),
      expectedRatio: 0.9,  // Should compress very well
      description: 'Simple repeating pattern'
    },
    {
      name: 'alternating',
      data: alternatingPattern('A', 'B', 200),
      expectedRatio: 0.8,
      description: 'Two-value alternation'
    },
    {
      name: 'cyclic_5',
      data: cyclicPattern([1, 2, 3, 4, 5], 100),
      expectedRatio: 0.85,
      description: '5-element cycle'
    },
    {
      name: 'nested_3x3',
      data: nestedPattern(3, 3),
      expectedRatio: 0.7,
      description: 'Nested tree structure'
    },
    {
      name: 'random_like',
      data: pseudoRandomSequence(100, 42),
      expectedRatio: 0.1,  // Should not compress well
      description: 'Pseudo-random (incompressible)'
    }
  ];
}

/**
 * Generate pseudo-random sequence (deterministic)
 * @param {number} length 
 * @param {number} seed 
 * @returns {number[]}
 */
export function pseudoRandomSequence(length, seed) {
  const result = [];
  let state = seed;
  
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    result.push(state % 256);
  }
  
  return result;
}

/**
 * Calculate pattern entropy (bits per element)
 * @param {Array} data
 * @returns {number}
 */
export function calculateEntropy(data) {
  const freq = new Map();
  
  for (const item of data) {
    const key = JSON.stringify(item);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  
  let entropy = 0;
  const n = data.length;
  
  for (const count of freq.values()) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  
  return entropy;
}

/**
 * Calculate theoretical compression ratio based on entropy
 * @param {Array} data
 * @returns {number}
 */
export function theoreticalCompressionRatio(data) {
  const entropy = calculateEntropy(data);
  const uniqueValues = new Set(data.map(x => JSON.stringify(x))).size;
  const maxEntropy = Math.log2(uniqueValues);
  
  if (maxEntropy === 0) return 1;
  
  return 1 - (entropy / maxEntropy);
}
