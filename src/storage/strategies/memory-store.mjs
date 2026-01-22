/**
 * In-Memory Storage Strategy
 * Per DS006: Memory storage backend for testing and small datasets
 */

import { StorageStrategy } from '../../core/interfaces/storage-strategy.mjs';
import { 
  factsHaveSameId, 
  factsConflict,
  Polarity 
} from '../../core/types/facts.mjs';
import { 
  symbolIdToString, 
  scopeIdToString, 
  scopeContains 
} from '../../core/types/identifiers.mjs';
import { timeOverlaps, isAtom, isStruct, termsEqual } from '../../core/types/terms.mjs';

/**
 * In-memory fact storage
 */
export class MemoryStore extends StorageStrategy {
  constructor() {
    super('memory');
    
    // Primary storage: factId → FactInstance
    this.facts = new Map();
    
    // Indices
    this.byPredicate = new Map();  // predicate string → Set<factId>
    this.byScope = new Map();      // scope string → Set<factId>
    
    // Snapshots
    this.snapshots = new Map();
    this.nextSnapshotId = 1;
  }

  async initialize() {
    // No-op for memory store
  }

  async close() {
    this.facts.clear();
    this.byPredicate.clear();
    this.byScope.clear();
    this.snapshots.clear();
  }

  async assertFact(fact) {
    const factId = fact.factId;
    
    // Store fact
    this.facts.set(factId, fact);
    
    // Update predicate index
    const predKey = symbolIdToString(fact.predicate);
    if (!this.byPredicate.has(predKey)) {
      this.byPredicate.set(predKey, new Set());
    }
    this.byPredicate.get(predKey).add(factId);
    
    // Update scope index
    const scopeKey = scopeIdToString(fact.scopeId);
    if (!this.byScope.has(scopeKey)) {
      this.byScope.set(scopeKey, new Set());
    }
    this.byScope.get(scopeKey).add(factId);
  }

  async denyFact(factId, scopeId) {
    const existing = this.facts.get(factId);
    if (!existing) return;
    
    // Check scope containment
    if (!scopeContains(scopeId, existing.scopeId)) {
      return; // Cannot deny from unrelated scope
    }
    
    // Remove from indices
    const predKey = symbolIdToString(existing.predicate);
    this.byPredicate.get(predKey)?.delete(factId);
    
    const scopeKey = scopeIdToString(existing.scopeId);
    this.byScope.get(scopeKey)?.delete(factId);
    
    // Remove fact
    this.facts.delete(factId);
  }

  async getFact(factId) {
    return this.facts.get(factId) || null;
  }

  async query(pattern) {
    const results = [];
    
    // If pattern has scope filter, use scope-based filtering
    if (pattern.scope) {
      for (const fact of this.facts.values()) {
        if (this.matchesPattern(fact, pattern) && this.matchesScope(fact, pattern.scope)) {
          results.push(fact);
        }
      }
      return results;
    }
    
    // Original logic for no scope filter
    for (const fact of this.facts.values()) {
      if (this.matchesPattern(fact, pattern)) {
        results.push(fact);
      }
    }
    
    return results;
  }

  /**
   * Check if fact matches scope
   * @private
   */
  matchesScope(fact, scopeFilter) {
    if (!scopeFilter || !fact.scopeId) return true;
    
    const factScope = fact.scopeId.path;
    const filterScope = scopeFilter.path;
    
    // Exact match
    return JSON.stringify(factScope) === JSON.stringify(filterScope);
  }

  async queryByPredicate(predicate) {
    const predKey = typeof predicate === 'string' 
      ? predicate 
      : symbolIdToString(predicate);
    
    const factIds = this.byPredicate.get(predKey);
    if (!factIds) return [];
    
    return [...factIds].map(id => this.facts.get(id)).filter(Boolean);
  }

  async queryByScope(scopeId) {
    const results = [];
    const targetPath = scopeId.path;
    
    for (const [scopeKey, factIds] of this.byScope) {
      const path = scopeKey.split('/');
      // Check if scope is contained or contains
      if (scopeContains({ path: targetPath }, { path }) || 
          scopeContains({ path }, { path: targetPath })) {
        for (const factId of factIds) {
          const fact = this.facts.get(factId);
          if (fact) results.push(fact);
        }
      }
    }
    
    return results;
  }

  async queryByTimeRange(start, end) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const results = [];
    
    for (const fact of this.facts.values()) {
      if (!fact.time) continue;
      
      const factStart = fact.time.instant ?? fact.time.start ?? -Infinity;
      const factEnd = fact.time.instant ?? fact.time.end ?? Infinity;
      
      if (factStart <= endMs && factEnd >= startMs) {
        results.push(fact);
      }
    }
    
    return results;
  }

  getAllFacts() {
    return [...this.facts.values()];
  }

  async findConflicting(fact) {
    const conflicts = [];
    
    for (const existing of this.facts.values()) {
      if (factsConflict(fact, existing)) {
        // Check temporal overlap
        if (timeOverlaps(fact.time, existing.time)) {
          conflicts.push(existing);
        }
      }
    }
    
    return conflicts;
  }

  async createSnapshot() {
    const snapshotId = `snap_${this.nextSnapshotId++}`;
    
    // Deep clone facts
    const factsClone = new Map();
    for (const [id, fact] of this.facts) {
      factsClone.set(id, this.cloneFact(fact));
    }
    
    // Clone indices
    const byPredicateClone = new Map();
    for (const [k, v] of this.byPredicate) {
      byPredicateClone.set(k, new Set(v));
    }
    
    const byScopeClone = new Map();
    for (const [k, v] of this.byScope) {
      byScopeClone.set(k, new Set(v));
    }
    
    this.snapshots.set(snapshotId, {
      facts: factsClone,
      byPredicate: byPredicateClone,
      byScope: byScopeClone
    });
    
    return snapshotId;
  }

  async restoreSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    this.facts = new Map(snapshot.facts);
    this.byPredicate = new Map();
    for (const [k, v] of snapshot.byPredicate) {
      this.byPredicate.set(k, new Set(v));
    }
    this.byScope = new Map();
    for (const [k, v] of snapshot.byScope) {
      this.byScope.set(k, new Set(v));
    }
  }

  async count() {
    return this.facts.size;
  }

  async clear() {
    this.facts.clear();
    this.byPredicate.clear();
    this.byScope.clear();
  }

  /**
   * Check if a fact matches a query pattern
   * @private
   */
  matchesPattern(fact, pattern) {
    // Match predicate
    if (pattern.predicate) {
      const factPred = symbolIdToString(fact.predicate);
      const patternPred = typeof pattern.predicate === 'string' 
        ? pattern.predicate 
        : symbolIdToString(pattern.predicate);
      if (factPred !== patternPred) return false;
    }
    
    // Match polarity
    if (pattern.polarity && fact.polarity !== pattern.polarity) {
      return false;
    }
    
    // Match scope
    if (pattern.scopeId && !scopeContains(pattern.scopeId, fact.scopeId)) {
      return false;
    }
    
    // Match arguments
    if (pattern.arguments) {
      for (const [slot, value] of Object.entries(pattern.arguments)) {
        if (!fact.arguments.has(slot)) return false;
        const factValue = fact.arguments.get(slot);

        const looksLikeTerm = (v) => isAtom(v) || isStruct(v);
        if (looksLikeTerm(factValue) || looksLikeTerm(value)) {
          if (!termsEqual(factValue, value)) return false;
        } else if (JSON.stringify(factValue) !== JSON.stringify(value)) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Clone a fact instance
   * @private
   */
  cloneFact(fact) {
    return {
      ...fact,
      arguments: new Map(fact.arguments),
      qualifiers: fact.qualifiers ? new Map(fact.qualifiers) : undefined,
      provenance: [...fact.provenance]
    };
  }
}
