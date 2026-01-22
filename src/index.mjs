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
  createConsolidator,
  PatternCompressor
} from './training/index.mjs';

// VSA exports
export { VSAService, MockVSA, BinarySparseVSA, serializeHyperVector, deserializeHyperVector } from './vsa/index.mjs';

// Storage exports
export { MemoryStore } from './storage/index.mjs';

// Event Stream exports
export { 
  TextParser, 
  parseText, 
  ingestEvents, 
  ingestText,
  fromAudioTranscript,
  fromVisualTokens,
  fromVideoSegments,
  scopeIdFromContextPath,
  scopeIdFromEvent,
  extendContextPath,
  ScopeTree
} from './event-stream/index.mjs';
export { detectStructuralSeparators, createStructuralScopeId } from './event-stream/separator-detector.mjs';

// Compiler/search/closure exports
export { CompilerService, createCompilerService } from './compiler/compiler-service.mjs';
export { SearchService, createSearchService } from './search/search-service.mjs';
export { ClosureService, createClosureService } from './closure/closure-service.mjs';
export { GenerationService, createGenerationService } from './generation/index.mjs';
export { 
  handleQuery, 
  handleStats, 
  handleRules,
  handleRequest,
  RequestType,
  createQueryRequest,
  createStatsRequest,
  createRulesRequest,
  ResponseStatus,
  createSuccessResponse,
  createErrorResponse
} from './api/index.mjs';
export {
  CanonicalService,
  StrictCanonicalizer,
  IdentityCanonicalizer,
  normalizeText,
  textsEquivalent,
  TEXT_NORMALIZE_DEFAULTS,
  normalizeNumber,
  numbersEquivalent,
  canonicalNumberToString,
  normalizeTime,
  timesEquivalent,
  canonicalTimeToString,
  truncateToPrecision,
  resolveEntity,
  ENTITY_RESOLUTION_DEFAULTS
} from './canonicalization/index.mjs';

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
import { FileStore } from './storage/strategies/file-store.mjs';
import { SqliteStore } from './storage/strategies/sqlite-store.mjs';
import { LevelDbStore } from './storage/strategies/leveldb-store.mjs';
import { PostgresStore } from './storage/strategies/postgres-store.mjs';
import { VSAService } from './vsa/vsa-service.mjs';
import { VMService } from './vm/vm-service.mjs';
import { createConfig } from './core/config/config-schema.mjs';
import { VSAVMError } from './core/errors.mjs';
import { 
  IdentityCanonicalizer, 
  StrictCanonicalizer, 
  FuzzyCanonicalizer 
} from './core/canonicalization/index.mjs';
import { createRuleLearner } from './training/rule-learner.mjs';
import { PatternCompressor } from './training/compression/pattern-compressor.mjs';
import { CompilerService } from './compiler/compiler-service.mjs';
import { SearchService } from './search/search-service.mjs';
import { ClosureService } from './closure/closure-service.mjs';
import { ResponseMode } from './core/types/results.mjs';
import { detectStructuralSeparators, updateSeparatorThreshold } from './event-stream/separator-detector.mjs';
import { ingestEvents, ingestText } from './event-stream/ingest.mjs';
import { GenerationService } from './generation/generation-service.mjs';
import { handleError } from './core/error-handling.mjs';
import { 
  createSchemaSlot,
  createSchemaTrigger,
  createOutputContract,
  SlotType,
  OutputKind,
  OutputMode
} from './compiler/schemas/schema-model.mjs';
import { QueryFeature } from './compiler/pipeline/normalizer.mjs';

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
registerStorageStrategy('file', (config) => new FileStore(config));
registerStorageStrategy('sqlite', () => new SqliteStore());
registerStorageStrategy('leveldb', () => new LevelDbStore());
registerStorageStrategy('postgres', () => new PostgresStore());

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
    VSAVMError.deterministicTime = this.config.vm?.strictMode ?? true;
    
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

    // Pattern compressor for DS005 compression evaluation
    this.compressor = new PatternCompressor(this.config.training?.compression ?? {});

    // Compiler/search/closure pipeline
    this.compiler = new CompilerService({
      vsaService: this.vsa,
      deterministicTime: this.config.vm?.strictMode ?? true
    });
    this.registerDefaultSchemas();
    this.search = new SearchService();
    this.closure = new ClosureService({
      defaultMode: this.config.vm?.strictMode ? ResponseMode.STRICT : ResponseMode.CONDITIONAL
    });
    this.generation = new GenerationService();

    // Expose separator detector for evaluation and feedback
    this.separatorDetector = {
      detectSeparators: detectStructuralSeparators,
      updateThreshold: updateSeparatorThreshold
    };
    
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
   * Ingest raw text into the system (event stream + facts).
   * @param {string} text
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async ingestText(text, options = {}) {
    try {
      return await ingestText(this, text, options);
    } catch (error) {
      return handleError(error, { operation: 'ingestText', module: 'vsavm' });
    }
  }

  /**
   * Ingest a pre-built event list into the system.
   * @param {Array} events
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async ingestEvents(events, options = {}) {
    try {
      return await ingestEvents(this, events, options);
    } catch (error) {
      return handleError(error, { operation: 'ingestEvents', module: 'vsavm' });
    }
  }

  /**
   * Compile, search, execute, and verify a natural language query
   * @param {string} queryText
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async answerQuery(queryText, options = {}) {
    try {
      const compilation = await this.compiler.compile(queryText, options.context ?? {});
      if (!compilation.success) {
        return {
          success: false,
          error: compilation.errors?.join('; ') || 'Compilation failed',
          compilation
        };
      }

      const candidates = compilation.hypotheses;
      const searchContext = {
        store: this.storage,
        budget: options.budget ?? this.config.vm?.defaultBudget,
        closureService: this.closure,
        executor: this.vm
      };

      const best = await this.search.selectBest(candidates, searchContext);
      const hypothesis = best ?? compilation.getBestHypothesis();

      if (!hypothesis) {
        return {
          success: false,
          error: 'No executable hypothesis selected',
          compilation
        };
      }

      const execution = await this.vm.execute(hypothesis.program, {
        budget: options.budget ?? this.config.vm?.defaultBudget
      });

      const closureStore = {
        getAllFacts: () => (typeof this.storage.getAllFacts === 'function'
          ? this.storage.getAllFacts()
          : []),
        getRules: () => this.vm.ruleStore?.getRules?.() ?? []
      };

      const closure = await this.closure.verify(
        execution,
        closureStore,
        options.closureBudget ?? options.budget ?? this.config.vm?.defaultBudget,
        options.mode
      );

      if (typeof this.separatorDetector?.updateThreshold === 'function') {
        const success = closure.mode === ResponseMode.STRICT && !closure.hasConflicts();
        this.separatorDetector.updateThreshold(success ? 1.0 : 0.0);
      }

      const schemaId = hypothesis.sourceSchemaId;
      if (schemaId) {
        const schema = this.compiler.schemaStore.get(schemaId);
        if (schema) {
          const success = closure.mode === ResponseMode.STRICT && !closure.hasConflicts();
          schema.recordUsage(
            success,
            hypothesis.hasAssumptions(),
            closure.executionMs ?? 0,
            this.config.vm?.strictMode ?? true
          );
          if (!success) {
            schema.recordClosureFailure();
          }
        }
      }

      return {
        success: true,
        compilation,
        hypothesis,
        execution,
        closure
      };
    } catch (error) {
      return handleError(error, { operation: 'answerQuery', module: 'vsavm' });
    }
  }

  /**
   * Add a rule to the rule store.
   * @param {Object} rule
   * @returns {Object|null}
   */
  addRule(rule) {
    return this.vm.ruleStore.addRule(rule);
  }

  /**
   * Get all stored rules.
   * @returns {Object[]}
   */
  getRules() {
    return this.vm.ruleStore.getRules();
  }

  /**
   * Clear all stored rules.
   */
  clearRules() {
    this.vm.ruleStore.clear();
  }

  registerDefaultSchemas() {
    const store = this.compiler.schemaStore;
    if (!store) return;

    store.add({
      schemaId: 'builtin:predicate_query:v1',
      name: 'Predicate query',
      trigger: createSchemaTrigger({
        requiredFeatures: [QueryFeature.LIST_REQUEST],
        keywords: ['list', 'show', 'find', 'get']
      }),
      slots: [
        createSchemaSlot('predicate', SlotType.PREDICATE)
      ],
      programTemplate: [
        {
          op: 'QUERY',
          args: {
            predicate: '$predicate'
          },
          out: 'results'
        },
        {
          op: 'RETURN',
          args: {
            value: { var: 'results' }
          }
        }
      ],
      outputContract: createOutputContract(OutputKind.FACT_LIST, OutputMode.STRICT_OR_CONDITIONAL)
    });

    store.add({
      schemaId: 'builtin:predicate_count:v1',
      name: 'Predicate count',
      trigger: createSchemaTrigger({
        requiredFeatures: [QueryFeature.QUANTIFIER],
        keywords: ['count', 'number', 'how']
      }),
      slots: [
        createSchemaSlot('predicate', SlotType.PREDICATE)
      ],
      programTemplate: [
        {
          op: 'QUERY',
          args: {
            predicate: '$predicate'
          },
          out: 'results'
        },
        {
          op: 'COUNT',
          args: {
            value: { var: 'results' }
          },
          out: 'count'
        },
        {
          op: 'RETURN',
          args: {
            value: { var: 'count' }
          }
        }
      ],
      outputContract: createOutputContract(OutputKind.VERDICT, OutputMode.ANY)
    });

    store.add({
      schemaId: 'builtin:predicate_exists:v1',
      name: 'Predicate exists',
      trigger: createSchemaTrigger({
        requiredFeatures: [QueryFeature.EXISTENTIAL],
        keywords: ['is', 'are', 'exists', 'exist', 'there']
      }),
      slots: [
        createSchemaSlot('predicate', SlotType.PREDICATE)
      ],
      programTemplate: [
        {
          op: 'QUERY',
          args: {
            predicate: '$predicate'
          },
          out: 'results'
        },
        {
          op: 'COUNT',
          args: {
            value: { var: 'results' }
          },
          out: 'count'
        },
        {
          op: 'BRANCH',
          args: {
            condition: '$count > 0',
            then: 'has_results',
            else: 'no_results'
          }
        },
        {
          label: 'has_results',
          op: 'RETURN',
          args: { value: true }
        },
        {
          label: 'no_results',
          op: 'RETURN',
          args: { value: false }
        }
      ],
      outputContract: createOutputContract(OutputKind.VERDICT, OutputMode.ANY)
    });
  }

  /**
   * Render a query result to text using the generation service.
   * @param {Object} result
   * @returns {Object}
   */
  renderResult(result) {
    return this.generation.render(result);
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
    const { name, data } = payload ?? {};

    if (!data) {
      return {
        success: false,
        error: 'No data provided',
        compressedSize: null
      };
    }

    const originalSize = JSON.stringify(data).length;

    if (this.compressor?.compress) {
      const result = this.compressor.compress(payload);
      const compressedBytes = Number.isFinite(result?.compressedBytes)
        ? result.compressedBytes
        : result?.compressedSize;
      const baseSize = Number.isFinite(result?.originalSize) ? result.originalSize : originalSize;

      if (Number.isFinite(compressedBytes)) {
        return {
          success: true,
          compressed: result.compressed,
          compressedBytes,
          compressedSize: compressedBytes,
          originalSize: baseSize,
          compressionRatio: 1 - (compressedBytes / baseSize),
          method: result.method ?? 'pattern',
          decompress: result.decompress ?? (() => this.decompressPattern(result.compressed))
        };
      }
    }

    // Smart compression: check if data is worth compressing
    if (Array.isArray(data) && data.length > 10) {
      const uniqueValues = new Set(data).size;
      const repetitionRatio = data.length / uniqueValues;
      
      // If low repetition (< 2x), likely not compressible
      if (repetitionRatio < 2) {
        return {
          success: false,
          error: 'Low repetition pattern detected',
          compressedSize: originalSize,
          originalSize,
          compressionRatio: 0,
          method: 'none',
          decompress: () => data
        };
      }
    }
    
    const compressionResults = [];

    // Handle non-array data (like nested structures)
    if (!Array.isArray(data)) {
      const jsonStr = JSON.stringify(data);
      const compressed = this.compressJSON(jsonStr);
      if (compressed && compressed.length < jsonStr.length) {
        compressionResults.push({
          compressed: { t: 'j', d: compressed },
          compressedSize: JSON.stringify({ t: 'j', d: compressed }).length,
          method: 'json'
        });
      }
    } else {
      // Original array compression logic
      const cyclicResult = this.detectCyclicPattern(data);
      if (cyclicResult) {
        compressionResults.push(cyclicResult);
      }

      if (data.every(x => typeof x === 'number')) {
        const learnResult = await this.ruleLearner.learnRule({
          name: `compress_${name}`,
          sequence: data
        });

        if (learnResult.success && learnResult.rule) {
          const compressed = {
            t: 'r',
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

      const rle = this.runLengthEncode(data);
      const rleSize = JSON.stringify({ t: 'rle', d: rle }).length;
      if (rleSize < originalSize) {
        compressionResults.push({
          compressed: { t: 'rle', d: rle },
          compressedSize: rleSize,
          method: 'rle'
        });
      }
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
      method: best.method,
      decompress: () => this.decompressPattern(best.compressed)  // Add decompression function
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
          t: 'c',
          p: cycle,
          n: Math.floor(data.length / cycleLen)  // Use floor to be more precise
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
   * Decompress pattern data
   * @param {Object} compressed - Compressed data
   * @returns {*} Original data
   */
  decompressPattern(compressed) {
    const candidate = compressed?.compressed ?? compressed;

    if (candidate?.kind && this.compressor?.decompress) {
      return this.compressor.decompress(candidate);
    }

    if (!candidate || !candidate.t) {
      throw new Error('Invalid compressed data');
    }

    switch (candidate.t) {
      case 'c': // cyclic
        const result = [];
        for (let i = 0; i < candidate.n; i++) {
          result.push(...candidate.p);
        }
        return result;

      case 'r': // rule-based
        const sequence = [];
        for (let i = 0; i < candidate.n; i++) {
          sequence.push(this.applyRule(candidate.r, i));
        }
        return sequence;

      case 'rle': // run-length encoding
        const decoded = [];
        for (const [value, count] of candidate.d) {
          for (let i = 0; i < count; i++) {
            decoded.push(value);
          }
        }
        return decoded;

      case 'j': // json
        return JSON.parse(candidate.d
          .replace(/"t":"n"/g, '"type":"node"')
          .replace(/"c"/g, '"children"')
          .replace(/"v"/g, '"value"'));

      default:
        throw new Error(`Unknown compression type: ${candidate.t}`);
    }
  }

  /**
   * Calculate entropy of data array
   * @private
   */
  calculateEntropy(data) {
    const freq = new Map();
    for (const item of data) {
      const key = JSON.stringify(item);
      freq.set(key, (freq.get(key) || 0) + 1);
    }
    
    let entropy = 0;
    const total = data.length;
    for (const count of freq.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }

  /**
   * Apply rule to generate value at position
   * @private
   */
  applyRule(rule, position) {
    switch (rule.type) {
      case 'arithmetic':
        return rule.start + position * rule.step;
      case 'geometric':
        return rule.start * Math.pow(rule.ratio, position);
      case 'fibonacci':
        if (position === 0) return 0;
        if (position === 1) return 1;
        let a = 0, b = 1;
        for (let i = 2; i <= position; i++) {
          [a, b] = [b, a + b];
        }
        return b;
      case 'polynomial':
        return rule.coefficients.reduce((sum, coef, i) => sum + coef * Math.pow(position, i), 0);
      default:
        return 0;
    }
  }

  /**
   * Simple JSON compression (remove whitespace, common patterns)
   * @private
   */
  compressJSON(jsonStr) {
    // More aggressive compression for nested structures
    return jsonStr
      .replace(/\s+/g, '')  // Remove whitespace
      .replace(/"type":"node"/g, '"t":"n"')  // Compress common patterns
      .replace(/"children"/g, '"c"')
      .replace(/"value"/g, '"v"')
      .replace(/\{"t":"n","c":\[/g, '{n:[')  // Further compress node patterns
      .replace(/\]\}/g, ']}')
      .replace(/,\{"t":"n"/g, ',{n')  // Compress repeated node starts
      .replace(/"c":\[\]/g, 'c:[]');  // Compress empty children
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
  /**
   * Generate text conditioned on current VM state
   * DS005 outer loop: next-phrase prediction
   * DS011: Uses MacroUnitModel with VM state conditioning and claims validation
   */
  async generateText(prompt, options = {}) {
    // Use MacroUnitModel if available (newer, better), else fall back to phrasePredictor
    if (options.useMacroUnitModel !== false && !options.useLegacy) {
      if (!this.macroUnitModel) {
        const { MacroUnitModel } = await import('./training/outer-loop/macro-unit-model.mjs');
        this.macroUnitModel = new MacroUnitModel({
          contextWindow: options.contextWindow ?? 32,
          useVMConditioning: true,
          useClaimValidation: true
        });
      }
      
      // Convert prompt to byte array if string
      const promptBytes = typeof prompt === 'string' 
        ? Array.from(Buffer.from(prompt))
        : prompt;
      
      // Generate with VM state conditioning
      const result = await this.macroUnitModel.generate(promptBytes, {
        maxTokens: options.maxTokens ?? 100,
        temperature: options.temperature ?? 0.7,
        topK: options.topK ?? 40,
        repetitionPenalty: options.repetitionPenalty ?? 1.4,
        ngramBlockSize: options.ngramBlockSize ?? 5,
        diversityBonus: options.diversityBonus ?? 0.25,
        vmState: this,  // Pass VM instance for conditioning
        mode: options.mode ?? 'CONDITIONAL'
      });
      
      // Convert back to string
      const text = Buffer.from(result.tokens).toString('utf8');
      
      return {
        text,
        macroUnitsUsed: result.macroUnits,
        compressionRatio: result.compressionRatio,
        vmConditioned: result.vmConditioned,
        validationStats: result.validationStats
      };
    }
    
    // Legacy path: use phrasePredictor
    if (!this.phrasePredictor) {
      const { VMConditionedLanguageModel } = await import('./training/outer-loop/phrase-predictor.mjs');
      this.phrasePredictor = new VMConditionedLanguageModel();
    }
    
    // Get current VM state
    const vmState = {
      facts: Array.from(this.storage.facts || []),
      rules: this.rules || [],
      contextStack: this.contextStack?.stack || [],
      budget: this.budget?.used || {}
    };
    
    return await this.phrasePredictor.generateText(prompt, vmState, options.maxPhrases);
  }

  /**
   * Load a pre-trained MacroUnitModel
   * @param {Object} modelState - Exported model state
   */
  async loadMacroUnitModel(modelState) {
    const { MacroUnitModel } = await import('./training/outer-loop/macro-unit-model.mjs');
    this.macroUnitModel = new MacroUnitModel();
    this.macroUnitModel.import(modelState);
  }

  /**
   * Export the MacroUnitModel state for saving
   * @param {Object} [options] - Export options
   * @returns {Object|null}
   */
  exportMacroUnitModel(options = {}) {
    if (!this.macroUnitModel) return null;
    return this.macroUnitModel.export(options);
  }

  /**
   * Train phrase predictor on examples
   */
  async trainPhrasePredictor(trainingData) {
    if (!this.phrasePredictor) {
      const { VMConditionedLanguageModel } = await import('./training/outer-loop/phrase-predictor.mjs');
      this.phrasePredictor = new VMConditionedLanguageModel();
    }
    
    return await this.phrasePredictor.train(trainingData);
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
