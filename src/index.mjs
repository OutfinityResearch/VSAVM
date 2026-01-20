/**
 * VSAVM - Vector Symbolic Architecture Virtual Machine
 * Main entry point and service composition
 * 
 * Per DS006: Service composition with strategy injection
 */

// Core exports
export * from './core/index.mjs';

// VM exports
export { 
  Budget, 
  Executor, 
  VMState, 
  VMService,
  executeProgram,
  BindingEnv,
  ContextStack,
  ExecutionLog,
  FactStore
} from './vm/index.mjs';

// Training exports
export {
  RuleLearner,
  createRuleLearner,
  TrainingService,
  createTrainingService,
  PatternMiner,
  createPatternMiner,
  SchemaProposer,
  createSchemaProposer,
  Consolidator,
  createConsolidator
} from './training/index.mjs';

// VSA exports
export { VSAService, MockVSA, BinarySparseVSA } from './vsa/index.mjs';

// Storage exports
export { MemoryStore } from './storage/index.mjs';

// Event Stream exports
export { TextParser, parseText } from './event-stream/index.mjs';

// Strategy registration
import { 
  registerVSAStrategy, 
  registerStorageStrategy,
  registerCanonicalizerStrategy,
  getVSAStrategy,
  getStorageStrategy,
  getCanonicalizerStrategy
} from './core/config/strategy-registry.mjs';
import { MockVSA } from './vsa/strategies/mock-vsa.mjs';
import { BinarySparseVSA } from './vsa/strategies/binary-sparse.mjs';
import { MemoryStore } from './storage/strategies/memory-store.mjs';
import { VSAService } from './vsa/vsa-service.mjs';
import { VMService } from './vm/vm-service.mjs';
import { createConfig } from './core/config/config-schema.mjs';
import { 
  IdentityCanonicalizer, 
  StrictCanonicalizer, 
  FuzzyCanonicalizer 
} from './core/canonicalization/index.mjs';
import { createRuleLearner } from './training/rule-learner.mjs';

// Register default strategies
registerVSAStrategy('mock', (config) => new MockVSA(
  config?.vsa?.dimensions ?? 1000,
  config?.vsa?.similarityThreshold ?? 0.35
));

registerVSAStrategy('binary-sparse', (config) => new BinarySparseVSA(
  config?.vsa?.dimensions ?? 10000,
  0.5,
  config?.vsa?.similarityThreshold ?? 0.35
));

registerStorageStrategy('memory', () => new MemoryStore());

// Register default canonicalizer strategies
registerCanonicalizerStrategy('identity', (config) => new IdentityCanonicalizer(
  config?.canonicalization
));

registerCanonicalizerStrategy('strict', (config) => new StrictCanonicalizer(
  config?.canonicalization
));

registerCanonicalizerStrategy('fuzzy', (config) => new FuzzyCanonicalizer(
  config?.canonicalization
));

/**
 * VSAVM - Main class for the system
 */
export class VSAVM {
  /**
   * Create a new VSAVM instance
   * @param {Object} [configOverrides]
   */
  constructor(configOverrides = {}) {
    this.config = createConfig(configOverrides);
    
    // Initialize services with configured strategies
    const vsaStrategy = getVSAStrategy(
      this.config.strategies.vsa,
      this.config
    );
    
    this.vsa = new VSAService(vsaStrategy);
    this.storage = getStorageStrategy(
      this.config.strategies.storage,
      this.config
    );

    // Canonicalizer strategy
    this.canonicalizer = getCanonicalizerStrategy(
      this.config.strategies.canonicalizer,
      this.config
    );
    
    // VM service
    this.vm = new VMService(this.storage, {
      strictMode: this.config.vm?.strictMode ?? true,
      traceLevel: this.config.vm?.traceLevel ?? 'standard',
      defaultBudget: this.config.vm?.defaultBudget ?? {},
      canonicalizer: this.canonicalizer
    });

    // Rule learner for training
    this.ruleLearner = createRuleLearner({
      minConfidence: this.config.training?.minConfidence ?? 0.7
    });
    
    this.initialized = false;
  }

  /**
   * Initialize the system
   */
  async initialize() {
    if (this.initialized) return;
    
    await this.storage.initialize();
    this.initialized = true;
  }

  /**
   * Shutdown the system
   */
  async close() {
    if (!this.initialized) return;
    
    await this.storage.close();
    this.initialized = false;
  }

  /**
   * Assert a fact into the store
   * @param {Object} fact - FactInstance
   */
  async assertFact(fact) {
    await this.storage.assertFact(fact);
    // Index in VSA
    this.vsa.vectorizeFact(fact);
  }

  /**
   * Query facts by pattern
   * @param {Object} pattern
   * @returns {Promise<Object[]>}
   */
  async queryFacts(pattern) {
    return this.storage.query(pattern);
  }

  /**
   * Execute a VM program
   * @param {Object} program
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async execute(program, options = {}) {
    return this.vm.execute(program, options);
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    const factCount = await this.storage.count();
    return {
      factCount,
      vsaStrategy: this.vsa.name,
      vsaDimensions: this.vsa.dimensions,
      storageStrategy: this.storage.name,
      config: this.config
    };
  }

  /**
   * Learn a rule from a sequence
   * Per DS005: Training and rule learning
   * @param {Object} payload - Learning payload
   * @param {string} payload.name - Rule name
   * @param {string} [payload.type] - Expected pattern type hint
   * @param {number[]} payload.sequence - Input sequence
   * @param {Object} [payload.expectedRule] - Expected rule for validation
   * @returns {Promise<Object>} Learning result
   */
  async learnRule(payload) {
    return this.ruleLearner.learnRule(payload);
  }

  /**
   * Learn multiple rules from sequences
   * @param {Object[]} payloads - Array of learning payloads
   * @returns {Promise<Object[]>}
   */
  async learnRules(payloads) {
    return this.ruleLearner.learnRules(payloads);
  }

  /**
   * Compress a pattern using MDL-based compression
   * Uses rule learning to find patterns and represent data compactly
   * @param {Object} payload - Compression payload
   * @param {string} payload.name - Pattern name
   * @param {Array} payload.data - Data to compress
   * @returns {Promise<Object>} Compression result
   */
  async compressPattern(payload) {
    const { name, data } = payload;

    if (!data || !Array.isArray(data)) {
      return {
        success: false,
        error: 'Invalid data: must be an array',
        compressedSize: null
      };
    }

    const originalSize = JSON.stringify(data).length;
    const compressionResults = [];

    // Method 1: Try cyclic pattern detection (most common)
    const cyclicResult = this.detectCyclicPattern(data);
    if (cyclicResult) {
      compressionResults.push(cyclicResult);
    }

    // Method 2: Try numeric rule learning (arithmetic/geometric progressions)
    if (data.every(x => typeof x === 'number')) {
      const learnResult = await this.ruleLearner.learnRule({
        name: `compress_${name}`,
        sequence: data
      });

      if (learnResult.success && learnResult.rule) {
        const compressed = {
          t: 'r', // type: rule
          r: learnResult.rule,
          n: data.length
        };
        compressionResults.push({
          compressed,
          compressedSize: JSON.stringify(compressed).length,
          method: 'rule'
        });
      }
    }

    // Method 3: Run-length encoding
    const rle = this.runLengthEncode(data);
    const rleSize = JSON.stringify(rle).length;
    if (rleSize < originalSize) {
      compressionResults.push({
        compressed: rle,
        compressedSize: rleSize,
        method: 'rle'
      });
    }

    // Pick best compression method
    if (compressionResults.length === 0) {
      return {
        success: false,
        error: 'No pattern found for compression',
        compressedSize: originalSize,
        originalSize,
        compressionRatio: 0
      };
    }

    // Sort by size (smallest first)
    compressionResults.sort((a, b) => a.compressedSize - b.compressedSize);
    const best = compressionResults[0];

    return {
      success: true,
      compressed: best.compressed,
      compressedSize: best.compressedSize,
      originalSize,
      compressionRatio: 1 - (best.compressedSize / originalSize),
      method: best.method
    };
  }

  /**
   * Detect cyclic (repeating) pattern
   * @private
   */
  detectCyclicPattern(data) {
    if (!data || data.length < 2) return null;

    // Try various cycle lengths
    for (let cycleLen = 1; cycleLen <= Math.floor(data.length / 2); cycleLen++) {
      if (data.length % cycleLen !== 0) continue;

      const cycle = data.slice(0, cycleLen);
      let matches = true;

      for (let i = cycleLen; i < data.length && matches; i++) {
        if (!this.valuesEqual(data[i], cycle[i % cycleLen])) {
          matches = false;
        }
      }

      if (matches) {
        const compressed = {
          t: 'c', // type: cyclic
          p: cycle, // pattern
          n: data.length / cycleLen // repetitions
        };
        return {
          compressed,
          compressedSize: JSON.stringify(compressed).length,
          method: 'cyclic'
        };
      }
    }

    return null;
  }

  /**
   * Simple run-length encoding
   * @private
   */
  runLengthEncode(data) {
    if (!data || data.length === 0) return { t: 'e', r: [] };

    const runs = [];
    let current = data[0];
    let count = 1;

    for (let i = 1; i < data.length; i++) {
      if (this.valuesEqual(data[i], current)) {
        count++;
      } else {
        runs.push([current, count]);
        current = data[i];
        count = 1;
      }
    }
    runs.push([current, count]);

    return { t: 'l', r: runs };
  }

  /**
   * Compare values for equality
   * @private
   */
  valuesEqual(a, b) {
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  }
}

/**
 * Create a default VSAVM instance for testing/development
 */
export function createDefaultVSAVM() {
  return new VSAVM({
    strategies: {
      vsa: 'mock',
      storage: 'memory'
    },
    vsa: {
      dimensions: 1000,
      similarityThreshold: 0.35
    }
  });
}

// Default export
export default VSAVM;
