/**
 * Stress Tests for VSAVM Evaluation Suite
 * Tests edge cases and boundary conditions
 */

import { createDefaultVSAVM } from '../../src/index.mjs';

/**
 * Run stress tests
 */
export async function runStressTests(config) {
  const results = {
    category: 'stress-tests',
    metrics: {
      edge_case_handling: 0,
      memory_stability: 0,
      concurrent_operations: 0,
      large_data_handling: 0
    },
    details: {
      edge_cases: [],
      memory_tests: [],
      concurrency_tests: [],
      large_data_tests: []
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    await testEdgeCases(vm, results, config);
    await testMemoryStability(vm, results, config);
    await testConcurrentOperations(vm, results, config);
    await testLargeDataHandling(vm, results, config);
    
    // Calculate metrics
    results.metrics.edge_case_handling = results.details.edge_cases.filter(t => t.handled_correctly).length / Math.max(results.details.edge_cases.length, 1);
    results.metrics.memory_stability = results.details.memory_tests.filter(t => t.stable).length / Math.max(results.details.memory_tests.length, 1);
    results.metrics.concurrent_operations = results.details.concurrency_tests.filter(t => t.successful).length / Math.max(results.details.concurrency_tests.length, 1);
    results.metrics.large_data_handling = results.details.large_data_tests.filter(t => t.handled).length / Math.max(results.details.large_data_tests.length, 1);
    
  } finally {
    await vm.close();
  }
  
  return results;
}

async function testEdgeCases(vm, results, config) {
  const startTime = performance.now();
  
  // Test empty inputs
  try {
    const emptyResult = await vm.queryFacts('');
    results.details.edge_cases.push({
      test: 'empty_query',
      handled_correctly: true,
      result: 'handled gracefully'
    });
  } catch (e) {
    results.details.edge_cases.push({
      test: 'empty_query',
      handled_correctly: false,
      error: e.message
    });
  }
  
  // Test null inputs
  try {
    const nullResult = await vm.queryFacts(null);
    results.details.edge_cases.push({
      test: 'null_query',
      handled_correctly: false,
      result: 'should have thrown error'
    });
  } catch (e) {
    results.details.edge_cases.push({
      test: 'null_query',
      handled_correctly: true,
      error: 'correctly rejected null input'
    });
  }
}

async function testMemoryStability(vm, results, config) {
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Create and destroy many objects
  for (let i = 0; i < 1000; i++) {
    await vm.queryFacts(`test query ${i}`);
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = (finalMemory - initialMemory) / (1024 * 1024); // MB
  
  results.details.memory_tests.push({
    test: 'memory_stability',
    stable: memoryGrowth < 50, // Less than 50MB growth
    initial_mb: initialMemory / (1024 * 1024),
    final_mb: finalMemory / (1024 * 1024),
    growth_mb: memoryGrowth
  });
}

async function testConcurrentOperations(vm, results, config) {
  // Test concurrent queries
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(vm.queryFacts(`concurrent query ${i}`));
  }
  
  try {
    const results_concurrent = await Promise.all(promises);
    results.details.concurrency_tests.push({
      test: 'concurrent_queries',
      successful: results_concurrent.length === 10,
      count: results_concurrent.length
    });
  } catch (e) {
    results.details.concurrency_tests.push({
      test: 'concurrent_queries',
      successful: false,
      error: e.message
    });
  }
}

async function testLargeDataHandling(vm, results, config) {
  // Test large query
  const largeQuery = 'large query '.repeat(1000);
  
  try {
    const result = await vm.queryFacts(largeQuery);
    results.details.large_data_tests.push({
      test: 'large_query',
      handled: true,
      size_chars: largeQuery.length
    });
  } catch (e) {
    results.details.large_data_tests.push({
      test: 'large_query',
      handled: false,
      error: e.message,
      size_chars: largeQuery.length
    });
  }
}

export default { runStressTests };
