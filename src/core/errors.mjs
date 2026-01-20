/**
 * Error types and codes for VSAVM
 * Per DS008: Error categories E1xxx-E5xxx
 */

/**
 * Error categories
 */
export const ErrorCategory = {
  INPUT: 'E1',       // E1xxx: Input errors
  PROCESSING: 'E2',  // E2xxx: Processing errors
  EXECUTION: 'E3',   // E3xxx: Execution errors
  CONSISTENCY: 'E4', // E4xxx: Consistency errors
  SYSTEM: 'E5'       // E5xxx: System errors
};

/**
 * Error codes
 */
export const ErrorCode = {
  // Input errors (E1xxx)
  INVALID_INPUT: 'E1001',
  MALFORMED_QUERY: 'E1002',
  UNKNOWN_PREDICATE: 'E1003',
  INVALID_TERM: 'E1004',
  MISSING_REQUIRED_SLOT: 'E1005',
  TYPE_MISMATCH: 'E1006',
  
  // Processing errors (E2xxx)
  CANONICALIZATION_FAILED: 'E2001',
  ENTITY_RESOLUTION_FAILED: 'E2002',
  SCHEMA_RETRIEVAL_FAILED: 'E2003',
  SLOT_FILLING_FAILED: 'E2004',
  PROGRAM_COMPILATION_FAILED: 'E2005',
  
  // Execution errors (E3xxx)
  BUDGET_EXHAUSTED: 'E3001',
  DEPTH_LIMIT_EXCEEDED: 'E3002',
  STEP_LIMIT_EXCEEDED: 'E3003',
  BRANCH_LIMIT_EXCEEDED: 'E3004',
  TIME_LIMIT_EXCEEDED: 'E3005',
  UNKNOWN_INSTRUCTION: 'E3006',
  BINDING_NOT_FOUND: 'E3007',
  RULE_APPLICATION_FAILED: 'E3008',
  
  // Consistency errors (E4xxx)
  DIRECT_CONFLICT: 'E4001',
  TEMPORAL_CONFLICT: 'E4002',
  SCOPE_CONFLICT: 'E4003',
  CLOSURE_INCOMPLETE: 'E4004',
  ASSUMPTION_REQUIRED: 'E4005',
  
  // System errors (E5xxx)
  STORAGE_ERROR: 'E5001',
  STRATEGY_NOT_FOUND: 'E5002',
  CONFIGURATION_ERROR: 'E5003',
  INTERNAL_ERROR: 'E5999'
};

/**
 * Base VSAVM Error class
 */
export class VSAVMError extends Error {
  /**
   * @param {string} code - Error code from ErrorCode
   * @param {string} message
   * @param {Object} [context]
   */
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'VSAVMError';
    this.code = code;
    this.category = code.slice(0, 2);
    this.context = context;
    this.timestamp = Date.now();
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp
    };
  }
}

/**
 * Input error
 */
export class InputError extends VSAVMError {
  constructor(code, message, context) {
    super(code, message, context);
    this.name = 'InputError';
  }
}

/**
 * Processing error
 */
export class ProcessingError extends VSAVMError {
  constructor(code, message, context) {
    super(code, message, context);
    this.name = 'ProcessingError';
  }
}

/**
 * Execution error
 */
export class ExecutionError extends VSAVMError {
  constructor(code, message, context) {
    super(code, message, context);
    this.name = 'ExecutionError';
  }
}

/**
 * Consistency error
 */
export class ConsistencyError extends VSAVMError {
  constructor(code, message, context) {
    super(code, message, context);
    this.name = 'ConsistencyError';
  }
}

/**
 * System error
 */
export class SystemError extends VSAVMError {
  constructor(code, message, context) {
    super(code, message, context);
    this.name = 'SystemError';
  }
}

/**
 * Create appropriate error by code
 * @param {string} code
 * @param {string} message
 * @param {Object} [context]
 * @returns {VSAVMError}
 */
export function createError(code, message, context) {
  const category = code.slice(0, 2);
  
  switch (category) {
    case ErrorCategory.INPUT:
      return new InputError(code, message, context);
    case ErrorCategory.PROCESSING:
      return new ProcessingError(code, message, context);
    case ErrorCategory.EXECUTION:
      return new ExecutionError(code, message, context);
    case ErrorCategory.CONSISTENCY:
      return new ConsistencyError(code, message, context);
    case ErrorCategory.SYSTEM:
      return new SystemError(code, message, context);
    default:
      return new VSAVMError(code, message, context);
  }
}

/**
 * Check if an error is recoverable
 * @param {Error} error
 * @returns {boolean}
 */
export function isRecoverable(error) {
  if (!(error instanceof VSAVMError)) return false;
  
  // Input errors are often recoverable with user correction
  if (error.category === ErrorCategory.INPUT) return true;
  
  // Budget exhaustion is recoverable by increasing budget
  if (error.code === ErrorCode.BUDGET_EXHAUSTED) return true;
  
  // Consistency errors may be recoverable by changing mode
  if (error.category === ErrorCategory.CONSISTENCY) return true;
  
  return false;
}

/**
 * Get recovery suggestion for an error
 * @param {VSAVMError} error
 * @returns {string}
 */
export function getRecoverySuggestion(error) {
  if (!(error instanceof VSAVMError)) {
    return 'Unknown error - check system logs';
  }
  
  const suggestions = {
    [ErrorCode.BUDGET_EXHAUSTED]: 'Increase budget limits or simplify query',
    [ErrorCode.DEPTH_LIMIT_EXCEEDED]: 'Increase maxDepth or reduce inference chain',
    [ErrorCode.STEP_LIMIT_EXCEEDED]: 'Increase maxSteps or optimize rules',
    [ErrorCode.DIRECT_CONFLICT]: 'Resolve conflicting facts or use conditional mode',
    [ErrorCode.ASSUMPTION_REQUIRED]: 'Use conditional mode to proceed with assumptions',
    [ErrorCode.SCHEMA_RETRIEVAL_FAILED]: 'Add relevant schemas or rephrase query',
    [ErrorCode.UNKNOWN_PREDICATE]: 'Define predicate or check spelling'
  };
  
  return suggestions[error.code] || 'Check error context for details';
}
