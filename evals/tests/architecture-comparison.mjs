/**
 * Architecture Comparison Evaluation Tests
 * Compares VSAVM against baseline architectures
 */

import { createDefaultVSAVM } from '../../src/index.mjs';

export async function runArchitectureComparisonTests(config) {
  const results = {
    category: 'architecture-comparison',
    metrics: {
      vs_transformer_baseline: 0,
      vs_retrieval_augmented: 0,
      vs_symbolic_reasoning: 0,
      efficiency_score: 0
    },
    details: {
      transformer_tests: [],
      retrieval_tests: [],
      symbolic_tests: [],
      efficiency_tests: []
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    await testVsTransformerBaseline(vm, results, config);
    await testVsRetrievalAugmented(vm, results, config);
    await testVsSymbolicReasoning(vm, results, config);
    await testEfficiencyScore(vm, results, config);
    
    results.metrics.vs_transformer_baseline = calculateSuccess(results.details.transformer_tests);
    results.metrics.vs_retrieval_augmented = calculateSuccess(results.details.retrieval_tests);
    results.metrics.vs_symbolic_reasoning = calculateSuccess(results.details.symbolic_tests);
    results.metrics.efficiency_score = calculateSuccess(results.details.efficiency_tests);
    
  } finally {
    await vm.close();
  }
  
  return results;
}

async function testVsTransformerBaseline(vm, results, config) {
  const startTime = performance.now();
  let outperforms_transformer = false;
  let error = null;
  
  try {
    // Test reasoning tasks where VSAVM should outperform transformers
    const reasoningTasks = [
      {
        facts: ['A implies B', 'B implies C', 'A is true'],
        query: 'Is C true?',
        expected: true
      },
      {
        facts: ['All birds fly', 'Penguin is a bird', 'Penguin does not fly'],
        query: 'Is there a contradiction?',
        expected: true
      }
    ];
    
    let vsavm_correct = 0;
    let transformer_correct = 0; // Mock baseline performance
    
    for (const task of reasoningTasks) {
      // Load facts
      for (const fact of task.facts) {
        await vm.assertFact({
          symbolId: { namespace: 'test', name: `fact_${Math.random()}` },
          content: { statement: fact },
          metadata: { scopeId: { path: ['reasoning'] } }
        });
      }
      
      const result = await vm.query(task.query);
      if (result === task.expected) {
        vsavm_correct++;
      }
      
      // Mock transformer baseline (typically struggles with logical reasoning)
      transformer_correct += Math.random() < 0.6 ? 1 : 0;
    }
    
    outperforms_transformer = vsavm_correct > transformer_correct;
    
    if (!outperforms_transformer) {
      error = `VSAVM: ${vsavm_correct}/${reasoningTasks.length}, Transformer: ${transformer_correct}/${reasoningTasks.length}`;
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.transformer_tests.push({
    test_name: 'logical_reasoning_comparison',
    success: outperforms_transformer,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testVsRetrievalAugmented(vm, results, config) {
  const startTime = performance.now();
  let outperforms_rag = false;
  let error = null;
  
  try {
    // Test structured knowledge tasks
    const knowledgeTasks = [
      {
        knowledge: 'Paris is the capital of France',
        query: 'What is the capital of France?',
        expected: 'Paris'
      }
    ];
    
    let vsavm_correct = 0;
    let rag_correct = 0; // Mock RAG performance
    
    for (const task of knowledgeTasks) {
      await vm.assertFact({
        symbolId: { namespace: 'geography', name: 'capital_france' },
        content: { statement: task.knowledge },
        metadata: { scopeId: { path: ['geography'] } }
      });
      
      const result = await vm.query(task.query);
      if (result && result.toString().toLowerCase().includes(task.expected.toLowerCase())) {
        vsavm_correct++;
      }
      
      // Mock RAG performance (good at retrieval but may lack reasoning)
      rag_correct += Math.random() < 0.8 ? 1 : 0;
    }
    
    // VSAVM should match or exceed RAG on pure retrieval
    outperforms_rag = vsavm_correct >= rag_correct;
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.retrieval_tests.push({
    test_name: 'knowledge_retrieval_comparison',
    success: outperforms_rag,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testVsSymbolicReasoning(vm, results, config) {
  const startTime = performance.now();
  let matches_symbolic = false;
  let error = null;
  
  try {
    // Test pure symbolic reasoning tasks
    const symbolicTasks = [
      {
        rules: ['forall X: human(X) -> mortal(X)', 'human(socrates)'],
        query: 'mortal(socrates)?',
        expected: true
      }
    ];
    
    let vsavm_correct = 0;
    let symbolic_correct = symbolicTasks.length; // Pure symbolic systems should get 100%
    
    for (const task of symbolicTasks) {
      for (const rule of task.rules) {
        await vm.assertFact({
          symbolId: { namespace: 'logic', name: `rule_${Math.random()}` },
          content: { rule: rule },
          metadata: { scopeId: { path: ['logic'] } }
        });
      }
      
      const result = await vm.query(task.query);
      if (result === task.expected) {
        vsavm_correct++;
      }
    }
    
    // VSAVM should match pure symbolic reasoning
    matches_symbolic = vsavm_correct === symbolic_correct;
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.symbolic_tests.push({
    test_name: 'symbolic_reasoning_comparison',
    success: matches_symbolic,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testEfficiencyScore(vm, results, config) {
  const startTime = performance.now();
  let efficient = false;
  let error = null;
  
  try {
    // Test computational efficiency
    const complexQuery = 'Find all implications in the knowledge base';
    
    const queryStart = performance.now();
    await vm.query(complexQuery);
    const queryTime = performance.now() - queryStart;
    
    // Should be efficient for microLLM constraints
    efficient = queryTime < config.params.micro_llm_inference_latency_ms * 5; // 5x latency budget
    
    if (!efficient) {
      error = `Complex query took ${queryTime.toFixed(2)}ms, exceeds efficiency threshold`;
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.efficiency_tests.push({
    test_name: 'computational_efficiency',
    success: efficient,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

function calculateSuccess(tests) {
  const successful = tests.filter(t => t.success).length;
  return tests.length > 0 ? successful / tests.length : 0;
}

export default { runArchitectureComparisonTests };
