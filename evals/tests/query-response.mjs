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
    // Run queries using VM execution instead of direct storage access
    const queryCount = config.params.query_count || 20;
    const threshold = config.thresholds.query_response_ms || 100;
    const perPredicate = config.params.per_predicate_count || 20;
    
    const responseTimes = [];
    let correctCount = 0;
    let vmExecutionSuccesses = 0;
    let compilationSuccesses = 0;

    const predicateCounts = await populateTestData(vm, perPredicate);

    for (let i = 0; i < queryCount; i++) {
      const query = generateTestQuery(i);
      const expectedCount = predicateCounts[query.predicate] ?? 0;
      
      try {
        const startTime = performance.now();
        
        const answer = await vm.answerQuery(`list ${query.predicate}`, {
          budget: {
            maxDepth: 3,
            maxSteps: 500,
            maxBranches: 2,
            maxTimeMs: threshold
          }
        });
        if (!answer.success) {
          throw new Error(answer.error || 'Compilation failed');
        }
        
        const responseTime = performance.now() - startTime;
        responseTimes.push(responseTime);
        
        const resultCount = answer.execution?.bindings?.results?.length || 0;
        vmExecutionSuccesses++;
        compilationSuccesses++;
        
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
 * Populate VSAVM with test facts using VM execution
 */
async function populateTestData(vm, factCount) {
  const predicates = ['person', 'location', 'event', 'property', 'relation'];
  const predicateCounts = {};
  
  // Build a program to populate facts via VM
  const instructions = [];
  
  for (const predicate of predicates) {
    const fullPredicate = `test:${predicate}`;
    predicateCounts[fullPredicate] = factCount;
    for (let i = 0; i < factCount; i++) {
      instructions.push({
        op: 'ASSERT',
        args: {
          predicate: fullPredicate,
          arguments: {
            id: `entity_${predicate}_${i}`,
            value: i * 10,
            label: `Label ${i}`
          }
        }
      });
    }
  }
  
  const populateProgram = {
    programId: 'populate_test_data',
    instructions
  };
  
  // Execute population program
  await vm.execute(populateProgram, {
    budget: {
      maxDepth: 2,
      maxSteps: factCount * predicates.length * 3,
      maxBranches: 1,
      maxTimeMs: 10000
    }
  });

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
function compileQueryToProgram(query, expectedCount) {
  const instructions = [];
  
  // First populate some test facts for this predicate
  for (let i = 0; i < expectedCount; i++) {
    instructions.push({
      op: 'ASSERT',
      args: {
        predicate: query.predicate,
        arguments: {
          id: `entity_${i}`,
          value: i * 10
        }
      }
    });
  }
  
  // Then query
  instructions.push({
    op: 'QUERY',
    args: {
      predicate: query.predicate
    },
    out: 'results'
  });
  
  instructions.push({
    op: 'RETURN',
    args: { value: { var: 'results' } }
  });

  return {
    programId: `query_${Date.now()}_${Math.random()}`,
    instructions,
    metadata: {
      compiledAt: Date.now(),
      estimatedSteps: expectedCount + 2,
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
  
  // Check for other binding names
  if (vmResult.bindings) {
    for (const [key, value] of Object.entries(vmResult.bindings)) {
      if (Array.isArray(value)) {
        return value.length;
      }
    }
  }
  
  // If we got a result but can't parse it, assume 1 result
  if (vmResult.mode && vmResult.mode !== 'INDETERMINATE') {
    return 1;
  }
  
  return 0;
}

export default { runQueryResponseTests };
