/**
 * Logical Reasoning Test
 * Tests the system's ability to perform deductive reasoning and maintain consistency
 */

class LogicalFact {
  constructor(predicate, args, polarity = true, confidence = 1.0) {
    this.predicate = predicate;
    this.args = args;
    this.polarity = polarity;
    this.confidence = confidence;
    this.id = this.generateId();
  }

  generateId() {
    const argsStr = this.args.join(',');
    return `${this.predicate}(${argsStr})${this.polarity ? '+' : '-'}`;
  }

  toString() {
    const prefix = this.polarity ? '' : '¬';
    return `${prefix}${this.predicate}(${this.args.join(', ')})`;
  }

  contradicts(other) {
    return this.predicate === other.predicate &&
           this.args.length === other.args.length &&
           this.args.every((arg, i) => arg === other.args[i]) &&
           this.polarity !== other.polarity;
  }
}

class LogicalRule {
  constructor(premises, conclusion, confidence = 1.0) {
    this.premises = premises; // Array of LogicalFact
    this.conclusion = conclusion; // LogicalFact
    this.confidence = confidence;
    this.id = this.generateId();
  }

  generateId() {
    const premisesStr = this.premises.map(p => p.toString()).join(' ∧ ');
    return `${premisesStr} → ${this.conclusion.toString()}`;
  }

  toString() {
    const premisesStr = this.premises.map(p => p.toString()).join(' ∧ ');
    return `${premisesStr} → ${this.conclusion.toString()}`;
  }

  canApply(facts) {
    return this.premises.every(premise => 
      facts.some(fact => this.factsMatch(premise, fact))
    );
  }

  factsMatch(premise, fact) {
    return premise.predicate === fact.predicate &&
           premise.polarity === fact.polarity &&
           this.unifyArgs(premise.args, fact.args);
  }

  unifyArgs(premiseArgs, factArgs) {
    if (premiseArgs.length !== factArgs.length) return false;
    
    const bindings = new Map();
    
    for (let i = 0; i < premiseArgs.length; i++) {
      const premiseArg = premiseArgs[i];
      const factArg = factArgs[i];
      
      if (this.isVariable(premiseArg)) {
        if (bindings.has(premiseArg)) {
          if (bindings.get(premiseArg) !== factArg) return false;
        } else {
          bindings.set(premiseArg, factArg);
        }
      } else if (premiseArg !== factArg) {
        return false;
      }
    }
    
    return true;
  }

  isVariable(arg) {
    return typeof arg === 'string' && arg.startsWith('?');
  }

  apply(facts) {
    if (!this.canApply(facts)) return null;

    // Find bindings
    const bindings = new Map();
    for (const premise of this.premises) {
      const matchingFact = facts.find(fact => this.factsMatch(premise, fact));
      if (matchingFact) {
        this.updateBindings(premise.args, matchingFact.args, bindings);
      }
    }

    // Apply bindings to conclusion
    const conclusionArgs = this.conclusion.args.map(arg => 
      this.isVariable(arg) ? bindings.get(arg) || arg : arg
    );

    return new LogicalFact(
      this.conclusion.predicate,
      conclusionArgs,
      this.conclusion.polarity,
      this.confidence
    );
  }

  updateBindings(premiseArgs, factArgs, bindings) {
    for (let i = 0; i < premiseArgs.length; i++) {
      if (this.isVariable(premiseArgs[i])) {
        bindings.set(premiseArgs[i], factArgs[i]);
      }
    }
  }
}

class MockVSAVMReasoner {
  constructor() {
    this.facts = new Map();
    this.rules = new Map();
    this.derivationHistory = [];
    this.contradictions = [];
  }

  addFact(fact) {
    // Check for contradictions
    for (const existingFact of this.facts.values()) {
      if (fact.contradicts(existingFact)) {
        this.contradictions.push({
          fact1: existingFact,
          fact2: fact,
          timestamp: Date.now()
        });
      }
    }

    this.facts.set(fact.id, fact);
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
  }

  async performInference(maxSteps = 10) {
    let step = 0;
    let newFactsAdded = true;

    while (newFactsAdded && step < maxSteps) {
      newFactsAdded = false;
      const currentFacts = Array.from(this.facts.values());

      for (const rule of this.rules.values()) {
        if (rule.canApply(currentFacts)) {
          const derivedFact = rule.apply(currentFacts);
          
          if (derivedFact && !this.facts.has(derivedFact.id)) {
            this.addFact(derivedFact);
            this.derivationHistory.push({
              step,
              rule: rule.id,
              derivedFact: derivedFact.id,
              timestamp: Date.now()
            });
            newFactsAdded = true;
          }
        }
      }

      step++;
      await this.delay(10); // Simulate processing time
    }

    return {
      stepsPerformed: step,
      factsDerivd: this.derivationHistory.length,
      contradictionsFound: this.contradictions.length
    };
  }

  checkConsistency() {
    const consistencyScore = this.contradictions.length === 0 ? 1.0 : 
      Math.max(0, 1 - (this.contradictions.length / this.facts.size));
    
    return {
      isConsistent: this.contradictions.length === 0,
      consistencyScore,
      contradictions: this.contradictions,
      totalFacts: this.facts.size
    };
  }

  queryFacts(predicate, args = null) {
    const results = [];
    
    for (const fact of this.facts.values()) {
      if (fact.predicate === predicate) {
        if (args === null || this.argsMatch(fact.args, args)) {
          results.push(fact);
        }
      }
    }

    return results;
  }

  argsMatch(factArgs, queryArgs) {
    if (factArgs.length !== queryArgs.length) return false;
    
    return factArgs.every((arg, i) => 
      queryArgs[i] === null || queryArgs[i] === arg
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMemoryUsage() {
    const factMemory = this.facts.size * 100; // bytes per fact
    const ruleMemory = this.rules.size * 200; // bytes per rule
    const historyMemory = this.derivationHistory.length * 50; // bytes per derivation
    return (factMemory + ruleMemory + historyMemory) / (1024 * 1024); // Convert to MB
  }

  reset() {
    this.facts.clear();
    this.rules.clear();
    this.derivationHistory = [];
    this.contradictions = [];
  }
}

class ReasoningTestGenerator {
  static generateTransitivityTest() {
    const facts = [
      new LogicalFact('parent', ['alice', 'bob']),
      new LogicalFact('parent', ['bob', 'charlie']),
      new LogicalFact('parent', ['charlie', 'david'])
    ];

    const rules = [
      new LogicalRule(
        [new LogicalFact('parent', ['?x', '?y']), new LogicalFact('parent', ['?y', '?z'])],
        new LogicalFact('grandparent', ['?x', '?z'])
      )
    ];

    return { facts, rules, expectedDerivations: 2 };
  }

  static generateImplicationTest() {
    const facts = [
      new LogicalFact('bird', ['tweety']),
      new LogicalFact('bird', ['polly']),
      new LogicalFact('penguin', ['pingu'])
    ];

    const rules = [
      new LogicalRule(
        [new LogicalFact('bird', ['?x'])],
        new LogicalFact('can_fly', ['?x'])
      ),
      new LogicalRule(
        [new LogicalFact('penguin', ['?x'])],
        new LogicalFact('bird', ['?x'])
      ),
      new LogicalRule(
        [new LogicalFact('penguin', ['?x'])],
        new LogicalFact('can_fly', ['?x'], false) // Penguins can't fly
      )
    ];

    return { facts, rules, expectedDerivations: 3, expectedContradictions: 1 };
  }

  static generateComplexReasoningTest() {
    const facts = [
      new LogicalFact('human', ['socrates']),
      new LogicalFact('human', ['plato']),
      new LogicalFact('philosopher', ['socrates']),
      new LogicalFact('philosopher', ['plato'])
    ];

    const rules = [
      new LogicalRule(
        [new LogicalFact('human', ['?x'])],
        new LogicalFact('mortal', ['?x'])
      ),
      new LogicalRule(
        [new LogicalFact('philosopher', ['?x']), new LogicalFact('mortal', ['?x'])],
        new LogicalFact('wise', ['?x'])
      )
    ];

    return { facts, rules, expectedDerivations: 4 };
  }
}

async function runTest(config) {
  const reasoner = new MockVSAVMReasoner();
  const results = {
    metrics: {
      inference_accuracy: 0,
      consistency_score: 0,
      reasoning_completeness: 0,
      memory_usage_mb: 0,
      inference_speed: 0
    },
    details: {
      test_cases: [],
      derivations: [],
      contradictions: [],
      performance_stats: {}
    }
  };

  const testCases = [
    {
      name: 'transitivity_reasoning',
      generator: ReasoningTestGenerator.generateTransitivityTest,
      weight: 1.0
    },
    {
      name: 'implication_with_contradiction',
      generator: ReasoningTestGenerator.generateImplicationTest,
      weight: 1.5
    },
    {
      name: 'complex_multi_step',
      generator: ReasoningTestGenerator.generateComplexReasoningTest,
      weight: 2.0
    }
  ];

  let totalAccuracy = 0;
  let totalConsistency = 0;
  let totalCompleteness = 0;
  let totalWeight = 0;
  let totalInferenceTime = 0;

  for (const testCase of testCases) {
    reasoner.reset();
    
    try {
      const testData = testCase.generator();
      
      // Add facts and rules
      testData.facts.forEach(fact => reasoner.addFact(fact));
      testData.rules.forEach(rule => reasoner.addRule(rule));

      // Perform inference
      const startTime = Date.now();
      const inferenceResult = await reasoner.performInference();
      const inferenceTime = Date.now() - startTime;

      // Check consistency
      const consistencyResult = reasoner.checkConsistency();

      // Calculate metrics for this test
      const expectedDerivations = testData.expectedDerivations || 0;
      const actualDerivations = inferenceResult.factsDerivd;
      const derivationAccuracy = expectedDerivations > 0 ? 
        Math.min(1.0, actualDerivations / expectedDerivations) : 1.0;

      const expectedContradictions = testData.expectedContradictions || 0;
      const actualContradictions = inferenceResult.contradictionsFound;
      const contradictionAccuracy = expectedContradictions === actualContradictions ? 1.0 : 0.5;

      const overallAccuracy = (derivationAccuracy + contradictionAccuracy) / 2;

      const testResult = {
        name: testCase.name,
        accuracy: overallAccuracy,
        consistency_score: consistencyResult.consistencyScore,
        derivations_expected: expectedDerivations,
        derivations_actual: actualDerivations,
        contradictions_expected: expectedContradictions,
        contradictions_actual: actualContradictions,
        inference_time_ms: inferenceTime,
        steps_performed: inferenceResult.stepsPerformed
      };

      results.details.test_cases.push(testResult);
      results.details.derivations.push(...reasoner.derivationHistory);
      results.details.contradictions.push(...reasoner.contradictions);

      // Accumulate weighted metrics
      totalAccuracy += overallAccuracy * testCase.weight;
      totalConsistency += consistencyResult.consistencyScore * testCase.weight;
      totalCompleteness += (actualDerivations > 0 ? 1.0 : 0.0) * testCase.weight;
      totalWeight += testCase.weight;
      totalInferenceTime += inferenceTime;

    } catch (error) {
      results.details.test_cases.push({
        name: testCase.name,
        error: error.message,
        accuracy: 0,
        consistency_score: 0
      });
    }
  }

  // Calculate final metrics
  if (totalWeight > 0) {
    results.metrics.inference_accuracy = totalAccuracy / totalWeight;
    results.metrics.consistency_score = totalConsistency / totalWeight;
    results.metrics.reasoning_completeness = totalCompleteness / totalWeight;
  }

  results.metrics.memory_usage_mb = reasoner.getMemoryUsage();
  results.metrics.inference_speed = testCases.length > 0 ? 
    totalInferenceTime / testCases.length : 0;

  results.details.performance_stats = {
    total_inference_time_ms: totalInferenceTime,
    average_inference_time_ms: results.metrics.inference_speed,
    total_derivations: results.details.derivations.length,
    total_contradictions: results.details.contradictions.length
  };

  return results;
}

module.exports = { 
  runTest, 
  LogicalFact, 
  LogicalRule, 
  MockVSAVMReasoner, 
  ReasoningTestGenerator 
};
