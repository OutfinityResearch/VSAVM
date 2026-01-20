/**
 * Term operations for VM
 * Per DS006: MAKE_TERM, CANONICALIZE, BIND_SLOTS
 */

import { 
  createStruct, 
  stringAtom, 
  numberAtom, 
  booleanAtom,
  entityAtom,
  symbolAtom,
  isAtom,
  isStruct,
  termToString,
  termsEqual
} from '../../core/types/terms.mjs';
import { 
  createSymbolId, 
  parseSymbolId,
  createEntityId,
  parseEntityId
} from '../../core/types/identifiers.mjs';
import { ExecutionError, ErrorCode } from '../../core/errors.mjs';

/**
 * MAKE_TERM: Create a term from components
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Created term
 */
export function makeTerm(vmState, args) {
  vmState.budget.consumeSteps('MAKE_TERM');
  
  const { type, value, predicate, slots } = args;
  
  // Resolve any bindings in args
  const resolveArg = (arg) => {
    if (typeof arg === 'string' && arg.startsWith('$')) {
      const binding = vmState.bindings.get(arg.slice(1));
      if (binding === undefined) {
        throw new ExecutionError(
          ErrorCode.BINDING_NOT_FOUND,
          `Binding not found: ${arg}`,
          { binding: arg }
        );
      }
      return binding;
    }
    return arg;
  };
  
  // Create atom
  if (type) {
    const resolvedValue = resolveArg(value);
    
    switch (type) {
      case 'string':
        return stringAtom(String(resolvedValue));
      case 'number':
        return numberAtom(Number(resolvedValue));
      case 'boolean':
        return booleanAtom(Boolean(resolvedValue));
      case 'entity':
        if (typeof resolvedValue === 'string') {
          return entityAtom(parseEntityId(resolvedValue));
        }
        return entityAtom(resolvedValue);
      case 'symbol':
        if (typeof resolvedValue === 'string') {
          return symbolAtom(parseSymbolId(resolvedValue));
        }
        return symbolAtom(resolvedValue);
      default:
        throw new ExecutionError(
          ErrorCode.INVALID_TERM,
          `Unknown term type: ${type}`,
          { type }
        );
    }
  }
  
  // Create struct
  if (predicate) {
    const pred = typeof predicate === 'string' 
      ? parseSymbolId(predicate) 
      : predicate;
    
    const resolvedSlots = {};
    for (const [slotName, slotValue] of Object.entries(slots || {})) {
      resolvedSlots[slotName] = resolveArg(slotValue);
    }
    
    return createStruct(pred, resolvedSlots);
  }
  
  throw new ExecutionError(
    ErrorCode.INVALID_TERM,
    'MAKE_TERM requires type or predicate',
    { args }
  );
}

/**
 * CANONICALIZE: Normalize a term using canonicalizer strategy
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Canonical term
 */
export function canonicalize(vmState, args) {
  vmState.budget.consumeSteps('CANONICALIZE');
  
  const { term } = args;
  
  // Resolve binding
  const resolvedTerm = typeof term === 'string' && term.startsWith('$')
    ? vmState.bindings.get(term.slice(1))
    : term;
  
  if (!resolvedTerm) {
    throw new ExecutionError(
      ErrorCode.INVALID_TERM,
      'CANONICALIZE: term is null or undefined',
      { term }
    );
  }
  
  // Use canonicalizer if available
  if (vmState.canonicalizer) {
    return vmState.canonicalizer.canonicalize(resolvedTerm);
  }
  
  // Default: return as-is (identity canonicalization)
  return resolvedTerm;
}

/**
 * BIND_SLOTS: Bind values to slots in a term pattern
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Term with slots filled
 */
export function bindSlots(vmState, args) {
  vmState.budget.consumeSteps('BIND_SLOTS');
  
  const { pattern, bindings } = args;
  
  // Resolve pattern
  const resolvedPattern = typeof pattern === 'string' && pattern.startsWith('$')
    ? vmState.bindings.get(pattern.slice(1))
    : pattern;
  
  if (!isStruct(resolvedPattern)) {
    throw new ExecutionError(
      ErrorCode.INVALID_TERM,
      'BIND_SLOTS: pattern must be a struct',
      { pattern }
    );
  }
  
  // Create new slots with bindings applied
  const newSlots = new Map(resolvedPattern.slots);
  
  for (const [slotName, value] of Object.entries(bindings || {})) {
    // Resolve binding reference
    const resolvedValue = typeof value === 'string' && value.startsWith('$')
      ? vmState.bindings.get(value.slice(1))
      : value;
    
    newSlots.set(slotName, resolvedValue);
  }
  
  return {
    structType: resolvedPattern.structType,
    slots: newSlots
  };
}

/**
 * Term operations registry
 */
export const termOps = {
  MAKE_TERM: makeTerm,
  CANONICALIZE: canonicalize,
  BIND_SLOTS: bindSlots
};
