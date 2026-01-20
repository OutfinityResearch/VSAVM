/**
 * Greedy Search Strategy
 * Per DS003/DS008: Fast greedy best-first search for quick results
 */

import { createMDLScorer, createScoringContext } from '../scoring/mdl-scorer.mjs';

/**
 * Default greedy search configuration
 */
export const GREEDY_SEARCH_CONFIG = {
  maxIterations: 20,
  earlyStopThreshold: 0.1,
  expansionLimit: 3
};

/**
 * Greedy Search Result
 */
export class GreedySearchResult {
  constructor(config = {}) {
    this.best = config.best ?? null;
    this.bestScore = config.bestScore ?? Infinity;
    this.iterations = config.iterations ?? 0;
    this.totalEvaluated = config.totalEvaluated ?? 0;
    this.path = config.path ?? [];
    this.duration = config.duration ?? 0;
  }

  /**
   * Get best hypothesis
   * @returns {Object|null}
   */
  getBest() {
    return this.best;
  }

  /**
   * Check if search succeeded
   * @returns {boolean}
   */
  succeeded() {
    return this.best !== null;
  }

  /**
   * Get improvement ratio
   * @returns {number}
   */
  getImprovementRatio() {
    if (this.path.length < 2) return 0;
    const initial = this.path[0].score;
    const final = this.path[this.path.length - 1].score;
    if (initial === 0) return 0;
    return (initial - final) / initial;
  }
}

/**
 * Greedy Search Strategy
 * Implements greedy best-first search - always follows best expansion
 */
export class GreedySearchStrategy {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    this.config = { ...GREEDY_SEARCH_CONFIG, ...config };
    this.scorer = config.scorer ?? createMDLScorer();
    this.expansionGenerator = config.expansionGenerator ?? null;
  }

  /**
   * Search for best program using greedy descent
   * @param {Array} initialCandidates - Initial hypotheses
   * @param {Object} context - Scoring context
   * @returns {Promise<GreedySearchResult>}
   */
  async search(initialCandidates, context) {
    const startTime = Date.now();

    if (!initialCandidates || initialCandidates.length === 0) {
      return new GreedySearchResult({ duration: Date.now() - startTime });
    }

    // Score initial candidates and pick best
    const scoredInitial = await this._scoreAll(initialCandidates, context);
    scoredInitial.sort((a, b) => a.score - b.score);

    let current = scoredInitial[0];
    let iteration = 0;
    let totalEvaluated = scoredInitial.length;
    const path = [current];

    // Greedy descent loop
    while (iteration < this.config.maxIterations) {
      iteration++;

      // Early stop if score is good enough
      if (current.score <= this.config.earlyStopThreshold) {
        break;
      }

      // Generate expansions
      const expansions = await this._generateExpansions(current.hypothesis, context);
      
      if (expansions.length === 0) {
        break; // No more expansions possible
      }

      // Score expansions
      const scoredExpansions = await this._scoreAll(expansions, context);
      totalEvaluated += scoredExpansions.length;

      // Find best expansion
      scoredExpansions.sort((a, b) => a.score - b.score);
      const best = scoredExpansions[0];

      // Only continue if we improved
      if (best.score >= current.score) {
        break; // Local minimum reached
      }

      current = best;
      path.push(current);
    }

    return new GreedySearchResult({
      best: current.hypothesis,
      bestScore: current.score,
      iterations: iteration,
      totalEvaluated,
      path,
      duration: Date.now() - startTime
    });
  }

  /**
   * Quick search - single pass, no iteration
   * @param {Array} candidates
   * @param {Object} context
   * @returns {Promise<GreedySearchResult>}
   */
  async quickSearch(candidates, context) {
    const startTime = Date.now();

    if (!candidates || candidates.length === 0) {
      return new GreedySearchResult({ duration: Date.now() - startTime });
    }

    const scored = await this._scoreAll(candidates, context);
    scored.sort((a, b) => a.score - b.score);

    const best = scored[0];

    return new GreedySearchResult({
      best: best.hypothesis,
      bestScore: best.score,
      iterations: 1,
      totalEvaluated: candidates.length,
      path: [best],
      duration: Date.now() - startTime
    });
  }

  /**
   * Score a single hypothesis
   * @private
   */
  async _score(hypothesis, context) {
    if (!hypothesis) return Infinity;

    const scoringContext = context instanceof Object && context.store
      ? context
      : createScoringContext(context);

    const result = await this.scorer.score(hypothesis, scoringContext);
    return result.total;
  }

  /**
   * Score all hypotheses
   * @private
   */
  async _scoreAll(hypotheses, context) {
    const results = [];

    for (const hypothesis of hypotheses) {
      const score = await this._score(hypothesis, context);
      results.push({ hypothesis, score });
    }

    return results;
  }

  /**
   * Generate expansions for a hypothesis
   * @private
   */
  async _generateExpansions(hypothesis, context) {
    if (this.expansionGenerator) {
      return this.expansionGenerator(hypothesis, context);
    }

    // Default: simple expansions
    const expansions = [];
    const limit = this.config.expansionLimit;

    const program = hypothesis.program ?? hypothesis;

    // Try modifying parameters
    if (program.parameters) {
      for (const [param, value] of Object.entries(program.parameters)) {
        if (typeof value === 'number') {
          expansions.push(this._withParam(hypothesis, param, value * 0.9));
          expansions.push(this._withParam(hypothesis, param, value * 1.1));
        }
        if (expansions.length >= limit) break;
      }
    }

    // Try modifying bindings
    if (hypothesis.bindings) {
      // Would use VSA to suggest alternatives in full implementation
    }

    return expansions.slice(0, limit);
  }

  /**
   * Create hypothesis with modified parameter
   * @private
   */
  _withParam(hypothesis, param, value) {
    const program = hypothesis.program ?? hypothesis;
    return {
      ...hypothesis,
      program: {
        ...program,
        parameters: {
          ...program.parameters,
          [param]: value
        }
      }
    };
  }
}

/**
 * Create a greedy search strategy
 * @param {Object} [config]
 * @returns {GreedySearchStrategy}
 */
export function createGreedySearchStrategy(config = {}) {
  return new GreedySearchStrategy(config);
}

export default {
  GreedySearchStrategy,
  GreedySearchResult,
  createGreedySearchStrategy,
  GREEDY_SEARCH_CONFIG
};
