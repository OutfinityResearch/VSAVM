/**
 * Beam Search Strategy
 * Per DS003/DS008: Standard beam search for program space exploration
 */

import { BeamManager, BeamEntry, createBeamManager, BEAM_CONFIG } from '../beam.mjs';
import { createMDLScorer, createScoringContext } from '../scoring/mdl-scorer.mjs';

/**
 * Default beam search configuration
 */
export const BEAM_SEARCH_CONFIG = {
  beamWidth: 10,
  maxIterations: 50,
  earlyStopThreshold: 0.1,
  diversityWeight: 0.3,
  expansionLimit: 5
};

/**
 * Search result
 */
export class SearchResult {
  constructor(config = {}) {
    this.best = config.best ?? null;
    this.candidates = config.candidates ?? [];
    this.iterations = config.iterations ?? 0;
    this.totalExpanded = config.totalExpanded ?? 0;
    this.totalPruned = config.totalPruned ?? 0;
    this.earlyStop = config.earlyStop ?? false;
    this.duration = config.duration ?? 0;
  }

  /**
   * Get best hypothesis
   * @returns {Object|null}
   */
  getBest() {
    return this.best?.hypothesis ?? null;
  }

  /**
   * Get best score
   * @returns {number}
   */
  getBestScore() {
    return this.best?.score ?? Infinity;
  }

  /**
   * Get top N candidates
   * @param {number} n
   * @returns {Array}
   */
  getTopN(n) {
    return this.candidates.slice(0, n).map(c => c.hypothesis);
  }

  /**
   * Check if search succeeded
   * @returns {boolean}
   */
  succeeded() {
    return this.best !== null;
  }
}

/**
 * Beam Search Strategy
 * Implements beam search for program space exploration
 */
export class BeamSearchStrategy {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    this.config = { ...BEAM_SEARCH_CONFIG, ...config };
    this.scorer = config.scorer ?? createMDLScorer();
    this.expansionGenerator = config.expansionGenerator ?? null;
  }

  /**
   * Search for best program
   * Per DS008 beam_search
   * @param {Array} initialCandidates - Initial hypotheses
   * @param {Object} context - Scoring context
   * @returns {Promise<SearchResult>}
   */
  async search(initialCandidates, context) {
    const startTime = Date.now();

    // Initialize beam manager
    const beamManager = createBeamManager({
      beamWidth: this.config.beamWidth,
      diversityWeight: this.config.diversityWeight
    });

    // Score initial candidates
    const scored = await this._scoreAll(initialCandidates, context);
    beamManager.initialize(scored);

    let iteration = 0;
    let bestEntry = beamManager.getBest();
    let earlyStop = false;

    // Main search loop
    while (beamManager.shouldContinue(this.config.maxIterations)) {
      iteration++;
      beamManager.nextIteration();

      const currentBeam = beamManager.getBeam();
      const allSuccessors = [];

      // Generate successors for each beam member
      for (const entry of currentBeam) {
        const expansions = await this._generateExpansions(entry.hypothesis, context);
        
        for (const expansion of expansions) {
          const score = await this._score(expansion, context);
          allSuccessors.push({ hypothesis: expansion, score });

          // Check for early stopping
          if (score <= this.config.earlyStopThreshold) {
            const newEntry = new BeamEntry(expansion, score);
            bestEntry = newEntry;
            earlyStop = true;
            break;
          }
        }

        if (earlyStop) break;
      }

      if (earlyStop) break;

      // Select diverse beam from successors
      if (allSuccessors.length > 0) {
        const selected = beamManager.selectDiverse(allSuccessors);
        
        for (const entry of selected) {
          beamManager.add(entry);
        }
      }

      // Prune low-scoring entries
      beamManager.prune();

      // Update best
      const currentBest = beamManager.getBest();
      if (currentBest && (!bestEntry || currentBest.score < bestEntry.score)) {
        bestEntry = currentBest;
      }

      // Check if beam is exhausted
      if (beamManager.getBeam().length === 0) {
        break;
      }
    }

    const stats = beamManager.getStats();

    return new SearchResult({
      best: bestEntry,
      candidates: beamManager.getBeam(),
      iterations: iteration,
      totalExpanded: stats.totalExpanded,
      totalPruned: stats.totalPruned,
      earlyStop,
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
   * Per DS008 generate_expansions
   * @private
   */
  async _generateExpansions(hypothesis, context) {
    if (this.expansionGenerator) {
      return this.expansionGenerator(hypothesis, context);
    }

    // Default expansion strategy
    const expansions = [];
    const limit = this.config.expansionLimit;

    const program = hypothesis.program ?? hypothesis;
    const instructions = program.instructions ?? [];

    // Expansion type 1: Parameter modification
    if (program.parameters) {
      for (const [param, value] of Object.entries(program.parameters)) {
        const alternatives = this._suggestAlternatives(param, value);
        for (const alt of alternatives.slice(0, limit)) {
          const newProgram = this._withParam(program, param, alt);
          expansions.push({ ...hypothesis, program: newProgram });
        }
      }
    }

    // Expansion type 2: Slot binding alternatives
    if (hypothesis.bindings) {
      for (const [slot, value] of Object.entries(hypothesis.bindings)) {
        const alternatives = this._suggestSlotAlternatives(slot, value, context);
        for (const alt of alternatives.slice(0, limit)) {
          expansions.push({ 
            ...hypothesis, 
            bindings: { ...hypothesis.bindings, [slot]: alt }
          });
        }
      }
    }

    // Expansion type 3: Add optional instructions
    const optionalOps = this._suggestOptionalOps(program);
    for (const op of optionalOps.slice(0, limit)) {
      const newInstructions = [...instructions, op];
      expansions.push({ 
        ...hypothesis, 
        program: { ...program, instructions: newInstructions }
      });
    }

    return expansions;
  }

  /**
   * Suggest alternative values for a parameter
   * @private
   */
  _suggestAlternatives(param, value) {
    const alternatives = [];

    if (typeof value === 'number') {
      alternatives.push(value * 0.5);
      alternatives.push(value * 2);
      alternatives.push(value + 1);
      alternatives.push(value - 1);
    } else if (typeof value === 'boolean') {
      alternatives.push(!value);
    }

    return alternatives;
  }

  /**
   * Suggest alternative slot bindings
   * @private
   */
  _suggestSlotAlternatives(slot, value, context) {
    // Would use VSA similarity search in full implementation
    return [];
  }

  /**
   * Suggest optional operations to add
   * @private
   */
  _suggestOptionalOps(program) {
    // Basic suggestions - full implementation would be context-aware
    return [
      { opcode: 'CANONICALIZE', target: '_result' },
      { opcode: 'FILTER', predicate: 'valid', target: '_result' }
    ];
  }

  /**
   * Create program with modified parameter
   * @private
   */
  _withParam(program, param, value) {
    return {
      ...program,
      parameters: {
        ...program.parameters,
        [param]: value
      }
    };
  }
}

/**
 * Create a beam search strategy
 * @param {Object} [config]
 * @returns {BeamSearchStrategy}
 */
export function createBeamSearchStrategy(config = {}) {
  return new BeamSearchStrategy(config);
}

export default {
  BeamSearchStrategy,
  SearchResult,
  createBeamSearchStrategy,
  BEAM_SEARCH_CONFIG
};
