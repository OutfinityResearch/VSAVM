/**
 * Forward Chaining Algorithm
 * Per DS004/DS008: Forward chaining rule application with budget control
 * Implements bounded closure computation
 */

import { Budget, createBudget } from '../../vm/budget.mjs';
import { factsConflict } from '../../core/types/facts.mjs';
import { timeOverlaps } from '../../core/types/terms.mjs';
import { scopeContains } from '../../core/types/identifiers.mjs';

/**
 * Forward chain result
 */
export class ForwardChainResult {
  constructor(config = {}) {
    this.facts = config.facts ?? [];
    this.derived = config.derived ?? new Set();
    this.conflicts = config.conflicts ?? [];
    this.trace = config.trace ?? [];
    this.budgetExhausted = config.budgetExhausted ?? false;
    this.iterations = config.iterations ?? 0;
    this.rulesApplied = config.rulesApplied ?? 0;
  }

  /**
   * Get all derived facts
   */
  getDerivedFacts() {
    return [...this.derived];
  }

  /**
   * Check if any conflicts were detected
   */
  hasConflicts() {
    return this.conflicts.length > 0;
  }

  /**
   * Get conflict count
   */
  getConflictCount() {
    return this.conflicts.length;
  }
}

/**
 * Rule representation for forward chaining
 */
export class Rule {
  /**
   * @param {Object} config
   * @param {string} config.ruleId - Unique identifier
   * @param {Array} config.premises - Premise patterns
   * @param {Array} config.conclusions - Conclusion templates
   * @param {number} [config.priority] - Rule priority (higher = first)
   * @param {number} [config.estimatedCost] - Estimated step cost
   */
  constructor(config) {
    this.ruleId = config.ruleId;
    this.premises = config.premises ?? [];
    this.conclusions = config.conclusions ?? [];
    this.priority = config.priority ?? 0;
    this.estimatedCost = config.estimatedCost ?? 5;
    this.specificity = this._computeSpecificity();
  }

  /**
   * Compute rule specificity (more premises = more specific)
   * @private
   */
  _computeSpecificity() {
    return this.premises.length;
  }
}

/**
 * Priority queue for agenda management
 */
class PriorityQueue {
  constructor() {
    this._items = [];
  }

  push(item, priority) {
    this._items.push({ item, priority });
    this._items.sort((a, b) => b.priority - a.priority);
  }

  pop() {
    const entry = this._items.shift();
    return entry?.item ?? null;
  }

  isEmpty() {
    return this._items.length === 0;
  }

  size() {
    return this._items.length;
  }

  all() {
    return this._items.map(e => e.item);
  }
}

/**
 * Forward Chainer - implements forward chaining algorithm
 */
export class ForwardChainer {
  /**
   * @param {Object} [options]
   * @param {string} [options.timeOverlapPolicy='strict'] - Time overlap policy
   * @param {number} [options.conflictCheckInterval=10] - Steps between full conflict scans
   */
  constructor(options = {}) {
    this.options = {
      timeOverlapPolicy: 'strict',
      conflictCheckInterval: 10,
      ...options
    };
  }

  /**
   * Run forward chaining algorithm
   * Per DS008 forward_chain algorithm
   * @param {Array} initialFacts - Initial fact instances
   * @param {Array} rules - List of rules
   * @param {Budget|Object} budget - Budget constraints
   * @returns {ForwardChainResult}
   */
  chain(initialFacts, rules, budget) {
    const budgetObj = budget instanceof Budget 
      ? budget 
      : createBudget(budget);

    // Initialize
    const factStore = new Map();  // factId → fact
    const agenda = new PriorityQueue();
    const derived = new Set();
    const conflicts = [];
    const trace = [];
    let iterations = 0;
    let rulesApplied = 0;

    // Add initial facts to store and agenda
    for (const fact of initialFacts) {
      factStore.set(fact.factId, fact);
      agenda.push(fact, 0);
    }

    // Sort rules by priority
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    // Main loop
    while (!agenda.isEmpty() && budgetObj.hasRemaining()) {
      const currentFact = agenda.pop();
      iterations++;

      try {
        budgetObj.consumeStep(1);
      } catch (e) {
        // Budget exhausted
        break;
      }

      // Find applicable rules
      const applicable = this._findApplicableRules(currentFact, sortedRules, factStore);

      for (const { rule, bindings } of applicable) {
        // Check if we have budget for this rule
        if (budgetObj.remainingSteps() < rule.estimatedCost) {
          continue;
        }

        // Apply rule
        const newFacts = this._applyRule(rule, bindings, factStore);
        
        try {
          budgetObj.consumeStep(rule.estimatedCost);
        } catch (e) {
          break;
        }

        rulesApplied++;

        // Log rule application
        trace.push({
          type: 'rule_applied',
          ruleId: rule.ruleId,
          bindings: this._serializeBindings(bindings),
          newFactCount: newFacts.length,
          timestamp: Date.now()
        });

        for (const newFact of newFacts) {
          // Check for conflicts
          const factConflicts = this._findConflicts(newFact, factStore);

          if (factConflicts.length > 0) {
            conflicts.push(...factConflicts);
            trace.push({
              type: 'conflict_detected',
              factId: newFact.factId,
              conflictCount: factConflicts.length,
              timestamp: Date.now()
            });
            continue;  // Don't add conflicting facts
          }

          // Add to store and agenda if new
          if (!factStore.has(newFact.factId)) {
            factStore.set(newFact.factId, newFact);
            derived.add(newFact);

            const priority = this._computePriority(newFact, rule);
            agenda.push(newFact, priority);
          }
        }
      }

      // Periodic full conflict check
      if (iterations % this.options.conflictCheckInterval === 0) {
        const fullConflicts = this._fullConflictScan(factStore);
        if (fullConflicts.length > 0) {
          conflicts.push(...fullConflicts);
        }
      }
    }

    return new ForwardChainResult({
      facts: [...factStore.values()],
      derived,
      conflicts,
      trace,
      budgetExhausted: !budgetObj.hasRemaining(),
      iterations,
      rulesApplied
    });
  }

  /**
   * Find rules applicable to a fact
   * Per DS008 find_applicable_rules
   * @private
   */
  _findApplicableRules(fact, rules, store) {
    const results = [];

    for (const rule of rules) {
      for (let i = 0; i < rule.premises.length; i++) {
        const premise = rule.premises[i];
        const bindings = this._unify(premise, fact);

        if (bindings !== null) {
          // Check remaining premises
          const remaining = rule.premises.filter((_, idx) => idx !== i);
          const allBindings = this._findAllBindings(remaining, store, bindings);

          for (const bindingSet of allBindings) {
            results.push({ rule, bindings: bindingSet });
          }
        }
      }
    }

    return results;
  }

  /**
   * Unify a pattern with a fact
   * @private
   */
  _unify(pattern, fact) {
    const bindings = new Map();

    // Match predicate
    if (pattern.predicate) {
      const factPred = this._predicateToString(fact.predicate);
      const patternPred = this._predicateToString(pattern.predicate);

      if (patternPred.startsWith('?')) {
        bindings.set(patternPred, fact.predicate);
      } else if (factPred !== patternPred) {
        return null;
      }
    }

    // Match arguments
    if (pattern.arguments) {
      for (const [slot, value] of Object.entries(pattern.arguments)) {
        const factValue = fact.arguments?.get?.(slot) ?? fact.arguments?.[slot];
        
        if (factValue === undefined) {
          return null;
        }

        if (typeof value === 'string' && value.startsWith('?')) {
          bindings.set(value, factValue);
        } else if (!this._valuesEqual(value, factValue)) {
          return null;
        }
      }
    }

    // Match polarity if specified
    if (pattern.polarity && pattern.polarity !== fact.polarity) {
      return null;
    }

    return bindings;
  }

  /**
   * Find all binding combinations for remaining premises
   * @private
   */
  _findAllBindings(premises, store, initialBindings) {
    if (premises.length === 0) {
      return [initialBindings];
    }

    const results = [];
    const [first, ...rest] = premises;

    for (const fact of store.values()) {
      const bindings = this._unifyWithBindings(first, fact, initialBindings);
      if (bindings !== null) {
        const subResults = this._findAllBindings(rest, store, bindings);
        results.push(...subResults);
      }
    }

    return results;
  }

  /**
   * Unify with existing bindings
   * @private
   */
  _unifyWithBindings(pattern, fact, existingBindings) {
    const newBindings = new Map(existingBindings);
    const patternBindings = this._unify(pattern, fact);

    if (patternBindings === null) {
      return null;
    }

    // Merge bindings, checking for conflicts
    for (const [key, value] of patternBindings) {
      if (newBindings.has(key)) {
        if (!this._valuesEqual(newBindings.get(key), value)) {
          return null;  // Binding conflict
        }
      } else {
        newBindings.set(key, value);
      }
    }

    return newBindings;
  }

  /**
   * Apply a rule with bindings to produce new facts
   * @private
   */
  _applyRule(rule, bindings, store) {
    const newFacts = [];

    for (const conclusionTemplate of rule.conclusions) {
      const fact = this._instantiateConclusion(conclusionTemplate, bindings);
      if (fact && !store.has(fact.factId)) {
        newFacts.push(fact);
      }
    }

    return newFacts;
  }

  /**
   * Instantiate a conclusion template with bindings
   * @private
   */
  _instantiateConclusion(template, bindings) {
    const fact = {
      predicate: this._substituteValue(template.predicate, bindings),
      polarity: template.polarity ?? 'assert',
      arguments: new Map(),
      provenance: [{
        sourceId: { type: 'derived', id: 'forward_chain' },
        timestamp: Date.now()
      }]
    };

    // Substitute arguments
    if (template.arguments) {
      for (const [slot, value] of Object.entries(template.arguments)) {
        fact.arguments.set(slot, this._substituteValue(value, bindings));
      }
    }

    // Compute factId
    fact.factId = this._computeFactId(fact);

    return fact;
  }

  /**
   * Substitute variables in a value
   * @private
   */
  _substituteValue(value, bindings) {
    if (typeof value === 'string' && value.startsWith('?')) {
      return bindings.get(value) ?? value;
    }
    if (typeof value === 'object' && value !== null) {
      if (value.type && value.value !== undefined) {
        // Atom
        return {
          ...value,
          value: this._substituteValue(value.value, bindings)
        };
      }
    }
    return value;
  }

  /**
   * Find conflicts for a new fact
   * @private
   */
  _findConflicts(newFact, store) {
    const conflicts = [];

    for (const existing of store.values()) {
      if (this._factsConflict(newFact, existing)) {
        conflicts.push({
          type: 'direct',
          facts: [newFact.factId, existing.factId],
          reason: 'same_fact_opposite_polarity'
        });
      }
    }

    return conflicts;
  }

  /**
   * Check if two facts conflict
   * @private
   */
  _factsConflict(a, b) {
    // Same factId, opposite polarity
    if (a.factId === b.factId && a.polarity !== b.polarity) {
      // Check time overlap
      if (timeOverlaps(a.time, b.time, this.options.timeOverlapPolicy)) {
        // Check scope visibility
        if (this._scopesOverlap(a.scopeId, b.scopeId)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if scopes overlap (are visible to each other)
   * @private
   */
  _scopesOverlap(scope1, scope2) {
    if (!scope1 || !scope2) return true;
    return scopeContains(scope1, scope2) || scopeContains(scope2, scope1);
  }

  /**
   * Full conflict scan of all facts
   * @private
   */
  _fullConflictScan(store) {
    const conflicts = [];
    const facts = [...store.values()];

    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        if (this._factsConflict(facts[i], facts[j])) {
          conflicts.push({
            type: 'direct',
            facts: [facts[i].factId, facts[j].factId],
            reason: 'full_scan_conflict'
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Compute priority for agenda
   * Per DS008 compute_priority
   * @private
   */
  _computePriority(fact, rule) {
    let priority = 0;

    // Prefer facts from more specific rules
    priority += rule.specificity * 0.3;

    // Prefer facts with higher confidence
    priority += (fact.confidence ?? 1.0) * 0.3;

    // Recency bonus
    priority += 0.1;

    return priority;
  }

  /**
   * Helper: predicate to string
   * @private
   */
  _predicateToString(pred) {
    if (typeof pred === 'string') return pred;
    if (pred?.namespace && pred?.name) {
      return `${pred.namespace}:${pred.name}`;
    }
    return String(pred);
  }

  /**
   * Helper: check value equality
   * @private
   */
  _valuesEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  /**
   * Helper: compute fact ID (simplified)
   * @private
   */
  _computeFactId(fact) {
    const content = JSON.stringify({
      predicate: this._predicateToString(fact.predicate),
      arguments: [...(fact.arguments?.entries?.() ?? [])]
    });
    // Simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return `fact_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Helper: serialize bindings for trace
   * @private
   */
  _serializeBindings(bindings) {
    const obj = {};
    for (const [key, value] of bindings) {
      obj[key] = typeof value === 'object' ? JSON.stringify(value) : value;
    }
    return obj;
  }
}

/**
 * Create a forward chainer
 * @param {Object} [options]
 * @returns {ForwardChainer}
 */
export function createForwardChainer(options = {}) {
  return new ForwardChainer(options);
}

/**
 * Create a rule
 * @param {Object} config
 * @returns {Rule}
 */
export function createRule(config) {
  return new Rule(config);
}

export default {
  ForwardChainer,
  ForwardChainResult,
  Rule,
  createForwardChainer,
  createRule
};
