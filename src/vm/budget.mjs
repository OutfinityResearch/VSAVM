/**
 * Budget tracking for VM execution
 * Per DS006/DS007: Budget enforcement and accounting
 */

import { ExecutionError, ErrorCode } from '../core/errors.mjs';

/**
 * Default budget limits (per DS007)
 */
export const DEFAULT_BUDGET = {
  maxDepth: 10,
  maxSteps: 1000,
  maxBranches: 5,
  maxTimeMs: 5000
};

/**
 * Operation costs (per DS006)
 */
export const OP_COSTS = {
  MAKE_TERM: 1,
  CANONICALIZE: 2,
  ASSERT: 3,
  DENY: 2,
  QUERY: 5,        // Base cost, adds per match
  MATCH: 2,
  APPLY_RULE: 5,   // Base cost, adds per premise
  CLOSURE: 0,      // Uses remaining budget
  BRANCH: 0,       // Costs 1 branch, not steps
  CALL: 2,
  RETURN: 1,
  PUSH_CONTEXT: 1,
  POP_CONTEXT: 1,
  MERGE_CONTEXT: 3,
  ISOLATE_CONTEXT: 1,
  BIND_SLOTS: 1,
  JUMP: 0,
  COUNT: 1,
  FILTER: 2,
  MAP: 2,
  REDUCE: 2
};

/**
 * Budget tracker for VM execution
 */
export class Budget {
  /**
   * @param {Object} [limits]
   */
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_BUDGET, ...limits };
    this.used = {
      depth: 0,
      steps: 0,
      branches: 0,
      timeMs: 0
    };
    this.startTime = null;
    this.depthStack = [0]; // Track depth at each call level
  }

  /**
   * Start timing
   */
  start() {
    this.startTime = Date.now();
  }

  /**
   * Update elapsed time
   */
  updateTime() {
    if (this.startTime) {
      this.used.timeMs = Date.now() - this.startTime;
    }
  }

  /**
   * Consume steps for an operation
   * @param {string} op - Operation name
   * @param {number} [extra=0] - Additional cost (e.g., per match)
   * @throws {ExecutionError} If budget exhausted
   */
  consumeSteps(op, extra = 0) {
    this.updateTime();
    
    const baseCost = OP_COSTS[op] ?? 1;
    const totalCost = baseCost + extra;
    
    this.used.steps += totalCost;
    
    if (this.used.steps > this.limits.maxSteps) {
      throw new ExecutionError(
        ErrorCode.STEP_LIMIT_EXCEEDED,
        `Step limit exceeded: ${this.used.steps} > ${this.limits.maxSteps}`,
        { op, used: this.used.steps, limit: this.limits.maxSteps }
      );
    }
    
    if (this.limits.maxTimeMs && this.used.timeMs > this.limits.maxTimeMs) {
      throw new ExecutionError(
        ErrorCode.TIME_LIMIT_EXCEEDED,
        `Time limit exceeded: ${this.used.timeMs}ms > ${this.limits.maxTimeMs}ms`,
        { used: this.used.timeMs, limit: this.limits.maxTimeMs }
      );
    }
  }

  /**
   * Push depth (entering a call or inference level)
   * @throws {ExecutionError} If depth limit exceeded
   */
  pushDepth() {
    this.used.depth++;
    this.depthStack.push(this.used.depth);
    
    if (this.used.depth > this.limits.maxDepth) {
      throw new ExecutionError(
        ErrorCode.DEPTH_LIMIT_EXCEEDED,
        `Depth limit exceeded: ${this.used.depth} > ${this.limits.maxDepth}`,
        { used: this.used.depth, limit: this.limits.maxDepth }
      );
    }
  }

  /**
   * Pop depth (returning from a call)
   */
  popDepth() {
    this.depthStack.pop();
    this.used.depth = this.depthStack[this.depthStack.length - 1] ?? 0;
  }

  /**
   * Consume a branch
   * @throws {ExecutionError} If branch limit exceeded
   */
  consumeBranch() {
    this.used.branches++;
    
    if (this.used.branches > this.limits.maxBranches) {
      throw new ExecutionError(
        ErrorCode.BRANCH_LIMIT_EXCEEDED,
        `Branch limit exceeded: ${this.used.branches} > ${this.limits.maxBranches}`,
        { used: this.used.branches, limit: this.limits.maxBranches }
      );
    }
  }

  /**
   * Check if budget is exhausted
   * @returns {boolean}
   */
  isExhausted() {
    this.updateTime();
    
    return this.used.steps >= this.limits.maxSteps ||
           this.used.depth >= this.limits.maxDepth ||
           this.used.branches >= this.limits.maxBranches ||
           (this.limits.maxTimeMs && this.used.timeMs >= this.limits.maxTimeMs);
  }

  /**
   * Get remaining budget as fraction (0-1)
   * @returns {number}
   */
  remaining() {
    this.updateTime();
    
    const stepsRatio = 1 - (this.used.steps / this.limits.maxSteps);
    const depthRatio = 1 - (this.used.depth / this.limits.maxDepth);
    const branchesRatio = 1 - (this.used.branches / this.limits.maxBranches);
    
    let min = Math.min(stepsRatio, depthRatio, branchesRatio);
    
    if (this.limits.maxTimeMs) {
      const timeRatio = 1 - (this.used.timeMs / this.limits.maxTimeMs);
      min = Math.min(min, timeRatio);
    }
    
    return Math.max(0, min);
  }

  /**
   * Get budget usage report
   * @returns {Object}
   */
  getUsage() {
    this.updateTime();
    
    return {
      maxDepth: this.limits.maxDepth,
      usedDepth: this.used.depth,
      maxSteps: this.limits.maxSteps,
      usedSteps: this.used.steps,
      maxBranches: this.limits.maxBranches,
      usedBranches: this.used.branches,
      maxTimeMs: this.limits.maxTimeMs,
      usedTimeMs: this.used.timeMs
    };
  }

  /**
   * Create a sub-budget for a branch
   * @param {number} [fraction=0.5] - Fraction of remaining budget
   * @returns {Budget}
   */
  createSubBudget(fraction = 0.5) {
    this.updateTime();
    
    const remaining = this.remaining();
    const subFraction = remaining * fraction;
    
    return new Budget({
      maxDepth: this.limits.maxDepth - this.used.depth,
      maxSteps: Math.floor((this.limits.maxSteps - this.used.steps) * fraction),
      maxBranches: Math.max(1, Math.floor((this.limits.maxBranches - this.used.branches) * fraction)),
      maxTimeMs: this.limits.maxTimeMs 
        ? Math.floor((this.limits.maxTimeMs - this.used.timeMs) * fraction)
        : undefined
    });
  }

  /**
   * Clone budget state
   * @returns {Budget}
   */
  clone() {
    const b = new Budget(this.limits);
    b.used = { ...this.used };
    b.startTime = this.startTime;
    b.depthStack = [...this.depthStack];
    return b;
  }
}
