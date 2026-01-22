/**
 * Closure Service
 * Per DS004/DS006: High-level facade for bounded closure computation
 * Orchestrates forward chaining, conflict detection, and mode handling
 */

import { Budget, DEFAULT_BUDGET } from '../vm/budget.mjs';
import { ResponseMode } from '../core/types/results.mjs';
import { ForwardChainer, createForwardChainer } from './algorithms/forward-chain.mjs';
import { ConflictDetector, createConflictDetector } from './algorithms/conflict-detect.mjs';
import { BranchManager, createBranchManager } from './algorithms/branch-manager.mjs';
import { StrictModeHandler, createStrictModeHandler } from './modes/strict-mode.mjs';
import { ConditionalModeHandler, createConditionalModeHandler } from './modes/conditional-mode.mjs';
import { IndeterminateModeHandler, createIndeterminateModeHandler, IndeterminateReason } from './modes/indeterminate-mode.mjs';
import { ResultBuilder, createResultBuilder } from './result-builder.mjs';

/**
 * Closure service configuration
 */
export const CLOSURE_SERVICE_CONFIG = {
  defaultMode: ResponseMode.STRICT,
  timeOverlapPolicy: 'strict',
  conflictCheckInterval: 10,
  maxBranches: 5,
  pruneThreshold: 0.3
};

/**
 * Closure result structure
 */
export class ClosureResult {
  constructor(config = {}) {
    this.mode = config.mode ?? ResponseMode.INDETERMINATE;
    this.budgetUsed = config.budgetUsed ?? null;
    this.claims = config.claims ?? [];
    this.assumptions = config.assumptions ?? [];
    this.conflicts = config.conflicts ?? [];
    this.traceRefs = config.traceRefs ?? [];
    this.executionMs = config.executionMs ?? 0;
    this.reason = config.reason ?? null;
    this.explorationStats = config.explorationStats ?? null;
  }

  /**
   * Check if result has claims
   */
  hasClaims() {
    return this.claims.length > 0;
  }

  /**
   * Check if result has conflicts
   */
  hasConflicts() {
    return this.conflicts.length > 0;
  }

  /**
   * Check if result is definitive (strict mode, no conflicts)
   */
  isDefinitive() {
    return this.mode === ResponseMode.STRICT && !this.hasConflicts();
  }

  /**
   * Get primary claim (first claim)
   */
  getPrimaryClaim() {
    return this.claims[0] ?? null;
  }

  /**
   * Convert to QueryResult format
   */
  toQueryResult() {
    return {
      mode: this.mode,
      budgetUsed: this.budgetUsed,
      claims: this.claims,
      assumptions: this.assumptions,
      conflicts: this.conflicts,
      traceRefs: this.traceRefs,
      executionMs: this.executionMs
    };
  }
}

/**
 * Closure Service - main facade for bounded closure
 */
export class ClosureService {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = {
      ...CLOSURE_SERVICE_CONFIG,
      ...options
    };

    // Initialize components
    this.forwardChainer = createForwardChainer({
      timeOverlapPolicy: this.options.timeOverlapPolicy,
      conflictCheckInterval: this.options.conflictCheckInterval
    });

    this.conflictDetector = createConflictDetector({
      timeOverlapPolicy: this.options.timeOverlapPolicy
    });

    // Mode handlers
    this.modeHandlers = {
      [ResponseMode.STRICT]: createStrictModeHandler(),
      [ResponseMode.CONDITIONAL]: createConditionalModeHandler(),
      [ResponseMode.INDETERMINATE]: createIndeterminateModeHandler()
    };
  }

  /**
   * Verify a program result through bounded closure
   * Per DS008 bounded_closure algorithm
   * @param {Object} program - Compiled program (or execution result)
   * @param {Object} store - Fact store
   * @param {Object|Budget} budget - Budget constraints
   * @param {string} [mode] - Response mode
   * @returns {Promise<ClosureResult>}
   */
  async verify(program, store, budget, mode = null) {
    const startTime = Date.now();
    const budgetObj = this._ensureBudget(budget);
    budgetObj.start();

    const requestedMode = mode ?? this.options.defaultMode;

    try {
      // Step 1: Get initial facts from store/program
      const initialFacts = this._extractInitialFacts(program, store);

      // Step 2: Get rules from store
      const rules = this._extractRules(store);

      // Step 3: Create branch manager
      const branchManager = createBranchManager(
        budgetObj.limits.maxBranches,
        { 
          pruneThreshold: this.options.pruneThreshold,
          deterministicTime: budgetObj.deterministicTime
        }
      );
      const mainBranch = branchManager.createRoot();

      // Step 4: Run forward chaining
      const closureResult = this.forwardChainer.chain(
        initialFacts,
        rules,
        budgetObj
      );

      // Step 5: Detect conflicts in derived facts
      const allFacts = closureResult.facts;
      const consistencyCheck = this.conflictDetector.checkConsistency(allFacts);
      
      // Merge conflicts
      const allConflicts = [
        ...closureResult.conflicts,
        ...consistencyCheck.conflicts
      ];

      // Update closure result with all conflicts
      const fullClosureResult = {
        ...closureResult,
        conflicts: allConflicts
      };

      // Step 6: Build result based on mode
      const executionResult = this._extractExecutionResult(program);
      const result = this._buildResult(
        fullClosureResult,
        executionResult,
        budgetObj,
        requestedMode,
        startTime
      );

      return new ClosureResult(result);

    } catch (error) {
      // Handle errors gracefully
      return this._buildErrorResult(error, budgetObj, startTime);
    }
  }

  /**
   * Run closure on a set of facts with rules
   * @param {Array} facts - Initial facts
   * @param {Array} rules - Rules to apply
   * @param {Object|Budget} budget - Budget constraints
   * @param {string} [mode] - Response mode
   * @returns {Promise<ClosureResult>}
   */
  async runClosure(facts, rules, budget, mode = null) {
    const startTime = Date.now();
    const budgetObj = this._ensureBudget(budget);
    budgetObj.start();

    const requestedMode = mode ?? this.options.defaultMode;

    try {
      // Run forward chaining
      const closureResult = this.forwardChainer.chain(facts, rules, budgetObj);

      // Check consistency on ORIGINAL input facts (not just closure output)
      // This catches conflicts in the initial fact set
      const inputConsistency = this.conflictDetector.checkConsistency(facts);
      
      // Also check consistency of derived facts
      const derivedConsistency = this.conflictDetector.checkConsistency(closureResult.facts);

      const fullClosureResult = {
        ...closureResult,
        conflicts: [
          ...closureResult.conflicts, 
          ...inputConsistency.conflicts,
          ...derivedConsistency.conflicts
        ]
      };

      // Build result
      const result = this._buildResult(
        fullClosureResult,
        null,
        budgetObj,
        requestedMode,
        startTime
      );

      return new ClosureResult(result);

    } catch (error) {
      return this._buildErrorResult(error, budgetObj, startTime);
    }
  }

  /**
   * Check consistency of a fact set
   * @param {Array} facts
   * @returns {{consistent: boolean, conflicts: Array}}
   */
  checkConsistency(facts) {
    return this.conflictDetector.checkConsistency(facts);
  }

  /**
   * Find conflicts for a new fact
   * @param {Object} newFact
   * @param {Array|Map} existingFacts
   * @returns {Array}
   */
  findConflicts(newFact, existingFacts) {
    return this.conflictDetector.findConflicts(newFact, existingFacts);
  }

  /**
   * Ensure budget is a Budget instance
   * @private
   */
  _ensureBudget(budget) {
    if (budget instanceof Budget) {
      return budget;
    }
    const seed = budget ?? DEFAULT_BUDGET;
    return new Budget({
      ...seed,
      deterministicTime: seed.deterministicTime ?? (this.options.defaultMode === ResponseMode.STRICT)
    });
  }

  /**
   * Extract initial facts from program/store
   * @private
   */
  _extractInitialFacts(program, store) {
    const facts = [];

    // From store
    if (store) {
      if (typeof store.getAllFacts === 'function') {
        facts.push(...store.getAllFacts());
      } else if (typeof store.values === 'function') {
        facts.push(...store.values());
      } else if (Array.isArray(store)) {
        facts.push(...store);
      }
    }

    // From program execution result
    if (program) {
      if (program.derivedFacts) {
        facts.push(...program.derivedFacts);
      }
      if (program.facts) {
        facts.push(...program.facts);
      }
    }

    return facts;
  }

  /**
   * Extract rules from store
   * @private
   */
  _extractRules(store) {
    if (!store) return [];

    if (typeof store.getActiveRules === 'function') {
      return store.getActiveRules();
    }
    if (typeof store.getRules === 'function') {
      return store.getRules();
    }
    if (store.rules) {
      return Array.isArray(store.rules) ? store.rules : [];
    }

    return [];
  }

  /**
   * Extract execution result from program
   * @private
   */
  _extractExecutionResult(program) {
    if (!program) return null;

    return {
      claims: program.claims ?? [],
      conflicts: program.conflicts ?? [],
      trace: program.trace ?? []
    };
  }

  /**
   * Build result based on mode
   * @private
   */
  _buildResult(closureResult, executionResult, budget, mode, startTime) {
    const handler = this.modeHandlers[mode];
    
    if (!handler) {
      // Fallback to indeterminate
      return this.modeHandlers[ResponseMode.INDETERMINATE].process(
        closureResult,
        executionResult,
        budget,
        'unknown_mode'
      );
    }

    // Check if we should use indeterminate due to conflicts in strict mode
    if (mode === ResponseMode.STRICT) {
      const hasConflicts = (closureResult.conflicts?.length ?? 0) > 0;
      if (hasConflicts) {
        return this.modeHandlers[ResponseMode.INDETERMINATE].process(
          closureResult,
          executionResult,
          budget,
          IndeterminateReason.CONFLICTS_DETECTED
        );
      }
    }

    return handler.process(closureResult, executionResult, budget);
  }

  /**
   * Build error result
   * @private
   */
  _buildErrorResult(error, budget, startTime) {
    const handler = this.modeHandlers[ResponseMode.INDETERMINATE];
    
    const errorResult = {
      conflicts: [],
      derived: new Set(),
      trace: [{
        type: 'error',
        message: error.message,
        timestamp: budget?.deterministicTime ? 0 : Date.now()
      }],
      budgetExhausted: false
    };

    const executionResult = {
      error: error.message,
      conflicts: [],
      claims: []
    };

    return handler.process(
      errorResult,
      executionResult,
      budget,
      IndeterminateReason.EXECUTION_ERROR
    );
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      timeOverlapPolicy: this.options.timeOverlapPolicy,
      defaultMode: this.options.defaultMode,
      maxBranches: this.options.maxBranches
    };
  }
}

/**
 * Create a closure service
 * @param {Object} [options]
 * @returns {ClosureService}
 */
export function createClosureService(options = {}) {
  return new ClosureService(options);
}

/**
 * Quick verify helper
 * @param {Array} facts
 * @param {Array} rules
 * @param {Object} [budgetConfig]
 * @param {string} [mode]
 * @returns {Promise<ClosureResult>}
 */
export async function quickVerify(facts, rules, budgetConfig = {}, mode = ResponseMode.STRICT) {
  const service = createClosureService();
  return service.runClosure(facts, rules, budgetConfig, mode);
}

export default {
  ClosureService,
  ClosureResult,
  createClosureService,
  quickVerify,
  CLOSURE_SERVICE_CONFIG
};
