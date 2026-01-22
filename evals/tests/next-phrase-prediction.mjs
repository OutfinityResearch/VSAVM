/**
 * Next-Phrase Prediction Evaluation Tests
 * Tests DS005 outer loop implementation
 */

import { createDefaultVSAVM } from '../../src/index.mjs';

/**
 * Run next-phrase prediction tests
 */
export async function runNextPhrasePredictionTests(config) {
  const results = {
    category: 'next-phrase-prediction',
    metrics: {
      vm_state_conditioning: 0,
      phrase_level_accuracy: 0,
      context_awareness: 0,
      training_effectiveness: 0
    },
    details: {
      conditioning_tests: [],
      accuracy_tests: [],
      context_tests: [],
      training_tests: []
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    await testVMStateConditioning(vm, results, config);
    await testPhraseLevelAccuracy(vm, results, config);
    await testContextAwareness(vm, results, config);
    await testTrainingEffectiveness(vm, results, config);
    
    // Calculate metrics
    results.metrics.vm_state_conditioning = calculateSuccess(results.details.conditioning_tests);
    results.metrics.phrase_level_accuracy = calculateSuccess(results.details.accuracy_tests);
    results.metrics.context_awareness = calculateSuccess(results.details.context_tests);
    results.metrics.training_effectiveness = calculateSuccess(results.details.training_tests);
    
  } finally {
    await vm.close();
  }
  
  return results;
}

async function testVMStateConditioning(vm, results, config) {
  const startTime = performance.now();
  let conditioning_works = false;
  let error = null;
  
  try {
    // Test that VM state influences generation
    const emptyStateResult = await vm.generateText('The answer is', { maxPhrases: 3 });
    
    // Add some facts to VM state
    await vm.assertFact({
      symbolId: { namespace: 'test', name: 'fact' },
      content: { answer: { type: 'string', value: 'forty-two' } },
      metadata: { scopeId: { path: ['test'] } }
    });
    
    const factStateResult = await vm.generateText('The answer is', { maxPhrases: 3 });
    
    // VM state should influence generation
    conditioning_works = emptyStateResult.vmStateInfluence !== factStateResult.vmStateInfluence;
    
    if (!conditioning_works) {
      error = 'VM state does not influence text generation';
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.conditioning_tests.push({
    test_name: 'vm_state_conditioning',
    success: conditioning_works,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testPhraseLevelAccuracy(vm, results, config) {
  const startTime = performance.now();
  let phrase_level_works = false;
  let error = null;
  
  try {
    // Train on phrase-level patterns
    const trainingData = [
      {
        phrases: ['Hello', 'world', 'this', 'is', 'a', 'test'],
        vmStates: [{}, {}, {}, {}, {}, {}]
      }
    ];
    
    await vm.trainPhrasePredictor(trainingData);
    
    // Test phrase-level prediction
    const result = await vm.generateText('Hello world', { maxPhrases: 2 });
    
    phrase_level_works = result.phrases && result.phrases.length > 2;
    
    if (!phrase_level_works) {
      error = 'Phrase-level prediction not working';
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.accuracy_tests.push({
    test_name: 'phrase_level_accuracy',
    success: phrase_level_works,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testContextAwareness(vm, results, config) {
  const startTime = performance.now();
  let context_aware = false;
  let error = null;
  
  try {
    // Test context window awareness
    const shortContext = await vm.generateText('A', { maxPhrases: 1 });
    const longContext = await vm.generateText('A B C D E F G H I J', { maxPhrases: 1 });
    
    // Should handle different context lengths
    context_aware = shortContext.text !== longContext.text || 
                   shortContext.phrases.length !== longContext.phrases.length;
    
    if (!context_aware) {
      error = 'Context awareness not working properly';
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.context_tests.push({
    test_name: 'context_awareness',
    success: context_aware,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

async function testTrainingEffectiveness(vm, results, config) {
  const startTime = performance.now();
  let training_effective = false;
  let error = null;
  
  try {
    // Test before training
    const beforeTraining = await vm.generateText('machine learning', { maxPhrases: 1 });
    
    // Train on specific patterns
    const trainingData = [
      {
        phrases: ['machine', 'learning', 'is', 'powerful'],
        vmStates: [{}, {}, {}, {}]
      },
      {
        phrases: ['machine', 'learning', 'enables', 'automation'],
        vmStates: [{}, {}, {}, {}]
      }
    ];
    
    await vm.trainPhrasePredictor(trainingData);
    
    // Test after training
    const afterTraining = await vm.generateText('machine learning', { maxPhrases: 1 });
    
    // Training should change predictions
    training_effective = beforeTraining.text !== afterTraining.text;
    
    if (!training_effective) {
      error = 'Training does not improve predictions';
    }
    
  } catch (e) {
    error = e.message;
  }
  
  results.details.training_tests.push({
    test_name: 'training_effectiveness',
    success: training_effective,
    execution_time_ms: performance.now() - startTime,
    error
  });
}

function calculateSuccess(tests) {
  const successful = tests.filter(t => t.success).length;
  return tests.length > 0 ? successful / tests.length : 0;
}

export default { runNextPhrasePredictionTests };
