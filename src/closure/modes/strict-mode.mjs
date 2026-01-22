/**
 * Strict Mode Handler
 * Per DS004: Refuse to emit any conclusion that cannot be verified as consistent
 */

import { ResponseMode, createQueryResult, createBudgetUsage } from '../../core/types/results.mjs';

/**
 * Strict mode configuration
 */
export const STRICT_MODE_CONFIG = {
  requireNoConflicts: true,
  requireCompleteClosure: false,
  allowBudgetExhaustion: false
};

/**
 * Strict Mode Handler
 * Returns definitive claims only when no conflicts exist
 */
export class StrictModeHandler {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = {
      ...STRICT_MODE_CONFIG,
      ...options
    };
  }

  /**
   * Get mode identifier
   * @returns {string}
   */
  getMode() {
    return ResponseMode.STRICT;
  }

  /**
   * Process closure result in strict mode
   * Per DS004: Strict mode refuses to emit any conclusion that cannot be verified as consistent
   * @param {Object} closureResult - Result from closure computation
   * @param {Object} executionResult - Result from VM execution
   * @param {Object} budget - Budget tracker
   * @returns {Object} - QueryResult
   */
  process(closureResult, executionResult, budget) {
    const budgetUsage = this._extractBudgetUsage(budget);

    // Check for conflicts
    const conflicts = [
      ...(closureResult.conflicts ?? []),
      ...(executionResult?.conflicts ?? [])
    ];

    const executionMs = budget?.deterministicTime
      ? 0
      : Date.now() - (budget.startTime ?? Date.now());

    if (conflicts.length > 0) {
      // Conflicts detected - refuse to emit claims
      return createQueryResult({
        mode: ResponseMode.INDETERMINATE,
        budgetUsed: budgetUsage,
        claims: [],
        assumptions: [],
        conflicts: this._formatConflicts(conflicts),
        traceRefs: this._extractTraceRefs(closureResult, executionResult),
        executionMs
      });
    }

    // Check for budget exhaustion
    if (this.options.allowBudgetExhaustion === false && closureResult.budgetExhausted) {
      return createQueryResult({
        mode: ResponseMode.INDETERMINATE,
        budgetUsed: budgetUsage,
        claims: [],
        assumptions: [{
          assumptionId: 'budget_exhausted',
          description: 'Closure computation did not complete within budget',
          dependentClaims: []
        }],
        conflicts: [],
        traceRefs: this._extractTraceRefs(closureResult, executionResult),
        executionMs
      });
    }

    // No conflicts - emit claims with full confidence
    const claims = this._buildClaims(closureResult, executionResult, 1.0);

    return createQueryResult({
      mode: ResponseMode.STRICT,
      budgetUsed: budgetUsage,
      claims,
      assumptions: [],
      conflicts: [],
      traceRefs: this._extractTraceRefs(closureResult, executionResult),
      executionMs
    });
  }

  /**
   * Check if strict mode can produce a result
   * @param {Object} closureResult
   * @returns {boolean}
   */
  canProduce(closureResult) {
    const hasConflicts = (closureResult.conflicts?.length ?? 0) > 0;
    const budgetExhausted = closureResult.budgetExhausted ?? false;

    return !hasConflicts && (!this.options.allowBudgetExhaustion === false || !budgetExhausted);
  }

  /**
   * Extract budget usage from budget tracker
   * @private
   */
  _extractBudgetUsage(budget) {
    if (budget.getUsage) {
      const usage = budget.getUsage();
      return createBudgetUsage(
        { depth: usage.maxDepth, steps: usage.maxSteps, branches: usage.maxBranches, timeMs: usage.maxTimeMs },
        { depth: usage.usedDepth, steps: usage.usedSteps, branches: usage.usedBranches, timeMs: usage.usedTimeMs }
      );
    }
    return createBudgetUsage(
      { depth: budget.limits?.maxDepth, steps: budget.limits?.maxSteps, branches: budget.limits?.maxBranches, timeMs: budget.limits?.maxTimeMs },
      { depth: budget.used?.depth, steps: budget.used?.steps, branches: budget.used?.branches, timeMs: budget.used?.timeMs }
    );
  }

  /**
   * Format conflicts for result
   * @private
   */
  _formatConflicts(conflicts) {
    return conflicts.map((c, i) => ({
      conflictId: c.conflictId ?? `conflict_${i}`,
      type: c.type ?? 'direct',
      facts: c.factIds ?? c.facts ?? [],
      scopeId: c.scopeId ?? null,
      resolution: c.resolution
    }));
  }

  /**
   * Build claims from results
   * @private
   */
  _buildClaims(closureResult, executionResult, confidence) {
    const claims = [];

    // Add claims from execution result
    if (executionResult?.claims) {
      for (const claim of executionResult.claims) {
        claims.push({
          ...claim,
          confidence
        });
      }
    }

    // Add claims from derived facts
    const derived = closureResult.derived ?? new Set();
    for (const fact of derived) {
      claims.push({
        claimId: `claim_${fact.factId ?? claims.length}`,
        content: fact,
        confidence,
        supportingFacts: [fact.factId],
        derivationTrace: null
      });
    }

    return claims;
  }

  /**
   * Extract trace references
   * @private
   */
  _extractTraceRefs(closureResult, executionResult) {
    const refs = [];

    if (closureResult.trace) {
      refs.push({
        logSegmentId: 'closure_trace',
        startOffset: 0,
        endOffset: closureResult.trace.length
      });
    }

    if (executionResult?.trace) {
      refs.push({
        logSegmentId: 'execution_trace',
        startOffset: 0,
        endOffset: executionResult.trace.length
      });
    }

    return refs;
  }
}

/**
 * Create a strict mode handler
 * @param {Object} [options]
 * @returns {StrictModeHandler}
 */
export function createStrictModeHandler(options = {}) {
  return new StrictModeHandler(options);
}

export default {
  StrictModeHandler,
  createStrictModeHandler,
  STRICT_MODE_CONFIG
};
