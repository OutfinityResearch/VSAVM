/**
 * Error handling utilities
 * Per DS009: categories, recovery strategies, propagation helpers
 */

import { VSAVMError, ErrorCode, ErrorCategory, createError, getRecoverySuggestion } from './errors.mjs';

/**
 * Create a structured error context.
 * @param {Object} options
 * @returns {Object}
 */
export function createErrorContext(options = {}) {
  return {
    operation: options.operation ?? 'unknown',
    module: options.module ?? 'unknown',
    inputSummary: options.inputSummary ?? null,
    state: options.state ?? null,
    traceRef: options.traceRef ?? null,
    callStack: options.callStack ? [...options.callStack] : []
  };
}

/**
 * Attach context to a VSAVMError (or wrap a non-VSAVM error).
 * @param {Error} error
 * @param {Object} context
 * @returns {VSAVMError}
 */
export function attachErrorContext(error, context) {
  const ctx = createErrorContext(context);

  if (error instanceof VSAVMError) {
    const stack = error.context?.callStack ?? [];
    error.context = {
      ...ctx,
      callStack: [...stack, { operation: ctx.operation, module: ctx.module }]
    };
    return error;
  }

  return createError(
    ErrorCode.INTERNAL_ERROR,
    error?.message ?? 'Unknown error',
    ctx
  );
}

/**
 * Try a fallback strategy based on error code.
 * @param {VSAVMError} error
 * @param {Object} context
 * @returns {Object}
 */
export function tryFallbackStrategy(error, context) {
  switch (error.code) {
    case ErrorCode.CANONICALIZATION_FAILED:
      return { success: false, fallback: 'canonicalizer:identity' };
    case ErrorCode.SCHEMA_RETRIEVAL_FAILED:
      return { success: false, fallback: 'vsa:lower_threshold' };
    case ErrorCode.SLOT_FILLING_FAILED:
      return { success: false, fallback: 'slot_filling:optional_only' };
    default:
      return { success: false };
  }
}

/**
 * Compute exponential backoff with jitter.
 * @param {number} attempt
 * @returns {number}
 */
export function computeBackoff(attempt = 0) {
  const baseMs = 100;
  const maxMs = 30000;
  const exponential = Math.min(baseMs * (2 ** attempt), maxMs);
  const jitter = Math.floor(exponential * 0.1);
  return exponential + jitter;
}

function isTransientSystemError(error) {
  return error.code === ErrorCode.TIMEOUT ||
         error.code === ErrorCode.STORAGE_UNAVAILABLE ||
         error.code === ErrorCode.OUT_OF_MEMORY;
}

/**
 * Handle an error and produce a consistent response shape.
 * @param {Error} error
 * @param {Object} context
 * @returns {Object}
 */
export function handleError(error, context = {}) {
  const vsavmError = attachErrorContext(error, context);
  const suggestion = getRecoverySuggestion(vsavmError);

  switch (vsavmError.category) {
    case ErrorCategory.INPUT:
      return {
        success: false,
        error: vsavmError,
        suggestion,
        retry: false
      };
    case ErrorCategory.PROCESSING: {
      const fallback = tryFallbackStrategy(vsavmError, context);
      if (fallback.success) {
        return fallback.result;
      }
      return {
        success: false,
        error: vsavmError,
        suggestion,
        retry: false,
        fallback
      };
    }
    case ErrorCategory.EXECUTION:
      if (vsavmError.code === ErrorCode.BUDGET_EXHAUSTED) {
        return {
          success: false,
          error: vsavmError,
          suggestion,
          retry: true,
          retryWith: { budgetMultiplier: 2 }
        };
      }
      return {
        success: false,
        error: vsavmError,
        suggestion,
        retry: false
      };
    case ErrorCategory.CONSISTENCY:
      return {
        success: true,
        mode: 'conditional',
        error: vsavmError,
        conflicts: context.conflicts ?? []
      };
    case ErrorCategory.SYSTEM:
      return {
        success: false,
        error: vsavmError,
        suggestion,
        retry: isTransientSystemError(vsavmError),
        retryAfterMs: computeBackoff(context.attempt ?? 0)
      };
    default:
      return { success: false, error: vsavmError, suggestion, retry: false };
  }
}

export default {
  createErrorContext,
  attachErrorContext,
  tryFallbackStrategy,
  computeBackoff,
  handleError
};
