/**
 * VM Fact Store wrapper
 * Per DS006: Wraps storage strategy with context awareness
 */

import { factsConflict } from '../../core/types/facts.mjs';
import { timeOverlaps, isAtom, isStruct, termsEqual } from '../../core/types/terms.mjs';
import { scopeContains, symbolIdToString } from '../../core/types/identifiers.mjs';
import { detectStructuralSeparators, createStructuralScopeId } from '../../event-stream/separator-detector.mjs';

/**
 * Fact store with context awareness and conflict detection
 */
export class FactStore {
  /**
   * @param {Object} storage - StorageStrategy implementation
   * @param {Object} contextStack - ContextStack instance
   */
  constructor(storage, contextStack) {
    this.storage = storage;
    this.contextStack = contextStack;
  }

  /**
   * Assert a fact (add to context and optionally storage)
   * @param {Object} fact
   * @returns {Promise<{conflicts: Object[]}>}
   */
  async assertFact(fact) {
    // Check for conflicts
    const conflicts = await this.findConflicts(fact);
    
    // Add to current context
    this.contextStack.addFact(fact);
    
    // Only persist to storage if not in isolated context
    const current = this.contextStack.current;
    if (!current.isolated) {
      await this.storage.assertFact(fact);
    }
    
    return { conflicts };
  }

  /**
   * Deny a fact (remove from context)
   * @param {string} factId
   * @returns {Promise<boolean>}
   */
  async denyFact(factId) {
    const existing = this.contextStack.getFact(factId);
    if (!existing) return false;
    
    this.contextStack.denyFact(factId);
    await this.storage.denyFact(factId, this.contextStack.current.scopeId);
    
    return true;
  }

  /**
   * Get a fact by ID
   * @param {string} factId
   * @returns {Promise<Object|null>}
   */
  async getFact(factId) {
    // First check context (includes denials)
    const contextFact = this.contextStack.getFact(factId);
    if (contextFact !== undefined) return contextFact;
    
    // Fall back to storage
    return this.storage.getFact(factId);
  }

  /**
   * Query facts matching pattern within specific scope
   * @param {Object} pattern
   * @param {Object} scopeFilter - Optional scope to filter by
   * @returns {Promise<Object[]>}
   */
  async query(pattern, scopeFilter = null) {
    const results = new Map();
    
    // If in isolated context, only check context facts
    const current = this.contextStack.current;
    if (current.isolated) {
      const contextFacts = this.contextStack.getAllFacts();
      for (const [factId, fact] of contextFacts) {
        if (this.matchesPattern(fact, pattern) && this.matchesScope(fact, scopeFilter)) {
          results.set(factId, fact);
        }
      }
    } else {
      // Normal mode: check storage + context
      const storageFacts = await this.storage.query(pattern);
      
      // Add storage facts (if not denied and scope matches)
      for (const fact of storageFacts) {
        if (this.contextStack.getFact(fact.factId) !== null && this.matchesScope(fact, scopeFilter)) {
          results.set(fact.factId, fact);
        }
      }
      
      // Add context facts (override storage)
      const contextFacts = this.contextStack.getAllFacts();
      for (const [factId, fact] of contextFacts) {
        if (this.matchesPattern(fact, pattern) && this.matchesScope(fact, scopeFilter)) {
          results.set(factId, fact);
        }
      }
    }
    
    return [...results.values()];
  }

  /**
   * Check if fact matches scope filter
   * @private
   */
  matchesScope(fact, scopeFilter) {
    if (!scopeFilter) return true;
    
    const factScope = fact.scopeId;
    if (!factScope || !factScope.path) return false;
    
    // Exact scope match
    if (scopeFilter.path && Array.isArray(scopeFilter.path)) {
      return JSON.stringify(factScope.path) === JSON.stringify(scopeFilter.path);
    }
    
    return true;
  }

  /**
   * Query by predicate
   * @param {string|Object} predicate
   * @returns {Promise<Object[]>}
   */
  async queryByPredicate(predicate) {
    const predStr = typeof predicate === 'string' 
      ? predicate 
      : symbolIdToString(predicate);
    
    return this.query({ predicate: predStr });
  }

  /**
   * Find conflicts with a fact
   * @param {Object} fact
   * @returns {Promise<Object[]>}
   */
  async findConflicts(fact) {
    const conflicts = [];
    
    // Check storage
    const storageConflicts = await this.storage.findConflicting(fact);
    for (const existing of storageConflicts) {
      if (this.isConflict(fact, existing)) {
        conflicts.push(existing);
      }
    }
    
    // Check context
    const contextFacts = this.contextStack.getAllFacts();
    for (const [, existing] of contextFacts) {
      if (this.isConflict(fact, existing)) {
        // Avoid duplicates
        if (!conflicts.some(c => c.factId === existing.factId)) {
          conflicts.push(existing);
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Check if two facts conflict
   * @param {Object} factA
   * @param {Object} factB
   * @returns {boolean}
   */
  isConflict(factA, factB) {
    // Same fact ID with opposite polarity
    if (!factsConflict(factA, factB)) return false;
    
    // Check temporal overlap
    if (!timeOverlaps(factA.time, factB.time)) return false;
    
    // Check scope overlap
    if (!scopeContains(factA.scopeId, factB.scopeId) && 
        !scopeContains(factB.scopeId, factA.scopeId)) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if fact matches pattern
   * @param {Object} fact
   * @param {Object} pattern
   * @returns {boolean}
   */
  matchesPattern(fact, pattern) {
    if (pattern.predicate) {
      const factPred = symbolIdToString(fact.predicate);
      const patternPred = typeof pattern.predicate === 'string' 
        ? pattern.predicate 
        : symbolIdToString(pattern.predicate);
      if (factPred !== patternPred) return false;
    }
    
    if (pattern.polarity && fact.polarity !== pattern.polarity) {
      return false;
    }
    
    if (pattern.scopeId && !scopeContains(pattern.scopeId, fact.scopeId)) {
      return false;
    }

    // Match arguments (if provided)
    if (pattern.arguments) {
      const entries = pattern.arguments instanceof Map
        ? [...pattern.arguments.entries()]
        : Object.entries(pattern.arguments);

      for (const [slot, value] of entries) {
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
   * Get count of facts
   * @returns {Promise<number>}
   */
  async count() {
    return this.storage.count();
  }

  /**
   * Create snapshot
   * @returns {Promise<string>}
   */
  async createSnapshot() {
    return this.storage.createSnapshot();
  }

  /**
   * Restore from snapshot
   * @param {string} snapshotId
   */
  async restoreSnapshot(snapshotId) {
    await this.storage.restoreSnapshot(snapshotId);
  }
}
