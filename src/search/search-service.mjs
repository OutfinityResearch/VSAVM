/**
 * Search Service
 * Per DS003/DS006: High-level facade for program search
 * Orchestrates candidate ranking and selection
 */

import { BeamSearchStrategy, createBeamSearchStrategy, SearchResult, BEAM_SEARCH_CONFIG } from './strategies/beam-search.mjs';
import { GreedySearchStrategy, createGreedySearchStrategy, GREEDY_SEARCH_CONFIG } from './strategies/greedy-search.mjs';
import { MDLScorer, createMDLScorer, createScoringContext, ScoringResult } from './scoring/mdl-scorer.mjs';
import { BeamManager, createBeamManager } from './beam.mjs';

/**
 * Search strategy types
 */
export const SearchStrategy = {
  BEAM: 'beam',
  GREEDY: 'greedy',
  QUICK: 'quick'
};

/**
 * Default search service configuration
 */
export const SEARCH_SERVICE_CONFIG = {
  defaultStrategy: SearchStrategy.BEAM,
  beamWidth: 10,
  maxIterations: 50,
  earlyStopThreshold: 0.1,
  diversityWeight: 0.3
};

/**
 * Search Service - main facade for program search
 */
export class SearchService {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    this.config = { ...SEARCH_SERVICE_CONFIG, ...config };
    
    // Initialize components
    this.scorer = config.scorer ?? createMDLScorer();
    
    this.strategies = {
      [SearchStrategy.BEAM]: createBeamSearchStrategy({
        beamWidth: this.config.beamWidth,
        maxIterations: this.config.maxIterations,
        earlyStopThreshold: this.config.earlyStopThreshold,
        diversityWeight: this.config.diversityWeight,
        scorer: this.scorer
      }),
      [SearchStrategy.GREEDY]: createGreedySearchStrategy({
        maxIterations: Math.floor(this.config.maxIterations / 2),
        earlyStopThreshold: this.config.earlyStopThreshold,
        scorer: this.scorer
      }),
      [SearchStrategy.QUICK]: createGreedySearchStrategy({
        maxIterations: 1,
        scorer: this.scorer
      })
    };
  }

  /**
   * Search for best program from candidates
   * @param {Array} candidates - Initial hypotheses/programs
   * @param {Object} context - Scoring context (store, budget, etc.)
   * @param {Object} [options]
   * @param {string} [options.strategy] - Search strategy to use
   * @returns {Promise<SearchResult>}
   */
  async search(candidates, context, options = {}) {
    const strategyName = options.strategy ?? this.config.defaultStrategy;
    const strategy = this.strategies[strategyName];

    if (!strategy) {
      throw new Error(`Unknown search strategy: ${strategyName}`);
    }

    const scoringContext = this._ensureScoringContext(context);
    return strategy.search(candidates, scoringContext);
  }

  /**
   * Quick rank candidates without full search
   * @param {Array} candidates
   * @param {Object} [context]
   * @returns {Promise<Array<{hypothesis: Object, score: ScoringResult}>>}
   */
  async rank(candidates, context = {}) {
    const scoringContext = this._ensureScoringContext(context);
    return this.scorer.rank(candidates, scoringContext);
  }

  /**
   * Quick rank without closure verification (faster)
   * @param {Array} candidates
   * @param {Object} [options]
   * @returns {Array<{hypothesis: Object, score: ScoringResult}>}
   */
  rankQuick(candidates, options = {}) {
    return this.scorer.rankQuick(candidates, options);
  }

  /**
   * Score a single program
   * @param {Object} program
   * @param {Object} [context]
   * @returns {Promise<ScoringResult>}
   */
  async score(program, context = {}) {
    const scoringContext = this._ensureScoringContext(context);
    return this.scorer.score(program, scoringContext);
  }

  /**
   * Quick score without closure verification
   * @param {Object} program
   * @param {Object} [options]
   * @returns {ScoringResult}
   */
  scoreQuick(program, options = {}) {
    return this.scorer.scoreQuick(program, options);
  }

  /**
   * Compare two programs
   * @param {Object} programA
   * @param {Object} programB
   * @param {Object} [context]
   * @returns {Promise<{better: Object, scoreA: ScoringResult, scoreB: ScoringResult}>}
   */
  async compare(programA, programB, context = {}) {
    const scoringContext = this._ensureScoringContext(context);
    return this.scorer.compare(programA, programB, scoringContext);
  }

  /**
   * Select best from candidates (quick)
   * @param {Array} candidates
   * @param {Object} [context]
   * @returns {Promise<Object|null>}
   */
  async selectBest(candidates, context = {}) {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const result = await this.search(candidates, context, { strategy: SearchStrategy.QUICK });
    return result.getBest();
  }

  /**
   * Select top N candidates
   * @param {Array} candidates
   * @param {number} n
   * @param {Object} [context]
   * @returns {Promise<Array>}
   */
  async selectTopN(candidates, n, context = {}) {
    const ranked = await this.rank(candidates, context);
    return ranked.slice(0, n).map(r => r.program ?? r.hypothesis);
  }

  /**
   * Filter candidates by score threshold
   * @param {Array} candidates
   * @param {number} maxScore - Maximum acceptable MDL score
   * @param {Object} [context]
   * @returns {Promise<Array>}
   */
  async filterByScore(candidates, maxScore, context = {}) {
    const ranked = await this.rank(candidates, context);
    return ranked
      .filter(r => r.score.total <= maxScore)
      .map(r => r.program ?? r.hypothesis);
  }

  /**
   * Get available strategies
   * @returns {string[]}
   */
  getStrategies() {
    return Object.keys(this.strategies);
  }

  /**
   * Set default strategy
   * @param {string} strategy
   */
  setDefaultStrategy(strategy) {
    if (!this.strategies[strategy]) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    this.config.defaultStrategy = strategy;
  }

  /**
   * Get service statistics
   * @returns {Object}
   */
  getStats() {
    return {
      defaultStrategy: this.config.defaultStrategy,
      beamWidth: this.config.beamWidth,
      maxIterations: this.config.maxIterations,
      strategies: Object.keys(this.strategies)
    };
  }

  /**
   * Ensure context is a ScoringContext
   * @private
   */
  _ensureScoringContext(context) {
    if (context && typeof context.store !== 'undefined') {
      return context;
    }
    return createScoringContext(context);
  }
}

/**
 * Create a search service
 * @param {Object} [config]
 * @returns {SearchService}
 */
export function createSearchService(config = {}) {
  return new SearchService(config);
}

/**
 * Quick search helper
 * @param {Array} candidates
 * @param {Object} [context]
 * @param {Object} [options]
 * @returns {Promise<Object|null>}
 */
export async function quickSearch(candidates, context = {}, options = {}) {
  const service = createSearchService();
  const result = await service.search(candidates, context, { 
    strategy: SearchStrategy.QUICK,
    ...options 
  });
  return result.getBest();
}

/**
 * Beam search helper
 * @param {Array} candidates
 * @param {Object} [context]
 * @param {Object} [options]
 * @returns {Promise<SearchResult>}
 */
export async function beamSearch(candidates, context = {}, options = {}) {
  const service = createSearchService(options);
  return service.search(candidates, context, { strategy: SearchStrategy.BEAM });
}

export default {
  SearchService,
  SearchStrategy,
  createSearchService,
  quickSearch,
  beamSearch,
  SEARCH_SERVICE_CONFIG
};
