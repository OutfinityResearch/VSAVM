/**
 * Arithmetic Sequence Generators
 * Generates deterministic synthetic data for rule learning tests
 */

/**
 * Generate arithmetic sequence: a, a+d, a+2d, ...
 * @param {number} start - First term
 * @param {number} difference - Common difference
 * @param {number} length - Number of terms
 * @returns {number[]}
 */
export function arithmeticSequence(start, difference, length) {
  const seq = [];
  for (let i = 0; i < length; i++) {
    seq.push(start + i * difference);
  }
  return seq;
}

/**
 * Generate geometric sequence: a, a*r, a*r^2, ...
 * @param {number} start - First term
 * @param {number} ratio - Common ratio
 * @param {number} length - Number of terms
 * @returns {number[]}
 */
export function geometricSequence(start, ratio, length) {
  const seq = [];
  let current = start;
  for (let i = 0; i < length; i++) {
    seq.push(current);
    current *= ratio;
  }
  return seq;
}

/**
 * Generate modular arithmetic sequence
 * @param {number} start - Initial value
 * @param {number} increment - Step size
 * @param {number} modulus - Modulus
 * @param {number} length - Number of terms
 * @returns {number[]}
 */
export function modularSequence(start, increment, modulus, length) {
  const seq = [];
  let current = start % modulus;
  for (let i = 0; i < length; i++) {
    seq.push(current);
    current = (current + increment) % modulus;
  }
  return seq;
}

/**
 * Generate Fibonacci-like sequence
 * @param {number} a - First term
 * @param {number} b - Second term
 * @param {number} length - Number of terms
 * @returns {number[]}
 */
export function fibonacciSequence(a, b, length) {
  const seq = [a, b];
  for (let i = 2; i < length; i++) {
    seq.push(seq[i - 1] + seq[i - 2]);
  }
  return seq.slice(0, length);
}

/**
 * Generate polynomial sequence: f(n) = an^2 + bn + c
 * @param {number} a - Quadratic coefficient
 * @param {number} b - Linear coefficient
 * @param {number} c - Constant
 * @param {number} length - Number of terms
 * @returns {number[]}
 */
export function polynomialSequence(a, b, c, length) {
  const seq = [];
  for (let n = 0; n < length; n++) {
    seq.push(a * n * n + b * n + c);
  }
  return seq;
}

/**
 * Generate test cases for arithmetic rule learning
 * @param {number} count - Number of test cases
 * @param {number} length - Sequence length
 * @returns {Array<{name: string, sequence: number[], type: string, rule: Object}>}
 */
export function generateArithmeticTestCases(count, length) {
  const cases = [];
  const seeder = createSeeder(42); // Deterministic
  
  for (let i = 0; i < count; i++) {
    const start = seeder.nextInt(-50, 50);
    const diff = seeder.nextInt(-10, 10);
    
    cases.push({
      name: `arithmetic_${i}`,
      sequence: arithmeticSequence(start, diff, length),
      type: 'arithmetic',
      rule: {
        type: 'arithmetic_progression',
        start,
        difference: diff
      }
    });
  }
  
  return cases;
}

/**
 * Generate mixed test cases
 * @param {number} length - Sequence length
 * @returns {Array}
 */
export function generateMixedTestCases(length) {
  return [
    {
      name: 'simple_arithmetic',
      sequence: arithmeticSequence(1, 3, length),
      type: 'arithmetic',
      rule: { type: 'arithmetic_progression', start: 1, difference: 3 }
    },
    {
      name: 'negative_arithmetic',
      sequence: arithmeticSequence(20, -2, length),
      type: 'arithmetic',
      rule: { type: 'arithmetic_progression', start: 20, difference: -2 }
    },
    {
      name: 'geometric_double',
      sequence: geometricSequence(1, 2, Math.min(length, 10)),
      type: 'geometric',
      rule: { type: 'geometric_progression', start: 1, ratio: 2 }
    },
    {
      name: 'modular_7',
      sequence: modularSequence(0, 3, 7, length),
      type: 'modular',
      rule: { type: 'modular_arithmetic', start: 0, increment: 3, modulus: 7 }
    },
    {
      name: 'fibonacci',
      sequence: fibonacciSequence(1, 1, length),
      type: 'fibonacci',
      rule: { type: 'fibonacci', a: 1, b: 1 }
    },
    {
      name: 'squares',
      sequence: polynomialSequence(1, 0, 0, length),
      type: 'polynomial',
      rule: { type: 'polynomial', a: 1, b: 0, c: 0 }
    }
  ];
}

/**
 * Simple deterministic random number generator
 */
function createSeeder(seed) {
  let state = seed;
  
  return {
    next() {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    },
    nextInt(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  };
}
