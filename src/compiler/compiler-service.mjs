/**
 * Compiler Service
 * Per DS003/DS006: High-level facade for query compilation
 * Orchestrates normalization, schema retrieval, slot filling, and program emission
 */

import { QueryNormalizer, createQueryNormalizer } from './pipeline/normalizer.mjs';
import { SlotFiller, createSlotFiller } from './pipeline/slot-filler.mjs';
import { SchemaStore, createSchemaStore } from './schemas/schema-store.mjs';
import { Program, createProgram, OpCode, binding, literal, slot } from './programs/program-ir.mjs';
import { Hypothesis, createHypothesis, compareHypotheses, deduplicateHypotheses } from './programs/hypothesis.mjs';
import { VSAVMError, ErrorCode } from '../core/errors.mjs';

/**
 * Compilation result
 */
export class CompilationResult {
  constructor(config = {}) {
    this.success = config.success ?? false;
    this.hypotheses = config.hypotheses ?? [];
    this.normalizedQuery = config.normalizedQuery ?? null;
    this.candidateSchemas = config.candidateSchemas ?? [];
    this.errors = config.errors ?? [];
    this.warnings = config.warnings ?? [];
    this.metadata = config.metadata ?? {};
  }

  /**
   * Get the best hypothesis
   */
  getBestHypothesis() {
    if (this.hypotheses.length === 0) return null;
    return this.hypotheses.reduce((best, h) => 
      h.score < best.score ? h : best
    );
  }

  /**
   * Get top-K hypotheses
   */
  getTopHypotheses(k = 5) {
    return [...this.hypotheses]
      .sort(compareHypotheses)
      .slice(0, k);
  }

  /**
   * Check if compilation produced any valid hypotheses
   */
  hasHypotheses() {
    return this.hypotheses.length > 0;
  }
}

/**
 * Compiler Service - main compilation orchestrator
 */
export class CompilerService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.vsaService] - VSA service for similarity
   * @param {Object} [options.schemaStore] - Pre-populated schema store
   * @param {Object} [options.normalizerOptions] - Query normalizer options
   * @param {Object} [options.slotFillerOptions] - Slot filler options
   */
  constructor(options = {}) {
    this.options = {
      maxHypotheses: 10,
      minSchemaConfidence: 0.3,
      ...options
    };

    // Initialize components
    this.normalizer = createQueryNormalizer(options.normalizerOptions ?? {});
    this.slotFiller = createSlotFiller(options.slotFillerOptions ?? {});
    this.schemaStore = options.schemaStore ?? createSchemaStore();

    // Set VSA service if provided
    if (options.vsaService) {
      this.setVSAService(options.vsaService);
    }
  }

  /**
   * Compile a query into candidate programs
   * @param {string} queryText - Raw query text
   * @param {Object} [context] - Additional context
   * @returns {Promise<CompilationResult>}
   */
  async compile(queryText, context = {}) {
    const errors = [];
    const warnings = [];
    const startTime = Date.now();

    // Step 1: Normalize query
    let normalizedQuery;
    try {
      normalizedQuery = this.normalizer.normalize(queryText);
    } catch (e) {
      return new CompilationResult({
        success: false,
        errors: [`Query normalization failed: ${e.message}`]
      });
    }

    // Step 2: Retrieve candidate schemas
    const queryContext = {
      ...normalizedQuery.toQueryContext(),
      ...context
    };

    let candidateSchemas;
    try {
      candidateSchemas = await this.schemaStore.retrieveCandidates(
        queryContext,
        this.options.maxHypotheses
      );
    } catch (e) {
      warnings.push(`Schema retrieval warning: ${e.message}`);
      candidateSchemas = [];
    }

    // If no schemas found, try to create a default program
    if (candidateSchemas.length === 0) {
      const defaultHypothesis = this._createDefaultHypothesis(normalizedQuery);
      if (defaultHypothesis) {
        return new CompilationResult({
          success: true,
          hypotheses: [defaultHypothesis],
          normalizedQuery,
          candidateSchemas: [],
          warnings: ['No matching schemas found, using default query program'],
          metadata: {
            compilationTimeMs: Date.now() - startTime,
            method: 'default'
          }
        });
      }
      
      return new CompilationResult({
        success: false,
        normalizedQuery,
        candidateSchemas: [],
        errors: ['No matching schemas found and could not create default program']
      });
    }

    // Step 3: For each schema, fill slots and create hypothesis
    const hypotheses = [];

    for (const { schema, score, method } of candidateSchemas) {
      try {
        const fillResult = this.slotFiller.fillSlots(schema, normalizedQuery, context);

        if (fillResult.success) {
          // Create program from template
          const program = this._instantiateProgram(schema, fillResult.bindings);
          
          // Create hypothesis
          const hypothesis = createHypothesis({
            program,
            bindings: fillResult.bindings,
            score: this._computeScore(schema, fillResult, score),
            sourceSchemaId: schema.schemaId,
            derivationMethod: method
          });

          // Run early checks
          this._runEarlyChecks(hypothesis, fillResult);

          // Add ambiguity-based assumptions
          for (const ambiguity of fillResult.ambiguities) {
            hypothesis.addAssumption({
              description: `Slot '${ambiguity.slot}' bound to '${JSON.stringify(ambiguity.chosen)}' (${ambiguity.alternatives.length} alternatives)`,
              dependentClaims: []
            });
          }

          hypotheses.push(hypothesis);
        } else {
          // Slot filling failed for this schema
          warnings.push(`Schema ${schema.schemaId}: ${fillResult.errors.join(', ')}`);
        }
      } catch (e) {
        warnings.push(`Schema ${schema.schemaId} compilation error: ${e.message}`);
      }
    }

    // Deduplicate and sort
    const uniqueHypotheses = deduplicateHypotheses(hypotheses);
    uniqueHypotheses.sort(compareHypotheses);

    // Limit to max
    const finalHypotheses = uniqueHypotheses.slice(0, this.options.maxHypotheses);

    return new CompilationResult({
      success: finalHypotheses.length > 0,
      hypotheses: finalHypotheses,
      normalizedQuery,
      candidateSchemas: candidateSchemas.map(c => ({
        schemaId: c.schema.schemaId,
        score: c.score,
        method: c.method
      })),
      errors,
      warnings,
      metadata: {
        compilationTimeMs: Date.now() - startTime,
        totalSchemas: candidateSchemas.length,
        successfulHypotheses: finalHypotheses.length
      }
    });
  }

  /**
   * Compile with a specific schema
   * @param {string} queryText
   * @param {string} schemaId
   * @param {Object} [context]
   * @returns {Promise<CompilationResult>}
   */
  async compileWithSchema(queryText, schemaId, context = {}) {
    const schema = this.schemaStore.get(schemaId);
    if (!schema) {
      return new CompilationResult({
        success: false,
        errors: [`Schema not found: ${schemaId}`]
      });
    }

    const normalizedQuery = this.normalizer.normalize(queryText);
    const fillResult = this.slotFiller.fillSlots(schema, normalizedQuery, context);

    if (!fillResult.success) {
      return new CompilationResult({
        success: false,
        normalizedQuery,
        errors: fillResult.errors
      });
    }

    const program = this._instantiateProgram(schema, fillResult.bindings);
    const hypothesis = createHypothesis({
      program,
      bindings: fillResult.bindings,
      score: fillResult.confidence,
      sourceSchemaId: schemaId
    });

    return new CompilationResult({
      success: true,
      hypotheses: [hypothesis],
      normalizedQuery,
      candidateSchemas: [{ schemaId, score: 1.0, method: 'explicit' }]
    });
  }

  /**
   * Just normalize a query (without compilation)
   * @param {string} queryText
   * @returns {Object} NormalizedQuery
   */
  normalizeQuery(queryText) {
    return this.normalizer.normalize(queryText);
  }

  /**
   * Add a schema to the store
   * @param {Object} schema
   * @returns {Object} QuerySchema
   */
  addSchema(schema) {
    return this.schemaStore.add(schema);
  }

  /**
   * Get a schema by ID
   * @param {string} schemaId
   * @returns {Object|null}
   */
  getSchema(schemaId) {
    return this.schemaStore.get(schemaId);
  }

  /**
   * Get all schemas
   * @returns {Object[]}
   */
  getAllSchemas() {
    return this.schemaStore.getAll();
  }

  /**
   * Get schema count
   * @returns {number}
   */
  getSchemaCount() {
    return this.schemaStore.count();
  }

  /**
   * Set VSA service for similarity-based retrieval
   * @param {Object} vsaService
   */
  setVSAService(vsaService) {
    this.schemaStore.setVSAService(vsaService);
    this.slotFiller.setVSAService(vsaService);
  }

  /**
   * Instantiate a program from schema template
   * @private
   */
  _instantiateProgram(schema, bindings) {
    const instructions = [];

    for (const templateInstr of schema.programTemplate) {
      const instr = this._instantiateInstruction(templateInstr, bindings);
      instructions.push(instr);
    }

    return createProgram({
      instructions,
      metadata: {
        sourceSchemaId: schema.schemaId,
        compiledAt: Date.now(),
        tracePolicy: 'minimal'
      }
    });
  }

  /**
   * Instantiate a single instruction
   * @private
   */
  _instantiateInstruction(template, bindings) {
    const instr = {
      op: template.op,
      args: {}
    };

    // Process arguments
    for (const [key, value] of Object.entries(template.args ?? {})) {
      instr.args[key] = this._instantiateArg(value, bindings);
    }

    // Copy output binding
    if (template.out) {
      instr.out = template.out;
    }

    // Copy label
    if (template.label) {
      instr.label = template.label;
    }

    return instr;
  }

  /**
   * Instantiate an argument value
   * @private
   */
  _instantiateArg(arg, bindings) {
    if (typeof arg === 'string') {
      // Check for slot reference ($slotName)
      if (arg.startsWith('$')) {
        const slotName = arg.slice(1);
        if (bindings.has(slotName)) {
          return literal(bindings.get(slotName));
        }
        // Keep as slot reference for later resolution
        return slot(slotName);
      }
      // Plain string
      return literal(arg);
    }

    if (typeof arg === 'object' && arg !== null) {
      // Already an instruction arg
      if (arg.type === 'slot') {
        const value = bindings.get(arg.name);
        if (value !== undefined) {
          return literal(value);
        }
      }
      return arg;
    }

    return literal(arg);
  }

  /**
   * Compute hypothesis score
   * @private
   */
  _computeScore(schema, fillResult, retrievalScore) {
    // Lower score is better (MDL-style)
    let score = 0;

    // Base score from retrieval (inverted - higher retrieval = lower score)
    score += (1 - retrievalScore) * 0.3;

    // Slot filling confidence (inverted)
    score += (1 - fillResult.confidence) * 0.4;

    // Penalty for ambiguities
    score += fillResult.ambiguities.length * 0.1;

    // Bonus for schema success rate
    if (schema.telemetry.retrievalCount > 0) {
      const successRate = schema.telemetry.successCount / schema.telemetry.retrievalCount;
      score -= successRate * 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Run early validation checks
   * @private
   */
  _runEarlyChecks(hypothesis, fillResult) {
    // Type check
    hypothesis.setEarlyCheck('type_check', {
      passed: fillResult.success,
      details: fillResult.errors
    });

    // Slot coverage check
    const requiredSlots = Object.entries(fillResult.slotResults)
      .filter(([_, r]) => r.isFilled);
    hypothesis.setEarlyCheck('slot_coverage', {
      passed: requiredSlots.length > 0,
      filledCount: requiredSlots.length,
      totalSlots: Object.keys(fillResult.slotResults).length
    });
  }

  /**
   * Create a default hypothesis when no schemas match
   * @private
   */
  _createDefaultHypothesis(normalizedQuery) {
    // Create a simple query program
    const keywords = normalizedQuery.getKeywords();
    
    if (keywords.length === 0) {
      return null;
    }

    // Build a basic query program
    const instructions = [
      {
        op: OpCode.QUERY,
        args: {
          predicate: literal(keywords[0]),
          pattern: literal({ keywords })
        },
        out: 'results'
      },
      {
        op: OpCode.RETURN,
        args: {
          value: binding('results')
        }
      }
    ];

    const program = createProgram({
      instructions,
      metadata: {
        sourceSchemaId: null,
        compiledAt: Date.now(),
        tracePolicy: 'minimal'
      }
    });

    return createHypothesis({
      program,
      bindings: new Map([['query', normalizedQuery.normalizedText]]),
      score: 0.8,  // Higher score (worse) for default
      derivationMethod: 'default'
    });
  }
}

/**
 * Create a compiler service
 * @param {Object} [options]
 * @returns {CompilerService}
 */
export function createCompilerService(options = {}) {
  return new CompilerService(options);
}

export default {
  CompilerService,
  CompilationResult,
  createCompilerService
};
