/**
 * Hypothesis
 * Per DS003: Candidate program with bindings, assumptions, and score
 * Used during compilation and search to represent alternative interpretations
 */

import { Program, createProgram } from './program-ir.mjs';
import { computeHash } from '../../core/hash.mjs';

/**
 * Hypothesis class - represents a candidate program interpretation
 */
export class Hypothesis {
  /**
   * @param {Object} config
   * @param {string} [config.hypothesisId] - Unique identifier
   * @param {Program|Object} config.program - The candidate program
   * @param {Map<string, any>|Object} [config.bindings] - Slot bindings
   * @param {Array} [config.assumptions] - Explicit assumptions
   * @param {number} [config.score] - MDL-style score (lower is better)
   * @param {Object} [config.earlyChecks] - Early validation results
   * @param {string} [config.sourceSchemaId] - Source schema
   */
  constructor(config) {
    this.hypothesisId = config.hypothesisId ?? this._generateId();
    
    this.program = config.program instanceof Program
      ? config.program
      : createProgram(config.program);
    
    this.bindings = config.bindings instanceof Map
      ? config.bindings
      : new Map(Object.entries(config.bindings ?? {}));
    
    this.assumptions = config.assumptions ?? [];
    this.score = config.score ?? Infinity;
    this.earlyChecks = config.earlyChecks ?? {};
    this.sourceSchemaId = config.sourceSchemaId ?? null;
    
    // Metadata
    this.createdAt = Date.now();
    this.parentId = config.parentId ?? null;
    this.derivationMethod = config.derivationMethod ?? 'initial';
  }

  /**
   * Generate a hypothesis ID
   * @private
   */
  _generateId() {
    return `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get a binding value
   * @param {string} name
   * @returns {*}
   */
  getBinding(name) {
    return this.bindings.get(name);
  }

  /**
   * Set a binding value
   * @param {string} name
   * @param {*} value
   * @returns {Hypothesis} this
   */
  setBinding(name, value) {
    this.bindings.set(name, value);
    return this;
  }

  /**
   * Check if hypothesis has a binding
   * @param {string} name
   * @returns {boolean}
   */
  hasBinding(name) {
    return this.bindings.has(name);
  }

  /**
   * Get all binding names
   * @returns {string[]}
   */
  getBindingNames() {
    return [...this.bindings.keys()];
  }

  /**
   * Add an assumption
   * @param {Object} assumption
   * @returns {Hypothesis} this
   */
  addAssumption(assumption) {
    this.assumptions.push({
      assumptionId: assumption.assumptionId ?? `assum_${this.assumptions.length}`,
      description: assumption.description,
      dependentClaims: assumption.dependentClaims ?? [],
      addedAt: Date.now()
    });
    return this;
  }

  /**
   * Check if hypothesis has assumptions
   * @returns {boolean}
   */
  hasAssumptions() {
    return this.assumptions.length > 0;
  }

  /**
   * Set early check result
   * @param {string} checkName
   * @param {Object} result
   * @returns {Hypothesis} this
   */
  setEarlyCheck(checkName, result) {
    this.earlyChecks[checkName] = {
      ...result,
      checkedAt: Date.now()
    };
    return this;
  }

  /**
   * Get early check result
   * @param {string} checkName
   * @returns {Object|null}
   */
  getEarlyCheck(checkName) {
    return this.earlyChecks[checkName] ?? null;
  }

  /**
   * Check if all early checks passed
   * @returns {boolean}
   */
  passedEarlyChecks() {
    for (const check of Object.values(this.earlyChecks)) {
      if (check.passed === false) return false;
    }
    return true;
  }

  /**
   * Update score
   * @param {number} score
   * @returns {Hypothesis} this
   */
  updateScore(score) {
    this.score = score;
    return this;
  }

  /**
   * Check if this hypothesis is better than another
   * @param {Hypothesis} other
   * @returns {boolean}
   */
  isBetterThan(other) {
    // Lower score is better
    return this.score < other.score;
  }

  /**
   * Create a derived hypothesis with modifications
   * @param {Object} modifications
   * @returns {Hypothesis}
   */
  derive(modifications) {
    const derived = new Hypothesis({
      program: modifications.program ?? this.program.clone(),
      bindings: new Map(this.bindings),
      assumptions: [...this.assumptions],
      score: modifications.score ?? this.score,
      earlyChecks: { ...this.earlyChecks },
      sourceSchemaId: this.sourceSchemaId,
      parentId: this.hypothesisId,
      derivationMethod: modifications.method ?? 'derived'
    });

    // Apply binding modifications
    if (modifications.bindings) {
      for (const [name, value] of Object.entries(modifications.bindings)) {
        derived.setBinding(name, value);
      }
    }

    // Apply assumption modifications
    if (modifications.assumptions) {
      for (const assumption of modifications.assumptions) {
        derived.addAssumption(assumption);
      }
    }

    return derived;
  }

  /**
   * Clone the hypothesis
   * @returns {Hypothesis}
   */
  clone() {
    return new Hypothesis({
      program: this.program.clone(),
      bindings: new Map(this.bindings),
      assumptions: [...this.assumptions],
      score: this.score,
      earlyChecks: { ...this.earlyChecks },
      sourceSchemaId: this.sourceSchemaId,
      parentId: this.hypothesisId,
      derivationMethod: 'clone'
    });
  }

  /**
   * Compute hash for deduplication
   * @returns {string}
   */
  computeHash() {
    const content = JSON.stringify({
      program: this.program.computeHash(),
      bindings: [...this.bindings.entries()].sort()
    });
    return computeHash(content);
  }

  /**
   * Check equality with another hypothesis
   * @param {Hypothesis} other
   * @returns {boolean}
   */
  equals(other) {
    return this.computeHash() === other.computeHash();
  }

  /**
   * Convert to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      hypothesisId: this.hypothesisId,
      program: this.program.toJSON(),
      bindings: Object.fromEntries(this.bindings),
      assumptions: this.assumptions,
      score: this.score,
      earlyChecks: this.earlyChecks,
      sourceSchemaId: this.sourceSchemaId,
      createdAt: this.createdAt,
      parentId: this.parentId,
      derivationMethod: this.derivationMethod
    };
  }

  /**
   * Create from JSON
   * @param {Object} json
   * @returns {Hypothesis}
   */
  static fromJSON(json) {
    return new Hypothesis({
      hypothesisId: json.hypothesisId,
      program: Program.fromJSON(json.program),
      bindings: json.bindings,
      assumptions: json.assumptions,
      score: json.score,
      earlyChecks: json.earlyChecks,
      sourceSchemaId: json.sourceSchemaId,
      parentId: json.parentId,
      derivationMethod: json.derivationMethod
    });
  }
}

/**
 * Create a hypothesis
 * @param {Object} config
 * @returns {Hypothesis}
 */
export function createHypothesis(config) {
  return new Hypothesis(config);
}

/**
 * Compare hypotheses by score (for sorting)
 * @param {Hypothesis} a
 * @param {Hypothesis} b
 * @returns {number}
 */
export function compareHypotheses(a, b) {
  return a.score - b.score;  // Lower score first
}

/**
 * Deduplicate hypotheses by hash
 * @param {Hypothesis[]} hypotheses
 * @returns {Hypothesis[]}
 */
export function deduplicateHypotheses(hypotheses) {
  const seen = new Set();
  const unique = [];

  for (const hyp of hypotheses) {
    const hash = hyp.computeHash();
    if (!seen.has(hash)) {
      seen.add(hash);
      unique.push(hyp);
    }
  }

  return unique;
}

export default {
  Hypothesis,
  createHypothesis,
  compareHypotheses,
  deduplicateHypotheses
};
