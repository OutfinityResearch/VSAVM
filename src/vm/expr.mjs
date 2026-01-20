/**
 * Minimal expression/condition evaluator for VM control flow and built-ins.
 * This is intentionally limited (no arbitrary code execution).
 */

/**
 * Resolve a value that may be a binding reference (e.g., "$x").
 * @param {Object} vmState
 * @param {*} value
 * @returns {*}
 */
export function resolveValue(vmState, value) {
  if (typeof value === 'string' && value.startsWith('$')) {
    return vmState.bindings.get(value.slice(1));
  }
  return value;
}

/**
 * Evaluate a condition expression.
 * Supports booleans, binding refs, negation, and simple comparisons.
 * @param {Object} vmState
 * @param {*} condition
 * @returns {boolean}
 */
export function evaluateCondition(vmState, condition) {
  if (typeof condition === 'boolean') {
    return condition;
  }

  if (typeof condition === 'string') {
    // Negation
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

    // Binding reference (only if no comparison operator matched)
    if (condition.startsWith('$')) {
      const value = vmState.bindings.get(condition.slice(1));
      return Boolean(value);
    }

    // Fallback: evaluate as expression
    return Boolean(evaluateExpr(vmState, condition));
  }

  return Boolean(condition);
}

/**
 * Evaluate a simple expression.
 * Supports numbers, string literals, booleans/null, binding refs, and property access.
 * @param {Object} vmState
 * @param {string} expr
 * @returns {*}
 */
export function evaluateExpr(vmState, expr) {
  if (typeof expr !== 'string') return expr;
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

  // Boolean/null
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;

  // Binding reference
  if (expr.startsWith('$')) {
    return vmState.bindings.get(expr.slice(1));
  }

  // Property access (e.g., matches.length or item.factId)
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
