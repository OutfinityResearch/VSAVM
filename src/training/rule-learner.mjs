/**
 * Rule Learner
 * Per DS005: Learn rules from sequences
 * Main API for sequence pattern detection used by evaluations
 */

import { PatternMiner, createPatternMiner } from './inner-loop/pattern-miner.mjs';
import { SchemaProposer, createSchemaProposer } from './inner-loop/schema-proposer.mjs';
import { Consolidator, createConsolidator } from './inner-loop/consolidator.mjs';

/**
 * Rule learning result
 * @typedef {Object} RuleLearningResult
 * @property {boolean} success - Whether learning succeeded
 * @property {Object|null} rule - Learned rule
 * @property {number} confidence - Confidence score (0-1)
 * @property {string|null} error - Error message if failed
 */

/**
 * Rule Learner
 * Learns rules from numeric sequences
 */
export class RuleLearner {
  /**
   * @param {Object} [config]
   * @param {number} [config.minConfidence=0.7] - Minimum confidence for rule
   * @param {number} [config.tolerance=0.001] - Numeric tolerance
   * @param {boolean} [config.consolidate=false] - Whether to consolidate schemas
   */
  constructor(config = {}) {
    this.minConfidence = config.minConfidence ?? 0.7;
    this.tolerance = config.tolerance ?? 0.001;
    this.consolidate = config.consolidate ?? false;

    this.patternMiner = createPatternMiner({
      minConfidence: this.minConfidence,
      tolerance: this.tolerance
    });

    this.schemaProposer = createSchemaProposer({
      minConfidence: this.minConfidence
    });

    this.consolidator = createConsolidator({
      minConfidence: this.minConfidence
    });

    // Track learned rules
    this.learnedRules = new Map();
  }

  /**
   * Learn a rule from a sequence
   * Main API called by evaluations
   * 
   * @param {Object} payload
   * @param {string} payload.name - Rule name
   * @param {string} [payload.type] - Expected rule type hint
   * @param {number[]} payload.sequence - Input sequence
   * @param {Object} [payload.expectedRule] - Expected rule for validation
   * @param {Object} [payload.scopeId] - Scope context
   * @returns {Promise<RuleLearningResult>}
   */
  async learnRule(payload) {
    const { name, type, sequence, expectedRule, scopeId } = payload;

    // Validate input
    if (!sequence || !Array.isArray(sequence) || sequence.length < 2) {
      return {
        success: false,
        rule: null,
        confidence: 0,
        error: 'Invalid sequence: must be array with at least 2 elements'
      };
    }

    try {
      // Detect pattern using pattern miner
      const detected = this.patternMiner.detect(sequence, type);

      if (!detected.rule) {
        return {
          success: false,
          rule: null,
          confidence: detected.confidence || 0,
          error: detected.error || 'No pattern detected'
        };
      }

      // Check confidence threshold
      if (detected.confidence < this.minConfidence) {
        return {
          success: false,
          rule: detected.rule,
          confidence: detected.confidence,
          error: `Confidence ${detected.confidence.toFixed(2)} below threshold ${this.minConfidence}`
        };
      }

      // Optional: Propose and consolidate schema
      if (this.consolidate) {
        const candidate = this.schemaProposer.proposeFromPattern(detected, {
          name,
          sequenceLength: sequence.length
        });

        if (candidate) {
          const decision = this.consolidator.evaluate(candidate);
          if (decision.action === 'promote') {
            this.consolidator.promote(candidate, decision);
          }
        }
      }

      // Store learned rule
      this.learnedRules.set(name, {
        rule: detected.rule,
        confidence: detected.confidence,
        learnedAt: Date.now()
      });

      return {
        success: true,
        rule: detected.rule,
        confidence: detected.confidence
      };

    } catch (error) {
      return {
        success: false,
        rule: null,
        confidence: 0,
        error: `Learning failed: ${error.message}`
      };
    }
  }

  /**
   * Learn multiple rules
   * @param {Object[]} payloads - Array of learning payloads
   * @returns {Promise<RuleLearningResult[]>}
   */
  async learnRules(payloads) {
    const results = [];
    for (const payload of payloads) {
      const result = await this.learnRule(payload);
      results.push(result);
    }
    return results;
  }

  /**
   * Alternative API: learn from raw sequence
   * @param {number[]} sequence
   * @param {string} [hint] - Type hint
   * @returns {Promise<RuleLearningResult>}
   */
  async learn(payload) {
    // Support both object and direct sequence
    if (Array.isArray(payload)) {
      return this.learnRule({ name: 'anonymous', sequence: payload });
    }
    return this.learnRule(payload);
  }

  /**
   * Predict next value using learned rule
   * @param {string} ruleName - Name of learned rule
   * @param {number[]} sequence - Current sequence
   * @returns {number|null}
   */
  predict(ruleName, sequence) {
    const learned = this.learnedRules.get(ruleName);
    if (!learned) return null;

    return this.patternMiner.predict(learned.rule, sequence);
  }

  /**
   * Get all learned rules
   * @returns {Map}
   */
  getAllRules() {
    return new Map(this.learnedRules);
  }

  /**
   * Get specific learned rule
   * @param {string} name
   * @returns {Object|null}
   */
  getRule(name) {
    return this.learnedRules.get(name) || null;
  }

  /**
   * Clear all learned rules
   */
  clear() {
    this.learnedRules.clear();
    this.schemaProposer.clear();
    this.consolidator.clear();
  }

  /**
   * Get consolidated schemas
   * @returns {Object[]}
   */
  getConsolidatedSchemas() {
    return this.consolidator.getAllPromoted();
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      rulesLearned: this.learnedRules.size,
      schemasProposed: this.schemaProposer.getAllProposed().length,
      schemasConsolidated: this.consolidator.getAllPromoted().length
    };
  }
}

/**
 * Create a rule learner
 * @param {Object} [config]
 * @returns {RuleLearner}
 */
export function createRuleLearner(config = {}) {
  return new RuleLearner(config);
}

export default { RuleLearner, createRuleLearner };
