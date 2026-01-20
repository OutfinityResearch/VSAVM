/**
 * Context stack for VM reasoning contexts
 * Per DS006: Manages nested reasoning contexts for isolation and merging
 */

import { createScopeId, scopeIdToString, scopeContains } from '../../core/types/identifiers.mjs';

/**
 * A reasoning context (isolated fact space)
 */
export class Context {
  /**
   * @param {string} id
   * @param {{path: string[]}} scopeId
   * @param {Context} [parent]
   */
  constructor(id, scopeId, parent = null) {
    this.id = id;
    this.scopeId = scopeId;
    this.parent = parent;
    
    // Local facts (not in parent)
    this.localFacts = new Map(); // factId → FactInstance
    
    // Denied facts (shadowing parent)
    this.deniedFacts = new Set(); // factIds
    
    // Metadata
    this.createdAt = Date.now();
    this.isolated = false;
  }

  /**
   * Check if a fact is visible in this context
   * @param {string} factId
   * @returns {boolean}
   */
  hasFact(factId) {
    if (this.deniedFacts.has(factId)) return false;
    if (this.localFacts.has(factId)) return true;
    if (this.parent && !this.isolated) return this.parent.hasFact(factId);
    return false;
  }

  /**
   * Get a fact by ID
   * @param {string} factId
   * @returns {Object|null}
   */
  getFact(factId) {
    if (this.deniedFacts.has(factId)) return null;
    if (this.localFacts.has(factId)) return this.localFacts.get(factId);
    if (this.parent && !this.isolated) return this.parent.getFact(factId);
    return null;
  }

  /**
   * Add a local fact
   * @param {Object} fact
   */
  addFact(fact) {
    this.localFacts.set(fact.factId, fact);
    this.deniedFacts.delete(fact.factId);
  }

  /**
   * Deny a fact (shadow from parent)
   * @param {string} factId
   */
  denyFact(factId) {
    this.localFacts.delete(factId);
    this.deniedFacts.add(factId);
  }

  /**
   * Get all visible facts
   * @returns {Map}
   */
  getAllFacts() {
    const result = new Map();
    
    // Get parent facts first (if not isolated)
    if (this.parent && !this.isolated) {
      for (const [id, fact] of this.parent.getAllFacts()) {
        if (!this.deniedFacts.has(id)) {
          result.set(id, fact);
        }
      }
    }
    
    // Add local facts (override parent)
    for (const [id, fact] of this.localFacts) {
      result.set(id, fact);
    }
    
    return result;
  }

  /**
   * Get count of local facts
   * @returns {number}
   */
  get localCount() {
    return this.localFacts.size;
  }

  /**
   * Create snapshot
   * @returns {Object}
   */
  snapshot() {
    return {
      id: this.id,
      scopeId: this.scopeId,
      localFacts: new Map(this.localFacts),
      deniedFacts: new Set(this.deniedFacts),
      isolated: this.isolated
    };
  }

  /**
   * Restore from snapshot
   * @param {Object} snap
   */
  restore(snap) {
    this.localFacts = new Map(snap.localFacts);
    this.deniedFacts = new Set(snap.deniedFacts);
    this.isolated = snap.isolated;
  }
}

/**
 * Stack of reasoning contexts
 */
export class ContextStack {
  constructor() {
    this.nextId = 1;
    // Root context
    this.root = new Context('ctx_0', createScopeId(['root']));
    this.stack = [this.root];
  }

  /**
   * Get current (top) context
   * @returns {Context}
   */
  get current() {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Get stack depth
   * @returns {number}
   */
  get depth() {
    return this.stack.length;
  }

  /**
   * Push a new context
   * @param {string} [scopeSegment] - Added to current scope path
   * @returns {Context}
   */
  push(scopeSegment) {
    const id = `ctx_${this.nextId++}`;
    const parentScope = this.current.scopeId;
    const newPath = [...parentScope.path];
    if (scopeSegment) {
      newPath.push(scopeSegment);
    }
    
    const ctx = new Context(id, createScopeId(newPath), this.current);
    this.stack.push(ctx);
    return ctx;
  }

  /**
   * Pop current context
   * @returns {Context}
   */
  pop() {
    if (this.stack.length <= 1) {
      throw new Error('Cannot pop root context');
    }
    return this.stack.pop();
  }

  /**
   * Push an isolated context (no parent visibility)
   * @param {string} [scopeSegment]
   * @returns {Context}
   */
  pushIsolated(scopeSegment) {
    const ctx = this.push(scopeSegment);
    ctx.isolated = true;
    return ctx;
  }

  /**
   * Merge a child context into parent
   * @param {Context} child
   * @param {Context} parent
   * @returns {{merged: number, conflicts: Array}}
   */
  merge(child, parent) {
    const conflicts = [];
    let merged = 0;
    
    for (const [factId, fact] of child.localFacts) {
      // Check for conflicts
      const existing = parent.getFact(factId);
      if (existing && existing.polarity !== fact.polarity) {
        conflicts.push({ factId, child: fact, parent: existing });
      } else {
        parent.addFact(fact);
        merged++;
      }
    }
    
    // Propagate denials
    for (const factId of child.deniedFacts) {
      parent.denyFact(factId);
    }
    
    return { merged, conflicts };
  }

  /**
   * Get a fact from current context
   * @param {string} factId
   * @returns {Object|null}
   */
  getFact(factId) {
    return this.current.getFact(factId);
  }

  /**
   * Add a fact to current context
   * @param {Object} fact
   */
  addFact(fact) {
    this.current.addFact(fact);
  }

  /**
   * Deny a fact in current context
   * @param {string} factId
   */
  denyFact(factId) {
    this.current.denyFact(factId);
  }

  /**
   * Get all visible facts from current context
   * @returns {Map}
   */
  getAllFacts() {
    return this.current.getAllFacts();
  }

  /**
   * Create snapshot of entire stack
   * @returns {Object}
   */
  snapshot() {
    return {
      nextId: this.nextId,
      contexts: this.stack.map(ctx => ctx.snapshot())
    };
  }

  /**
   * Restore from snapshot
   * @param {Object} snap
   */
  restore(snap) {
    this.nextId = snap.nextId;
    
    // Rebuild stack
    this.stack = [];
    for (let i = 0; i < snap.contexts.length; i++) {
      const ctxSnap = snap.contexts[i];
      const parent = i > 0 ? this.stack[i - 1] : null;
      const ctx = new Context(ctxSnap.id, ctxSnap.scopeId, parent);
      ctx.restore(ctxSnap);
      this.stack.push(ctx);
    }
    this.root = this.stack[0];
  }

  /**
   * Clear all contexts (reset to root only)
   */
  clear() {
    this.root = new Context('ctx_0', createScopeId(['root']));
    this.stack = [this.root];
    this.nextId = 1;
  }
}
