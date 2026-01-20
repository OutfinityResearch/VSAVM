/**
 * Training Service
 * Per DS005: Training loop orchestration
 * Coordinates pattern mining, schema proposal, and consolidation
 */

import { RuleLearner, createRuleLearner } from './rule-learner.mjs';
import { PatternMiner, createPatternMiner } from './inner-loop/pattern-miner.mjs';
import { SchemaProposer, createSchemaProposer } from './inner-loop/schema-proposer.mjs';
import { Consolidator, createConsolidator } from './inner-loop/consolidator.mjs';

/**
 * Training configuration
 * @typedef {Object} TrainingConfig
 * @property {number} [minConfidence=0.7] - Minimum pattern confidence
 * @property {number} [minSupport=3] - Minimum support for schemas
 * @property {boolean} [autoConsolidate=true] - Auto-consolidate discovered schemas
 * @property {number} [batchSize=10] - Batch size for training
 */

/**
 * Training result
 * @typedef {Object} TrainingResult
 * @property {number} rulesLearned - Number of rules learned
 * @property {number} schemasProposed - Number of schemas proposed
 * @property {number} schemasConsolidated - Number of schemas consolidated
 * @property {Object[]} rules - Learned rules
 * @property {Object} metrics - Performance metrics
 */

/**
 * Training Service
 * Orchestrates the training process
 */
export class TrainingService {
  /**
   * @param {TrainingConfig} [config]
   */
  constructor(config = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.7,
      minSupport: config.minSupport ?? 3,
      autoConsolidate: config.autoConsolidate ?? true,
      batchSize: config.batchSize ?? 10
    };

    // Initialize components
    this.ruleLearner = createRuleLearner({
      minConfidence: this.config.minConfidence,
      consolidate: this.config.autoConsolidate
    });

    this.patternMiner = createPatternMiner({
      minConfidence: this.config.minConfidence
    });

    this.schemaProposer = createSchemaProposer({
      minSupport: this.config.minSupport,
      minConfidence: this.config.minConfidence
    });

    this.consolidator = createConsolidator({
      minSupport: this.config.minSupport,
      minConfidence: this.config.minConfidence
    });

    // Training state
    this.trainingHistory = [];
    this.initialized = false;
  }

  /**
   * Initialize the training service
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
  }

  /**
   * Close the training service
   */
  async close() {
    if (!this.initialized) return;
    this.initialized = false;
  }

  /**
   * Learn a single rule
   * Delegates to RuleLearner
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async learnRule(payload) {
    return this.ruleLearner.learnRule(payload);
  }

  /**
   * Learn multiple rules
   * @param {Object[]} payloads
   * @returns {Promise<Object[]>}
   */
  async learnRules(payloads) {
    return this.ruleLearner.learnRules(payloads);
  }

  /**
   * Train on a batch of sequences
   * @param {Object[]} examples - Training examples
   * @returns {Promise<TrainingResult>}
   */
  async train(examples) {
    const startTime = Date.now();
    const results = {
      rulesLearned: 0,
      schemasProposed: 0,
      schemasConsolidated: 0,
      rules: [],
      errors: [],
      metrics: {}
    };

    // Process in batches
    for (let i = 0; i < examples.length; i += this.config.batchSize) {
      const batch = examples.slice(i, i + this.config.batchSize);
      
      for (const example of batch) {
        try {
          // Learn rule
          const learnResult = await this.ruleLearner.learnRule({
            name: example.name || `rule_${i}`,
            type: example.type,
            sequence: example.sequence,
            expectedRule: example.rule
          });

          if (learnResult.success) {
            results.rulesLearned++;
            results.rules.push({
              name: example.name,
              rule: learnResult.rule,
              confidence: learnResult.confidence
            });

            // Propose schema
            if (this.config.autoConsolidate) {
              const detected = this.patternMiner.detect(example.sequence, example.type);
              if (detected.rule) {
                const candidate = this.schemaProposer.proposeFromPattern(detected, {
                  name: example.name,
                  sequenceLength: example.sequence.length
                });

                if (candidate) {
                  results.schemasProposed++;

                  // Evaluate for consolidation
                  const decision = this.consolidator.evaluate(candidate);
                  if (decision.action === 'promote') {
                    this.consolidator.promote(candidate, decision);
                    results.schemasConsolidated++;
                  }
                }
              }
            }
          } else {
            results.errors.push({
              name: example.name,
              error: learnResult.error
            });
          }
        } catch (error) {
          results.errors.push({
            name: example.name,
            error: error.message
          });
        }
      }
    }

    // Compute metrics
    const endTime = Date.now();
    results.metrics = {
      duration: endTime - startTime,
      successRate: examples.length > 0 
        ? results.rulesLearned / examples.length 
        : 0,
      consolidationRate: results.schemasProposed > 0
        ? results.schemasConsolidated / results.schemasProposed
        : 0
    };

    // Track history
    this.trainingHistory.push({
      timestamp: startTime,
      examples: examples.length,
      ...results.metrics
    });

    return results;
  }

  /**
   * Mine patterns from a sequence
   * @param {number[]} sequence
   * @returns {Object[]}
   */
  minePatterns(sequence) {
    return this.patternMiner.mineAll(sequence);
  }

  /**
   * Get training statistics
   * @returns {Object}
   */
  getStats() {
    return {
      rulesLearned: this.ruleLearner.learnedRules.size,
      schemasProposed: this.schemaProposer.getAllProposed().length,
      schemasConsolidated: this.consolidator.getAllPromoted().length,
      trainingRuns: this.trainingHistory.length,
      history: this.trainingHistory
    };
  }

  /**
   * Get all learned rules
   * @returns {Map}
   */
  getRules() {
    return this.ruleLearner.getAllRules();
  }

  /**
   * Get consolidated schemas
   * @returns {Object[]}
   */
  getSchemas() {
    return this.consolidator.getAllPromoted();
  }

  /**
   * Clear all training state
   */
  clear() {
    this.ruleLearner.clear();
    this.schemaProposer.clear();
    this.consolidator.clear();
    this.trainingHistory = [];
  }

  /**
   * Export training state
   * @returns {Object}
   */
  export() {
    return {
      rules: Object.fromEntries(this.ruleLearner.getAllRules()),
      schemas: this.consolidator.getAllPromoted(),
      history: this.trainingHistory,
      config: this.config
    };
  }

  /**
   * Import training state
   * @param {Object} state
   */
  import(state) {
    if (state.rules) {
      for (const [name, data] of Object.entries(state.rules)) {
        this.ruleLearner.learnedRules.set(name, data);
      }
    }
    if (state.history) {
      this.trainingHistory = state.history;
    }
  }
}

/**
 * Create a training service
 * @param {TrainingConfig} [config]
 * @returns {TrainingService}
 */
export function createTrainingService(config = {}) {
  return new TrainingService(config);
}

export default { TrainingService, createTrainingService };
