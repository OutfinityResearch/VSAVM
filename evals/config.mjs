/**
 * Evaluation Configuration
 * No external dependencies - pure JavaScript
 */

export const config = {
  // Thresholds for passing
  thresholds: {
    rule_accuracy: 0.90,
    compression_ratio: 0.50,
    reasoning_consistency: 0.95,
    query_response_ms: 100,
    query_accuracy: 0.95,
    memory_usage_mb: 256
  },

  // Timeouts per category (ms)
  timeouts: {
    rule_learning: 30000,
    compression: 20000,
    reasoning: 30000,
    query_response: 10000
  },

  // Test parameters
  params: {
    // Rule learning
    sequence_length: 20,
    num_sequences: 10,
    rule_learning_min_confidence: 0.7,
    
    // Compression
    pattern_repetitions: 50,
    
    // Reasoning
    rule_chain_depth: 5,
    max_facts: 100,
    
    // Query response
    query_count: 20
  },

  // VSAVM configuration for tests
  vsavm: {
    strategies: {
      vsa: 'mock',
      storage: 'memory'
    },
    vsa: {
      dimensions: 1000,
      similarityThreshold: 0.35
    },
    vm: {
      defaultBudget: {
        maxDepth: 10,
        maxSteps: 1000,
        maxBranches: 5,
        maxTimeMs: 5000
      }
    }
  }
};

export default config;
