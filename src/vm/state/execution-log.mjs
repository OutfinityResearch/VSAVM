/**
 * Execution log for VM tracing
 * Per DS006/DS004: Operation trace logging for auditability
 */

/**
 * Log entry types
 */
export const LogEntryType = {
  INSTRUCTION: 'instruction',
  FACT_ASSERT: 'fact_assert',
  FACT_DENY: 'fact_deny',
  QUERY_RESULT: 'query_result',
  MATCH_RESULT: 'match_result',
  BRANCH_START: 'branch_start',
  BRANCH_END: 'branch_end',
  CONTEXT_PUSH: 'context_push',
  CONTEXT_POP: 'context_pop',
  CONFLICT: 'conflict',
  ERROR: 'error',
  BUDGET: 'budget'
};

/**
 * Execution log for tracing
 */
export class ExecutionLog {
  /**
   * @param {Object} [options]
   * @param {'minimal' | 'standard' | 'verbose'} [options.level='standard']
   */
  constructor(options = {}) {
    this.level = options.level ?? 'standard';
    this.entries = [];
    this.nextId = 0;
    this.segmentId = `log_${Date.now()}`;
  }

  /**
   * Check if a log level should be recorded
   * @param {'minimal' | 'standard' | 'verbose'} requiredLevel
   * @returns {boolean}
   */
  shouldLog(requiredLevel) {
    const levels = { minimal: 0, standard: 1, verbose: 2 };
    return levels[this.level] >= levels[requiredLevel];
  }

  /**
   * Add a log entry
   * @param {string} type - LogEntryType
   * @param {Object} data
   * @param {'minimal' | 'standard' | 'verbose'} [requiredLevel='standard']
   * @returns {number} Entry ID
   */
  log(type, data, requiredLevel = 'standard') {
    if (!this.shouldLog(requiredLevel)) {
      return -1;
    }
    
    const entry = {
      id: this.nextId++,
      type,
      timestamp: Date.now(),
      data
    };
    
    this.entries.push(entry);
    return entry.id;
  }

  /**
   * Log an instruction execution
   * @param {string} op
   * @param {Object} args
   * @param {*} result
   */
  logInstruction(op, args, result) {
    return this.log(LogEntryType.INSTRUCTION, { op, args, result }, 'verbose');
  }

  /**
   * Log a fact assertion
   * @param {Object} fact
   */
  logFactAssert(fact) {
    return this.log(LogEntryType.FACT_ASSERT, {
      factId: fact.factId,
      predicate: fact.predicate,
      polarity: fact.polarity
    }, 'standard');
  }

  /**
   * Log a fact denial
   * @param {string} factId
   */
  logFactDeny(factId) {
    return this.log(LogEntryType.FACT_DENY, { factId }, 'standard');
  }

  /**
   * Log query results
   * @param {Object} pattern
   * @param {number} count
   * @param {string[]} factIds
   */
  logQueryResult(pattern, count, factIds) {
    return this.log(LogEntryType.QUERY_RESULT, { pattern, count, factIds }, 'standard');
  }

  /**
   * Log match result
   * @param {Object} pattern
   * @param {boolean} success
   * @param {Object} [bindings]
   */
  logMatchResult(pattern, success, bindings) {
    return this.log(LogEntryType.MATCH_RESULT, { pattern, success, bindings }, 'verbose');
  }

  /**
   * Log branch start
   * @param {string} branchId
   * @param {string} reason
   */
  logBranchStart(branchId, reason) {
    return this.log(LogEntryType.BRANCH_START, { branchId, reason }, 'standard');
  }

  /**
   * Log branch end
   * @param {string} branchId
   * @param {string} outcome
   */
  logBranchEnd(branchId, outcome) {
    return this.log(LogEntryType.BRANCH_END, { branchId, outcome }, 'standard');
  }

  /**
   * Log context push
   * @param {string} contextId
   * @param {boolean} isolated
   */
  logContextPush(contextId, isolated) {
    return this.log(LogEntryType.CONTEXT_PUSH, { contextId, isolated }, 'verbose');
  }

  /**
   * Log context pop
   * @param {string} contextId
   */
  logContextPop(contextId) {
    return this.log(LogEntryType.CONTEXT_POP, { contextId }, 'verbose');
  }

  /**
   * Log a conflict
   * @param {string} type
   * @param {string[]} factIds
   */
  logConflict(type, factIds) {
    return this.log(LogEntryType.CONFLICT, { type, factIds }, 'minimal');
  }

  /**
   * Log an error
   * @param {string} code
   * @param {string} message
   * @param {Object} [context]
   */
  logError(code, message, context) {
    return this.log(LogEntryType.ERROR, { code, message, context }, 'minimal');
  }

  /**
   * Log budget update
   * @param {Object} usage
   */
  logBudget(usage) {
    return this.log(LogEntryType.BUDGET, usage, 'verbose');
  }

  /**
   * Get all entries
   * @returns {Object[]}
   */
  getEntries() {
    return [...this.entries];
  }

  /**
   * Get entries by type
   * @param {string} type
   * @returns {Object[]}
   */
  getEntriesByType(type) {
    return this.entries.filter(e => e.type === type);
  }

  /**
   * Get entries in range
   * @param {number} startId
   * @param {number} endId
   * @returns {Object[]}
   */
  getEntriesInRange(startId, endId) {
    return this.entries.filter(e => e.id >= startId && e.id <= endId);
  }

  /**
   * Create a trace reference
   * @param {number} startId
   * @param {number} endId
   * @returns {{logSegmentId: string, startOffset: number, endOffset: number}}
   */
  createTraceRef(startId, endId) {
    return {
      logSegmentId: this.segmentId,
      startOffset: startId,
      endOffset: endId
    };
  }

  /**
   * Get summary statistics
   * @returns {Object}
   */
  getSummary() {
    const counts = {};
    for (const entry of this.entries) {
      counts[entry.type] = (counts[entry.type] || 0) + 1;
    }
    return {
      totalEntries: this.entries.length,
      byType: counts,
      segmentId: this.segmentId
    };
  }

  /**
   * Clear log
   */
  clear() {
    this.entries = [];
    this.nextId = 0;
  }

  /**
   * Export to JSON
   * @returns {string}
   */
  toJSON() {
    return JSON.stringify({
      segmentId: this.segmentId,
      level: this.level,
      entries: this.entries
    });
  }
}
