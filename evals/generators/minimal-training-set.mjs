/**
 * Minimal Training Dataset Generator for MicroLLM Evaluation
 * Creates the smallest viable dataset for architecture comparison
 */

export function generateMinimalTrainingSet() {
  return {
    facts: generateMinimalFacts(),
    rules: generateMinimalRules(),
    queries: generateMinimalQueries(),
    compressionSamples: generateMinimalCompressionSamples()
  };
}

function generateMinimalFacts() {
  return [
    // Basic factual knowledge (100 facts)
    { id: 'geo_1', content: 'Paris is the capital of France', domain: 'geography' },
    { id: 'geo_2', content: 'London is the capital of England', domain: 'geography' },
    { id: 'math_1', content: '2 + 2 = 4', domain: 'mathematics' },
    { id: 'math_2', content: '3 * 3 = 9', domain: 'mathematics' },
    { id: 'sci_1', content: 'Water boils at 100 degrees Celsius', domain: 'science' },
    // ... generate 95 more programmatically
    ...Array.from({ length: 95 }, (_, i) => ({
      id: `fact_${i + 6}`,
      content: `Generated fact ${i + 6} for testing`,
      domain: ['geography', 'mathematics', 'science', 'history'][i % 4]
    }))
  ];
}

function generateMinimalRules() {
  return [
    // Basic inference patterns (20 rules)
    { id: 'rule_1', pattern: 'If X is capital of Y, then X is in Y', type: 'implication' },
    { id: 'rule_2', pattern: 'If X + Y = Z, then Y + X = Z', type: 'commutativity' },
    { id: 'rule_3', pattern: 'If X is human, then X is mortal', type: 'universal' },
    { id: 'rule_4', pattern: 'If X boils at Y degrees, then X is liquid below Y', type: 'physical' },
    { id: 'rule_5', pattern: 'If X implies Y and Y implies Z, then X implies Z', type: 'transitivity' },
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `rule_${i + 6}`,
      pattern: `Generated rule ${i + 6} for pattern matching`,
      type: ['implication', 'equivalence', 'negation'][i % 3]
    }))
  ];
}

function generateMinimalQueries() {
  return [
    // Test reasoning capability (50 queries)
    { id: 'q_1', query: 'What is the capital of France?', expected: 'Paris', type: 'factual' },
    { id: 'q_2', query: 'What is 2 + 2?', expected: '4', type: 'computational' },
    { id: 'q_3', query: 'If Socrates is human, is Socrates mortal?', expected: 'yes', type: 'logical' },
    { id: 'q_4', query: 'At what temperature does water boil?', expected: '100', type: 'factual' },
    { id: 'q_5', query: 'Is Paris in France?', expected: 'yes', type: 'inference' },
    ...Array.from({ length: 45 }, (_, i) => ({
      id: `q_${i + 6}`,
      query: `Test query ${i + 6}?`,
      expected: `answer_${i + 6}`,
      type: ['factual', 'computational', 'logical', 'inference'][i % 4]
    }))
  ];
}

function generateMinimalCompressionSamples() {
  return [
    // Pattern compression tests (10 samples)
    {
      id: 'comp_1',
      pattern: 'The cat sat on the mat. The cat sat on the hat. The cat sat on the bat.',
      expectedCompression: 0.6
    },
    {
      id: 'comp_2', 
      pattern: 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z',
      expectedCompression: 0.8
    },
    {
      id: 'comp_3',
      pattern: 'repeat repeat repeat repeat repeat repeat repeat repeat',
      expectedCompression: 0.9
    },
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `comp_${i + 4}`,
      pattern: `Pattern ${i + 4} `.repeat(10),
      expectedCompression: 0.7 + (i * 0.02)
    }))
  ];
}

export function validateMinimalDataset(dataset) {
  const validation = {
    valid: true,
    errors: [],
    stats: {
      totalFacts: dataset.facts.length,
      totalRules: dataset.rules.length,
      totalQueries: dataset.queries.length,
      totalCompressionSamples: dataset.compressionSamples.length
    }
  };
  
  // Validate minimum requirements
  if (dataset.facts.length < 100) {
    validation.errors.push(`Insufficient facts: ${dataset.facts.length} < 100`);
    validation.valid = false;
  }
  
  if (dataset.rules.length < 20) {
    validation.errors.push(`Insufficient rules: ${dataset.rules.length} < 20`);
    validation.valid = false;
  }
  
  if (dataset.queries.length < 50) {
    validation.errors.push(`Insufficient queries: ${dataset.queries.length} < 50`);
    validation.valid = false;
  }
  
  if (dataset.compressionSamples.length < 10) {
    validation.errors.push(`Insufficient compression samples: ${dataset.compressionSamples.length} < 10`);
    validation.valid = false;
  }
  
  return validation;
}

export default { generateMinimalTrainingSet, validateMinimalDataset };
