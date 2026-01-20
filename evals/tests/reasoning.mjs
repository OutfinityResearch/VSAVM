/**
 * Reasoning Evaluation Tests
 * Tests VSAVM's inference and logical reasoning capabilities
 */

import { ClosureService } from '../../src/closure/closure-service.mjs';
import { createRule } from '../../src/closure/algorithms/forward-chain.mjs';
import { ResponseMode } from '../../src/core/types/results.mjs';
import { createEntityId, symbolIdToString } from '../../src/core/types/identifiers.mjs';
import { entityAtom, stringAtom, termToString } from '../../src/core/types/terms.mjs';
import {
  generateFamilyTree,
  generateTaxonomy,
  generatePropositionalLogic,
  generateContradictionTest
} from '../generators/logic.mjs';

const DEFAULT_BUDGET = {
  maxDepth: 6,
  maxSteps: 500,
  maxBranches: 5,
  maxTimeMs: 3000
};

/**
 * Run reasoning evaluation
 * @param {Object} config
 * @returns {Promise<Object>}
 */
export async function runReasoningTests(config) {
  const results = {
    category: 'reasoning',
    metrics: {
      consistency_score: 0,
      inference_accuracy: 0,
      conflict_detection_rate: 0,
      closure_completeness: 0
    },
    details: {
      tests: []
    }
  };

  const closure = new ClosureService({ defaultMode: ResponseMode.STRICT });
  const budget = config?.vsavm?.vm?.defaultBudget ?? DEFAULT_BUDGET;

  // Test 1: Family tree inference
  const familyResult = await runFamilyTreeTest(closure, budget);
  results.details.tests.push(familyResult);

  // Test 2: Taxonomy transitive closure
  const taxonomyResult = await runTaxonomyTest(closure, budget);
  results.details.tests.push(taxonomyResult);

  // Test 3: Propositional logic modus ponens
  const logicResult = await runPropositionalLogicTest(closure, budget);
  results.details.tests.push(logicResult);

  // Test 4: Contradiction detection
  const contradictionResult = await runContradictionTest(closure, budget);
  results.details.tests.push(contradictionResult);

  // Calculate aggregate metrics
  const testResults = results.details.tests;
  const passedTests = testResults.filter(t => t.passed);

  results.metrics.consistency_score = passedTests.length / testResults.length;
  results.metrics.inference_accuracy = calculateAverageMetric(testResults, 'inference_accuracy');
  results.metrics.conflict_detection_rate = contradictionResult.passed ? 1.0 : 0.0;
  results.metrics.closure_completeness = calculateAverageMetric(testResults, 'completeness');

  return results;
}

/**
 * Test family tree inference
 */
async function runFamilyTreeTest(closure, budget) {
  const { facts, rules } = generateFamilyTree();
  const startTime = Date.now();

  const normalizedRules = normalizeRules(rules);
  const result = await closure.runClosure(facts, normalizedRules, budget, ResponseMode.STRICT);
  const derivedFacts = collectDerivedFacts(result);

  const expectedGrandparents = [
    { grandparent: person('Alice'), grandchild: person('Eve') },
    { grandparent: person('Alice'), grandchild: person('Frank') },
    { grandparent: person('Bob'), grandchild: person('Eve') },
    { grandparent: person('Bob'), grandchild: person('Frank') }
  ];

  const expectedSiblings = [
    { person1: person('Carol'), person2: person('Dave') },
    { person1: person('Dave'), person2: person('Carol') }
  ];

  const grandparentStats = checkExpectedFacts(
    derivedFacts,
    'family:grandparent',
    ['grandparent', 'grandchild'],
    expectedGrandparents
  );

  const siblingStats = checkExpectedFacts(
    derivedFacts,
    'family:sibling',
    ['person1', 'person2'],
    expectedSiblings
  );

  const expectedTotal = expectedGrandparents.length + expectedSiblings.length;
  const foundTotal = grandparentStats.found + siblingStats.found;

  return {
    name: 'family_tree',
    passed: grandparentStats.missing.length === 0 && siblingStats.missing.length === 0,
    inference_accuracy: expectedTotal > 0 ? foundTotal / expectedTotal : 0,
    completeness: expectedTotal > 0 ? foundTotal / expectedTotal : 0,
    missing: [...grandparentStats.missing, ...siblingStats.missing],
    execution_ms: Date.now() - startTime
  };
}

/**
 * Test taxonomy transitive closure
 */
async function runTaxonomyTest(closure, budget) {
  const { facts, rules } = generateTaxonomy();
  const startTime = Date.now();

  const normalizedRules = normalizeRules(rules);
  const result = await closure.runClosure(facts, normalizedRules, budget, ResponseMode.STRICT);
  const derivedFacts = collectDerivedFacts(result);

  const expectedAnimals = ['Dog', 'Cat', 'Eagle', 'Sparrow'].map(name => ({
    subtype: concept(name),
    supertype: concept('Animal')
  }));

  const expectedStats = checkExpectedFacts(
    derivedFacts,
    'taxonomy:is_a',
    ['subtype', 'supertype'],
    expectedAnimals
  );

  return {
    name: 'taxonomy_closure',
    passed: expectedStats.missing.length === 0,
    inference_accuracy: expectedStats.expected > 0 ? expectedStats.found / expectedStats.expected : 0,
    completeness: expectedStats.expected > 0 ? expectedStats.found / expectedStats.expected : 0,
    missing: expectedStats.missing,
    execution_ms: Date.now() - startTime
  };
}

/**
 * Test propositional logic modus ponens
 */
async function runPropositionalLogicTest(closure, budget) {
  const { facts, rules } = generatePropositionalLogic();
  const startTime = Date.now();

  const normalizedRules = normalizeRules(rules);
  const result = await closure.runClosure(facts, normalizedRules, budget, ResponseMode.STRICT);
  const derivedFacts = collectDerivedFacts(result);

  const expectedPropositions = ['Q', 'R', 'S'].map(value => ({
    proposition: stringAtom(value)
  }));

  const expectedStats = checkExpectedFacts(
    derivedFacts,
    'logic:holds',
    ['proposition'],
    expectedPropositions
  );

  return {
    name: 'propositional_logic',
    passed: expectedStats.missing.length === 0,
    inference_accuracy: expectedStats.expected > 0 ? expectedStats.found / expectedStats.expected : 0,
    completeness: expectedStats.expected > 0 ? expectedStats.found / expectedStats.expected : 0,
    missing: expectedStats.missing,
    execution_ms: Date.now() - startTime
  };
}

/**
 * Test contradiction detection
 */
async function runContradictionTest(closure, budget) {
  const { facts, hasContradiction } = generateContradictionTest();
  const startTime = Date.now();

  const result = await closure.runClosure(facts, [], budget, ResponseMode.STRICT);
  const conflictDetected = (result.conflicts?.length ?? 0) > 0;

  return {
    name: 'contradiction_detection',
    passed: conflictDetected === hasContradiction,
    conflict_detected: conflictDetected,
    expected_contradiction: hasContradiction,
    execution_ms: Date.now() - startTime
  };
}

function normalizeRules(rules) {
  return rules.map((rule, index) => createRule({
    ruleId: rule.ruleId ?? rule.name ?? `rule_${index}`,
    premises: rule.premises ?? [],
    conclusions: rule.conclusions ?? (rule.conclusion ? [rule.conclusion] : []),
    priority: rule.priority ?? 0,
    estimatedCost: rule.estimatedCost ?? 5
  }));
}

function collectDerivedFacts(result) {
  return (result.claims ?? [])
    .map(claim => claim.content)
    .filter(Boolean);
}

function checkExpectedFacts(derivedFacts, predicate, slots, expectedRows) {
  const derivedSet = new Set();

  for (const fact of derivedFacts) {
    if (predicateKey(fact.predicate) !== predicate) {
      continue;
    }

    const key = buildFactKey(predicate, slots, slot => termToString(getArgument(fact, slot)));
    derivedSet.add(key);
  }

  const missing = [];
  for (const expected of expectedRows) {
    const key = buildFactKey(predicate, slots, slot => termToString(expected[slot]));
    if (!derivedSet.has(key)) {
      missing.push(key);
    }
  }

  return {
    expected: expectedRows.length,
    found: expectedRows.length - missing.length,
    missing
  };
}

function buildFactKey(predicate, slots, valueFn) {
  const values = slots.map(slot => valueFn(slot));
  return `${predicate}|${values.join('|')}`;
}

function getArgument(fact, slot) {
  if (fact.arguments?.get) {
    return fact.arguments.get(slot);
  }
  return fact.arguments?.[slot];
}

function predicateKey(pred) {
  if (typeof pred === 'string') return pred;
  if (pred?.namespace && pred?.name) {
    return symbolIdToString(pred);
  }
  return String(pred);
}

function person(name) {
  return entityAtom(createEntityId('person', name));
}

function concept(name) {
  return entityAtom(createEntityId('concept', name));
}

/**
 * Calculate average of a metric across test results
 */
function calculateAverageMetric(results, metricName) {
  const values = results
    .map(r => r[metricName])
    .filter(v => typeof v === 'number');

  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default { runReasoningTests };
