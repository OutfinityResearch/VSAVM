# VSAVM Evaluation Suite

This directory contains comprehensive evaluation tests for VSAVM that validate core system guarantees per DS001-DS004 specifications.

## Overview

The evaluation suite has been redesigned to test actual VSAVM correctness guarantees rather than superficial functionality. The tests now validate:

### Core Requirements Tested

1. **VM Execution (DS002)** - Tests actual VM instruction execution, not storage bypass
2. **Scope Isolation (DS001)** - Tests structural scoping and context isolation
3. **Query Compilation (DS003)** - Tests NL→VM program compilation and execution
4. **Budget Compliance (DS004)** - Tests bounded closure and graceful degradation
5. **Compression Fidelity (DS005)** - Tests lossless compression with decompression verification

### Key Improvements Made

**Previous Issues Fixed:**
- ❌ `vm.queryFacts()` bypassed VM execution → ✅ Now tests `vm.execute()` with compiled programs
- ❌ Compression ratio threshold 0.50 → ✅ Raised to 0.85 (realistic expectation)
- ❌ No decompression testing → ✅ Now verifies round-trip fidelity
- ❌ Incorrect family tree expectations → ✅ Fixed grandparent count (2→4) and sibling logic
- ❌ No scope isolation tests → ✅ Comprehensive scope isolation validation
- ❌ No budget exhaustion tests → ✅ Tests budget limits and graceful degradation
- ❌ No VM instruction tests → ✅ Tests individual VM operations

## Test Categories

### 1. Rule Learning (`rule-learning`)
Tests pattern recognition and rule extraction from sequences.
- **Metrics**: accuracy, rules_learned, memory_usage
- **Threshold**: 90% accuracy

### 2. Reasoning (`reasoning`) 
Tests logical inference and transitive closure.
- **Metrics**: consistency_score, inference_accuracy, conflict_detection_rate
- **Threshold**: 95% consistency
- **Fixed**: Correct family tree expectations (4 grandparents, 4 siblings including reflexive)

### 3. Query Response (`query-response`)
Tests VM program execution and query compilation.
- **Metrics**: response_time, accuracy, vm_execution_success_rate, query_compilation_success_rate
- **Threshold**: <100ms response, 95% accuracy, 90% VM execution success
- **Critical Change**: Now uses `vm.execute()` instead of direct storage access

### 4. Compression (`compression`)
Tests pattern compression and decompression fidelity.
- **Metrics**: compression_ratio, entropy_correlation, decompression_fidelity
- **Threshold**: 85% compression ratio, 100% decompression fidelity
- **Critical Change**: Verifies lossless round-trip compression

### 5. VM Execution (`vm-execution`) - NEW
Tests core VM instruction execution (DS002 requirement).
- **Metrics**: instruction_success_rate, program_success_rate, budget_compliance_rate
- **Threshold**: 90% instruction success, 100% budget compliance
- **Tests**: Individual instructions, complex programs, nested contexts

### 6. Scope Isolation (`scope-isolation`) - NEW  
Tests structural scoping and context management (DS001 requirement).
- **Metrics**: isolation_success_rate, cross_scope_leak_rate, context_nesting_success_rate
- **Threshold**: 100% isolation success, 0% leak rate
- **Tests**: Cross-scope queries, nested contexts, scope cleanup

## Usage

```bash
# Run all evaluations
node evals/run.mjs

# Run specific category
node evals/run.mjs --category vm-execution

# Verbose output
node evals/run.mjs --verbose

# JSON output only
node evals/run.mjs --json > results.json
```

## Configuration

Edit `config.mjs` to adjust:
- **Thresholds**: Pass/fail criteria for each metric
- **Timeouts**: Maximum execution time per category  
- **Parameters**: Test complexity and sample sizes
- **VSAVM Config**: VM budget limits, VSA dimensions, storage strategy

## Results

Results are saved to `results/` with timestamps. The `latest.json` always contains the most recent run.

### Result Structure

```json
{
  "timestamp": "2026-01-20T...",
  "config": { /* test configuration */ },
  "categories": {
    "vm-execution": {
      "metrics": {
        "instruction_success_rate": 0.95,
        "budget_compliance_rate": 1.0
      },
      "passed": true
    }
  },
  "summary": {
    "passed_categories": 5,
    "failed_categories": 1
  }
}
```

## Correctness Contract

The evaluation suite enforces VSAVM's correctness contract:

1. **Operational Correctness**: No contradictions within explored budget
2. **Budget Monotonicity**: Higher budgets preserve lower-budget claims  
3. **Scope Isolation**: Facts cannot leak across structural boundaries
4. **VM Determinism**: Same program + state → same result
5. **Compression Fidelity**: Lossless pattern compression

## Implementation Notes

- Tests use realistic data sizes and complexity
- Budget limits are enforced and tested
- Scope isolation is verified at multiple nesting levels
- VM programs are compiled from query patterns (DS003)
- All compression is verified through decompression
- Error handling and graceful degradation are tested

This evaluation suite provides confidence that VSAVM meets its architectural guarantees rather than just "running without crashing."
