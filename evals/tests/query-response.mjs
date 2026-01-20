/**
 * Query Response Evaluation Tests
 * Tests VSAVM's VM execution and query compilation performance
 * 
 * CRITICAL: Tests vm.execute() with compiled queries, not direct storage access
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
      total_queries: 0,
      vm_execution_success_rate: 0,  // New: VM execution success rate
      query_compilation_success_rate: 0  // New: Query compilation success rate
    },
    details: {
      queries: [],
      vm_execution_failures: [],  // New: Track VM execution failures
      compilation_failures: []   // New: Track compilation failures
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    // Populate with test data
    const predicateCounts = await populateTestData(vm, config.params.max_facts || 100);
    
    // Run queries using VM execution instead of direct storage access
    const queryCount = config.params.query_count || 20;
    const threshold = config.thresholds.query_response_ms || 100;
    
    const responseTimes = [];
    let correctCount = 0;
    let vmExecutionSuccesses = 0;
    let compilationSuccesses = 0;

    for (let i = 0; i < queryCount; i++) {
      const query = generateTestQuery(i);
      const expectedCount = predicateCounts[query.predicate] ?? 0;
      
      try {
        // Compile query to VM program (this is what DS003 specifies)
        const compiledQuery = compileQueryToProgram(query);
        compilationSuccesses++;
        
        const startTime = performance.now();
        
        // Execute via VM instead of direct storage access
        const vmResult = await vm.execute(compiledQuery, {
          budget: {
            maxDepth: 3,
            maxSteps: 100,
            maxBranches: 2,
            maxTimeMs: threshold
          }
        });
        
        const responseTime = performance.now() - startTime;
        responseTimes.push(responseTime);
        
        // Extract results from VM execution result
        const resultCount = extractResultCount(vmResult);
        vmExecutionSuccesses++;
        
        results.details.queries.push({
          query_id: i,
          predicate: query.predicate,
          response_ms: responseTime,
          result_count: resultCount,
          expected_count: expectedCount,
          correct: resultCount === expectedCount,
          under_threshold: responseTime <= threshold,
          vm_executed: true,
          compiled: true
        });

        if (resultCount === expectedCount) {
          correctCount++;
        }

        if (responseTime <= threshold) {
          results.metrics.queries_under_threshold++;
        }
        
      } catch (compilationError) {
        // Track compilation failures
        results.details.compilation_failures.push({
          query_id: i,
          query: query,
          error: compilationError.message
        });
        
        results.details.queries.push({
          query_id: i,
          predicate: query.predicate,
          response_ms: null,
          result_count: 0,
          expected_count: expectedCount,
          correct: false,
          under_threshold: false,
          vm_executed: false,
          compiled: false,
          error: compilationError.message
        });
      }
    }
    
    // Calculate metrics
    results.metrics.total_queries = queryCount;
    results.metrics.avg_response_ms = responseTimes.length > 0 ? 
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    results.metrics.max_response_ms = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    results.metrics.min_response_ms = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    results.metrics.response_accuracy = queryCount > 0 ? correctCount / queryCount : 0;
    results.metrics.vm_execution_success_rate = queryCount > 0 ? vmExecutionSuccesses / queryCount : 0;
    results.metrics.query_compilation_success_rate = queryCount > 0 ? compilationSuccesses / queryCount : 0;
    
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

/**
 * Compile a query pattern to a VM program (DS003 requirement)
 * This is a minimal implementation - real system would have sophisticated NL→VM compilation
 */
function compileQueryToProgram(query) {
  return {
    programId: `query_${Date.now()}_${Math.random()}`,
    instructions: [
      {
        op: 'QUERY',
        args: {
          predicate: query.predicate,
          pattern: {},  // Match all facts with this predicate
          outputVar: 'results'
        }
      },
      {
        op: 'RETURN',
        args: {
          value: { var: 'results' }
        }
      }
    ],
    metadata: {
      compiledAt: Date.now(),
      estimatedSteps: 2,
      estimatedBranches: 0,
      tracePolicy: 'minimal'
    }
  };
}

/**
 * Extract result count from VM execution result
 */
function extractResultCount(vmResult) {
  if (!vmResult) return 0;
  
  // Handle different possible result formats
  if (vmResult.claims && Array.isArray(vmResult.claims)) {
    return vmResult.claims.length;
  }
  
  if (vmResult.result && Array.isArray(vmResult.result)) {
    return vmResult.result.length;
  }
  
  if (vmResult.bindings && vmResult.bindings.results && Array.isArray(vmResult.bindings.results)) {
    return vmResult.bindings.results.length;
  }
  
  // If we got a result but can't parse it, assume 1 result
  if (vmResult.mode && vmResult.mode !== 'INDETERMINATE') {
    return 1;
  }
  
  return 0;
}

export default { runQueryResponseTests };
