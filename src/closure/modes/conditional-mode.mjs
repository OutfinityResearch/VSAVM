/**
 * Conditional Mode Handler
 * Per DS004: Emit conclusions with explicit conditions and uncertainty qualifiers
 */

import { ResponseMode, createQueryResult, createBudgetUsage, createAssumption } from '../../core/types/results.mjs';

/**
 * Conditional mode configuration
 */
export const CONDITIONAL_MODE_CONFIG = {
  minConfidence: 0.1,
  directConflictPenalty: 0.3,
  temporalConflictPenalty: 0.2,
  indirectConflictPenalty: 0.1,
  budgetExhaustionPenalty: 0.2
};

/**
 * Conditional Mode Handler
 * Emits claims with qualifications when conflicts exist
 */
export class ConditionalModeHandler {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = {
      ...CONDITIONAL_MODE_CONFIG,
      ...options
    };
  }

  /**
   * Get mode identifier
   * @returns {string}
   */
  getMode() {
    return ResponseMode.CONDITIONAL;
  }

  /**
   * Process closure result in conditional mode
   * Per DS004: Emit conclusions with explicit conditions when conflicts exist
   * @param {Object} closureResult - Result from closure computation
   * @param {Object} executionResult - Result from VM execution
   * @param {Object} budget - Budget tracker
   * @returns {Object} - QueryResult
   */
  process(closureResult, executionResult, budget) {
    const budgetUsage = this._extractBudgetUsage(budget);

    // Collect conflicts
    const conflicts = [
      ...(closureResult.conflicts ?? []),
      ...(executionResult?.conflicts ?? [])
    ];

    // Compute conditional confidence
    let confidence = this._computeConditionalConfidence(conflicts, closureResult);

    // Build assumptions based on conflicts and budget state
    const assumptions = this._buildAssumptions(conflicts, closureResult);

    // Build claims with conditional confidence
    const claims = this._buildClaims(closureResult, executionResult, confidence);

    // If confidence is too low, return indeterminate
    if (confidence < this.options.minConfidence) {
      return createQueryResult({
        mode: ResponseMode.INDETERMINATE,
        budgetUsed: budgetUsage,
        claims: [],
        assumptions,
        conflicts: this._formatConflicts(conflicts),
        traceRefs: this._extractTraceRefs(closureResult, executionResult),
        executionMs: Date.now() - (budget.startTime ?? Date.now())
      });
    }

    return createQueryResult({
      mode: ResponseMode.CONDITIONAL,
      budgetUsed: budgetUsage,
      claims,
      assumptions,
      conflicts: this._formatConflicts(conflicts),
      traceRefs: this._extractTraceRefs(closureResult, executionResult),
      executionMs: Date.now() - (budget.startTime ?? Date.now())
    });
  }

  /**
   * Compute conditional confidence based on conflicts
   * Per DS008 compute_conditional_confidence
   * @private
   */
  _computeConditionalConfidence(conflicts, closureResult) {
    let confidence = 1.0;

    // Reduce for each conflict
    for (const conflict of conflicts) {
      const penalty = this._getConflictPenalty(conflict.type);
      confidence = confidence * (1.0 - penalty);
    }

    // Reduce for budget exhaustion
    if (closureResult.budgetExhausted) {
      confidence = confidence * (1.0 - this.options.budgetExhaustionPenalty);
    }

    // Floor at minimum confidence
    return Math.max(confidence, this.options.minConfidence);
  }

  /**
   * Get penalty for conflict type
   * @private
   */
  _getConflictPenalty(type) {
    switch (type) {
      case 'direct':
        return this.options.directConflictPenalty;
      case 'temporal':
        return this.options.temporalConflictPenalty;
      case 'indirect':
        return this.options.indirectConflictPenalty;
      case 'branch':
        return this.options.indirectConflictPenalty;
      default:
        return this.options.indirectConflictPenalty;
    }
  }

  /**
   * Build assumptions from conflicts and closure state
   * @private
   */
  _buildAssumptions(conflicts, closureResult) {
    const assumptions = [];

    // Group conflicts by type
    const byType = new Map();
    for (const conflict of conflicts) {
      const type = conflict.type ?? 'unknown';
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type).push(conflict);
    }

    // Create assumptions for each conflict type
    let assumptionIndex = 0;
    for (const [type, typeConflicts] of byType) {
      const factIds = typeConflicts.flatMap(c => c.factIds ?? c.facts ?? []);
      
      assumptions.push(createAssumption(
        `assumption_${assumptionIndex++}`,
        `Assuming no ${type} conflicts between facts: ${factIds.slice(0, 3).join(', ')}${factIds.length > 3 ? '...' : ''}`,
        [] // dependent claims would be added later
      ));
    }

    // Add budget exhaustion assumption if applicable
    if (closureResult.budgetExhausted) {
      assumptions.push(createAssumption(
        `assumption_${assumptionIndex++}`,
        'Assuming no additional conflicts exist beyond the explored search space',
        []
      ));
    }

    return assumptions;
  }

  /**
   * Build claims with conditional confidence
   * @private
   */
  _buildClaims(closureResult, executionResult, confidence) {
    const claims = [];

    // Add claims from execution result
    if (executionResult?.claims) {
      for (const claim of executionResult.claims) {
        claims.push({
          ...claim,
          confidence: Math.min(claim.confidence ?? 1.0, confidence)
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
 * Create a conditional mode handler
 * @param {Object} [options]
 * @returns {ConditionalModeHandler}
 */
export function createConditionalModeHandler(options = {}) {
  return new ConditionalModeHandler(options);
}

export default {
  ConditionalModeHandler,
  createConditionalModeHandler,
  CONDITIONAL_MODE_CONFIG
};
