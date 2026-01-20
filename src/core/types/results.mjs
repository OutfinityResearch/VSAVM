/**
 * Result types for VSAVM
 * Per DS007: QueryResult, BudgetUsage, Claim, Assumption, ConflictReport, TraceRef
 */

/**
 * Response modes
 */
export const ResponseMode = {
  STRICT: 'strict',
  CONDITIONAL: 'conditional',
  INDETERMINATE: 'indeterminate'
};

/**
 * Conflict types
 */
export const ConflictType = {
  DIRECT: 'direct',
  INDIRECT: 'indirect',
  TEMPORAL: 'temporal'
};

/**
 * Create a BudgetUsage object
 * @param {Object} max - Maximum budget limits
 * @param {Object} used - Consumed budget
 * @returns {Object}
 */
export function createBudgetUsage(max, used) {
  return {
    maxDepth: max.depth ?? 10,
    usedDepth: used.depth ?? 0,
    maxSteps: max.steps ?? 1000,
    usedSteps: used.steps ?? 0,
    maxBranches: max.branches ?? 5,
    usedBranches: used.branches ?? 0,
    maxTimeMs: max.timeMs,
    usedTimeMs: used.timeMs ?? 0
  };
}

/**
 * Create a Claim
 * @param {string} claimId
 * @param {Object} content - Term
 * @param {Object} options
 * @returns {Object}
 */
export function createClaim(claimId, content, options = {}) {
  return {
    claimId,
    content,
    confidence: options.confidence ?? 1.0,
    supportingFacts: options.supportingFacts ?? [],
    derivationTrace: options.derivationTrace ?? null
  };
}

/**
 * Create an Assumption
 * @param {string} assumptionId
 * @param {string} description
 * @param {string[]} dependentClaims
 * @returns {Object}
 */
export function createAssumption(assumptionId, description, dependentClaims = []) {
  return {
    assumptionId,
    description,
    dependentClaims
  };
}

/**
 * Create a ConflictReport
 * @param {string} conflictId
 * @param {string} type - ConflictType value
 * @param {string[]} facts - FactIds involved
 * @param {{path: string[]}} scopeId
 * @param {string} [resolution]
 * @returns {Object}
 */
export function createConflictReport(conflictId, type, facts, scopeId, resolution = undefined) {
  const report = {
    conflictId,
    type,
    facts,
    scopeId
  };
  if (resolution) report.resolution = resolution;
  return report;
}

/**
 * Create a TraceRef
 * @param {string} logSegmentId
 * @param {number} startOffset
 * @param {number} endOffset
 * @returns {Object}
 */
export function createTraceRef(logSegmentId, startOffset, endOffset) {
  return {
    logSegmentId,
    startOffset,
    endOffset
  };
}

/**
 * Create a QueryResult
 * @param {Object} options
 * @returns {Object}
 */
export function createQueryResult(options = {}) {
  return {
    mode: options.mode ?? ResponseMode.INDETERMINATE,
    budgetUsed: options.budgetUsed ?? createBudgetUsage({}, {}),
    claims: options.claims ?? [],
    assumptions: options.assumptions ?? [],
    conflicts: options.conflicts ?? [],
    traceRefs: options.traceRefs ?? [],
    executionMs: options.executionMs ?? 0
  };
}

/**
 * Check if a result is definite (no assumptions, no conflicts)
 * @param {Object} result
 * @returns {boolean}
 */
export function isDefiniteResult(result) {
  return result.mode === ResponseMode.STRICT &&
         result.assumptions.length === 0 &&
         result.conflicts.length === 0;
}

/**
 * Check if budget is exhausted
 * @param {Object} budgetUsage
 * @returns {boolean}
 */
export function isBudgetExhausted(budgetUsage) {
  return budgetUsage.usedDepth >= budgetUsage.maxDepth ||
         budgetUsage.usedSteps >= budgetUsage.maxSteps ||
         budgetUsage.usedBranches >= budgetUsage.maxBranches ||
         (budgetUsage.maxTimeMs && budgetUsage.usedTimeMs >= budgetUsage.maxTimeMs);
}

/**
 * Get budget remaining as fraction (0-1)
 * @param {Object} budgetUsage
 * @returns {number}
 */
export function budgetRemaining(budgetUsage) {
  const depthRatio = 1 - (budgetUsage.usedDepth / budgetUsage.maxDepth);
  const stepsRatio = 1 - (budgetUsage.usedSteps / budgetUsage.maxSteps);
  const branchesRatio = 1 - (budgetUsage.usedBranches / budgetUsage.maxBranches);
  
  // Return minimum of all ratios
  let min = Math.min(depthRatio, stepsRatio, branchesRatio);
  
  if (budgetUsage.maxTimeMs) {
    const timeRatio = 1 - (budgetUsage.usedTimeMs / budgetUsage.maxTimeMs);
    min = Math.min(min, timeRatio);
  }
  
  return Math.max(0, min);
}
