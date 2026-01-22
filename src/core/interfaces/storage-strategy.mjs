/**
 * Storage Strategy Interface
 * Per DS006: Pluggable fact storage backend
 */

/**
 * Base Storage Strategy class
 * Implementations: MemoryStore, SqliteStore, LevelDbStore, PostgresStore
 */
export class StorageStrategy {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Initialize storage connection
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Not implemented: initialize');
  }

  /**
   * Close storage connection
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('Not implemented: close');
  }

  /**
   * Assert a fact
   * @param {Object} fact - FactInstance
   * @returns {Promise<void>}
   */
  async assertFact(fact) {
    throw new Error('Not implemented: assertFact');
  }

  /**
   * Deny a fact (retract)
   * @param {string} factId
   * @param {{path: string[]}} scopeId
   * @returns {Promise<void>}
   */
  async denyFact(factId, scopeId) {
    throw new Error('Not implemented: denyFact');
  }

  /**
   * Get a fact by ID
   * @param {string} factId
   * @returns {Promise<Object|null>}
   */
  async getFact(factId) {
    throw new Error('Not implemented: getFact');
  }

  /**
   * Query facts by pattern
   * @param {Object} pattern
   * @returns {Promise<Object[]>}
   */
  async query(pattern) {
    throw new Error('Not implemented: query');
  }

  /**
   * Query facts by predicate
   * @param {string} predicate
   * @returns {Promise<Object[]>}
   */
  async queryByPredicate(predicate) {
    throw new Error('Not implemented: queryByPredicate');
  }

  /**
   * Query facts by scope
   * @param {{path: string[]}} scopeId
   * @returns {Promise<Object[]>}
   */
  async queryByScope(scopeId) {
    throw new Error('Not implemented: queryByScope');
  }

  /**
   * Query facts by time range
   * @param {Date} start
   * @param {Date} end
   * @returns {Promise<Object[]>}
   */
  async queryByTimeRange(start, end) {
    throw new Error('Not implemented: queryByTimeRange');
  }

  /**
   * Get all stored facts
   * @returns {Promise<Object[]>}
   */
  async getAllFacts() {
    throw new Error('Not implemented: getAllFacts');
  }

  /**
   * Find facts that conflict with given fact
   * @param {Object} fact
   * @returns {Promise<Object[]>}
   */
  async findConflicting(fact) {
    throw new Error('Not implemented: findConflicting');
  }

  /**
   * Create a snapshot for rollback
   * @returns {Promise<string>} Snapshot ID
   */
  async createSnapshot() {
    throw new Error('Not implemented: createSnapshot');
  }

  /**
   * Restore from snapshot
   * @param {string} snapshotId
   * @returns {Promise<void>}
   */
  async restoreSnapshot(snapshotId) {
    throw new Error('Not implemented: restoreSnapshot');
  }

  /**
   * Get count of stored facts
   * @returns {Promise<number>}
   */
  async count() {
    throw new Error('Not implemented: count');
  }

  /**
   * Clear all stored facts
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('Not implemented: clear');
  }
}
