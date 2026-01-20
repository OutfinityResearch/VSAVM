/**
 * Fast Evaluation Mode - Quick Development Feedback
 * Tests core functionality without complex edge cases
 */

import { createDefaultVSAVM } from '../src/index.mjs';

/**
 * Run fast scope isolation test
 */
export async function runFastScopeTest() {
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    // Simple scope isolation test
    const program = {
      programId: 'fast_scope_test',
      instructions: [
        // Add fact to default scope
        {
          op: 'ASSERT',
          args: {
            predicate: 'test:item',
            arguments: { id: 'item1', scope: 'default' }
          }
        },
        // Query with different scope - should find nothing
        {
          op: 'QUERY',
          args: {
            predicate: 'test:item',
            scope: { path: ['other', 'scope'] }
          },
          out: 'other_results'
        },
        // Query without scope - should find item
        {
          op: 'QUERY',
          args: {
            predicate: 'test:item'
          },
          out: 'all_results'
        }
      ]
    };
    
    const result = await vm.execute(program);
    const otherCount = result.bindings?.other_results?.length || 0;
    const allCount = result.bindings?.all_results?.length || 0;
    
    const passed = otherCount === 0 && allCount === 1;
    
    return {
      name: 'fast_scope_isolation',
      passed,
      other_scope_results: otherCount,
      all_results: allCount,
      expected: '0, 1'
    };
    
  } finally {
    await vm.close();
  }
}

/**
 * Run performance benchmarks
 */
export async function runPerfBench() {
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    // Benchmark VM instruction throughput
    const start = performance.now();
    const iterations = 1000;
    
    for (let i = 0; i < iterations; i++) {
      await vm.execute({
        programId: `perf_${i}`,
        instructions: [
          { op: 'ASSERT', args: { predicate: 'test:perf', arguments: { id: i } } },
          { op: 'QUERY', args: { predicate: 'test:perf' }, out: 'results' }
        ]
      }, {
        budget: { maxSteps: 10000, maxDepth: 5, maxBranches: 2 }  // Generous budget for perf test
      });
    }
    
    const elapsed = performance.now() - start;
    const throughput = iterations / (elapsed / 1000); // ops/sec
    
    return {
      name: 'vm_throughput',
      passed: throughput > 100, // 100 ops/sec minimum
      throughput: Math.round(throughput),
      elapsed_ms: Math.round(elapsed)
    };
    
  } finally {
    await vm.close();
  }
}

/**
 * Run comprehensive fast evaluation
 */
export async function runFastEval() {
  console.log('🚀 Fast Eval Mode - Development Feedback');
  
  const tests = [
    await runFastScopeTest(),
    await runPerfBench()
  ];
  
  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;
  
  console.log(`\n📊 Fast Eval Results: ${passed}/${total} (${(passed/total*100).toFixed(1)}%)`);
  
  tests.forEach(test => {
    const status = test.passed ? '✅' : '❌';
    console.log(`  ${status} ${test.name}`);
    if (!test.passed) {
      console.log(`    Expected: ${test.expected}, Got: ${test.other_scope_results}, ${test.all_results}`);
    }
  });
  
  return { passed, total, tests };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFastEval();
}
