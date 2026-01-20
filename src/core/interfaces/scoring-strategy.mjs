/**
 * Scoring Strategy Interface
 * Per DS006: Pluggable MDL scoring strategy
 */

/**
 * Base Scoring Strategy class
 * Implementations: MDLStandardScorer, MDLWeightedScorer
 */
export class ScoringStrategy {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Calculate program complexity cost (description length)
   * @param {Object} program
   * @returns {number}
   */
  calculateComplexityCost(program) {
    throw new Error('Not implemented: calculateComplexityCost');
  }

  /**
   * Calculate residual/prediction loss cost
   * @param {Object} program
   * @param {Object} context
   * @returns {number}
   */
  calculateResidualCost(program, context) {
    throw new Error('Not implemented: calculateResidualCost');
  }

  /**
   * Calculate correctness penalty (for conflicts/violations)
   * @param {Object} closureResult
   * @returns {number}
   */
  calculateCorrectnessPenalty(closureResult) {
    throw new Error('Not implemented: calculateCorrectnessPenalty');
  }

  /**
   * Calculate budget overage penalty
   * @param {Object} budgetUsage
   * @returns {number}
   */
  calculateBudgetPenalty(budgetUsage) {
    throw new Error('Not implemented: calculateBudgetPenalty');
  }

  /**
   * Calculate combined MDL score (lower is better)
   * @param {Object} program
   * @param {Object} context
   * @returns {{total: number, breakdown: Object}}
   */
  score(program, context) {
    throw new Error('Not implemented: score');
  }
}
