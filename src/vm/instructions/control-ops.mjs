/**
 * Control flow operations for VM
 * Per DS006: BRANCH, JUMP, CALL, RETURN
 */

import { ExecutionError, ErrorCode } from '../../core/errors.mjs';

/**
 * BRANCH: Conditional branching
 * @param {Object} vmState
 * @param {Object} args
 * @returns {string|null} Label to jump to, or null to continue
 */
export function branch(vmState, args) {
  // BRANCH doesn't cost steps, but may cost a branch
  const { condition, then: thenLabel, else: elseLabel } = args;
  
  // Evaluate condition
  const condValue = evaluateCondition(vmState, condition);
  
  if (condValue) {
    return thenLabel || null;
  } else {
    return elseLabel || null;
  }
}

/**
 * JUMP: Unconditional jump
 * @param {Object} vmState
 * @param {Object} args
 * @returns {string} Label to jump to
 */
export function jump(vmState, args) {
  const { label } = args;
  
  if (!label) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'JUMP requires label',
      { args }
    );
  }
  
  return label;
}

/**
 * CALL: Call a subroutine/macro
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Call frame info
 */
export function call(vmState, args) {
  vmState.budget.consumeSteps('CALL');
  vmState.budget.pushDepth();
  
  const { target, arguments: callArgs } = args;
  
  // Push new binding scope
  vmState.bindings.pushScope();
  
  // Bind arguments
  if (callArgs) {
    for (const [name, value] of Object.entries(callArgs)) {
      const resolved = resolveValue(vmState, value);
      vmState.bindings.bind(name, resolved);
    }
  }
  
  return {
    target,
    returnAddress: vmState.pc + 1
  };
}

/**
 * RETURN: Return from subroutine
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Object} Return value
 */
export function returnOp(vmState, args) {
  vmState.budget.consumeSteps('RETURN');
  vmState.budget.popDepth();
  
  const { value } = args;
  
  // Resolve return value before popping scope
  const returnValue = value ? resolveValue(vmState, value) : undefined;
  
  // Pop binding scope
  vmState.bindings.popScope();
  
  return { value: returnValue };
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(vmState, condition) {
  if (typeof condition === 'boolean') {
    return condition;
  }
  
  if (typeof condition === 'string') {
    // Binding reference
    if (condition.startsWith('$')) {
      const value = vmState.bindings.get(condition.slice(1));
      return Boolean(value);
    }
    
    // Simple expression parsing
    // Supports: var.length > 0, var == value, !var
    
    if (condition.startsWith('!')) {
      return !evaluateCondition(vmState, condition.slice(1).trim());
    }
    
    // Comparison operators
    const operators = ['>=', '<=', '!=', '==', '>', '<'];
    for (const op of operators) {
      const idx = condition.indexOf(op);
      if (idx !== -1) {
        const left = evaluateExpr(vmState, condition.slice(0, idx).trim());
        const right = evaluateExpr(vmState, condition.slice(idx + op.length).trim());
        
        switch (op) {
          case '==': return left == right;
          case '!=': return left != right;
          case '>': return left > right;
          case '<': return left < right;
          case '>=': return left >= right;
          case '<=': return left <= right;
        }
      }
    }
    
    // Just evaluate as expression
    return Boolean(evaluateExpr(vmState, condition));
  }
  
  return Boolean(condition);
}

/**
 * Evaluate a simple expression
 */
function evaluateExpr(vmState, expr) {
  expr = expr.trim();
  
  // Number
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return parseFloat(expr);
  }
  
  // String literal
  if ((expr.startsWith('"') && expr.endsWith('"')) ||
      (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }
  
  // Boolean
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  
  // Binding reference
  if (expr.startsWith('$')) {
    return vmState.bindings.get(expr.slice(1));
  }
  
  // Property access (e.g., matches.length)
  if (expr.includes('.')) {
    const parts = expr.split('.');
    let value = vmState.bindings.get(parts[0].replace('$', ''));
    
    for (let i = 1; i < parts.length && value !== undefined; i++) {
      if (Array.isArray(value) && parts[i] === 'length') {
        value = value.length;
      } else if (value instanceof Map && value.has(parts[i])) {
        value = value.get(parts[i]);
      } else if (typeof value === 'object' && value !== null) {
        value = value[parts[i]];
      } else {
        value = undefined;
      }
    }
    
    return value;
  }
  
  // Plain identifier - check bindings
  return vmState.bindings.get(expr);
}

/**
 * Resolve value that may be binding reference
 */
function resolveValue(vmState, value) {
  if (typeof value === 'string' && value.startsWith('$')) {
    return vmState.bindings.get(value.slice(1));
  }
  return value;
}

/**
 * Control operations registry
 */
export const controlOps = {
  BRANCH: branch,
  JUMP: jump,
  CALL: call,
  RETURN: returnOp
};
