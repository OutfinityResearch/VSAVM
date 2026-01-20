/**
 * Consolidator
 * Per DS005: Promote schemas based on MDL improvement and validation
 * Handles schema lifecycle: proposal -> validation -> promotion/rejection
 */

/**
 * Consolidation decision
 * @typedef {Object} ConsolidationDecision
 * @property {string} action - 'promote' | 'reject' | 'defer'
 * @property {string} reason - Explanation
 * @property {number} score - MDL improvement score
 * @property {Object|null} artifact - Promoted artifact if action is 'promote'
 */

/**
 * Promoted schema artifact
 * @typedef {Object} SchemaArtifact
 * @property {string} id - Artifact ID
 * @property {string} version - Version string
 * @property {Object} schema - Schema definition
 * @property {number} promotedAt - Timestamp
 * @property {Object} metrics - Performance metrics
 */

/**
 * Consolidator
 * Manages schema promotion based on MDL criteria
 */
export class Consolidator {
  /**
   * @param {Object} [config]
   * @param {number} [config.minSupport=3] - Minimum support for promotion
   * @param {number} [config.minMDLImprovement=2] - Minimum MDL improvement
   * @param {number} [config.minConfidence=0.8] - Minimum confidence
   * @param {number} [config.validationRatio=0.2] - Held-out validation ratio
   */
  constructor(config = {}) {
    this.minSupport = config.minSupport ?? 3;
    this.minMDLImprovement = config.minMDLImprovement ?? 2;
    this.minConfidence = config.minConfidence ?? 0.8;
    this.validationRatio = config.validationRatio ?? 0.2;
    
    // Promoted schemas with versioning
    this.promotedSchemas = new Map();
    this.schemaHistory = new Map();
    this.versionCounter = new Map();
  }

  /**
   * Evaluate a schema candidate for promotion
   * @param {Object} candidate - Schema candidate
   * @param {Object} [context] - Evaluation context
   * @returns {ConsolidationDecision}
   */
  evaluate(candidate, context = {}) {
    const checks = [];

    // Check 1: Minimum support
    if (candidate.support < this.minSupport) {
      checks.push({
        passed: false,
        check: 'support',
        reason: `Insufficient support: ${candidate.support} < ${this.minSupport}`
      });
    } else {
      checks.push({ passed: true, check: 'support' });
    }

    // Check 2: Minimum confidence
    if (candidate.confidence < this.minConfidence) {
      checks.push({
        passed: false,
        check: 'confidence',
        reason: `Insufficient confidence: ${candidate.confidence} < ${this.minConfidence}`
      });
    } else {
      checks.push({ passed: true, check: 'confidence' });
    }

    // Check 3: MDL improvement
    if (candidate.mdlScore < this.minMDLImprovement) {
      checks.push({
        passed: false,
        check: 'mdl',
        reason: `Insufficient MDL improvement: ${candidate.mdlScore} < ${this.minMDLImprovement}`
      });
    } else {
      checks.push({ passed: true, check: 'mdl' });
    }

    // Check 4: Validation on held-out data (if provided)
    if (context.validationData) {
      const validationResult = this.validateOnHeldOut(candidate, context.validationData);
      checks.push(validationResult);
    }

    // Check 5: Consistency checks (if closure service provided)
    if (context.closureService) {
      const consistencyResult = this.checkConsistency(candidate, context.closureService);
      checks.push(consistencyResult);
    }

    // Determine action
    const failedChecks = checks.filter(c => c.passed === false);
    
    if (failedChecks.length === 0) {
      return {
        action: 'promote',
        reason: 'All validation checks passed',
        score: candidate.mdlScore,
        checks,
        artifact: null // Will be created on promote
      };
    } else if (failedChecks.length === 1 && failedChecks[0].check === 'support') {
      // Defer if only support is insufficient
      return {
        action: 'defer',
        reason: 'Awaiting more evidence',
        score: candidate.mdlScore,
        checks,
        artifact: null
      };
    } else {
      return {
        action: 'reject',
        reason: failedChecks.map(c => c.reason).join('; '),
        score: candidate.mdlScore,
        checks,
        artifact: null
      };
    }
  }

  /**
   * Validate schema on held-out data
   * @private
   */
  validateOnHeldOut(candidate, validationData) {
    if (!validationData || validationData.length === 0) {
      return { passed: true, check: 'validation', reason: 'No validation data' };
    }

    // Test pattern on validation examples
    let matches = 0;
    for (const example of validationData) {
      if (this.patternMatches(candidate.pattern, example)) {
        matches++;
      }
    }

    const accuracy = matches / validationData.length;
    if (accuracy >= 0.7) {
      return { passed: true, check: 'validation', accuracy };
    } else {
      return {
        passed: false,
        check: 'validation',
        reason: `Validation accuracy too low: ${accuracy.toFixed(2)}`,
        accuracy
      };
    }
  }

  /**
   * Check pattern matches example
   * @private
   */
  patternMatches(pattern, example) {
    if (!pattern || !example || !Array.isArray(example.sequence)) {
      return false;
    }

    // Generate expected sequence from pattern
    const expected = this.generateFromPattern(pattern, example.sequence.length);
    if (!expected) return false;

    // Check if sequences match
    for (let i = 0; i < example.sequence.length; i++) {
      if (Math.abs(example.sequence[i] - expected[i]) > 0.001) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate sequence from pattern
   * @private
   */
  generateFromPattern(pattern, length) {
    const result = [];

    switch (pattern.type) {
      case 'arithmetic_progression':
        for (let i = 0; i < length; i++) {
          result.push(pattern.start + i * pattern.difference);
        }
        break;

      case 'geometric_progression':
        for (let i = 0; i < length; i++) {
          result.push(pattern.start * Math.pow(pattern.ratio, i));
        }
        break;

      case 'fibonacci':
        result.push(pattern.a, pattern.b);
        for (let i = 2; i < length; i++) {
          result.push(result[i - 1] + result[i - 2]);
        }
        break;

      case 'modular_arithmetic':
        for (let i = 0; i < length; i++) {
          result.push(((pattern.start + i * pattern.increment) % pattern.modulus + pattern.modulus) % pattern.modulus);
        }
        break;

      case 'polynomial':
        for (let n = 0; n < length; n++) {
          result.push(pattern.a * n * n + pattern.b * n + pattern.c);
        }
        break;

      default:
        return null;
    }

    return result.slice(0, length);
  }

  /**
   * Check consistency via closure
   * @private
   */
  checkConsistency(candidate, closureService) {
    // Placeholder for closure-based consistency check
    // In full implementation, would verify no conflicts under bounded closure
    return { passed: true, check: 'consistency' };
  }

  /**
   * Promote a schema to permanent status
   * @param {Object} candidate - Schema candidate
   * @param {ConsolidationDecision} decision - Evaluation decision
   * @returns {SchemaArtifact}
   */
  promote(candidate, decision) {
    if (decision.action !== 'promote') {
      throw new Error(`Cannot promote schema with action: ${decision.action}`);
    }

    // Generate version
    const baseId = candidate.type;
    const version = this.getNextVersion(baseId);

    const artifact = {
      id: `${baseId}_v${version}`,
      version: `${version}.0`,
      schema: candidate.pattern,
      promotedAt: Date.now(),
      metrics: {
        support: candidate.support,
        confidence: candidate.confidence,
        mdlScore: candidate.mdlScore
      }
    };

    // Store artifact
    this.promotedSchemas.set(artifact.id, artifact);

    // Track history
    if (!this.schemaHistory.has(baseId)) {
      this.schemaHistory.set(baseId, []);
    }
    this.schemaHistory.get(baseId).push(artifact);

    return artifact;
  }

  /**
   * Get next version number
   * @private
   */
  getNextVersion(baseId) {
    const current = this.versionCounter.get(baseId) || 0;
    this.versionCounter.set(baseId, current + 1);
    return current + 1;
  }

  /**
   * Rollback to previous version
   * @param {string} schemaId - Schema ID to rollback
   * @returns {SchemaArtifact|null}
   */
  rollback(schemaId) {
    const baseId = schemaId.replace(/_v\d+$/, '');
    const history = this.schemaHistory.get(baseId);

    if (!history || history.length < 2) {
      return null; // No previous version
    }

    // Remove current version
    const removed = history.pop();
    this.promotedSchemas.delete(removed.id);

    // Return previous version
    const previous = history[history.length - 1];
    return previous;
  }

  /**
   * Get all promoted schemas
   * @returns {SchemaArtifact[]}
   */
  getAllPromoted() {
    return Array.from(this.promotedSchemas.values());
  }

  /**
   * Get schema by ID
   * @param {string} id
   * @returns {SchemaArtifact|null}
   */
  getSchema(id) {
    return this.promotedSchemas.get(id) || null;
  }

  /**
   * Clear all promoted schemas
   */
  clear() {
    this.promotedSchemas.clear();
    this.schemaHistory.clear();
    this.versionCounter.clear();
  }
}

/**
 * Create a consolidator
 * @param {Object} [config]
 * @returns {Consolidator}
 */
export function createConsolidator(config = {}) {
  return new Consolidator(config);
}

export default { Consolidator, createConsolidator };
