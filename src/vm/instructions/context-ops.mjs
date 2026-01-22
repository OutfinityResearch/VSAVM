/**
 * Context operations for VM
 * Per DS006: PUSH_CONTEXT, POP_CONTEXT, MERGE_CONTEXT, ISOLATE_CONTEXT
 */

import { ExecutionError, ErrorCode } from '../../core/errors.mjs';
import { createScopeId } from '../../core/types/identifiers.mjs';

/**
 * PUSH_CONTEXT: Enter a new reasoning context
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} New context info
 */
export function pushContext(vmState, args) {
  vmState.budget.consumeSteps('PUSH_CONTEXT');
  
  const { name, isolated, scopeId } = args;
  
  let ctx;
  if (scopeId) {
    const resolved = typeof scopeId === 'string' || Array.isArray(scopeId)
      ? createScopeId(scopeId)
      : scopeId;
    ctx = vmState.contextStack.pushWithScope(resolved, Boolean(isolated));
  } else if (isolated) {
    ctx = vmState.contextStack.pushIsolated(name);
  } else {
    ctx = vmState.contextStack.push(name);
  }

  vmState.log.logContextPush(ctx.id, ctx.isolated);
  
  return {
    contextId: ctx.id,
    depth: vmState.contextStack.depth,
    isolated: ctx.isolated
  };
}

/**
 * POP_CONTEXT: Exit current reasoning context
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Popped context info
 */
export function popContext(vmState, args) {
  vmState.budget.consumeSteps('POP_CONTEXT');
  
  const { discard } = args;
  
  if (vmState.contextStack.depth <= 1) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'Cannot pop root context',
      {}
    );
  }
  
  const ctx = vmState.contextStack.pop();
  vmState.log.logContextPop(ctx.id);
  
  return {
    contextId: ctx.id,
    localFacts: ctx.localCount,
    discarded: discard ?? false
  };
}

/**
 * MERGE_CONTEXT: Merge current context into parent
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Merge result
 */
export function mergeContext(vmState, args) {
  vmState.budget.consumeSteps('MERGE_CONTEXT');
  
  if (vmState.contextStack.depth <= 1) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'Cannot merge root context',
      {}
    );
  }
  
  const current = vmState.contextStack.current;
  const parent = vmState.contextStack.stack[vmState.contextStack.depth - 2];
  
  const result = vmState.contextStack.merge(current, parent);
  
  // Log conflicts
  for (const conflict of result.conflicts) {
    vmState.log.logConflict('merge', [conflict.child.factId, conflict.parent.factId]);
  }
  
  // Pop the merged context
  vmState.contextStack.pop();
  vmState.log.logContextPop(current.id);
  
  return {
    contextId: current.id,
    merged: result.merged,
    conflicts: result.conflicts
  };
}

/**
 * ISOLATE_CONTEXT: Mark current context as isolated
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Context info
 */
export function isolateContext(vmState, args) {
  vmState.budget.consumeSteps('ISOLATE_CONTEXT');
  
  const current = vmState.contextStack.current;
  current.isolated = true;
  
  return {
    contextId: current.id,
    isolated: true
  };
}

/**
 * Context operations registry
 */
export const contextOps = {
  PUSH_CONTEXT: pushContext,
  POP_CONTEXT: popContext,
  MERGE_CONTEXT: mergeContext,
  ISOLATE_CONTEXT: isolateContext
};
