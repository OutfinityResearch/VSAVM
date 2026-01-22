/**
 * Conflict Detection
 * Per DS004/DS008: Detect direct, indirect, and temporal conflicts
 */

import { timeOverlaps } from '../../core/types/terms.mjs';
import { scopeContains, scopeIdToString } from '../../core/types/identifiers.mjs';
import { Polarity } from '../../core/types/facts.mjs';
import { computeHash } from '../../core/hash.mjs';

/**
 * Conflict types
 */
export const ConflictType = {
  DIRECT: 'direct',
  INDIRECT: 'indirect',
  TEMPORAL: 'temporal',
  BRANCH: 'branch'
};

/**
 * Conflict report structure
 */
export class Conflict {
  /**
   * @param {Object} config
   * @param {string} config.type - Conflict type
   * @param {string[]} config.factIds - Conflicting fact IDs
   * @param {Object} [config.scopeId] - Scope where conflict occurs
   * @param {string} [config.reason] - Conflict reason
   * @param {Object} [config.resolution] - Resolution if resolved
   */
  constructor(config) {
    this.conflictId = config.conflictId ?? this._generateId(config);
    this.type = config.type;
    this.factIds = config.factIds ?? [];
    this.scopeId = config.scopeId ?? null;
    this.reason = config.reason ?? '';
    this.resolution = config.resolution ?? null;
    this.detectedAt = config.detectedAt ?? 0;
  }

  _generateId(config) {
    const type = config.type ?? 'direct';
    const facts = [...(config.factIds ?? [])].sort();
    const scope = config.scopeId ? scopeIdToString(config.scopeId) : 'global';
    const signature = `${type}|${scope}|${facts.join('|')}`;
    return `conflict_${computeHash(signature)}`;
  }

  /**
   * Check if conflict is resolved
   */
  isResolved() {
    return this.resolution !== null;
  }

  /**
   * Set resolution
   */
  resolve(resolution) {
    this.resolution = {
      ...resolution,
      resolvedAt: resolution?.resolvedAt ?? 0
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      conflictId: this.conflictId,
      type: this.type,
      factIds: this.factIds,
      scopeId: this.scopeId,
      reason: this.reason,
      resolution: this.resolution,
      detectedAt: this.detectedAt
    };
  }
}


/**
 * Conflict Detector - detects various types of conflicts
 */
export class ConflictDetector {
  /**
   * @param {Object} [options]
   * @param {string} [options.timeOverlapPolicy='strict'] - Time overlap policy
   */
  constructor(options = {}) {
    this.options = {
      timeOverlapPolicy: 'strict',
      ...options
    };
  }

  /**
   * Find all conflicts for a new fact against existing facts
   * Per DS008 find_conflicts algorithm
   * @param {Object} newFact - New fact to check
   * @param {Map|Array} existingFacts - Existing facts (Map<factId, fact> or Array)
   * @returns {Conflict[]}
   */
  findConflicts(newFact, existingFacts) {
    const conflicts = [];
    const facts = existingFacts instanceof Map 
      ? [...existingFacts.values()] 
      : existingFacts;

    // 1. Direct polarity conflicts
    const directConflicts = this.findDirectConflicts(newFact, facts);
    conflicts.push(...directConflicts);

    // 2. Temporal conflicts
    if (newFact.time) {
      const temporalConflicts = this.findTemporalConflicts(newFact, facts);
      conflicts.push(...temporalConflicts);
    }

    // 3. Indirect conflicts (through rule implications)
    // Note: Indirect conflicts require rule knowledge, handled separately

    return conflicts;
  }

  /**
   * Find direct polarity conflicts
   * Per DS008 find_direct_conflicts
   * @param {Object} fact - Fact to check
   * @param {Array} facts - Existing facts
   * @returns {Conflict[]}
   */
  findDirectConflicts(fact, facts) {
    const conflicts = [];

    for (const existing of facts) {
      // Skip self-comparison
      if (fact === existing) continue;

      // Check for same factId with opposite polarity
      if (this._sameFactId(fact, existing) && this._oppositePolarity(fact, existing)) {
        // Check scope visibility
        if (this._scopesOverlap(fact.scopeId, existing.scopeId)) {
          // Check time overlap
          if (timeOverlaps(fact.time, existing.time, this.options.timeOverlapPolicy)) {
            conflicts.push(new Conflict({
              type: ConflictType.DIRECT,
              factIds: [fact.factId, existing.factId],
              scopeId: this._commonScope(fact.scopeId, existing.scopeId),
              reason: 'same_fact_opposite_polarity'
            }));
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find temporal conflicts
   * @param {Object} fact - Fact to check
   * @param {Array} facts - Existing facts
   * @returns {Conflict[]}
   */
  findTemporalConflicts(fact, facts) {
    const conflicts = [];

    for (const existing of facts) {
      if (fact === existing) continue;

      // Same predicate and arguments but different assertion at overlapping times
      if (this._samePredicate(fact, existing) && 
          this._sameArguments(fact, existing) &&
          !this._samePolarity(fact, existing)) {
        
        if (timeOverlaps(fact.time, existing.time, this.options.timeOverlapPolicy)) {
          if (this._scopesOverlap(fact.scopeId, existing.scopeId)) {
            conflicts.push(new Conflict({
              type: ConflictType.TEMPORAL,
              factIds: [fact.factId, existing.factId],
              scopeId: this._commonScope(fact.scopeId, existing.scopeId),
              reason: 'temporal_overlap_different_polarity'
            }));
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if a fact set is consistent (no conflicts)
   * @param {Array} facts - Facts to check
   * @returns {{consistent: boolean, conflicts: Conflict[]}}
   */
  checkConsistency(facts) {
    const allConflicts = [];

    for (let i = 0; i < facts.length; i++) {
      const conflicts = this.findConflicts(facts[i], facts.slice(i + 1));
      allConflicts.push(...conflicts);
    }

    return {
      consistent: allConflicts.length === 0,
      conflicts: allConflicts
    };
  }

  /**
   * Group conflicts by scope
   * @param {Conflict[]} conflicts
   * @returns {Map<string, Conflict[]>}
   */
  groupByScope(conflicts) {
    const grouped = new Map();

    for (const conflict of conflicts) {
      const scopeKey = conflict.scopeId 
        ? scopeIdToString(conflict.scopeId) 
        : 'global';
      
      if (!grouped.has(scopeKey)) {
        grouped.set(scopeKey, []);
      }
      grouped.get(scopeKey).push(conflict);
    }

    return grouped;
  }

  /**
   * Check if two factIds are the same
   * @private
   */
  _sameFactId(a, b) {
    return a.factId === b.factId;
  }

  /**
   * Check if facts have opposite polarity
   * @private
   */
  _oppositePolarity(a, b) {
    const polA = a.polarity ?? Polarity.ASSERT;
    const polB = b.polarity ?? Polarity.ASSERT;
    return (polA === Polarity.ASSERT && polB === Polarity.DENY) ||
           (polA === Polarity.DENY && polB === Polarity.ASSERT);
  }

  /**
   * Check if facts have same polarity
   * @private
   */
  _samePolarity(a, b) {
    const polA = a.polarity ?? Polarity.ASSERT;
    const polB = b.polarity ?? Polarity.ASSERT;
    return polA === polB;
  }

  /**
   * Check if facts have same predicate
   * @private
   */
  _samePredicate(a, b) {
    const predA = this._predicateToString(a.predicate);
    const predB = this._predicateToString(b.predicate);
    return predA === predB;
  }

  /**
   * Check if facts have same arguments
   * @private
   */
  _sameArguments(a, b) {
    const argsA = this._argumentsToString(a.arguments);
    const argsB = this._argumentsToString(b.arguments);
    return argsA === argsB;
  }

  /**
   * Check if scopes overlap (visible to each other)
   * @private
   */
  _scopesOverlap(scope1, scope2) {
    if (!scope1 || !scope2) return true;
    return scopeContains(scope1, scope2) || scopeContains(scope2, scope1);
  }

  /**
   * Get common scope between two scopes
   * @private
   */
  _commonScope(scope1, scope2) {
    if (!scope1) return scope2;
    if (!scope2) return scope1;
    
    // Return the more specific (longer path) scope
    const path1 = scope1.path ?? [];
    const path2 = scope2.path ?? [];
    return path1.length >= path2.length ? scope1 : scope2;
  }

  /**
   * Predicate to string
   * @private
   */
  _predicateToString(pred) {
    if (typeof pred === 'string') return pred;
    if (pred?.namespace && pred?.name) {
      return `${pred.namespace}:${pred.name}`;
    }
    return JSON.stringify(pred);
  }

  /**
   * Arguments to string (for comparison)
   * @private
   */
  _argumentsToString(args) {
    if (!args) return '';
    if (args instanceof Map) {
      const entries = [...args.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      return JSON.stringify(entries);
    }
    const entries = Object.entries(args).sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(entries);
  }
}

/**
 * Create a conflict detector
 * @param {Object} [options]
 * @returns {ConflictDetector}
 */
export function createConflictDetector(options = {}) {
  return new ConflictDetector(options);
}

/**
 * Create a conflict
 * @param {Object} config
 * @returns {Conflict}
 */
export function createConflict(config) {
  return new Conflict(config);
}

export default {
  ConflictDetector,
  Conflict,
  ConflictType,
  createConflictDetector,
  createConflict
};
