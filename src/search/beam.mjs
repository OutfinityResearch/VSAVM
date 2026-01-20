/**
 * Beam Manager
 * Per DS003/DS008: Beam management for program search with diversity and pruning
 */

/**
 * Default beam configuration
 */
export const BEAM_CONFIG = {
  beamWidth: 10,
  diversityWeight: 0.3,
  pruneThreshold: 0.1,
  minBeamSize: 2,
  maxExpansions: 100
};

/**
 * Beam entry - a scored hypothesis in the beam
 */
export class BeamEntry {
  /**
   * @param {Object} hypothesis - The program hypothesis
   * @param {number} score - MDL score (lower is better)
   * @param {Set} [features] - Feature set for diversity
   */
  constructor(hypothesis, score, features = null) {
    this.hypothesis = hypothesis;
    this.score = score;
    this.features = features ?? new Set();
    this.adjustedScore = score;
    this.createdAt = Date.now();
    this.iteration = 0;
    this.parent = null;
  }

  /**
   * Clone with new score
   * @param {number} newScore
   * @returns {BeamEntry}
   */
  withScore(newScore) {
    const entry = new BeamEntry(this.hypothesis, newScore, new Set(this.features));
    entry.parent = this;
    entry.iteration = this.iteration + 1;
    return entry;
  }

  /**
   * Clone with new hypothesis
   * @param {Object} newHypothesis
   * @param {number} newScore
   * @returns {BeamEntry}
   */
  expand(newHypothesis, newScore) {
    const entry = new BeamEntry(newHypothesis, newScore);
    entry.parent = this;
    entry.iteration = this.iteration + 1;
    return entry;
  }

  /**
   * Get ancestry depth
   * @returns {number}
   */
  getDepth() {
    let depth = 0;
    let current = this.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }
}

/**
 * Priority Queue for beam management
 */
class BeamPriorityQueue {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this._items = [];
  }

  /**
   * Push entry to queue
   * @param {BeamEntry} entry
   */
  push(entry) {
    this._items.push(entry);
    // Sort by score (lower is better for MDL)
    this._items.sort((a, b) => a.adjustedScore - b.adjustedScore);
    // Trim to max size
    if (this._items.length > this.maxSize) {
      this._items = this._items.slice(0, this.maxSize);
    }
  }

  /**
   * Pop best entry
   * @returns {BeamEntry|null}
   */
  pop() {
    return this._items.shift() ?? null;
  }

  /**
   * Peek at best entry
   * @returns {BeamEntry|null}
   */
  peek() {
    return this._items[0] ?? null;
  }

  /**
   * Get all entries
   * @returns {BeamEntry[]}
   */
  all() {
    return [...this._items];
  }

  /**
   * Get current size
   * @returns {number}
   */
  size() {
    return this._items.length;
  }

  /**
   * Check if empty
   * @returns {boolean}
   */
  isEmpty() {
    return this._items.length === 0;
  }

  /**
   * Clear queue
   */
  clear() {
    this._items = [];
  }

  /**
   * Get best score
   * @returns {number}
   */
  bestScore() {
    return this._items[0]?.score ?? Infinity;
  }

  /**
   * Get worst score in beam
   * @returns {number}
   */
  worstScore() {
    return this._items[this._items.length - 1]?.score ?? Infinity;
  }
}

/**
 * Beam Manager
 * Manages beam of hypotheses with diversity-aware selection
 */
export class BeamManager {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    this.config = { ...BEAM_CONFIG, ...config };
    this.beam = new BeamPriorityQueue(this.config.beamWidth);
    this.explored = new Set();
    this.stats = {
      totalExpanded: 0,
      totalPruned: 0,
      iterations: 0
    };
  }

  /**
   * Initialize beam with candidates
   * @param {Array<{hypothesis: Object, score: number}>} candidates
   */
  initialize(candidates) {
    this.beam.clear();
    this.explored.clear();
    this.stats = { totalExpanded: 0, totalPruned: 0, iterations: 0 };

    for (const { hypothesis, score } of candidates) {
      const features = this._extractFeatures(hypothesis);
      const entry = new BeamEntry(hypothesis, score, features);
      this.beam.push(entry);
    }
  }

  /**
   * Add entry to beam
   * @param {BeamEntry} entry
   * @returns {boolean} - True if added
   */
  add(entry) {
    // Check if already explored
    const key = this._hypothesisKey(entry.hypothesis);
    if (this.explored.has(key)) {
      return false;
    }

    // Compute diversity-adjusted score
    entry.adjustedScore = this._computeAdjustedScore(entry);
    
    // Check if worth adding
    if (this.beam.size() >= this.config.beamWidth) {
      if (entry.adjustedScore >= this.beam.worstScore()) {
        this.stats.totalPruned++;
        return false;
      }
    }

    this.beam.push(entry);
    this.explored.add(key);
    return true;
  }

  /**
   * Get current beam entries
   * @returns {BeamEntry[]}
   */
  getBeam() {
    return this.beam.all();
  }

  /**
   * Get best entry
   * @returns {BeamEntry|null}
   */
  getBest() {
    return this.beam.peek();
  }

  /**
   * Get best N entries
   * @param {number} n
   * @returns {BeamEntry[]}
   */
  getTopN(n) {
    return this.beam.all().slice(0, n);
  }

  /**
   * Select diverse beam from candidates
   * Per DS008 select_diverse_beam
   * @param {Array<{hypothesis: Object, score: number}>} candidates
   * @returns {BeamEntry[]}
   */
  selectDiverse(candidates) {
    // Sort by score
    const sorted = [...candidates].sort((a, b) => a.score - b.score);

    const selected = [];
    const selectedFeatures = new Set();

    for (const { hypothesis, score } of sorted) {
      if (selected.length >= this.config.beamWidth) {
        break;
      }

      const features = this._extractFeatures(hypothesis);
      
      // Compute diversity bonus
      const overlap = this._featureOverlap(features, selectedFeatures);
      const diversity = 1.0 - overlap;
      const adjustedScore = score * (1 - this.config.diversityWeight) + 
                           (1 - diversity) * this.config.diversityWeight * score;

      const entry = new BeamEntry(hypothesis, score, features);
      entry.adjustedScore = adjustedScore;

      selected.push(entry);
      
      // Add features to selected set
      for (const f of features) {
        selectedFeatures.add(f);
      }
    }

    return selected;
  }

  /**
   * Prune beam entries below threshold
   * @returns {number} - Number pruned
   */
  prune() {
    const entries = this.beam.all();
    if (entries.length <= this.config.minBeamSize) {
      return 0;
    }

    const bestScore = entries[0]?.score ?? 0;
    const threshold = bestScore + (bestScore * this.config.pruneThreshold);

    let pruned = 0;
    this.beam.clear();

    for (const entry of entries) {
      if (entry.score <= threshold || this.beam.size() < this.config.minBeamSize) {
        this.beam.push(entry);
      } else {
        pruned++;
        this.stats.totalPruned++;
      }
    }

    return pruned;
  }

  /**
   * Update iteration counter
   */
  nextIteration() {
    this.stats.iterations++;
  }

  /**
   * Check if should continue search
   * @param {number} [maxIterations]
   * @returns {boolean}
   */
  shouldContinue(maxIterations = 100) {
    if (this.beam.isEmpty()) return false;
    if (this.stats.iterations >= maxIterations) return false;
    if (this.stats.totalExpanded >= this.config.maxExpansions) return false;
    return true;
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      beamSize: this.beam.size(),
      exploredCount: this.explored.size,
      bestScore: this.beam.bestScore(),
      worstScore: this.beam.worstScore()
    };
  }

  /**
   * Compute diversity-adjusted score
   * @private
   */
  _computeAdjustedScore(entry) {
    const currentFeatures = new Set();
    for (const existing of this.beam.all()) {
      for (const f of existing.features) {
        currentFeatures.add(f);
      }
    }

    const overlap = this._featureOverlap(entry.features, currentFeatures);
    const diversity = 1.0 - overlap;

    // Lower is better, so reduce score for diverse entries
    return entry.score * (1 - this.config.diversityWeight * diversity);
  }

  /**
   * Compute feature overlap ratio
   * @private
   */
  _featureOverlap(features, otherFeatures) {
    if (features.size === 0) return 0;
    
    let overlap = 0;
    for (const f of features) {
      if (otherFeatures.has(f)) {
        overlap++;
      }
    }
    
    return overlap / features.size;
  }

  /**
   * Extract features from hypothesis for diversity
   * @private
   */
  _extractFeatures(hypothesis) {
    const features = new Set();

    if (!hypothesis) return features;

    // Extract from program structure
    const program = hypothesis.program ?? hypothesis;
    const instructions = program.instructions ?? [];

    // Feature: instruction opcodes
    for (const instr of instructions) {
      const op = instr.opcode ?? instr.op;
      if (op) features.add(`op:${op}`);
    }

    // Feature: predicates used
    for (const instr of instructions) {
      if (instr.predicate) {
        const pred = typeof instr.predicate === 'string' 
          ? instr.predicate 
          : `${instr.predicate.namespace}:${instr.predicate.name}`;
        features.add(`pred:${pred}`);
      }
    }

    // Feature: schema used
    if (hypothesis.schemaId) {
      features.add(`schema:${hypothesis.schemaId}`);
    }

    // Feature: instruction count bucket
    const countBucket = Math.floor(instructions.length / 5) * 5;
    features.add(`size:${countBucket}`);

    return features;
  }

  /**
   * Generate key for hypothesis (for deduplication)
   * @private
   */
  _hypothesisKey(hypothesis) {
    if (!hypothesis) return 'null';
    
    const program = hypothesis.program ?? hypothesis;
    const instructions = program.instructions ?? [];
    
    // Simple hash of instruction sequence
    const ops = instructions.map(i => i.opcode ?? i.op ?? 'unknown').join(',');
    return ops;
  }
}

/**
 * Create a beam manager
 * @param {Object} [config]
 * @returns {BeamManager}
 */
export function createBeamManager(config = {}) {
  return new BeamManager(config);
}

/**
 * Create a beam entry
 * @param {Object} hypothesis
 * @param {number} score
 * @returns {BeamEntry}
 */
export function createBeamEntry(hypothesis, score) {
  return new BeamEntry(hypothesis, score);
}

export default {
  BeamManager,
  BeamEntry,
  createBeamManager,
  createBeamEntry,
  BEAM_CONFIG
};
