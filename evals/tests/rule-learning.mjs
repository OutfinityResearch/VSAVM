/**
 * Rule Learning Evaluation Tests
 * Tests VSAVM's ability to learn patterns from sequences
 */

import { createDefaultVSAVM } from '../../src/index.mjs';
import { generateMixedTestCases } from '../generators/arithmetic.mjs';
import { stringAtom, numberAtom } from '../../src/core/types/terms.mjs';
import { createSymbolId, createScopeId, createSourceId } from '../../src/core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../../src/core/types/facts.mjs';

/**
 * Run rule learning evaluation
 * @param {Object} config
 * @returns {Promise<Object>}
 */
export async function runRuleLearningTests(config) {
  const results = {
    category: 'rule-learning',
    metrics: {
      accuracy: 0,
      rules_learned: 0,
      total_cases: 0,
      memory_usage_mb: 0
    },
    details: {
      passed: [],
      failed: []
    }
  };

  const vm = createDefaultVSAVM();
  await vm.initialize();

  try {
    const testCases = generateMixedTestCases(config.params.sequence_length);
    results.metrics.total_cases = testCases.length;

    const ruleLearner = resolveRuleLearner(vm);
    if (!ruleLearner) {
      for (const testCase of testCases) {
        results.details.failed.push({
          name: testCase.name,
          type: testCase.type,
          reason: 'Rule learning API not available'
        });
      }
      results.metrics.accuracy = 0;
      results.metrics.rules_learned = 0;
      const stats = await vm.getStats();
      results.metrics.memory_usage_mb = estimateMemoryUsage(stats.factCount);
      return results;
    }

    const accuracies = [];
    let successCount = 0;

    for (const testCase of testCases) {
      const caseResult = await runSingleRuleLearningTest(vm, testCase, config, ruleLearner);
      accuracies.push(caseResult.accuracy);

      if (caseResult.success) {
        successCount++;
        results.details.passed.push({
          name: testCase.name,
          type: testCase.type,
          accuracy: caseResult.accuracy,
          confidence: caseResult.confidence
        });
      } else {
        results.details.failed.push({
          name: testCase.name,
          type: testCase.type,
          reason: caseResult.reason || 'Rule mismatch',
          confidence: caseResult.confidence
        });
      }
    }

    results.metrics.rules_learned = successCount;
    results.metrics.accuracy = accuracies.length
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : 0;

    // Estimate memory usage
    const stats = await vm.getStats();
    results.metrics.memory_usage_mb = estimateMemoryUsage(stats.factCount);

  } finally {
    await vm.close();
  }

  return results;
}

/**
 * Run a single rule learning test case
 */
async function runSingleRuleLearningTest(vm, testCase, config, ruleLearner) {
  const { sequence, type, rule, name } = testCase;
  const minConfidence = config.params.rule_learning_min_confidence ?? 0.7;

  // Store sequence as facts to support learners that read from the VM
  const scope = createScopeId(['eval', 'rule-learning', name]);
  const source = createSourceId('eval', 'sequence_gen');

  for (let i = 0; i < sequence.length; i++) {
    const fact = createFactInstance(
      createSymbolId('sequence', 'element'),
      {
        sequence: stringAtom(name),
        index: numberAtom(i),
        value: numberAtom(sequence[i])
      },
      {
        scopeId: scope,
        provenance: [createProvenanceLink(source)]
      }
    );

    await vm.assertFact(fact);
  }

  let learnResult;
  try {
    learnResult = await ruleLearner({
      name,
      type,
      sequence,
      expectedRule: rule,
      scopeId: scope
    });
  } catch (error) {
    return {
      success: false,
      accuracy: 0,
      confidence: 0,
      reason: `Rule learning failed: ${error.message}`
    };
  }

  const normalized = normalizeLearningResult(learnResult);
  if (!normalized.rule) {
    return {
      success: false,
      accuracy: 0,
      confidence: normalized.confidence ?? 0,
      reason: normalized.error || 'No rule produced'
    };
  }

  const matches = rulesMatch(normalized.rule, rule);
  const confidence = normalized.confidence ?? (matches ? 1 : 0);
  const accuracy = matches ? Math.max(0, Math.min(1, confidence || 1)) : 0;

  return {
    success: matches && confidence >= minConfidence,
    accuracy,
    confidence,
    learnedRule: normalized.rule
  };
}

function resolveRuleLearner(vm) {
  if (typeof vm.learnRule === 'function') {
    return (payload) => vm.learnRule(payload);
  }
  if (typeof vm.learnRules === 'function') {
    return async (payload) => {
      const result = await vm.learnRules([payload]);
      return Array.isArray(result) ? result[0] : result;
    };
  }
  if (vm.ruleLearner && typeof vm.ruleLearner.learnRule === 'function') {
    return (payload) => vm.ruleLearner.learnRule(payload);
  }
  if (vm.ruleLearner && typeof vm.ruleLearner.learn === 'function') {
    return (payload) => vm.ruleLearner.learn(payload);
  }
  if (vm.compiler && typeof vm.compiler.learnRule === 'function') {
    return (payload) => vm.compiler.learnRule(payload);
  }
  return null;
}

function normalizeLearningResult(result) {
  if (!result) {
    return { rule: null, confidence: 0, error: 'Empty result' };
  }

  if (result.success === false) {
    return {
      rule: null,
      confidence: result.confidence ?? result.score ?? 0,
      error: result.error || result.reason || 'Learning failed'
    };
  }

  if (result.rule) {
    return {
      rule: result.rule,
      confidence: result.confidence ?? result.score ?? 0
    };
  }

  if (result.type) {
    return {
      rule: result,
      confidence: result.confidence ?? result.score ?? 0
    };
  }

  return {
    rule: null,
    confidence: result.confidence ?? result.score ?? 0,
    error: result.error || 'Unrecognized rule learning result'
  };
}

/**
 * Check if two rules match
 */
function rulesMatch(detected, expected) {
  if (!detected || !expected) return false;

  if (detected.type !== expected.type) return false;

  if (detected.type === 'arithmetic_progression') {
    return Math.abs(detected.difference - expected.difference) < 0.001;
  }
  if (detected.type === 'geometric_progression') {
    return Math.abs(detected.ratio - expected.ratio) < 0.001;
  }
  if (detected.type === 'modular_arithmetic') {
    return detected.increment === expected.increment && detected.modulus === expected.modulus;
  }
  if (detected.type === 'fibonacci') {
    return detected.a === expected.a && detected.b === expected.b;
  }
  if (detected.type === 'polynomial') {
    return detected.a === expected.a && detected.b === expected.b && detected.c === expected.c;
  }

  return false;
}

/**
 * Estimate memory usage based on fact count
 */
function estimateMemoryUsage(factCount) {
  // Rough estimate: ~1KB per fact
  return (factCount * 1) / 1024; // MB
}

export default { runRuleLearningTests };
