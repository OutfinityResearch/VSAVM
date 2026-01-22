/**
 * Result Builder
 * Per DS004/DS007: Build QueryResult with claims, assumptions, conflicts, trace_refs
 */

import { 
  ResponseMode, 
  createQueryResult, 
  createClaim, 
  createAssumption, 
  createConflictReport,
  createTraceRef,
  createBudgetUsage 
} from '../core/types/results.mjs';

/**
 * Result builder configuration
 */
export const RESULT_BUILDER_CONFIG = {
  maxClaimsPerResult: 100,
  includeDerivationTrace: true,
  computeSupportingFacts: true
};

/**
 * Result Builder - constructs QueryResult objects
 */
export class ResultBuilder {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = {
      ...RESULT_BUILDER_CONFIG,
      ...options
    };
    this._reset();
  }

  /**
   * Reset builder state
   * @private
   */
  _reset() {
    this._mode = null;
    this._claims = [];
    this._assumptions = [];
    this._conflicts = [];
    this._traceRefs = [];
    this._budgetUsage = null;
    this._executionMs = 0;
    this._metadata = {};
  }

  /**
   * Start building a new result
   * @param {string} mode - ResponseMode
   * @returns {ResultBuilder} - this for chaining
   */
  startResult(mode = ResponseMode.INDETERMINATE) {
    this._reset();
    this._mode = mode;
    return this;
  }

  /**
   * Set response mode
   * @param {string} mode
   * @returns {ResultBuilder}
   */
  setMode(mode) {
    this._mode = mode;
    return this;
  }

  /**
   * Add a claim
   * @param {string} claimId
   * @param {Object} content - Term content
   * @param {Object} [options]
   * @returns {ResultBuilder}
   */
  addClaim(claimId, content, options = {}) {
    if (this._claims.length >= this.options.maxClaimsPerResult) {
      return this;
    }

    const claim = createClaim(claimId, content, {
      confidence: options.confidence ?? 1.0,
      supportingFacts: options.supportingFacts ?? [],
      derivationTrace: options.derivationTrace ?? null
    });

    this._claims.push(claim);
    return this;
  }

  /**
   * Add multiple claims from facts
   * @param {Array|Set} facts - Facts to convert to claims
   * @param {number} [confidence=1.0]
   * @returns {ResultBuilder}
   */
  addClaimsFromFacts(facts, confidence = 1.0) {
    const factArray = facts instanceof Set ? [...facts] : facts;

    for (const fact of factArray) {
      if (this._claims.length >= this.options.maxClaimsPerResult) {
        break;
      }

      const claimId = `claim_${fact.factId ?? this._claims.length}`;
      const supportingFacts = this.options.computeSupportingFacts
        ? this._findSupportingFacts(fact)
        : [fact.factId];

      this.addClaim(claimId, fact, {
        confidence,
        supportingFacts,
        derivationTrace: this.options.includeDerivationTrace 
          ? this._extractDerivationTrace(fact) 
          : null
      });
    }

    return this;
  }

  /**
   * Add an assumption
   * @param {string} assumptionId
   * @param {string} description
   * @param {string[]} [dependentClaims=[]]
   * @returns {ResultBuilder}
   */
  addAssumption(assumptionId, description, dependentClaims = []) {
    this._assumptions.push(createAssumption(assumptionId, description, dependentClaims));
    return this;
  }

  /**
   * Add assumptions from conflicts
   * @param {Array} conflicts
   * @returns {ResultBuilder}
   */
  addAssumptionsFromConflicts(conflicts) {
    const byType = new Map();
    
    for (const conflict of conflicts) {
      const type = conflict.type ?? 'unknown';
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type).push(conflict);
    }

    let index = this._assumptions.length;
    for (const [type, typeConflicts] of byType) {
      const factIds = typeConflicts.flatMap(c => c.factIds ?? c.facts ?? []);
      this.addAssumption(
        `assumption_conflict_${index++}`,
        `Assuming resolution of ${type} conflict(s) involving: ${factIds.slice(0, 3).join(', ')}${factIds.length > 3 ? '...' : ''}`,
        []
      );
    }

    return this;
  }

  /**
   * Add a conflict
   * @param {string} conflictId
   * @param {string} type - ConflictType
   * @param {string[]} facts - FactIds involved
   * @param {Object} [scopeId]
   * @param {string} [resolution]
   * @returns {ResultBuilder}
   */
  addConflict(conflictId, type, facts, scopeId = null, resolution = undefined) {
    this._conflicts.push(createConflictReport(conflictId, type, facts, scopeId, resolution));
    return this;
  }

  /**
   * Add conflicts from conflict array
   * @param {Array} conflicts
   * @returns {ResultBuilder}
   */
  addConflicts(conflicts) {
    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      this.addConflict(
        c.conflictId ?? `conflict_${this._conflicts.length}`,
        c.type ?? 'direct',
        c.factIds ?? c.facts ?? [],
        c.scopeId ?? null,
        c.resolution
      );
    }
    return this;
  }

  /**
   * Add a trace reference
   * @param {string} logSegmentId
   * @param {number} startOffset
   * @param {number} endOffset
   * @returns {ResultBuilder}
   */
  addTraceRef(logSegmentId, startOffset, endOffset) {
    this._traceRefs.push(createTraceRef(logSegmentId, startOffset, endOffset));
    return this;
  }

  /**
   * Add trace refs from closure/execution results
   * @param {Object} closureResult
   * @param {Object} [executionResult]
   * @returns {ResultBuilder}
   */
  addTraceRefsFromResults(closureResult, executionResult = null) {
    if (closureResult?.trace) {
      this.addTraceRef('closure_trace', 0, closureResult.trace.length);
    }
    if (executionResult?.trace) {
      this.addTraceRef('execution_trace', 0, executionResult.trace.length);
    }
    return this;
  }

  /**
   * Set budget usage from budget tracker
   * @param {Object} budget
   * @returns {ResultBuilder}
   */
  setBudgetFromTracker(budget) {
    if (budget.getUsage) {
      const usage = budget.getUsage();
      this._budgetUsage = createBudgetUsage(
        { depth: usage.maxDepth, steps: usage.maxSteps, branches: usage.maxBranches, timeMs: usage.maxTimeMs },
        { depth: usage.usedDepth, steps: usage.usedSteps, branches: usage.usedBranches, timeMs: usage.usedTimeMs }
      );
    } else {
      this._budgetUsage = createBudgetUsage(
        { depth: budget.limits?.maxDepth, steps: budget.limits?.maxSteps, branches: budget.limits?.maxBranches, timeMs: budget.limits?.maxTimeMs },
        { depth: budget.used?.depth, steps: budget.used?.steps, branches: budget.used?.branches, timeMs: budget.used?.timeMs }
      );
    }
    return this;
  }

  /**
   * Set execution time
   * @param {number} ms
   * @returns {ResultBuilder}
   */
  setExecutionMs(ms) {
    this._executionMs = ms;
    return this;
  }

  /**
   * Set metadata
   * @param {string} key
   * @param {*} value
   * @returns {ResultBuilder}
   */
  setMetadata(key, value) {
    this._metadata[key] = value;
    return this;
  }

  /**
   * Build the final QueryResult
   * @returns {Object}
   */
  build() {
    const result = createQueryResult({
      mode: this._mode ?? ResponseMode.INDETERMINATE,
      budgetUsed: this._budgetUsage ?? createBudgetUsage({}, {}),
      claims: this._claims,
      assumptions: this._assumptions,
      conflicts: this._conflicts,
      traceRefs: this._traceRefs,
      executionMs: this._executionMs
    });

    // Add any metadata
    for (const [key, value] of Object.entries(this._metadata)) {
      result[key] = value;
    }

    return result;
  }

  /**
   * Find supporting facts for a claim
   * @private
   */
  _findSupportingFacts(fact) {
    // If fact has provenance, extract source facts
    if (fact.provenance && Array.isArray(fact.provenance)) {
      const supporting = [];
      for (const prov of fact.provenance) {
        if (prov.sourceId) {
          supporting.push(prov.sourceId.id ?? prov.sourceId);
        }
      }
      if (supporting.length > 0) {
        return supporting;
      }
    }
    return [fact.factId];
  }

  /**
   * Extract derivation trace for a fact
   * @private
   */
  _extractDerivationTrace(fact) {
    if (!this.options.includeDerivationTrace) {
      return null;
    }

    // Build minimal trace
    return {
      factId: fact.factId,
      derivedFrom: fact.provenance?.map(p => p.sourceId?.id ?? p.sourceId) ?? []
    };
  }
}

/**
 * Build a strict mode result
 * @param {Object} closureResult
 * @param {Object} executionResult
 * @param {Object} budget
 * @returns {Object}
 */
export function buildStrictResult(closureResult, executionResult, budget) {
  const builder = new ResultBuilder();
  const executionMs = budget?.deterministicTime
    ? 0
    : Date.now() - (budget.startTime ?? Date.now());

  // Check for conflicts
  const conflicts = [
    ...(closureResult.conflicts ?? []),
    ...(executionResult?.conflicts ?? [])
  ];

  if (conflicts.length > 0) {
    // Return indeterminate with conflicts
    return builder
      .startResult(ResponseMode.INDETERMINATE)
      .addConflicts(conflicts)
      .addTraceRefsFromResults(closureResult, executionResult)
      .setBudgetFromTracker(budget)
      .setExecutionMs(executionMs)
      .setMetadata('reason', 'conflicts_detected')
      .build();
  }

  // No conflicts - return strict result
  return builder
    .startResult(ResponseMode.STRICT)
    .addClaimsFromFacts(closureResult.derived ?? [], 1.0)
    .addTraceRefsFromResults(closureResult, executionResult)
    .setBudgetFromTracker(budget)
    .setExecutionMs(executionMs)
    .build();
}

/**
 * Build a conditional mode result
 * @param {Object} closureResult
 * @param {Object} executionResult
 * @param {Object} budget
 * @param {number} [confidence=1.0]
 * @returns {Object}
 */
export function buildConditionalResult(closureResult, executionResult, budget, confidence = 1.0) {
  const builder = new ResultBuilder();
  const executionMs = budget?.deterministicTime
    ? 0
    : Date.now() - (budget.startTime ?? Date.now());

  const conflicts = [
    ...(closureResult.conflicts ?? []),
    ...(executionResult?.conflicts ?? [])
  ];

  return builder
    .startResult(ResponseMode.CONDITIONAL)
    .addClaimsFromFacts(closureResult.derived ?? [], confidence)
    .addAssumptionsFromConflicts(conflicts)
    .addConflicts(conflicts)
    .addTraceRefsFromResults(closureResult, executionResult)
    .setBudgetFromTracker(budget)
    .setExecutionMs(executionMs)
    .build();
}

/**
 * Build an indeterminate mode result
 * @param {Object} closureResult
 * @param {Object} executionResult
 * @param {Object} budget
 * @param {string} reason
 * @returns {Object}
 */
export function buildIndeterminateResult(closureResult, executionResult, budget, reason) {
  const builder = new ResultBuilder();
  const executionMs = budget?.deterministicTime
    ? 0
    : Date.now() - (budget.startTime ?? Date.now());

  const conflicts = [
    ...(closureResult.conflicts ?? []),
    ...(executionResult?.conflicts ?? [])
  ];

  return builder
    .startResult(ResponseMode.INDETERMINATE)
    .addConflicts(conflicts)
    .addTraceRefsFromResults(closureResult, executionResult)
    .setBudgetFromTracker(budget)
    .setExecutionMs(executionMs)
    .setMetadata('reason', reason)
    .build();
}

/**
 * Create a result builder
 * @param {Object} [options]
 * @returns {ResultBuilder}
 */
export function createResultBuilder(options = {}) {
  return new ResultBuilder(options);
}

export default {
  ResultBuilder,
  createResultBuilder,
  buildStrictResult,
  buildConditionalResult,
  buildIndeterminateResult,
  RESULT_BUILDER_CONFIG
};
