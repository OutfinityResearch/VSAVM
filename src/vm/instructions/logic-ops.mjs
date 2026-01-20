/**
 * Logic operations for VM
 * Per DS006: MATCH, APPLY_RULE, CLOSURE
 */

import { termsEqual, isStruct, isAtom, termToString } from '../../core/types/terms.mjs';
import { symbolIdToString } from '../../core/types/identifiers.mjs';
import { ExecutionError, ErrorCode } from '../../core/errors.mjs';

/**
 * MATCH: Unify a pattern with facts, producing bindings
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<Object[]>} Array of binding sets
 */
export async function match(vmState, args) {
  vmState.budget.consumeSteps('MATCH');
  
  const { pattern, facts, mode } = args;
  
  // Resolve pattern
  const resolvedPattern = resolveValue(vmState, pattern);
  
  // Get facts to match against
  let factsToMatch;
  if (facts) {
    factsToMatch = resolveValue(vmState, facts);
    if (!Array.isArray(factsToMatch)) {
      factsToMatch = [factsToMatch];
    }
  } else {
    // Query all facts matching pattern predicate
    const predicate = isStruct(resolvedPattern) 
      ? symbolIdToString(resolvedPattern.structType)
      : null;
    
    if (predicate) {
      factsToMatch = await vmState.factStore.queryByPredicate(predicate);
    } else {
      factsToMatch = [...vmState.contextStack.getAllFacts().values()];
    }
  }
  
  // Perform matching
  const results = [];
  
  for (const fact of factsToMatch) {
    const bindings = unify(resolvedPattern, fact, vmState.bindings);
    if (bindings !== null) {
      results.push({
        fact,
        bindings
      });
      
      // In 'first' mode, return after first match
      if (mode === 'first') break;
    }
  }
  
  vmState.log.logMatchResult(resolvedPattern, results.length > 0, 
    results.length > 0 ? results[0].bindings : null);
  
  return results;
}

/**
 * APPLY_RULE: Apply a rule to derive new facts
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<Object[]>} Derived facts
 */
export async function applyRule(vmState, args) {
  const { rule, bindings: inputBindings } = args;
  
  const resolvedRule = resolveValue(vmState, rule);
  
  if (!resolvedRule.premises || !resolvedRule.conclusion) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'APPLY_RULE: rule must have premises and conclusion',
      { rule: resolvedRule }
    );
  }
  
  // Budget scales with premises
  vmState.budget.consumeSteps('APPLY_RULE', resolvedRule.premises.length);
  
  // Start with input bindings
  const workingBindings = new Map(Object.entries(inputBindings || {}));
  
  // Match each premise
  for (const premise of resolvedRule.premises) {
    // Create temporary state with working bindings
    const tempBindings = vmState.bindings.clone();
    for (const [k, v] of workingBindings) {
      tempBindings.bind(k, v);
    }
    
    const matches = await match(
      { ...vmState, bindings: tempBindings },
      { pattern: premise, mode: 'first' }
    );
    
    if (matches.length === 0) {
      // Premise not satisfied
      return [];
    }
    
    // Merge bindings
    for (const [k, v] of Object.entries(matches[0].bindings)) {
      workingBindings.set(k, v);
    }
  }
  
  // All premises satisfied - derive conclusion
  const derived = [];
  
  // Apply bindings to conclusion
  const conclusion = substituteBindings(resolvedRule.conclusion, workingBindings);
  
  // Assert derived fact
  const { factOps } = await import('./fact-ops.mjs');
  const result = await factOps.ASSERT(vmState, {
    predicate: conclusion.predicate,
    arguments: conclusion.arguments
  });
  
  derived.push(result.fact);
  
  return derived;
}

/**
 * CLOSURE: Run forward chaining to fixed point
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<Object>} Closure result
 */
export async function closure(vmState, args) {
  // Closure uses remaining budget
  vmState.budget.consumeSteps('CLOSURE');
  
  const { rules, maxIterations } = args;
  
  const resolvedRules = resolveValue(vmState, rules) || [];
  const iterations = maxIterations ?? 100;
  
  let totalDerived = 0;
  let iteration = 0;
  let changed = true;
  
  while (changed && iteration < iterations && !vmState.budget.isExhausted()) {
    changed = false;
    iteration++;
    
    for (const rule of resolvedRules) {
      try {
        const derived = await applyRule(vmState, { rule });
        if (derived.length > 0) {
          totalDerived += derived.length;
          changed = true;
        }
      } catch (e) {
        // Rule didn't fire - continue
        if (e.code !== ErrorCode.BINDING_NOT_FOUND) {
          throw e;
        }
      }
      
      if (vmState.budget.isExhausted()) break;
    }
  }
  
  return {
    iterations: iteration,
    derived: totalDerived,
    complete: !changed,
    budgetExhausted: vmState.budget.isExhausted()
  };
}

/**
 * Unify pattern with term, returning bindings or null
 */
function unify(pattern, term, existingBindings) {
  const bindings = {};
  
  if (!unifyHelper(pattern, term, existingBindings, bindings)) {
    return null;
  }
  
  return bindings;
}

/**
 * Recursive unification helper
 */
function unifyHelper(pattern, term, existingBindings, bindings) {
  // Variable pattern (starts with ?)
  if (typeof pattern === 'string' && pattern.startsWith('?')) {
    const varName = pattern.slice(1);
    
    // Check existing binding
    if (existingBindings.has(varName)) {
      return termsEqual(existingBindings.get(varName), term);
    }
    
    // Check new binding
    if (varName in bindings) {
      return termsEqual(bindings[varName], term);
    }
    
    // Create new binding
    bindings[varName] = term;
    return true;
  }
  
  // Binding reference ($)
  if (typeof pattern === 'string' && pattern.startsWith('$')) {
    const resolved = existingBindings.get(pattern.slice(1));
    if (resolved === undefined) return false;
    return termsEqual(resolved, term);
  }
  
  // Atom matching
  if (isAtom(pattern) && isAtom(term)) {
    return termsEqual(pattern, term);
  }
  
  // Struct matching
  if (isStruct(pattern) && isStruct(term)) {
    // Check type
    if (symbolIdToString(pattern.structType) !== symbolIdToString(term.structType)) {
      return false;
    }
    
    // Match slots
    for (const [slot, patternValue] of pattern.slots) {
      const termValue = term.slots.get(slot);
      if (!termValue) return false;
      if (!unifyHelper(patternValue, termValue, existingBindings, bindings)) {
        return false;
      }
    }
    
    return true;
  }
  
  // Fact matching (has arguments map)
  if (pattern.arguments && term.arguments) {
    // Match predicate
    if (pattern.predicate) {
      const patPred = symbolIdToString(pattern.predicate);
      const termPred = symbolIdToString(term.predicate);
      if (patPred !== termPred) return false;
    }
    
    // Match arguments
    for (const [slot, patternValue] of 
         (pattern.arguments instanceof Map ? pattern.arguments : Object.entries(pattern.arguments))) {
      const termValue = term.arguments instanceof Map 
        ? term.arguments.get(slot)
        : term.arguments[slot];
      if (!termValue) return false;
      if (!unifyHelper(patternValue, termValue, existingBindings, bindings)) {
        return false;
      }
    }
    
    return true;
  }
  
  // Direct equality
  return pattern === term;
}

/**
 * Substitute bindings into a template
 */
function substituteBindings(template, bindings) {
  if (typeof template === 'string') {
    if (template.startsWith('?')) {
      const varName = template.slice(1);
      return bindings.get(varName) ?? template;
    }
    if (template.startsWith('$')) {
      const varName = template.slice(1);
      return bindings.get(varName) ?? template;
    }
    return template;
  }
  
  if (isAtom(template)) {
    return template;
  }
  
  if (isStruct(template)) {
    const newSlots = new Map();
    for (const [slot, value] of template.slots) {
      newSlots.set(slot, substituteBindings(value, bindings));
    }
    return { structType: template.structType, slots: newSlots };
  }
  
  if (template.predicate && template.arguments) {
    const newArgs = {};
    const args = template.arguments instanceof Map 
      ? Object.fromEntries(template.arguments)
      : template.arguments;
    for (const [slot, value] of Object.entries(args)) {
      newArgs[slot] = substituteBindings(value, bindings);
    }
    return { predicate: template.predicate, arguments: newArgs };
  }
  
  return template;
}

/**
 * Resolve a value that may be a binding reference
 */
function resolveValue(vmState, value) {
  if (typeof value === 'string' && value.startsWith('$')) {
    return vmState.bindings.get(value.slice(1));
  }
  return value;
}

/**
 * Logic operations registry
 */
export const logicOps = {
  MATCH: match,
  APPLY_RULE: applyRule,
  CLOSURE: closure
};
