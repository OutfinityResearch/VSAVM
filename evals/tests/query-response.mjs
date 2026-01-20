/**
 * Query Response Evaluation Tests
 * Tests VSAVM's query execution performance
 */

import { createDefaultVSAVM } from '../../src/index.mjs';
import { stringAtom, numberAtom } from '../../src/core/types/terms.mjs';
import { createSymbolId, createScopeId, createSourceId } from '../../src/core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../../src/core/types/facts.mjs';

/**
 * Run query response evaluation
 * @param {Object} config
 * @returns {Promise<Object>}
 */
export async function runQueryResponseTests(config) {
  const results = {
    category: 'query-response',
    metrics: {
      avg_response_ms: 0,
      max_response_ms: 0,
      min_response_ms: Infinity,
      response_accuracy: 0,
      queries_under_threshold: 0,
      total_queries: 0
    },
    details: {
      queries: []
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    // Populate with test data
    const predicateCounts = await populateTestData(vm, config.params.max_facts || 100);
    
    // Run queries
    const queryCount = config.params.query_count || 20;
    const threshold = config.thresholds.query_response_ms || 100;
    
    const responseTimes = [];
    
    let correctCount = 0;

    for (let i = 0; i < queryCount; i++) {
      const query = generateTestQuery(i);
      const expectedCount = predicateCounts[query.predicate] ?? 0;
      
      const startTime = performance.now();
      const queryResult = await vm.queryFacts(query);
      const responseTime = performance.now() - startTime;
      
      responseTimes.push(responseTime);
      
      results.details.queries.push({
        query_id: i,
        predicate: query.predicate,
        response_ms: responseTime,
        result_count: queryResult.length,
        expected_count: expectedCount,
        correct: queryResult.length === expectedCount,
        under_threshold: responseTime <= threshold
      });

      if (queryResult.length === expectedCount) {
        correctCount++;
      }

      if (responseTime <= threshold) {
        results.metrics.queries_under_threshold++;
      }
    }
    
    // Calculate metrics
    results.metrics.total_queries = queryCount;
    results.metrics.avg_response_ms = responseTimes.reduce((a, b) => a + b, 0) / queryCount;
    results.metrics.max_response_ms = Math.max(...responseTimes);
    results.metrics.min_response_ms = Math.min(...responseTimes);
    results.metrics.response_accuracy = queryCount > 0 ? correctCount / queryCount : 0;
    
  } finally {
    await vm.close();
  }
  
  return results;
}

/**
 * Populate VSAVM with test facts
 */
async function populateTestData(vm, factCount) {
  const scope = createScopeId(['eval', 'query-response']);
  const source = createSourceId('eval', 'test_data');
  
  const predicates = ['person', 'location', 'event', 'property', 'relation'];
  const predicateCounts = {};
  
  for (let i = 0; i < factCount; i++) {
    const predicate = predicates[i % predicates.length];
    const fullPredicate = `test:${predicate}`;
    predicateCounts[fullPredicate] = (predicateCounts[fullPredicate] ?? 0) + 1;
    
    const fact = createFactInstance(
      createSymbolId('test', predicate),
      {
        id: stringAtom(`entity_${i}`),
        value: numberAtom(i * 10),
        label: stringAtom(`Label ${i}`)
      },
      {
        scopeId: scope,
        provenance: [createProvenanceLink(source)]
      }
    );
    
    await vm.assertFact(fact);
  }

  return predicateCounts;
}

/**
 * Generate a test query
 */
function generateTestQuery(index) {
  const predicates = ['test:person', 'test:location', 'test:event', 'test:property', 'test:relation'];
  return {
    predicate: predicates[index % predicates.length]
  };
}

export default { runQueryResponseTests };
