/**
 * Schema Proposer
 * Per DS005: Propose new schemas from discovered patterns
 * Creates schema candidates for consolidation
 */

import { PatternMiner, createPatternMiner } from './pattern-miner.mjs';

/**
 * Schema candidate
 * @typedef {Object} SchemaCandidate
 * @property {string} id - Unique schema identifier
 * @property {string} type - Schema type
 * @property {Object} pattern - Underlying pattern
 * @property {number} support - Number of supporting occurrences
 * @property {number} mdlScore - MDL improvement score
 * @property {Object} metadata - Additional metadata
 */

/**
 * Schema Proposer
 * Proposes new schemas from pattern discoveries
 */
export class SchemaProposer {
  /**
   * @param {Object} [config]
   * @param {number} [config.minSupport=3] - Minimum occurrences for proposal
   * @param {number} [config.minConfidence=0.8] - Minimum pattern confidence
   */
  constructor(config = {}) {
    this.minSupport = config.minSupport ?? 3;
    this.minConfidence = config.minConfidence ?? 0.8;
    this.patternMiner = createPatternMiner({ minConfidence: this.minConfidence });
    this.proposedSchemas = new Map();
    this.schemaCounter = 0;
  }

  /**
   * Generate unique schema ID
   * @private
   */
  generateSchemaId(type) {
    return `schema_${type}_${++this.schemaCounter}_${Date.now()}`;
  }

  /**
   * Propose schema from a detected pattern
   * @param {Object} pattern - Detected pattern result
   * @param {Object} [context] - Context information
   * @returns {SchemaCandidate|null}
   */
  proposeFromPattern(pattern, context = {}) {
    if (!pattern || !pattern.rule || pattern.confidence < this.minConfidence) {
      return null;
    }

    const id = this.generateSchemaId(pattern.type);
    const candidate = {
      id,
      type: pattern.type,
      pattern: pattern.rule,
      support: pattern.support,
      confidence: pattern.confidence,
      mdlScore: this.estimateMDLImprovement(pattern),
      metadata: {
        createdAt: Date.now(),
        context: context.name || 'unknown',
        sequenceLength: context.sequenceLength || 0
      }
    };

    // Track proposed schema
    this.proposedSchemas.set(id, candidate);

    return candidate;
  }

  /**
   * Propose schemas from a sequence
   * @param {number[]} sequence - Input sequence
   * @param {Object} [context] - Context information
   * @returns {SchemaCandidate[]}
   */
  proposeFromSequence(sequence, context = {}) {
    const patterns = this.patternMiner.mineAll(sequence);
    const candidates = [];

    for (const pattern of patterns) {
      const candidate = this.proposeFromPattern(pattern, {
        ...context,
        sequenceLength: sequence.length
      });
      if (candidate) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  /**
   * Estimate MDL improvement for a pattern
   * Higher values indicate better compression
   * @private
   */
  estimateMDLImprovement(pattern) {
    if (!pattern || !pattern.rule) return 0;

    // Base score from pattern confidence
    let score = pattern.confidence * 10;

    // Bonus for pattern type simplicity
    const typeComplexity = {
      'arithmetic_progression': 2,  // Simplest: just start + diff
      'geometric_progression': 3,   // Slightly more complex
      'fibonacci': 4,               // Two starting values
      'modular_arithmetic': 5,      // Three parameters
      'polynomial': 6               // Most complex: 3 coefficients
    };

    const complexity = typeComplexity[pattern.type] || 5;
    
    // MDL improvement = (support * information_per_element) - schema_cost
    // Higher support = better compression
    const informationPerElement = 4; // bits per element (approximation)
    const schemaCost = complexity * 2; // bits to describe schema
    
    const rawImprovement = (pattern.support * informationPerElement) - schemaCost;
    score += Math.max(0, rawImprovement);

    return score;
  }

  /**
   * Get all proposed schemas
   * @returns {SchemaCandidate[]}
   */
  getAllProposed() {
    return Array.from(this.proposedSchemas.values());
  }

  /**
   * Get schemas above MDL threshold
   * @param {number} [threshold=5]
   * @returns {SchemaCandidate[]}
   */
  getViableSchemas(threshold = 5) {
    return this.getAllProposed().filter(s => s.mdlScore >= threshold);
  }

  /**
   * Clear all proposed schemas
   */
  clear() {
    this.proposedSchemas.clear();
  }

  /**
   * Merge similar schemas
   * @param {SchemaCandidate[]} schemas
   * @returns {SchemaCandidate[]}
   */
  mergeSimilar(schemas) {
    const merged = new Map();

    for (const schema of schemas) {
      const key = this.getSchemaKey(schema);
      
      if (merged.has(key)) {
        // Merge with existing
        const existing = merged.get(key);
        existing.support += schema.support;
        existing.mdlScore = Math.max(existing.mdlScore, schema.mdlScore);
        existing.confidence = Math.max(existing.confidence, schema.confidence);
      } else {
        // Add new
        merged.set(key, { ...schema });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Generate schema key for deduplication
   * @private
   */
  getSchemaKey(schema) {
    const pattern = schema.pattern;
    if (!pattern) return schema.id;

    switch (pattern.type) {
      case 'arithmetic_progression':
        return `arith:${pattern.difference}`;
      case 'geometric_progression':
        return `geom:${pattern.ratio}`;
      case 'fibonacci':
        return `fib:${pattern.a}:${pattern.b}`;
      case 'modular_arithmetic':
        return `mod:${pattern.increment}:${pattern.modulus}`;
      case 'polynomial':
        return `poly:${pattern.a}:${pattern.b}:${pattern.c}`;
      default:
        return schema.id;
    }
  }
}

/**
 * Create a schema proposer
 * @param {Object} [config]
 * @returns {SchemaProposer}
 */
export function createSchemaProposer(config = {}) {
  return new SchemaProposer(config);
}

export default { SchemaProposer, createSchemaProposer };
