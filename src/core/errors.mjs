/**
 * Error types and codes for VSAVM
 * Per DS009: Error categories E1xxx-E5xxx
 */

/**
 * Error categories
 */
export const ErrorCategory = {
  INPUT: 'E1xxx',
  PROCESSING: 'E2xxx',
  EXECUTION: 'E3xxx',
  CONSISTENCY: 'E4xxx',
  SYSTEM: 'E5xxx'
};

/**
 * Error codes
 */
export const ErrorCode = {
  // Input errors (E1xxx)
  MALFORMED_QUERY: 'E1001',
  UNSUPPORTED_MODALITY: 'E1002',
  ENTITY_NOT_FOUND: 'E1003',
  INVALID_INPUT: 'E1004',
  UNKNOWN_PREDICATE: 'E1005',
  INVALID_TERM: 'E1006',
  MISSING_REQUIRED_SLOT: 'E1007',
  
  // Processing errors (E2xxx)
  CANONICALIZATION_FAILED: 'E2001',
  SCHEMA_RETRIEVAL_FAILED: 'E2002',
  SLOT_FILLING_FAILED: 'E2003',
  COMPILATION_FAILED: 'E2004',
  ENTITY_RESOLUTION_FAILED: 'E2005',
  PROGRAM_COMPILATION_FAILED: 'E2004',
  
  // Execution errors (E3xxx)
  BUDGET_EXHAUSTED: 'E3001',
  BRANCH_LIMIT_EXCEEDED: 'E3002',
  STACK_OVERFLOW: 'E3003',
  INVALID_INSTRUCTION: 'E3004',
  TYPE_MISMATCH: 'E3005',
  DEPTH_LIMIT_EXCEEDED: 'E3006',
  STEP_LIMIT_EXCEEDED: 'E3007',
  TIME_LIMIT_EXCEEDED: 'E3008',
  BINDING_NOT_FOUND: 'E3009',
  RULE_APPLICATION_FAILED: 'E3010',
  UNKNOWN_INSTRUCTION: 'E3004',
  
  // Consistency errors (E4xxx)
  CONFLICT_DETECTED: 'E4001',
  INVARIANT_VIOLATED: 'E4002',
  SCOPE_VIOLATION: 'E4003',
  DIRECT_CONFLICT: 'E4004',
  TEMPORAL_CONFLICT: 'E4005',
  CLOSURE_INCOMPLETE: 'E4006',
  ASSUMPTION_REQUIRED: 'E4007',
  
  // System errors (E5xxx)
  STORAGE_UNAVAILABLE: 'E5001',
  TIMEOUT: 'E5002',
  OUT_OF_MEMORY: 'E5003',
  STRATEGY_NOT_FOUND: 'E5004',
  CONFIGURATION_ERROR: 'E5005',
  INTERNAL_ERROR: 'E5999',
  STORAGE_ERROR: 'E5001'
};

function categoryFromCode(code) {
  if (!code || typeof code !== 'string') return ErrorCategory.SYSTEM;
  if (code.startsWith('E1')) return ErrorCategory.INPUT;
  if (code.startsWith('E2')) return ErrorCategory.PROCESSING;
  if (code.startsWith('E3')) return ErrorCategory.EXECUTION;
  if (code.startsWith('E4')) return ErrorCategory.CONSISTENCY;
  if (code.startsWith('E5')) return ErrorCategory.SYSTEM;
  return ErrorCategory.SYSTEM;
}

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
    this.category = categoryFromCode(code);
    this.context = context;
    this.recoverable = context?.recoverable ?? false;
    const deterministic = context?.deterministicTime ?? VSAVMError.deterministicTime;
    this.timestamp = context?.timestamp ?? (deterministic ? 0 : Date.now());
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

VSAVMError.deterministicTime = false;

/**
 * Create appropriate error by code
 * @param {string} code
 * @param {string} message
 * @param {Object} [context]
 * @returns {VSAVMError}
 */
export function createError(code, message, context) {
  const category = categoryFromCode(code);
  
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
    [ErrorCode.CONFLICT_DETECTED]: 'Resolve conflicting facts or use conditional mode',
    [ErrorCode.DIRECT_CONFLICT]: 'Resolve conflicting facts or use conditional mode',
    [ErrorCode.ASSUMPTION_REQUIRED]: 'Use conditional mode to proceed with assumptions',
    [ErrorCode.SCHEMA_RETRIEVAL_FAILED]: 'Add relevant schemas or rephrase query',
    [ErrorCode.UNKNOWN_PREDICATE]: 'Define predicate or check spelling'
  };
  
  return suggestions[error.code] || 'Check error context for details';
}
