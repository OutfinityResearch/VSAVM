/**
 * Indeterminate Mode Handler
 * Per DS004: Report what was checked without emitting substantive claims
 */

import { ResponseMode, createQueryResult, createBudgetUsage } from '../../core/types/results.mjs';

/**
 * Indeterminate mode configuration
 */
export const INDETERMINATE_MODE_CONFIG = {
  includePartialResults: true,
  includeExplorationSummary: true
};

/**
 * Reasons for indeterminate result
 */
export const IndeterminateReason = {
  BUDGET_EXHAUSTED: 'budget_exhausted',
  CONFLICTS_DETECTED: 'conflicts_detected',
  EXECUTION_ERROR: 'execution_error',
  INCOMPLETE_CLOSURE: 'incomplete_closure',
  NO_CLAIMS_POSSIBLE: 'no_claims_possible'
};

/**
 * Indeterminate Mode Handler
 * Returns no substantive claims, reports what was checked
 */
export class IndeterminateModeHandler {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = {
      ...INDETERMINATE_MODE_CONFIG,
      ...options
    };
  }

  /**
   * Get mode identifier
   * @returns {string}
   */
  getMode() {
    return ResponseMode.INDETERMINATE;
  }

  /**
   * Process closure result in indeterminate mode
   * Per DS004: Return no substantive conclusion, report what was checked
   * @param {Object} closureResult - Result from closure computation
   * @param {Object} executionResult - Result from VM execution
   * @param {Object} budget - Budget tracker
   * @param {string} [reason] - Reason for indeterminate result
   * @returns {Object} - QueryResult
   */
  process(closureResult, executionResult, budget, reason = null) {
    const budgetUsage = this._extractBudgetUsage(budget);
    const executionMs = budget?.deterministicTime
      ? 0
      : Date.now() - (budget.startTime ?? Date.now());

    // Determine reason if not provided
    const determinedReason = reason ?? this._determineReason(closureResult, executionResult);

    // Collect conflicts
    const conflicts = [
      ...(closureResult.conflicts ?? []),
      ...(executionResult?.conflicts ?? [])
    ];

    // Build exploration summary as assumptions (what we checked)
    const assumptions = this._buildExplorationSummary(closureResult, executionResult, determinedReason);

    const result = createQueryResult({
      mode: ResponseMode.INDETERMINATE,
      budgetUsed: budgetUsage,
      claims: [],  // No claims in indeterminate mode
      assumptions,
      conflicts: this._formatConflicts(conflicts),
      traceRefs: this._extractTraceRefs(closureResult, executionResult),
      executionMs
    });

    // Add reason to result
    result.reason = determinedReason;

    // Add exploration stats if configured
    if (this.options.includeExplorationSummary) {
      result.explorationStats = this._buildExplorationStats(closureResult, executionResult);
    }

    return result;
  }

  /**
   * Determine reason for indeterminate result
   * @private
   */
  _determineReason(closureResult, executionResult) {
    // Check for execution error
    if (executionResult?.error) {
      return IndeterminateReason.EXECUTION_ERROR;
    }

    // Check for conflicts
    const hasConflicts = (closureResult.conflicts?.length ?? 0) > 0 ||
                        (executionResult?.conflicts?.length ?? 0) > 0;
    if (hasConflicts) {
      return IndeterminateReason.CONFLICTS_DETECTED;
    }

    // Check for budget exhaustion
    if (closureResult.budgetExhausted) {
      return IndeterminateReason.BUDGET_EXHAUSTED;
    }

    // Check if no claims possible
    const hasDerived = (closureResult.derived?.size ?? 0) > 0;
    const hasClaims = (executionResult?.claims?.length ?? 0) > 0;
    if (!hasDerived && !hasClaims) {
      return IndeterminateReason.NO_CLAIMS_POSSIBLE;
    }

    return IndeterminateReason.INCOMPLETE_CLOSURE;
  }

  /**
   * Build exploration summary
   * @private
   */
  _buildExplorationSummary(closureResult, executionResult, reason) {
    const summary = [];

    // Main reason assumption
    summary.push({
      assumptionId: 'reason',
      description: this._getReasonDescription(reason),
      dependentClaims: []
    });

    // What was explored
    if (closureResult.iterations !== undefined) {
      summary.push({
        assumptionId: 'iterations',
        description: `Explored ${closureResult.iterations} iterations of forward chaining`,
        dependentClaims: []
      });
    }

    if (closureResult.rulesApplied !== undefined) {
      summary.push({
        assumptionId: 'rules_applied',
        description: `Applied ${closureResult.rulesApplied} rules during closure`,
        dependentClaims: []
      });
    }

    // Derived facts count
    const derivedCount = closureResult.derived?.size ?? 0;
    if (derivedCount > 0) {
      summary.push({
        assumptionId: 'derived_facts',
        description: `Derived ${derivedCount} new facts (not emitted due to ${reason})`,
        dependentClaims: []
      });
    }

    // Conflicts found
    const conflictCount = (closureResult.conflicts?.length ?? 0) +
                         (executionResult?.conflicts?.length ?? 0);
    if (conflictCount > 0) {
      summary.push({
        assumptionId: 'conflicts_found',
        description: `Detected ${conflictCount} conflicts that prevent definitive claims`,
        dependentClaims: []
      });
    }

    return summary;
  }

  /**
   * Get human-readable reason description
   * @private
   */
  _getReasonDescription(reason) {
    switch (reason) {
      case IndeterminateReason.BUDGET_EXHAUSTED:
        return 'Computational budget was exhausted before closure completed';
      case IndeterminateReason.CONFLICTS_DETECTED:
        return 'Conflicts were detected that prevent definitive claims';
      case IndeterminateReason.EXECUTION_ERROR:
        return 'An error occurred during program execution';
      case IndeterminateReason.INCOMPLETE_CLOSURE:
        return 'Closure computation did not reach a definitive state';
      case IndeterminateReason.NO_CLAIMS_POSSIBLE:
        return 'No substantive claims could be derived from the facts';
      default:
        return 'Result is indeterminate for an unspecified reason';
    }
  }

  /**
   * Build exploration statistics
   * @private
   */
  _buildExplorationStats(closureResult, executionResult) {
    return {
      iterations: closureResult.iterations ?? 0,
      rulesApplied: closureResult.rulesApplied ?? 0,
      derivedFacts: closureResult.derived?.size ?? 0,
      conflictsDetected: (closureResult.conflicts?.length ?? 0) +
                        (executionResult?.conflicts?.length ?? 0),
      budgetExhausted: closureResult.budgetExhausted ?? false,
      traceEntries: (closureResult.trace?.length ?? 0) +
                   (executionResult?.trace?.length ?? 0)
    };
  }

  /**
   * Extract budget usage
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
 * Create an indeterminate mode handler
 * @param {Object} [options]
 * @returns {IndeterminateModeHandler}
 */
export function createIndeterminateModeHandler(options = {}) {
  return new IndeterminateModeHandler(options);
}

export default {
  IndeterminateModeHandler,
  createIndeterminateModeHandler,
  IndeterminateReason,
  INDETERMINATE_MODE_CONFIG
};
