/**
 * Penalty Cost Calculator
 * Per DS003/DS008: Correctness and budget penalty components of MDL
 */

/**
 * Default penalty weights
 */
export const PENALTY_WEIGHTS = {
  // Conflict penalties
  directConflictPenalty: 1.0,
  temporalConflictPenalty: 0.7,
  indirectConflictPenalty: 0.5,
  branchConflictPenalty: 0.3,

  // Budget penalties
  budgetExhaustionPenalty: 2.0,
  highUtilizationThreshold: 0.9,
  highUtilizationMultiplier: 10.0,

  // Correctness penalties
  indeterminatePenalty: 1.5,
  conditionalPenalty: 0.5,
  lowConfidencePenalty: 0.3,
  confidenceThreshold: 0.5
};

/**
 * Penalty Cost Calculator
 * Computes correctness and budget penalties
 */
export class PenaltyCostCalculator {
  /**
   * @param {Object} [weights]
   */
  constructor(weights = {}) {
    this.weights = { ...PENALTY_WEIGHTS, ...weights };
  }

  /**
   * Compute total penalty cost
   * @param {Object} closureResult - Result from closure computation
   * @param {Object} budget - Budget tracker/config
   * @returns {number}
   */
  compute(closureResult, budget = null) {
    let penalty = 0;

    // Correctness penalty from conflicts
    penalty += this.computeCorrectnessPenalty(closureResult);

    // Budget penalty
    if (budget) {
      penalty += this.computeBudgetPenalty(closureResult, budget);
    }

    // Mode penalty
    penalty += this.computeModePenalty(closureResult);

    return penalty;
  }

  /**
   * Compute correctness penalty from conflicts
   * Per DS008 compute_correctness_penalty
   * @param {Object} closureResult
   * @returns {number}
   */
  computeCorrectnessPenalty(closureResult) {
    let penalty = 0;

    const conflicts = closureResult?.conflicts ?? [];

    for (const conflict of conflicts) {
      const type = conflict.type ?? 'direct';
      const severity = this._getConflictSeverity(type);
      penalty += severity;
    }

    return penalty;
  }

  /**
   * Compute budget penalty
   * Per DS008 compute_budget_penalty
   * @param {Object} closureResult
   * @param {Object} budget
   * @returns {number}
   */
  computeBudgetPenalty(closureResult, budget) {
    let penalty = 0;

    // Get budget usage
    const budgetUsed = closureResult?.budgetUsed ?? budget?.getUsage?.() ?? budget;
    if (!budgetUsed) return 0;

    // Budget exhaustion penalty
    if (closureResult?.budgetExhausted) {
      penalty += this.weights.budgetExhaustionPenalty;
    }

    // High utilization penalty (near exhaustion)
    const stepRatio = this._computeRatio(
      budgetUsed.usedSteps ?? budgetUsed.used?.steps,
      budgetUsed.maxSteps ?? budgetUsed.limits?.maxSteps
    );
    
    if (stepRatio > this.weights.highUtilizationThreshold) {
      penalty += (stepRatio - this.weights.highUtilizationThreshold) * 
                 this.weights.highUtilizationMultiplier;
    }

    const branchRatio = this._computeRatio(
      budgetUsed.usedBranches ?? budgetUsed.used?.branches,
      budgetUsed.maxBranches ?? budgetUsed.limits?.maxBranches
    );

    if (branchRatio > this.weights.highUtilizationThreshold) {
      penalty += (branchRatio - this.weights.highUtilizationThreshold) * 
                 (this.weights.highUtilizationMultiplier / 2);
    }

    return penalty;
  }

  /**
   * Compute mode penalty
   * @param {Object} closureResult
   * @returns {number}
   */
  computeModePenalty(closureResult) {
    let penalty = 0;

    const mode = closureResult?.mode;

    if (mode === 'indeterminate') {
      penalty += this.weights.indeterminatePenalty;
    } else if (mode === 'conditional') {
      penalty += this.weights.conditionalPenalty;

      // Additional penalty for low confidence claims
      const claims = closureResult?.claims ?? [];
      for (const claim of claims) {
        const conf = claim.confidence ?? 1.0;
        if (conf < this.weights.confidenceThreshold) {
          penalty += this.weights.lowConfidencePenalty;
        }
      }
    }

    return penalty;
  }

  /**
   * Get detailed breakdown
   * @param {Object} closureResult
   * @param {Object} budget
   * @returns {Object}
   */
  breakdown(closureResult, budget = null) {
    const correctness = this.computeCorrectnessPenalty(closureResult);
    const budgetPenalty = budget ? this.computeBudgetPenalty(closureResult, budget) : 0;
    const modePenalty = this.computeModePenalty(closureResult);

    // Count conflicts by type
    const conflicts = closureResult?.conflicts ?? [];
    const conflictCounts = {
      direct: 0,
      temporal: 0,
      indirect: 0,
      branch: 0,
      other: 0
    };

    for (const c of conflicts) {
      const type = c.type ?? 'other';
      if (conflictCounts[type] !== undefined) {
        conflictCounts[type]++;
      } else {
        conflictCounts.other++;
      }
    }

    return {
      conflictCounts,
      correctnessPenalty: correctness,
      budgetPenalty,
      modePenalty,
      mode: closureResult?.mode,
      budgetExhausted: closureResult?.budgetExhausted ?? false,
      total: correctness + budgetPenalty + modePenalty
    };
  }

  /**
   * Get conflict severity by type
   * @private
   */
  _getConflictSeverity(type) {
    switch (type) {
      case 'direct':
        return this.weights.directConflictPenalty;
      case 'temporal':
        return this.weights.temporalConflictPenalty;
      case 'indirect':
        return this.weights.indirectConflictPenalty;
      case 'branch':
        return this.weights.branchConflictPenalty;
      default:
        return this.weights.indirectConflictPenalty;
    }
  }

  /**
   * Compute ratio safely
   * @private
   */
  _computeRatio(used, max) {
    if (!max || max <= 0) return 0;
    if (!used) return 0;
    return used / max;
  }
}

/**
 * Create a penalty cost calculator
 * @param {Object} [weights]
 * @returns {PenaltyCostCalculator}
 */
export function createPenaltyCostCalculator(weights = {}) {
  return new PenaltyCostCalculator(weights);
}

/**
 * Quick compute penalty cost
 * @param {Object} closureResult
 * @param {Object} [budget]
 * @param {Object} [weights]
 * @returns {number}
 */
export function computePenaltyCost(closureResult, budget = null, weights = {}) {
  const calc = new PenaltyCostCalculator(weights);
  return calc.compute(closureResult, budget);
}

export default {
  PenaltyCostCalculator,
  createPenaltyCostCalculator,
  computePenaltyCost,
  PENALTY_WEIGHTS
};
