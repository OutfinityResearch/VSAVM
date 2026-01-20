# DS009 Error Handling

This document defines error categories, structure, recovery strategies, propagation, and logging/monitoring for VSAVM. All behaviors are normative and implementations must follow the specified handling model.

## Error Handling

### Error Categories

```typescript
enum ErrorCategory {
    // Input errors (user's fault)
    INVALID_INPUT = "E1xxx",
    MALFORMED_QUERY = "E1001",
    UNSUPPORTED_MODALITY = "E1002",
    ENTITY_NOT_FOUND = "E1003",
    
    // Processing errors (may be recoverable)
    PROCESSING = "E2xxx",
    CANONICALIZATION_FAILED = "E2001",
    SCHEMA_RETRIEVAL_FAILED = "E2002",
    SLOT_FILLING_FAILED = "E2003",
    COMPILATION_FAILED = "E2004",
    
    // Execution errors
    EXECUTION = "E3xxx",
    BUDGET_EXHAUSTED = "E3001",
    BRANCH_LIMIT_EXCEEDED = "E3002",
    STACK_OVERFLOW = "E3003",
    INVALID_INSTRUCTION = "E3004",
    TYPE_MISMATCH = "E3005",
    
    // Consistency errors
    CONSISTENCY = "E4xxx",
    CONFLICT_DETECTED = "E4001",
    INVARIANT_VIOLATED = "E4002",
    SCOPE_VIOLATION = "E4003",
    
    // System errors (infrastructure)
    SYSTEM = "E5xxx",
    STORAGE_UNAVAILABLE = "E5001",
    TIMEOUT = "E5002",
    OUT_OF_MEMORY = "E5003",
    INTERNAL_ERROR = "E5999"
}
```

### Error Structure

```typescript
interface VSAVMError {
    code: string;           // E.g., "E3001"
    category: ErrorCategory;
    message: string;        // Human-readable
    recoverable: boolean;
    context: ErrorContext;
    cause?: Error;          // Underlying error
    timestamp: number;
}

interface ErrorContext {
    operation: string;      // Which operation failed
    module: string;         // Which module
    inputSummary?: string;  // Sanitized input summary
    state?: object;         // Relevant state (for debugging)
    traceRef?: TraceRef;    // Link to execution trace
}
```

### Error Recovery Strategies

```
FUNCTION handle_error(error: VSAVMError, context: OperationContext) -> ErrorResponse:
    
    MATCH error.category:
        
        CASE INVALID_INPUT:
            // User error - provide helpful message, no retry
            RETURN ErrorResponse(
                success = false,
                error = error,
                suggestion = generate_input_suggestion(error),
                retry = false
            )
        
        CASE PROCESSING:
            // May be recoverable with fallback
            fallback = try_fallback_strategy(error, context)
            IF fallback.success:
                log_warning("Used fallback for: " + error.code)
                RETURN fallback.result
            ELSE:
                RETURN ErrorResponse(
                    success = false,
                    error = error,
                    suggestion = "Try simplifying your query",
                    retry = false
                )
        
        CASE EXECUTION:
            IF error.code == "E3001":  // Budget exhausted
                // Offer to retry with higher budget
                RETURN ErrorResponse(
                    success = false,
                    error = error,
                    partialResult = context.partial_result,
                    suggestion = "Increase budget for more complete results",
                    retry = true,
                    retryWith = { budget: context.budget * 2 }
                )
            ELSE:
                // Other execution errors - not recoverable
                RETURN ErrorResponse(
                    success = false,
                    error = error,
                    retry = false
                )
        
        CASE CONSISTENCY:
            // Return as conditional/indeterminate result
            RETURN ErrorResponse(
                success = true,  // Technically succeeded, with caveats
                mode = "conditional",
                error = error,
                conflicts = extract_conflicts(error)
            )
        
        CASE SYSTEM:
            // Infrastructure issue - may retry
            IF is_transient(error):
                RETURN ErrorResponse(
                    success = false,
                    error = error,
                    retry = true,
                    retryAfterMs = compute_backoff(context.attempt)
                )
            ELSE:
                // Persistent system error
                log_critical(error)
                RETURN ErrorResponse(
                    success = false,
                    error = error,
                    retry = false
                )

FUNCTION try_fallback_strategy(error: VSAVMError, context: OperationContext) -> FallbackResult:
    
    MATCH error.code:
        
        CASE "E2001":  // Canonicalization failed
            // Try identity canonicalizer
            RETURN retry_with_strategy(context, "canonicalizer", "identity")
        
        CASE "E2002":  // Schema retrieval failed
            // Try broader similarity threshold
            RETURN retry_with_config(context, "vsa.similarityThreshold", 0.2)
        
        CASE "E2003":  // Slot filling failed
            // Try with optional slots only
            RETURN retry_with_optional_slots(context)
        
        DEFAULT:
            RETURN FallbackResult(success = false)

FUNCTION compute_backoff(attempt: int) -> int:
    // Exponential backoff with jitter
    base_ms = 100
    max_ms = 30000
    exponential = min(base_ms * (2 ^ attempt), max_ms)
    jitter = random(0, exponential * 0.1)
    RETURN exponential + jitter
```

### Error Propagation

```
// Errors propagate up the call stack with context accumulation

FUNCTION execute_with_error_handling<T>(
    operation: string,
    module: string,
    action: Function<T>
) -> Result<T, VSAVMError>:
    
    TRY:
        result = action()
        RETURN Result.ok(result)
    
    CATCH VSAVMError AS e:
        // Already a VSAVM error - add context and re-throw
        e.context.callStack.push({ operation, module })
        RETURN Result.error(e)
    
    CATCH Exception AS e:
        // Wrap external exception
        wrapped = VSAVMError(
            code = "E5999",
            category = SYSTEM,
            message = "Internal error: " + e.message,
            recoverable = false,
            context = ErrorContext(
                operation = operation,
                module = module
            ),
            cause = e
        )
        RETURN Result.error(wrapped)
```

### Logging and Monitoring

```
// All errors are logged with structured format

FUNCTION log_error(error: VSAVMError):
    log_entry = {
        timestamp: now(),
        level: error.recoverable ? "WARN" : "ERROR",
        code: error.code,
        category: error.category,
        message: error.message,
        module: error.context.module,
        operation: error.context.operation,
        trace_ref: error.context.traceRef,
        // Sanitized - no PII or sensitive data
        input_hash: hash(error.context.inputSummary)
    }
    
    logger.log(log_entry)
    
    // Metrics
    metrics.increment("errors.total", tags={code: error.code})
    metrics.increment("errors.by_category", tags={category: error.category})
    
    IF NOT error.recoverable:
        alerting.notify(error)
```
