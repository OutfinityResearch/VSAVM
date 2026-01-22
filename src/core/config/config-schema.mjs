/**
 * Configuration schema for VSAVM
 * Per DS006/DS007: Strategy selections and system parameters
 */

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  // Strategy selections
  strategies: {
    vsa: 'binary-sparse',
    canonicalizer: 'strict',
    storage: 'memory',
    search: 'beam',
    scoring: 'mdl-standard',
    conflictResolver: 'source-priority'
  },
  
  // VSA parameters (DS007)
  vsa: {
    dimensions: 10000,
    similarityThreshold: 0.35,
    retrievalK: 10,
    hashSeed: 0x5A5A5A5A
  },
  
  // VM/Budget parameters (DS007)
  vm: {
    defaultBudget: {
      maxDepth: 10,
      maxSteps: 1000,
      maxBranches: 5,
      maxTimeMs: 5000
    },
    strictMode: true,
    traceLevel: 'standard'  // 'minimal' | 'standard' | 'verbose'
  },
  
  // Search parameters (DS007)
  search: {
    beamWidth: 10,
    maxIterations: 100,
    diversityWeight: 0.2,
    earlyStopThreshold: 0.95
  },
  
  // Storage parameters
  storage: {
    cacheSize: 256,  // MB
    snapshotRetention: 10,
    indexBatchSize: 1000,
    vacuumIntervalMs: 3600000
  },
  
  // Closure parameters (DS007)
  closure: {
    defaultMode: 'strict',  // 'strict' | 'conditional'
    timeOverlapPolicy: 'strict',  // 'strict' | 'lenient'
    branchPruneThreshold: 0.1,
    conflictCheckInterval: 10
  },
  
  // MDL scoring weights (DS007)
  mdl: {
    complexityWeight: 1.0,
    residualWeight: 2.0,
    correctnessPenalty: 10.0,
    budgetPenalty: 0.5
  },
  
  // Canonicalization settings (DS007)
  canonicalization: {
    caseSensitive: false,
    stripPunctuation: true,
    normalizeWhitespace: true,
    numberPrecision: 6,
    timePrecision: 'second'
  }
};

/**
 * Create a configuration by merging with defaults
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createConfig(overrides = {}) {
  return deepMerge(DEFAULT_CONFIG, overrides);
}

/**
 * Validate configuration
 * @param {Object} config
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateConfig(config) {
  const errors = [];
  
  // Check strategy names
  const validStrategies = {
    vsa: ['binary-sparse', 'bipolar-dense', 'holographic', 'mock'],
    canonicalizer: ['strict', 'fuzzy', 'identity'],
    storage: ['memory', 'file', 'sqlite', 'leveldb', 'postgres'],
    search: ['beam', 'mcts', 'greedy'],
    scoring: ['mdl-standard', 'mdl-weighted'],
    conflictResolver: ['source-priority', 'temporal-priority', 'probabilistic']
  };
  
  for (const [key, validValues] of Object.entries(validStrategies)) {
    const value = config.strategies?.[key];
    if (value && !validValues.includes(value)) {
      errors.push(`Invalid ${key} strategy: ${value}. Valid: ${validValues.join(', ')}`);
    }
  }
  
  // Check numeric ranges
  if (config.vsa?.dimensions < 1000 || config.vsa?.dimensions > 100000) {
    errors.push('VSA dimensions must be between 1000 and 100000');
  }
  
  if (config.vsa?.similarityThreshold < 0.1 || config.vsa?.similarityThreshold > 0.8) {
    errors.push('VSA similarity threshold must be between 0.1 and 0.8');
  }
  
  if (config.vm?.defaultBudget?.maxDepth < 1 || config.vm?.defaultBudget?.maxDepth > 100) {
    errors.push('Budget maxDepth must be between 1 and 100');
  }
  
  if (config.vm?.defaultBudget?.maxSteps < 10 || config.vm?.defaultBudget?.maxSteps > 100000) {
    errors.push('Budget maxSteps must be between 10 and 100000');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Deep merge two objects
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}
