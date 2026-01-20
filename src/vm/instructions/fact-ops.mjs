/**
 * Fact operations for VM
 * Per DS006: ASSERT, DENY, QUERY
 */

import { 
  createFactInstance, 
  createProvenanceLink,
  Polarity 
} from '../../core/types/facts.mjs';
import { 
  canonicalizeText,
  canonicalizeTerm,
  canonicalizeSymbolId,
  resolveCanonicalizationOptions
} from '../../core/canonicalization/canonicalize.mjs';
import { 
  createScopeId, 
  createSourceId,
  symbolIdToString,
  parseSymbolId
} from '../../core/types/identifiers.mjs';
import { isStruct, termToString } from '../../core/types/terms.mjs';
import { ExecutionError, ErrorCode } from '../../core/errors.mjs';

/**
 * Convert primitive value to appropriate term
 */
function convertToTerm(value) {
  if (typeof value === 'string') {
    return { type: 'string', value };
  }
  if (typeof value === 'number') {
    return { type: 'number', value };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }
  // Already a term
  return value;
}

/**
 * ASSERT: Add a fact to the fact store
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<Object>} The asserted fact
 */
export async function assertFact(vmState, args) {
  vmState.budget.consumeSteps('ASSERT');
  
  const { predicate, arguments: factArgs, time, confidence, qualifiers } = args;
  const canonOpts = resolveCanonicalizationOptions(vmState.canonicalizer?.options);
  
  // Resolve predicate
  const pred = resolvePredicate(vmState, predicate);
  
  // Resolve arguments
  const resolvedArgs = {};
  for (const [slot, value] of Object.entries(factArgs || {})) {
    const resolvedValue = resolveValue(vmState, value);
    // Convert primitive values to atoms
    const termValue = convertToTerm(resolvedValue);
    resolvedArgs[canonicalizeText(slot, canonOpts)] = canonicalizeTerm(termValue, canonOpts);
  }
  
  // Build fact
  const fact = createFactInstance(pred, resolvedArgs, {
    polarity: Polarity.ASSERT,
    scopeId: vmState.contextStack.current.scopeId,
    time: time ? resolveValue(vmState, time) : undefined,
    confidence,
    provenance: [
      createProvenanceLink(
        createSourceId('derived', `vm_${vmState.executionId}`),
        { extractorId: 'vm_assert' }
      )
    ],
    qualifiers,
    canonicalization: canonOpts
  });
  
  // Assert to fact store
  const result = await vmState.factStore.assertFact(fact);
  
  // Log
  vmState.log.logFactAssert(fact);
  
  // Check for conflicts
  if (result.conflicts.length > 0) {
    for (const conflict of result.conflicts) {
      vmState.log.logConflict('direct', [fact.factId, conflict.factId]);
    }
  }
  
  return { fact, conflicts: result.conflicts };
}

/**
 * DENY: Retract a fact
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<boolean>}
 */
export async function denyFact(vmState, args) {
  vmState.budget.consumeSteps('DENY');
  
  const { factId, predicate, arguments: factArgs } = args;
  const canonOpts = resolveCanonicalizationOptions(vmState.canonicalizer?.options);
  
  let targetId = factId;
  
  // If no factId, compute from predicate+args
  if (!targetId && predicate && factArgs) {
    const pred = resolvePredicate(vmState, predicate);
    const resolvedArgs = {};
    for (const [slot, value] of Object.entries(factArgs)) {
      const resolvedValue = resolveValue(vmState, value);
      resolvedArgs[canonicalizeText(slot, canonOpts)] = canonicalizeTerm(resolvedValue, canonOpts);
    }
    
    // Create temporary fact to get ID
    const tempFact = createFactInstance(pred, resolvedArgs, {
      polarity: Polarity.DENY,
      scopeId: vmState.contextStack.current.scopeId,
      provenance: [createProvenanceLink(createSourceId('derived', 'temp'))],
      canonicalization: canonOpts
    });
    targetId = tempFact.factId;
  }
  
  if (!targetId) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'DENY requires factId or predicate+arguments',
      { args }
    );
  }
  
  // Resolve if binding reference
  targetId = resolveValue(vmState, targetId);
  
  const success = await vmState.factStore.denyFact(targetId);
  
  if (success) {
    vmState.log.logFactDeny(targetId);
  }
  
  return success;
}

/**
 * QUERY: Search for facts matching a pattern
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<Object[]>}
 */
export async function queryFacts(vmState, args) {
  const { pattern, predicate, arguments: queryArgs, limit } = args;
  const canonOpts = resolveCanonicalizationOptions(vmState.canonicalizer?.options);
  
  // Build query pattern
  const queryPattern = {};
  
  if (pattern) {
    const resolved = resolveValue(vmState, pattern);
    if (isStruct(resolved)) {
      const canonicalStructType = canonicalizeSymbolId(resolved.structType, canonOpts);
      queryPattern.predicate = symbolIdToString(canonicalStructType);

      const argEntries = [...resolved.slots.entries()].map(([k, v]) => ([
        canonicalizeText(k, canonOpts),
        canonicalizeTerm(v, canonOpts)
      ]));
      queryPattern.arguments = Object.fromEntries(argEntries);
    }
  } else if (predicate) {
    const resolvedPred = typeof predicate === 'string' && predicate.startsWith('$')
      ? resolveValue(vmState, predicate)
      : predicate;

    const parsedPred = typeof resolvedPred === 'string'
      ? parseSymbolId(resolvedPred)
      : resolvedPred;

    queryPattern.predicate = symbolIdToString(canonicalizeSymbolId(parsedPred, canonOpts));
    
    if (queryArgs) {
      queryPattern.arguments = {};
      for (const [slot, value] of Object.entries(queryArgs)) {
        // Skip unbound slots (for pattern matching)
        if (typeof value === 'string' && value.startsWith('?')) continue;

        const resolvedValue = resolveValue(vmState, value);
        queryPattern.arguments[canonicalizeText(slot, canonOpts)] = canonicalizeTerm(resolvedValue, canonOpts);
      }
    }
  }
  
  // Execute query
  const results = await vmState.factStore.query(queryPattern);
  
  // Apply limit
  const limited = limit ? results.slice(0, limit) : results;
  
  // Budget cost scales with results
  vmState.budget.consumeSteps('QUERY', limited.length);
  
  // Log
  vmState.log.logQueryResult(
    queryPattern, 
    limited.length, 
    limited.map(f => f.factId)
  );
  
  return limited;
}

/**
 * Resolve a predicate reference
 */
function resolvePredicate(vmState, predicate) {
  if (typeof predicate === 'string') {
    if (predicate.startsWith('$')) {
      const resolved = vmState.bindings.get(predicate.slice(1));
      if (!resolved) {
        throw new ExecutionError(
          ErrorCode.BINDING_NOT_FOUND,
          `Predicate binding not found: ${predicate}`,
          { predicate }
        );
      }
      return typeof resolved === 'string' ? parseSymbolId(resolved) : resolved;
    }
    return parseSymbolId(predicate);
  }
  return predicate;
}

/**
 * Resolve a value (may be binding reference)
 */
function resolveValue(vmState, value) {
  if (typeof value === 'string' && value.startsWith('$')) {
    const binding = vmState.bindings.get(value.slice(1));
    if (binding === undefined) {
      throw new ExecutionError(
        ErrorCode.BINDING_NOT_FOUND,
        `Binding not found: ${value}`,
        { binding: value }
      );
    }
    return binding;
  }
  return value;
}

/**
 * Fact operations registry
 */
export const factOps = {
  ASSERT: assertFact,
  DENY: denyFact,
  QUERY: queryFacts
};
