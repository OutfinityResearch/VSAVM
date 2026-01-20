/**
 * Arithmetic Rule Learning Test
 * Tests the system's ability to learn arithmetic patterns and rules
 */

class ArithmeticSequenceGenerator {
  static generateArithmeticSequence(start, difference, length) {
    const sequence = [];
    for (let i = 0; i < length; i++) {
      sequence.push(start + i * difference);
    }
    return sequence;
  }

  static generateGeometricSequence(start, ratio, length) {
    const sequence = [];
    let current = start;
    for (let i = 0; i < length; i++) {
      sequence.push(current);
      current *= ratio;
    }
    return sequence;
  }

  static generateModularSequence(start, increment, modulus, length) {
    const sequence = [];
    let current = start;
    for (let i = 0; i < length; i++) {
      sequence.push(current);
      current = (current + increment) % modulus;
    }
    return sequence;
  }
}

class MockVSAVM {
  constructor() {
    this.learnedRules = [];
    this.facts = [];
  }

  // Mock implementation for testing
  async learnFromSequence(sequence, sequenceType) {
    // Simulate rule learning
    await this.delay(100 + Math.random() * 200);

    switch (sequenceType) {
      case 'arithmetic':
        return this.learnArithmeticRule(sequence);
      case 'geometric':
        return this.learnGeometricRule(sequence);
      case 'modular':
        return this.learnModularRule(sequence);
      default:
        throw new Error(`Unknown sequence type: ${sequenceType}`);
    }
  }

  learnArithmeticRule(sequence) {
    if (sequence.length < 2) return { success: false, rule: null };

    const differences = [];
    for (let i = 1; i < sequence.length; i++) {
      differences.push(sequence[i] - sequence[i-1]);
    }

    // Check if all differences are the same (arithmetic sequence)
    const isArithmetic = differences.every(d => d === differences[0]);
    
    if (isArithmetic) {
      const rule = {
        type: 'arithmetic_progression',
        start: sequence[0],
        difference: differences[0],
        confidence: 0.95
      };
      
      this.learnedRules.push(rule);
      return { success: true, rule, accuracy: 0.95 };
    }

    return { success: false, rule: null, accuracy: 0.0 };
  }

  learnGeometricRule(sequence) {
    if (sequence.length < 2 || sequence.some(x => x === 0)) {
      return { success: false, rule: null, accuracy: 0.0 };
    }

    const ratios = [];
    for (let i = 1; i < sequence.length; i++) {
      ratios.push(sequence[i] / sequence[i-1]);
    }

    // Check if all ratios are approximately the same
    const avgRatio = ratios.reduce((a, b) => a + b) / ratios.length;
    const isGeometric = ratios.every(r => Math.abs(r - avgRatio) < 0.01);

    if (isGeometric) {
      const rule = {
        type: 'geometric_progression',
        start: sequence[0],
        ratio: avgRatio,
        confidence: 0.90
      };
      
      this.learnedRules.push(rule);
      return { success: true, rule, accuracy: 0.90 };
    }

    return { success: false, rule: null, accuracy: 0.0 };
  }

  learnModularRule(sequence) {
    // Simplified modular arithmetic detection
    const maxMod = 20;
    
    for (let mod = 2; mod <= maxMod; mod++) {
      const modSequence = sequence.map(x => x % mod);
      const differences = [];
      
      for (let i = 1; i < modSequence.length; i++) {
        differences.push((modSequence[i] - modSequence[i-1] + mod) % mod);
      }

      if (differences.length > 0 && differences.every(d => d === differences[0])) {
        const rule = {
          type: 'modular_arithmetic',
          start: sequence[0] % mod,
          increment: differences[0],
          modulus: mod,
          confidence: 0.85
        };
        
        this.learnedRules.push(rule);
        return { success: true, rule, accuracy: 0.85 };
      }
    }

    return { success: false, rule: null, accuracy: 0.0 };
  }

  async predictNext(sequence, count = 1) {
    await this.delay(50);
    
    // Find applicable rule
    const applicableRule = this.findApplicableRule(sequence);
    if (!applicableRule) {
      return { predictions: [], confidence: 0.0 };
    }

    const predictions = [];
    const lastValue = sequence[sequence.length - 1];

    for (let i = 0; i < count; i++) {
      let nextValue;
      
      switch (applicableRule.type) {
        case 'arithmetic_progression':
          nextValue = lastValue + (i + 1) * applicableRule.difference;
          break;
        case 'geometric_progression':
          nextValue = lastValue * Math.pow(applicableRule.ratio, i + 1);
          break;
        case 'modular_arithmetic':
          const currentPos = sequence.length + i;
          nextValue = (applicableRule.start + currentPos * applicableRule.increment) % applicableRule.modulus;
          break;
        default:
          nextValue = lastValue;
      }
      
      predictions.push(nextValue);
    }

    return { predictions, confidence: applicableRule.confidence };
  }

  findApplicableRule(sequence) {
    // Simple rule matching - in real implementation this would be more sophisticated
    return this.learnedRules.find(rule => {
      if (rule.type === 'arithmetic_progression') {
        return sequence.length >= 2 && 
               (sequence[1] - sequence[0]) === rule.difference;
      }
      return false;
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMemoryUsage() {
    // Mock memory usage calculation
    const baseMemory = 10; // MB
    const ruleMemory = this.learnedRules.length * 0.1;
    const factMemory = this.facts.length * 0.05;
    return baseMemory + ruleMemory + factMemory;
  }
}

async function runTest(config) {
  const vsavm = new MockVSAVM();
  const results = {
    metrics: {
      accuracy: 0,
      rules_learned: 0,
      memory_usage_mb: 0,
      generalization_accuracy: 0
    },
    details: {
      test_cases: [],
      learned_rules: [],
      failed_cases: []
    }
  };

  // Test cases
  const testCases = [
    {
      name: 'simple_arithmetic',
      sequence: ArithmeticSequenceGenerator.generateArithmeticSequence(1, 3, 10),
      type: 'arithmetic',
      expected_rule: 'arithmetic_progression'
    },
    {
      name: 'negative_arithmetic',
      sequence: ArithmeticSequenceGenerator.generateArithmeticSequence(20, -2, 8),
      type: 'arithmetic', 
      expected_rule: 'arithmetic_progression'
    },
    {
      name: 'geometric_growth',
      sequence: ArithmeticSequenceGenerator.generateGeometricSequence(2, 3, 6),
      type: 'geometric',
      expected_rule: 'geometric_progression'
    },
    {
      name: 'modular_sequence',
      sequence: ArithmeticSequenceGenerator.generateModularSequence(0, 3, 7, 10),
      type: 'modular',
      expected_rule: 'modular_arithmetic'
    }
  ];

  let totalAccuracy = 0;
  let successfulLearning = 0;

  // Run learning tests
  for (const testCase of testCases) {
    try {
      const learningResult = await vsavm.learnFromSequence(testCase.sequence, testCase.type);
      
      const testResult = {
        name: testCase.name,
        success: learningResult.success,
        accuracy: learningResult.accuracy || 0,
        learned_rule: learningResult.rule?.type || null,
        expected_rule: testCase.expected_rule
      };

      if (learningResult.success) {
        successfulLearning++;
        totalAccuracy += learningResult.accuracy;
        results.details.learned_rules.push(learningResult.rule);
      } else {
        results.details.failed_cases.push(testCase.name);
      }

      results.details.test_cases.push(testResult);

    } catch (error) {
      results.details.failed_cases.push({
        name: testCase.name,
        error: error.message
      });
    }
  }

  // Test generalization
  const generalizationTests = [
    {
      training: ArithmeticSequenceGenerator.generateArithmeticSequence(5, 4, 6),
      test: ArithmeticSequenceGenerator.generateArithmeticSequence(100, 4, 4)
    }
  ];

  let generalizationAccuracy = 0;
  for (const genTest of generalizationTests) {
    await vsavm.learnFromSequence(genTest.training, 'arithmetic');
    const prediction = await vsavm.predictNext(genTest.test.slice(0, 3), 1);
    
    if (prediction.predictions.length > 0) {
      const expected = genTest.test[3];
      const predicted = prediction.predictions[0];
      const accuracy = Math.abs(expected - predicted) < 0.01 ? 1.0 : 0.0;
      generalizationAccuracy += accuracy;
    }
  }
  generalizationAccuracy /= generalizationTests.length;

  // Calculate final metrics
  results.metrics.accuracy = successfulLearning > 0 ? totalAccuracy / successfulLearning : 0;
  results.metrics.rules_learned = successfulLearning;
  results.metrics.memory_usage_mb = vsavm.getMemoryUsage();
  results.metrics.generalization_accuracy = generalizationAccuracy;

  return results;
}

module.exports = { runTest, ArithmeticSequenceGenerator, MockVSAVM };
