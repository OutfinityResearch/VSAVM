/**
 * MDL Scorer
 * Per DS003/DS008: Minimum Description Length scoring for programs
 * Combines complexity, residual, and penalty costs
 */

import { ComplexityCostCalculator, createComplexityCostCalculator, COMPLEXITY_WEIGHTS } from './complexity-cost.mjs';
import { ResidualCostCalculator, createResidualCostCalculator, RESIDUAL_WEIGHTS } from './residual-cost.mjs';
import { PenaltyCostCalculator, createPenaltyCostCalculator, PENALTY_WEIGHTS } from './penalty-cost.mjs';

/**
 * Default MDL weights
 */
export const MDL_WEIGHTS = {
  complexity: 1.0,
  residual: 1.0,
  correctness: 2.0,
  budget: 0.5
};

/**
 * MDL Scoring Result
 */
export class ScoringResult {
  constructor(config = {}) {
    this.total = config.total ?? 0;
    this.complexity = config.complexity ?? 0;
    this.residual = config.residual ?? 0;
    this.correctness = config.correctness ?? 0;
    this.budget = config.budget ?? 0;
    this.breakdown = config.breakdown ?? null;
    this.program = config.program ?? null;
  }

  /**
   * Check if this score is better than another
   * Lower MDL score is better
   * @param {ScoringResult} other
   * @returns {boolean}
   */
  isBetterThan(other) {
    if (!other) return true;
    return this.total < other.total;
  }

  /**
   * Get normalized score (0-1, higher is better)
   * @param {number} [maxScore=100]
   * @returns {number}
   */
  normalized(maxScore = 100) {
    return Math.max(0, 1 - (this.total / maxScore));
  }

  /**
   * Convert to plain object
   */
  toJSON() {
    return {
      total: this.total,
      complexity: this.complexity,
      residual: this.residual,
      correctness: this.correctness,
      budget: this.budget,
      breakdown: this.breakdown
    };
  }
}

/**
 * Scoring Context
 */
export class ScoringContext {
  constructor(config = {}) {
    this.store = config.store ?? null;
    this.budget = config.budget ?? null;
    this.evaluationExamples = config.evaluationExamples ?? null;
    this.executor = config.executor ?? null;
    this.closureService = config.closureService ?? null;
  }
}

/**
 * MDL Scorer
 * Computes Minimum Description Length score for programs
 */
export class MDLScorer {
  /**
   * @param {Object} [config]
   * @param {Object} [config.weights] - Component weights
   * @param {Object} [config.complexityWeights]
   * @param {Object} [config.residualWeights]
   * @param {Object} [config.penaltyWeights]
   */
  constructor(config = {}) {
    this.weights = { ...MDL_WEIGHTS, ...config.weights };
    
    this.complexityCalc = createComplexityCostCalculator(config.complexityWeights);
    this.residualCalc = createResidualCostCalculator(config.residualWeights);
    this.penaltyCalc = createPenaltyCostCalculator(config.penaltyWeights);
  }

  /**
   * Compute MDL score for a program
   * Per DS008 compute_mdl_score
   * @param {Object} program - Program to evaluate
   * @param {ScoringContext} context - Scoring context
   * @returns {Promise<ScoringResult>}
   */
  async score(program, context) {
    const targetProgram = program?.program ?? program;

    // Component 1: Program complexity
    const complexity = this.complexityCalc.compute(targetProgram);

    // Component 2: Residual (prediction loss)
    let residual = 0;
    if (context.evaluationExamples) {
      residual = this.residualCalc.compute(
        targetProgram, 
        context.evaluationExamples,
        context.executor
      );
    }

    // Component 3 & 4: Correctness and budget penalty
    let correctness = 0;
    let budgetPenalty = 0;

    if (context.closureService && context.store) {
      try {
        const closureResult = await context.closureService.verify(
          targetProgram,
          context.store,
          context.budget
        );
        
        correctness = this.penaltyCalc.computeCorrectnessPenalty(closureResult);
        budgetPenalty = this.penaltyCalc.computeBudgetPenalty(closureResult, context.budget);
      } catch (e) {
        // Closure failed - apply penalty
        correctness = this.weights.correctness * 2;
      }
    }

    // Weighted sum (lower is better)
    const total = (
      this.weights.complexity * complexity +
      this.weights.residual * residual +
      this.weights.correctness * correctness +
      this.weights.budget * budgetPenalty
    );

    return new ScoringResult({
      total,
      complexity,
      residual,
      correctness,
      budget: budgetPenalty,
      breakdown: {
        complexityBreakdown: this.complexityCalc.breakdown(program),
        weights: this.weights
      },
      program: targetProgram
    });
  }

  /**
   * Score without closure verification (faster)
   * @param {Object} program
   * @param {Object} [options]
   * @returns {ScoringResult}
   */
  scoreQuick(program, options = {}) {
    // Only compute complexity
    const complexity = this.complexityCalc.compute(program);

    // Optional residual if examples provided
    let residual = 0;
    if (options.evaluationExamples) {
      residual = this.residualCalc.compute(
        program,
        options.evaluationExamples,
        options.executor
      );
    }

    const total = (
      this.weights.complexity * complexity +
      this.weights.residual * residual
    );

    return new ScoringResult({
      total,
      complexity,
      residual,
      correctness: 0,
      budget: 0,
      program
    });
  }

  /**
   * Score from existing closure result
   * @param {Object} program
   * @param {Object} closureResult
   * @param {Object} [budget]
   * @returns {ScoringResult}
   */
  scoreFromClosure(program, closureResult, budget = null) {
    const complexity = this.complexityCalc.compute(program);
    const correctness = this.penaltyCalc.computeCorrectnessPenalty(closureResult);
    const budgetPenalty = budget 
      ? this.penaltyCalc.computeBudgetPenalty(closureResult, budget)
      : 0;

    const total = (
      this.weights.complexity * complexity +
      this.weights.correctness * correctness +
      this.weights.budget * budgetPenalty
    );

    return new ScoringResult({
      total,
      complexity,
      residual: 0,
      correctness,
      budget: budgetPenalty,
      breakdown: {
        complexityBreakdown: this.complexityCalc.breakdown(program),
        penaltyBreakdown: this.penaltyCalc.breakdown(closureResult, budget)
      },
      program
    });
  }

  /**
   * Compare two programs
   * @param {Object} programA
   * @param {Object} programB
   * @param {ScoringContext} context
   * @returns {Promise<{better: Object, scoreA: ScoringResult, scoreB: ScoringResult}>}
   */
  async compare(programA, programB, context) {
    const [scoreA, scoreB] = await Promise.all([
      this.score(programA, context),
      this.score(programB, context)
    ]);

    return {
      better: scoreA.isBetterThan(scoreB) ? programA : programB,
      scoreA,
      scoreB
    };
  }

  /**
   * Rank programs by MDL score
   * @param {Array} programs
   * @param {ScoringContext} context
   * @returns {Promise<Array<{program: Object, score: ScoringResult}>>}
   */
  async rank(programs, context) {
    const scored = await Promise.all(
      programs.map(async (program) => ({
        program,
        score: await this.score(program, context)
      }))
    );

    // Sort by score (lower is better)
    scored.sort((a, b) => a.score.total - b.score.total);

    return scored;
  }

  /**
   * Quick rank without closure verification
   * @param {Array} programs
   * @param {Object} [options]
   * @returns {Array<{program: Object, score: ScoringResult}>}
   */
  rankQuick(programs, options = {}) {
    const scored = programs.map(program => ({
      program,
      score: this.scoreQuick(program, options)
    }));

    scored.sort((a, b) => a.score.total - b.score.total);

    return scored;
  }
}

/**
 * Create an MDL scorer
 * @param {Object} [config]
 * @returns {MDLScorer}
 */
export function createMDLScorer(config = {}) {
  return new MDLScorer(config);
}

/**
 * Create a scoring context
 * @param {Object} config
 * @returns {ScoringContext}
 */
export function createScoringContext(config = {}) {
  return new ScoringContext(config);
}

/**
 * Quick score a program
 * @param {Object} program
 * @param {Object} [options]
 * @returns {ScoringResult}
 */
export function quickScore(program, options = {}) {
  const scorer = createMDLScorer(options);
  return scorer.scoreQuick(program, options);
}

export default {
  MDLScorer,
  ScoringResult,
  ScoringContext,
  createMDLScorer,
  createScoringContext,
  quickScore,
  MDL_WEIGHTS
};
