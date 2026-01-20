/**
 * Pattern Miner
 * Per DS005: Bottom-up pattern discovery from sequences
 * Detects arithmetic, geometric, modular, fibonacci, polynomial patterns
 */

/**
 * Pattern detection result
 * @typedef {Object} PatternResult
 * @property {string} type - Pattern type identifier
 * @property {Object} rule - Detected rule parameters
 * @property {number} confidence - Detection confidence (0-1)
 * @property {number} support - Number of supporting elements
 * @property {string|null} error - Error message if detection failed
 */

/**
 * Pattern Miner
 * Discovers recurring patterns in numeric sequences
 */
export class PatternMiner {
  /**
   * @param {Object} [config]
   * @param {number} [config.minConfidence=0.8] - Minimum confidence threshold
   * @param {number} [config.tolerance=0.001] - Numeric tolerance for comparisons
   */
  constructor(config = {}) {
    this.minConfidence = config.minConfidence ?? 0.8;
    this.tolerance = config.tolerance ?? 0.001;
  }

  /**
   * Detect pattern in a numeric sequence
   * @param {number[]} sequence - Input sequence
   * @param {string} [hint] - Optional hint about expected pattern type
   * @returns {PatternResult}
   */
  detect(sequence, hint = null) {
    if (!Array.isArray(sequence) || sequence.length < 2) {
      return {
        type: null,
        rule: null,
        confidence: 0,
        support: 0,
        error: 'Sequence must have at least 2 elements'
      };
    }

    // Try pattern detection in order of likelihood/complexity
    const detectors = [
      ['arithmetic', () => this.detectArithmetic(sequence)],
      ['geometric', () => this.detectGeometric(sequence)],
      ['fibonacci', () => this.detectFibonacci(sequence)],
      ['modular', () => this.detectModular(sequence)],
      ['polynomial', () => this.detectPolynomial(sequence)]
    ];

    // If hint provided, try that first
    if (hint) {
      const hintDetector = detectors.find(([type]) => type === hint);
      if (hintDetector) {
        const result = hintDetector[1]();
        if (result.confidence >= this.minConfidence) {
          return result;
        }
      }
    }

    // Try all detectors and return best match
    let best = { type: null, rule: null, confidence: 0, support: 0 };

    for (const [, detector] of detectors) {
      const result = detector();
      if (result.confidence > best.confidence) {
        best = result;
      }
    }

    if (best.confidence < this.minConfidence) {
      return {
        type: null,
        rule: null,
        confidence: best.confidence,
        support: 0,
        error: 'No pattern detected with sufficient confidence'
      };
    }

    return best;
  }

  /**
   * Detect arithmetic progression: a, a+d, a+2d, ...
   * @param {number[]} sequence
   * @returns {PatternResult}
   */
  detectArithmetic(sequence) {
    if (sequence.length < 2) {
      return { type: 'arithmetic_progression', rule: null, confidence: 0, support: 0 };
    }

    const start = sequence[0];
    const difference = sequence[1] - sequence[0];
    let matchCount = 0;

    for (let i = 0; i < sequence.length; i++) {
      const expected = start + i * difference;
      if (Math.abs(sequence[i] - expected) < this.tolerance) {
        matchCount++;
      }
    }

    const confidence = matchCount / sequence.length;

    return {
      type: 'arithmetic_progression',
      rule: { type: 'arithmetic_progression', start, difference },
      confidence,
      support: matchCount
    };
  }

  /**
   * Detect geometric progression: a, a*r, a*r^2, ...
   * @param {number[]} sequence
   * @returns {PatternResult}
   */
  detectGeometric(sequence) {
    if (sequence.length < 2 || sequence[0] === 0) {
      return { type: 'geometric_progression', rule: null, confidence: 0, support: 0 };
    }

    const start = sequence[0];
    const ratio = sequence[1] / sequence[0];

    // Avoid divide-by-zero and infinite ratios
    if (!Number.isFinite(ratio) || ratio === 0) {
      return { type: 'geometric_progression', rule: null, confidence: 0, support: 0 };
    }

    let matchCount = 0;
    let current = start;

    for (let i = 0; i < sequence.length; i++) {
      const expected = start * Math.pow(ratio, i);
      const relativeError = Math.abs(sequence[i] - expected) / (Math.abs(expected) + this.tolerance);
      if (relativeError < this.tolerance || Math.abs(sequence[i] - expected) < this.tolerance) {
        matchCount++;
      }
    }

    const confidence = matchCount / sequence.length;

    return {
      type: 'geometric_progression',
      rule: { type: 'geometric_progression', start, ratio },
      confidence,
      support: matchCount
    };
  }

  /**
   * Detect Fibonacci-like sequence: f(n) = f(n-1) + f(n-2)
   * @param {number[]} sequence
   * @returns {PatternResult}
   */
  detectFibonacci(sequence) {
    if (sequence.length < 3) {
      return { type: 'fibonacci', rule: null, confidence: 0, support: 0 };
    }

    const a = sequence[0];
    const b = sequence[1];
    let matchCount = 2; // First two elements always match by definition

    // Generate expected fibonacci sequence and compare
    const expected = [a, b];
    for (let i = 2; i < sequence.length; i++) {
      expected.push(expected[i - 1] + expected[i - 2]);
    }

    for (let i = 2; i < sequence.length; i++) {
      if (Math.abs(sequence[i] - expected[i]) < this.tolerance) {
        matchCount++;
      }
    }

    const confidence = matchCount / sequence.length;

    return {
      type: 'fibonacci',
      rule: { type: 'fibonacci', a, b },
      confidence,
      support: matchCount
    };
  }

  /**
   * Detect modular arithmetic: (start + i*increment) % modulus
   * @param {number[]} sequence
   * @returns {PatternResult}
   */
  detectModular(sequence) {
    if (sequence.length < 3) {
      return { type: 'modular_arithmetic', rule: null, confidence: 0, support: 0 };
    }

    // Try to detect modulus from the sequence
    // Look for the maximum value + 1 as potential modulus
    const maxVal = Math.max(...sequence);
    const candidates = [];

    // Try common moduli and detected ones
    for (let mod = maxVal + 1; mod <= maxVal + 10; mod++) {
      const detected = this.tryModular(sequence, mod);
      if (detected.confidence > 0.5) {
        candidates.push(detected);
      }
    }

    // Also try small moduli
    for (let mod = 2; mod <= 20; mod++) {
      const detected = this.tryModular(sequence, mod);
      if (detected.confidence > 0.5) {
        candidates.push(detected);
      }
    }

    // Return best candidate
    if (candidates.length === 0) {
      return { type: 'modular_arithmetic', rule: null, confidence: 0, support: 0 };
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0];
  }

  /**
   * Try to fit modular arithmetic with given modulus
   * @private
   */
  tryModular(sequence, modulus) {
    const start = sequence[0];

    // Calculate likely increment from first two elements
    let increment = ((sequence[1] - sequence[0]) % modulus + modulus) % modulus;

    let matchCount = 0;
    for (let i = 0; i < sequence.length; i++) {
      const expected = ((start + i * increment) % modulus + modulus) % modulus;
      if (Math.abs(sequence[i] - expected) < this.tolerance) {
        matchCount++;
      }
    }

    const confidence = matchCount / sequence.length;

    return {
      type: 'modular_arithmetic',
      rule: { type: 'modular_arithmetic', start, increment, modulus },
      confidence,
      support: matchCount
    };
  }

  /**
   * Detect polynomial sequence: f(n) = an^2 + bn + c
   * @param {number[]} sequence
   * @returns {PatternResult}
   */
  detectPolynomial(sequence) {
    if (sequence.length < 3) {
      return { type: 'polynomial', rule: null, confidence: 0, support: 0 };
    }

    // Use first 3 points to solve for a, b, c
    // f(0) = c = seq[0]
    // f(1) = a + b + c = seq[1]
    // f(2) = 4a + 2b + c = seq[2]
    const c = sequence[0];
    const eq1 = sequence[1] - c; // a + b
    const eq2 = sequence[2] - c; // 4a + 2b

    // Solve: 4a + 2b = eq2, a + b = eq1
    // 4a + 2b = eq2
    // 2a + 2b = 2*eq1
    // 2a = eq2 - 2*eq1
    const a = (eq2 - 2 * eq1) / 2;
    const b = eq1 - a;

    // Verify against all points
    let matchCount = 0;
    for (let n = 0; n < sequence.length; n++) {
      const expected = a * n * n + b * n + c;
      if (Math.abs(sequence[n] - expected) < this.tolerance) {
        matchCount++;
      }
    }

    const confidence = matchCount / sequence.length;

    return {
      type: 'polynomial',
      rule: { type: 'polynomial', a, b, c },
      confidence,
      support: matchCount
    };
  }

  /**
   * Mine multiple patterns from sequence
   * Returns all patterns above threshold
   * @param {number[]} sequence
   * @returns {PatternResult[]}
   */
  mineAll(sequence) {
    const results = [];

    const detectors = [
      () => this.detectArithmetic(sequence),
      () => this.detectGeometric(sequence),
      () => this.detectFibonacci(sequence),
      () => this.detectModular(sequence),
      () => this.detectPolynomial(sequence)
    ];

    for (const detector of detectors) {
      const result = detector();
      if (result.confidence >= this.minConfidence && result.rule) {
        results.push(result);
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * Predict next value given detected pattern
   * @param {Object} rule - Detected rule
   * @param {number[]} sequence - Existing sequence
   * @returns {number|null}
   */
  predict(rule, sequence) {
    if (!rule || !rule.type) return null;

    const n = sequence.length;

    switch (rule.type) {
      case 'arithmetic_progression':
        return rule.start + n * rule.difference;

      case 'geometric_progression':
        return rule.start * Math.pow(rule.ratio, n);

      case 'fibonacci':
        if (n < 2) return null;
        return sequence[n - 1] + sequence[n - 2];

      case 'modular_arithmetic':
        return ((rule.start + n * rule.increment) % rule.modulus + rule.modulus) % rule.modulus;

      case 'polynomial':
        return rule.a * n * n + rule.b * n + rule.c;

      default:
        return null;
    }
  }
}

/**
 * Create a pattern miner
 * @param {Object} [config]
 * @returns {PatternMiner}
 */
export function createPatternMiner(config = {}) {
  return new PatternMiner(config);
}

export default { PatternMiner, createPatternMiner };
