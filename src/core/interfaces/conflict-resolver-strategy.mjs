/**
 * Conflict Resolver Strategy Interface
 * Per DS006: Pluggable conflict resolution strategy
 */

/**
 * Base Conflict Resolver Strategy class
 * Implementations: SourcePriorityResolver, TemporalPriorityResolver, ProbabilisticResolver
 */
export class ConflictResolverStrategy {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Check if this resolver can handle a conflict type
   * @param {Object} conflict
   * @returns {boolean}
   */
  canHandle(conflict) {
    throw new Error('Not implemented: canHandle');
  }

  /**
   * Resolve a conflict
   * @param {Object} conflict
   * @returns {{keep: Object[], reject: Object[], reason: string, confidence: number}}
   */
  resolve(conflict) {
    throw new Error('Not implemented: resolve');
  }
}
