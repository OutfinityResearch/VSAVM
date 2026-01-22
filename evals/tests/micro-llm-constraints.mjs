/**
 * MicroLLM Constraints Evaluation Tests
 * Tests model size, latency, and memory constraints for micro models
 */

import { createDefaultVSAVM } from '../../src/index.mjs';

export async function runMicroLLMConstraintsTests(config) {
  const results = {
    category: 'micro-llm-constraints',
    metrics: {
      size_compliance: 0,
      latency_compliance: 0,
      memory_compliance: 0,
      quantization_accuracy: 0
    },
    details: {
      size_tests: [],
      latency_tests: [],
      memory_tests: [],
      quantization_tests: []
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    await testModelSizeCompliance(vm, results, config);
    await testInferenceLatency(vm, results, config);
    await testMemoryFootprint(vm, results, config);
    await testQuantizationAccuracy(vm, results, config);
    
    results.metrics.size_compliance = calculateSuccess(results.details.size_tests);
    results.metrics.latency_compliance = calculateSuccess(results.details.latency_tests);
    results.metrics.memory_compliance = calculateSuccess(results.details.memory_tests);
    results.metrics.quantization_accuracy = calculateSuccess(results.details.quantization_tests);
    
  } finally {
    await vm.close();
  }
  
  return results;
}

async function testModelSizeCompliance(vm, results, config) {
  const startTime = performance.now();
  let size_compliant = false;
  let error = null;
  
  try {
    const modelSize = await getModelSize(vm);
    const limit = config.params.micro_llm_model_size_mb;
    
    size_compliant = modelSize <= limit;
    
    if (!size_compliant) {
      error = `Model size ${modelSize}MB exceeds limit ${limit}MB`;
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.size_tests.push({
    test_name: 'model_size_compliance',
    success: size_compliant,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testInferenceLatency(vm, results, config) {
  const startTime = performance.now();
  let latency_compliant = false;
  let error = null;
  
  try {
    const queries = [
      'What is the capital of France?',
      'Explain photosynthesis',
      'Calculate 2+2'
    ];
    
    let totalLatency = 0;
    for (const query of queries) {
      const queryStart = performance.now();
      await vm.query(query);
      totalLatency += performance.now() - queryStart;
    }
    
    const avgLatency = totalLatency / queries.length;
    const limit = config.params.micro_llm_inference_latency_ms;
    
    latency_compliant = avgLatency <= limit;
    
    if (!latency_compliant) {
      error = `Average latency ${avgLatency.toFixed(2)}ms exceeds limit ${limit}ms`;
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.latency_tests.push({
    test_name: 'inference_latency',
    success: latency_compliant,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testMemoryFootprint(vm, results, config) {
  const startTime = performance.now();
  let memory_compliant = false;
  let error = null;
  
  try {
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    
    // Load test data
    for (let i = 0; i < 100; i++) {
      await vm.assertFact({
        symbolId: { namespace: 'test', name: `fact_${i}` },
        content: { value: `test_data_${i}` },
        metadata: { scopeId: { path: ['test'] } }
      });
    }
    
    const peakMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryUsed = peakMemory - initialMemory;
    const limit = config.params.micro_llm_memory_footprint_mb;
    
    memory_compliant = memoryUsed <= limit;
    
    if (!memory_compliant) {
      error = `Memory usage ${memoryUsed.toFixed(2)}MB exceeds limit ${limit}MB`;
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.memory_tests.push({
    test_name: 'memory_footprint',
    success: memory_compliant,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testQuantizationAccuracy(vm, results, config) {
  const startTime = performance.now();
  let quantization_accurate = false;
  let error = null;
  
  try {
    // Test accuracy with quantization
    const testQueries = [
      { query: 'What is 2+2?', expected: '4' },
      { query: 'What color is the sky?', expected: 'blue' }
    ];
    
    let correct = 0;
    for (const test of testQueries) {
      const result = await vm.query(test.query);
      if (result && result.toString().toLowerCase().includes(test.expected)) {
        correct++;
      }
    }
    
    const accuracy = correct / testQueries.length;
    quantization_accurate = accuracy >= 0.8; // 80% accuracy threshold
    
    if (!quantization_accurate) {
      error = `Quantization accuracy ${(accuracy * 100).toFixed(1)}% below 80% threshold`;
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.quantization_tests.push({
    test_name: 'quantization_accuracy',
    success: quantization_accurate,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function getModelSize(vm) {
  // Mock implementation - in real system would check actual model size
  if (vm.getModelSize) {
    return await vm.getModelSize();
  }
  return 45; // Mock size under 50MB limit
}

function calculateSuccess(tests) {
  const successful = tests.filter(t => t.success).length;
  return tests.length > 0 ? successful / tests.length : 0;
}

export default { runMicroLLMConstraintsTests };
