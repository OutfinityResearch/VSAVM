/**
 * Branch Management
 * Per DS004/DS008: Branch creation, merging, and pruning for parallel reasoning
 */

import { Budget } from '../../vm/budget.mjs';

/**
 * Default branch pruning threshold (fraction of best score)
 */
export const DEFAULT_PRUNE_THRESHOLD = 0.3;

/**
 * Branch represents a single reasoning path
 */
export class Branch {
  /**
   * @param {Object} config
   * @param {string} config.id - Branch ID
   * @param {Branch|null} [config.parent] - Parent branch
   * @param {Object} [config.hypothesis] - Hypothesis being explored
   * @param {Object} [config.snapshot] - Fact store snapshot
   * @param {number} [config.depth] - Branch depth
   * @param {number} [config.score] - Branch score
   */
  constructor(config) {
    this.id = config.id;
    this.parent = config.parent ?? null;
    this.hypothesis = config.hypothesis ?? null;
    this.snapshot = config.snapshot ?? null;
    this.depth = config.depth ?? 0;
    this.score = config.score ?? 1.0;
    this.createdAt = Date.now();
    this.derivedFacts = [];
    this.pruned = false;
    this.merged = false;
    this.conflicts = [];
  }

  /**
   * Check if this is the root branch
   * @returns {boolean}
   */
  isRoot() {
    return this.parent === null;
  }

  /**
   * Get all derived facts in this branch
   * @returns {Array}
   */
  getDerivedFacts() {
    return [...this.derivedFacts];
  }

  /**
   * Add a derived fact
   * @param {Object} fact
   */
  addDerivedFact(fact) {
    this.derivedFacts.push(fact);
  }

  /**
   * Mark branch as pruned
   */
  markPruned() {
    this.pruned = true;
  }

  /**
   * Mark branch as merged
   */
  markMerged() {
    this.merged = true;
  }

  /**
   * Add conflict detected in this branch
   * @param {Object} conflict
   */
  addConflict(conflict) {
    this.conflicts.push(conflict);
  }

  /**
   * Check if branch is active (not pruned/merged)
   * @returns {boolean}
   */
  isActive() {
    return !this.pruned && !this.merged;
  }

  /**
   * Get ancestors (parent chain)
   * @returns {Branch[]}
   */
  getAncestors() {
    const ancestors = [];
    let current = this.parent;
    while (current) {
      ancestors.push(current);
      current = current.parent;
    }
    return ancestors;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      parentId: this.parent?.id ?? null,
      hypothesis: this.hypothesis,
      depth: this.depth,
      score: this.score,
      derivedFactCount: this.derivedFacts.length,
      conflictCount: this.conflicts.length,
      pruned: this.pruned,
      merged: this.merged,
      createdAt: this.createdAt
    };
  }
}

/**
 * Merge result for combining branches
 */
export class MergeResult {
  constructor(config = {}) {
    this.facts = config.facts ?? [];
    this.conflicts = config.conflicts ?? [];
    this.mergedBranches = config.mergedBranches ?? [];
    this.keptFacts = config.keptFacts ?? [];
    this.discardedFacts = config.discardedFacts ?? [];
  }

  /**
   * Check if merge had conflicts
   */
  hasConflicts() {
    return this.conflicts.length > 0;
  }
}

/**
 * Branch Manager - manages parallel reasoning branches
 */
export class BranchManager {
  /**
   * @param {number} [maxBranches=5] - Maximum number of active branches
   * @param {Object} [options]
   */
  constructor(maxBranches = 5, options = {}) {
    this.maxBranches = maxBranches;
    this.options = {
      pruneThreshold: DEFAULT_PRUNE_THRESHOLD,
      minKeptBranches: 2,
      ...options
    };
    this.branches = new Map();
    this.rootBranch = null;
    this._nextId = 1;
  }

  /**
   * Generate unique branch ID
   * @private
   */
  _generateId() {
    return `branch_${this._nextId++}`;
  }

  /**
   * Create root branch
   * @returns {Branch}
   */
  createRoot() {
    const id = this._generateId();
    const branch = new Branch({
      id,
      parent: null,
      depth: 0,
      score: 1.0
    });
    this.rootBranch = branch;
    this.branches.set(id, branch);
    return branch;
  }

  /**
   * Create a new branch from a parent
   * Per DS008 create_branch algorithm
   * @param {Branch} parent - Parent branch
   * @param {Object} hypothesis - Hypothesis being explored
   * @param {Budget} budget - Budget tracker
   * @returns {Branch|null} - New branch or null if budget exhausted
   */
  createBranch(parent, hypothesis, budget) {
    // Check branch budget
    if (budget.used.branches >= budget.limits.maxBranches) {
      return null;
    }

    // Check if we've hit our internal limit
    const activeBranches = this.getActiveBranches();
    if (activeBranches.length >= this.maxBranches) {
      // Try to prune first
      this.pruneBranches(activeBranches, budget);
      if (this.getActiveBranches().length >= this.maxBranches) {
        return null;
      }
    }

    // Create new branch
    const id = this._generateId();
    const branch = new Branch({
      id,
      parent,
      hypothesis,
      snapshot: parent.snapshot ? this._copySnapshot(parent.snapshot) : null,
      depth: parent.depth + 1,
      score: hypothesis?.score ?? parent.score
    });

    // Consume branch budget
    try {
      budget.consumeBranch();
    } catch (e) {
      return null;
    }

    this.branches.set(id, branch);
    return branch;
  }

  /**
   * Copy a snapshot (shallow copy for efficiency)
   * @private
   */
  _copySnapshot(snapshot) {
    if (!snapshot) return null;
    if (typeof snapshot.copy === 'function') {
      return snapshot.copy();
    }
    if (snapshot instanceof Map) {
      return new Map(snapshot);
    }
    return { ...snapshot };
  }

  /**
   * Get all active (non-pruned, non-merged) branches
   * @returns {Branch[]}
   */
  getActiveBranches() {
    return [...this.branches.values()].filter(b => b.isActive());
  }

  /**
   * Get all branches
   * @returns {Branch[]}
   */
  getAllBranches() {
    return [...this.branches.values()];
  }

  /**
   * Get branch by ID
   * @param {string} id
   * @returns {Branch|undefined}
   */
  getBranch(id) {
    return this.branches.get(id);
  }

  /**
   * Merge multiple branches
   * Per DS008 merge_branches algorithm
   * @param {Branch[]} branches - Branches to merge
   * @param {Object} store - Fact store
   * @param {Object} [conflictResolver] - Conflict resolution strategy
   * @returns {MergeResult}
   */
  mergeBranches(branches, store, conflictResolver = null) {
    if (branches.length === 0) {
      return new MergeResult();
    }

    if (branches.length === 1) {
      const branch = branches[0];
      branch.markMerged();
      return new MergeResult({
        facts: branch.getDerivedFacts(),
        mergedBranches: [branch]
      });
    }

    // Collect all facts from all branches
    const allFacts = new Map(); // factId -> [{ branch, fact }]
    
    for (const branch of branches) {
      for (const fact of branch.getDerivedFacts()) {
        const factId = fact.factId;
        if (!allFacts.has(factId)) {
          allFacts.set(factId, []);
        }
        allFacts.get(factId).push({ branch, fact });
      }
    }

    // Identify conflicts and resolve
    const conflicts = [];
    const resolvedFacts = [];
    const discardedFacts = [];

    for (const [factId, instances] of allFacts) {
      if (instances.length === 1) {
        // No conflict, accept
        resolvedFacts.push(instances[0].fact);
      } else {
        // Multiple branches derived same fact - check for polarity conflicts
        const polarities = new Set(instances.map(i => i.fact.polarity ?? 'assert'));
        
        if (polarities.size === 1) {
          // Same polarity - just take one
          resolvedFacts.push(instances[0].fact);
        } else {
          // Different polarities - conflict
          const conflict = {
            type: 'branch',
            factIds: instances.map(i => i.fact.factId),
            branches: instances.map(i => i.branch.id),
            reason: 'branch_polarity_conflict'
          };

          if (conflictResolver) {
            const resolution = conflictResolver.resolve(conflict, instances);
            if (resolution.resolved) {
              resolvedFacts.push(...resolution.keep);
              discardedFacts.push(...resolution.discard);
              conflict.resolution = resolution;
            }
          }

          conflicts.push(conflict);
        }
      }
    }

    // Mark branches as merged
    for (const branch of branches) {
      branch.markMerged();
    }

    return new MergeResult({
      facts: resolvedFacts,
      conflicts,
      mergedBranches: branches,
      keptFacts: resolvedFacts,
      discardedFacts
    });
  }

  /**
   * Prune low-scoring branches
   * Per DS008 prune_branches algorithm
   * @param {Branch[]} branches - Branches to consider
   * @param {Budget} budget - Budget tracker
   * @returns {Branch[]} - Remaining active branches
   */
  pruneBranches(branches, budget) {
    if (branches.length <= 1) {
      return branches;
    }

    // Sort by score (descending)
    const sorted = [...branches].sort((a, b) => b.score - a.score);
    const bestScore = sorted[0].score;

    // Compute threshold
    const threshold = bestScore * this.options.pruneThreshold;

    const kept = [];
    
    for (const branch of sorted) {
      if (branch.score >= threshold) {
        kept.push(branch);
      } else if (kept.length < this.options.minKeptBranches) {
        // Keep minimum number of branches for diversity
        kept.push(branch);
      } else {
        // Prune this branch
        branch.markPruned();
        // Note: We don't release branch budget as per spec
      }
    }

    return kept;
  }

  /**
   * Update branch score
   * @param {Branch} branch
   * @param {number} newScore
   */
  updateScore(branch, newScore) {
    branch.score = newScore;
  }

  /**
   * Get best scoring active branch
   * @returns {Branch|null}
   */
  getBestBranch() {
    const active = this.getActiveBranches();
    if (active.length === 0) return null;
    
    return active.reduce((best, b) => b.score > best.score ? b : best, active[0]);
  }

  /**
   * Get total derived facts across all active branches
   * @returns {number}
   */
  getTotalDerivedFacts() {
    return this.getActiveBranches()
      .reduce((sum, b) => sum + b.derivedFacts.length, 0);
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    const all = this.getAllBranches();
    const active = this.getActiveBranches();
    
    return {
      totalBranches: all.length,
      activeBranches: active.length,
      prunedBranches: all.filter(b => b.pruned).length,
      mergedBranches: all.filter(b => b.merged).length,
      maxDepth: Math.max(0, ...all.map(b => b.depth)),
      totalDerivedFacts: this.getTotalDerivedFacts(),
      totalConflicts: all.reduce((sum, b) => sum + b.conflicts.length, 0)
    };
  }

  /**
   * Reset manager
   */
  reset() {
    this.branches.clear();
    this.rootBranch = null;
    this._nextId = 1;
  }
}

/**
 * Simple conflict resolver
 */
export class SimpleConflictResolver {
  /**
   * Resolve conflict by preferring higher confidence
   * @param {Object} conflict
   * @param {Array} instances - [{branch, fact}, ...]
   * @returns {Object} - {resolved, keep, discard}
   */
  resolve(conflict, instances) {
    if (instances.length === 0) {
      return { resolved: false, keep: [], discard: [] };
    }

    // Sort by confidence (descending)
    const sorted = [...instances].sort((a, b) => {
      const confA = a.fact.confidence ?? 1.0;
      const confB = b.fact.confidence ?? 1.0;
      return confB - confA;
    });

    return {
      resolved: true,
      keep: [sorted[0].fact],
      discard: sorted.slice(1).map(i => i.fact)
    };
  }
}

/**
 * Create a branch manager
 * @param {number} [maxBranches]
 * @param {Object} [options]
 * @returns {BranchManager}
 */
export function createBranchManager(maxBranches = 5, options = {}) {
  return new BranchManager(maxBranches, options);
}

/**
 * Create a branch
 * @param {Object} config
 * @returns {Branch}
 */
export function createBranch(config) {
  return new Branch(config);
}

export default {
  BranchManager,
  Branch,
  MergeResult,
  SimpleConflictResolver,
  createBranchManager,
  createBranch,
  DEFAULT_PRUNE_THRESHOLD
};
