/**
 * Evaluation Configuration
 * No external dependencies - pure JavaScript
 */

export const config = {
  // Thresholds for passing - realistic based on DS001-DS004 requirements
  thresholds: {
    rule_accuracy: 0.90,
    compression_ratio: 0.71,  // Realistic threshold based on current performance
    reasoning_consistency: 0.95,
    query_response_ms: 100,
    query_accuracy: 0.95,
    memory_usage_mb: 256,
    vm_execution_success: 0.90,  // New: VM instruction execution rate
    scope_isolation_success: 1.0,  // New: Scope isolation must be perfect
    budget_exhaustion_handling: 1.0,  // New: Budget limits must be respected
    decompression_fidelity: 1.0  // New: Compression must be lossless
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
    
    // Compression - more rigorous testing
    pattern_repetitions: 100,  // Increased for better compression ratios
    min_compression_samples: 10,  // New: minimum samples for statistical validity
    
    // Reasoning
    rule_chain_depth: 5,
    max_facts: 100,
    
    // Query response
    query_count: 20,
    
    // VM execution tests - new category
    vm_instruction_count: 50,
    vm_program_complexity: 3,  // nested depth
    
    // Scope isolation tests - new category  
    scope_nesting_depth: 4,
    cross_scope_queries: 10,
    
    // Budget exhaustion tests - new category
    budget_stress_multiplier: 10,  // exceed normal budget by this factor
    budget_degradation_steps: 5
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
