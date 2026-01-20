/**
 * Search Strategy Interface
 * Per DS006: Pluggable program search strategy
 */

/**
 * Base Search Strategy class
 * Implementations: BeamSearch, MCTSSearch, GreedySearch
 */
export class SearchStrategy {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this.stats = {
      candidatesExplored: 0,
      candidatesPruned: 0,
      iterations: 0,
      bestScore: Infinity
    };
  }

  /**
   * Configure search options
   * @param {Object} options
   * @param {number} [options.beamWidth=10]
   * @param {number} [options.maxIterations=100]
   * @param {number} [options.diversityWeight=0.2]
   * @param {number} [options.earlyStopThreshold=0.95]
   */
  configure(options) {
    this.options = {
      beamWidth: options.beamWidth ?? 10,
      maxIterations: options.maxIterations ?? 100,
      diversityWeight: options.diversityWeight ?? 0.2,
      earlyStopThreshold: options.earlyStopThreshold ?? 0.95
    };
  }

  /**
   * Run search over candidates
   * @param {Object[]} initialCandidates - Array of Hypothesis objects
   * @param {Object} budget - Budget constraints
   * @param {function(Object): Promise<number>} evaluator - Scoring function
   * @returns {Promise<Object[]>} Ranked hypotheses
   */
  async search(initialCandidates, budget, evaluator) {
    throw new Error('Not implemented: search');
  }

  /**
   * Get search statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      candidatesExplored: 0,
      candidatesPruned: 0,
      iterations: 0,
      bestScore: Infinity
    };
  }
}
