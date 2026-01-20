/**
 * Built-in collection operations for VM
 * Per DS007: COUNT, FILTER, MAP, REDUCE
 */

import { ExecutionError, ErrorCode } from '../../core/errors.mjs';
import { evaluateCondition, evaluateExpr } from '../expr.mjs';

/**
 * Resolve a value that may be a binding reference ($name).
 * Throws if the binding is missing.
 */
function resolveRequired(vmState, value) {
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
 * COUNT: Count items in a collection-like value.
 * @param {Object} vmState
 * @param {Object} args
 * @returns {number}
 */
export function count(vmState, args) {
  vmState.budget.consumeSteps('COUNT');

  const value = resolveRequired(vmState, args.value ?? args.list);

  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'object') return Object.keys(value).length;

  return 1;
}

/**
 * FILTER: Filter an array by a condition expression evaluated per item.
 * Binds `item` and `index` during evaluation.
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Array}
 */
export function filter(vmState, args) {
  const list = resolveRequired(vmState, args.list ?? args.value);
  if (!Array.isArray(list)) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'FILTER requires an array in args.list',
      { args }
    );
  }

  const condition = args.condition ?? '$item';

  // Budget scales with list length
  vmState.budget.consumeSteps('FILTER', list.length);

  const result = [];
  vmState.bindings.pushScope();
  try {
    for (let i = 0; i < list.length; i++) {
      vmState.bindings.bind('item', list[i]);
      vmState.bindings.bind('index', i);
      if (evaluateCondition(vmState, condition)) {
        result.push(list[i]);
      }
    }
  } finally {
    vmState.bindings.popScope();
  }

  return result;
}

/**
 * MAP: Map an array into a new array.
 * Supports `args.expr` (expression string) or `args.path` / `args.pick` (property path).
 * Binds `item` and `index` during evaluation.
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Array}
 */
export function map(vmState, args) {
  const list = resolveRequired(vmState, args.list ?? args.value);
  if (!Array.isArray(list)) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'MAP requires an array in args.list',
      { args }
    );
  }

  const expr = args.expr;
  const path = args.path ?? args.pick;
  const constant = args.constant;

  if (!expr && !path && constant === undefined) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'MAP requires args.expr, args.path/args.pick, or args.constant',
      { args }
    );
  }

  vmState.budget.consumeSteps('MAP', list.length);

  const getByPath = (obj, p) => {
    const parts = String(p).split('.').filter(Boolean);
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (current instanceof Map) {
        current = current.get(part);
      } else {
        current = current[part];
      }
    }
    return current;
  };

  const result = [];
  vmState.bindings.pushScope();
  try {
    for (let i = 0; i < list.length; i++) {
      vmState.bindings.bind('item', list[i]);
      vmState.bindings.bind('index', i);

      if (constant !== undefined) {
        result.push(constant);
      } else if (path) {
        result.push(getByPath(list[i], path));
      } else {
        result.push(evaluateExpr(vmState, expr));
      }
    }
  } finally {
    vmState.bindings.popScope();
  }

  return result;
}

/**
 * REDUCE: Reduce an array into a single value using a built-in reducer.
 * @param {Object} vmState
 * @param {Object} args
 * @returns {*}
 */
export function reduce(vmState, args) {
  const list = resolveRequired(vmState, args.list ?? args.value);
  if (!Array.isArray(list)) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'REDUCE requires an array in args.list',
      { args }
    );
  }

  const op = args.op;
  if (!op) {
    throw new ExecutionError(
      ErrorCode.INVALID_INPUT,
      'REDUCE requires args.op',
      { args }
    );
  }

  const separator = args.separator ?? '';
  let acc = args.initial;

  vmState.budget.consumeSteps('REDUCE', list.length);

  switch (op) {
    case 'sum': {
      let total = Number(acc ?? 0);
      for (const item of list) total += Number(item);
      return total;
    }
    case 'concat': {
      const out = Array.isArray(acc) ? [...acc] : [];
      for (const item of list) {
        if (Array.isArray(item)) out.push(...item);
        else out.push(item);
      }
      return out;
    }
    case 'join': {
      const strs = list.map(v => String(v));
      const prefix = acc !== undefined ? String(acc) : '';
      return prefix + strs.join(String(separator));
    }
    case 'and': {
      let value = acc !== undefined ? Boolean(acc) : true;
      for (const item of list) value = value && Boolean(item);
      return value;
    }
    case 'or': {
      let value = acc !== undefined ? Boolean(acc) : false;
      for (const item of list) value = value || Boolean(item);
      return value;
    }
    case 'min': {
      let value = acc !== undefined ? Number(acc) : Infinity;
      for (const item of list) value = Math.min(value, Number(item));
      return value;
    }
    case 'max': {
      let value = acc !== undefined ? Number(acc) : -Infinity;
      for (const item of list) value = Math.max(value, Number(item));
      return value;
    }
    default:
      throw new ExecutionError(
        ErrorCode.INVALID_INPUT,
        `Unknown REDUCE op: ${op}`,
        { op }
      );
  }
}

export const builtinOps = {
  COUNT: count,
  FILTER: filter,
  MAP: map,
  REDUCE: reduce
};

