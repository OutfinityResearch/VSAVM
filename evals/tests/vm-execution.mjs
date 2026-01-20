/**
 * VM Execution Evaluation Tests
 * Tests VSAVM's core VM instruction execution (DS002 requirement)
 * 
 * CRITICAL: This tests what was completely missing - actual VM program execution
 */

import { createDefaultVSAVM } from '../../src/index.mjs';
import { stringAtom, numberAtom, entityAtom } from '../../src/core/types/terms.mjs';
import { createSymbolId, createScopeId, createSourceId, createEntityId } from '../../src/core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../../src/core/types/facts.mjs';

/**
 * Run VM execution evaluation
 * @param {Object} config
 * @returns {Promise<Object>}
 */
export async function runVMExecutionTests(config) {
  const results = {
    category: 'vm-execution',
    metrics: {
      instruction_success_rate: 0,
      program_success_rate: 0,
      budget_compliance_rate: 0,
      avg_execution_ms: 0,
      total_instructions_tested: 0,
      total_programs_tested: 0
    },
    details: {
      instruction_tests: [],
      program_tests: [],
      budget_tests: []
    }
  };
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    // Test individual VM instructions
    await testVMInstructions(vm, results, config);
    
    // Test complete VM programs
    await testVMPrograms(vm, results, config);
    
    // Test budget compliance
    await testBudgetCompliance(vm, results, config);
    
    // Calculate aggregate metrics
    const instructionSuccesses = results.details.instruction_tests.filter(t => t.success).length;
    const programSuccesses = results.details.program_tests.filter(t => t.success).length;
    const budgetSuccesses = results.details.budget_tests.filter(t => t.budget_respected).length;
    
    results.metrics.instruction_success_rate = results.details.instruction_tests.length > 0 ? 
      instructionSuccesses / results.details.instruction_tests.length : 0;
    results.metrics.program_success_rate = results.details.program_tests.length > 0 ? 
      programSuccesses / results.details.program_tests.length : 0;
    results.metrics.budget_compliance_rate = results.details.budget_tests.length > 0 ? 
      budgetSuccesses / results.details.budget_tests.length : 0;
    
    const allExecutionTimes = [
      ...results.details.instruction_tests.map(t => t.execution_ms),
      ...results.details.program_tests.map(t => t.execution_ms)
    ].filter(t => typeof t === 'number');
    
    results.metrics.avg_execution_ms = allExecutionTimes.length > 0 ? 
      allExecutionTimes.reduce((a, b) => a + b, 0) / allExecutionTimes.length : 0;
    
    results.metrics.total_instructions_tested = results.details.instruction_tests.length;
    results.metrics.total_programs_tested = results.details.program_tests.length;
    
  } finally {
    await vm.close();
  }
  
  return results;
}

/**
 * Test individual VM instructions
 */
async function testVMInstructions(vm, results, config) {
  const instructionCount = config.params.vm_instruction_count || 20;
  
  // Test basic instructions
  const instructionTests = [
    {
      name: 'MAKE_TERM',
      instruction: {
        op: 'MAKE_TERM',
        args: { type: 'string', value: 'test_value', outputVar: 'term1' }
      }
    },
    {
      name: 'BIND_SLOTS',
      instruction: {
        op: 'BIND_SLOTS',
        args: { 
          term: { var: 'term1' },
          slots: { value: 'test_value' },
          outputVar: 'bound1'
        }
      }
    },
    {
      name: 'ASSERT',
      instruction: {
        op: 'ASSERT',
        args: {
          predicate: 'test:fact',
          arguments: { subject: 'entity1', value: 'test' }
        }
      }
    },
    {
      name: 'QUERY',
      instruction: {
        op: 'QUERY',
        args: {
          predicate: 'test:fact',
          pattern: {},
          outputVar: 'results'
        }
      }
    },
    {
      name: 'COUNT',
      instruction: {
        op: 'COUNT',
        args: {
          collection: { var: 'results' },
          outputVar: 'count'
        }
      }
    }
  ];
  
  for (const test of instructionTests) {
    const startTime = performance.now();
    let success = false;
    let error = null;
    
    try {
      const program = {
        programId: `instr_test_${test.name}`,
        instructions: [test.instruction],
        metadata: {
          compiledAt: Date.now(),
          estimatedSteps: 1,
          estimatedBranches: 0,
          tracePolicy: 'full'
        }
      };
      
      const result = await vm.execute(program, {
        budget: {
          maxDepth: 2,
          maxSteps: 10,
          maxBranches: 1,
          maxTimeMs: 1000
        }
      });
      
      success = result && result.mode !== 'INDETERMINATE';
      
    } catch (err) {
      error = err.message;
    }
    
    const executionTime = performance.now() - startTime;
    
    results.details.instruction_tests.push({
      name: test.name,
      instruction: test.instruction.op,
      success,
      error,
      execution_ms: executionTime
    });
  }
}

/**
 * Test complete VM programs
 */
async function testVMPrograms(vm, results, config) {
  const complexity = config.params.vm_program_complexity || 3;
  
  // Test programs of increasing complexity
  const programTests = [
    {
      name: 'simple_assert_query',
      program: {
        programId: 'test_simple',
        instructions: [
          {
            op: 'ASSERT',
            args: {
              predicate: 'test:simple',
              arguments: { id: 'item1', value: 42 }
            }
          },
          {
            op: 'QUERY',
            args: {
              predicate: 'test:simple',
              pattern: {},
              outputVar: 'results'
            }
          },
          {
            op: 'RETURN',
            args: { value: { var: 'results' } }
          }
        ]
      },
      expectedResultCount: 1
    },
    {
      name: 'conditional_branch',
      program: {
        programId: 'test_branch',
        instructions: [
          {
            op: 'MAKE_TERM',
            args: { type: 'number', value: 5, outputVar: 'num' }
          },
          {
            op: 'BRANCH',
            args: {
              condition: { op: 'gt', left: { var: 'num' }, right: 3 },
              then: 'success_path',
              else: 'fail_path'
            }
          },
          {
            label: 'success_path',
            op: 'MAKE_TERM',
            args: { type: 'string', value: 'success', outputVar: 'result' }
          },
          {
            op: 'JUMP',
            args: { label: 'end' }
          },
          {
            label: 'fail_path',
            op: 'MAKE_TERM',
            args: { type: 'string', value: 'fail', outputVar: 'result' }
          },
          {
            label: 'end',
            op: 'RETURN',
            args: { value: { var: 'result' } }
          }
        ]
      },
      expectedResult: 'success'
    },
    {
      name: 'nested_context',
      program: {
        programId: 'test_context',
        instructions: [
          {
            op: 'PUSH_CONTEXT',
            args: { scopeId: 'outer' }
          },
          {
            op: 'ASSERT',
            args: {
              predicate: 'test:scoped',
              arguments: { level: 'outer', value: 1 }
            }
          },
          {
            op: 'PUSH_CONTEXT',
            args: { scopeId: 'inner' }
          },
          {
            op: 'ASSERT',
            args: {
              predicate: 'test:scoped',
              arguments: { level: 'inner', value: 2 }
            }
          },
          {
            op: 'QUERY',
            args: {
              predicate: 'test:scoped',
              pattern: {},
              outputVar: 'inner_results'
            }
          },
          {
            op: 'POP_CONTEXT'
          },
          {
            op: 'QUERY',
            args: {
              predicate: 'test:scoped',
              pattern: {},
              outputVar: 'outer_results'
            }
          },
          {
            op: 'RETURN',
            args: { 
              value: { 
                inner: { var: 'inner_results' },
                outer: { var: 'outer_results' }
              }
            }
          }
        ]
      },
      expectedBehavior: 'scope_isolation'
    }
  ];
  
  for (const test of programTests) {
    const startTime = performance.now();
    let success = false;
    let error = null;
    let result = null;
    
    try {
      result = await vm.execute(test.program, {
        budget: {
          maxDepth: complexity + 2,
          maxSteps: 50,
          maxBranches: 3,
          maxTimeMs: 2000
        }
      });
      
      success = result && result.mode !== 'INDETERMINATE';
      
      // Additional validation based on test type
      if (success && test.expectedResultCount !== undefined) {
        const resultCount = extractResultCount(result);
        success = resultCount === test.expectedResultCount;
      }
      
    } catch (err) {
      error = err.message;
    }
    
    const executionTime = performance.now() - startTime;
    
    results.details.program_tests.push({
      name: test.name,
      success,
      error,
      execution_ms: executionTime,
      result_summary: result ? summarizeResult(result) : null
    });
  }
}

/**
 * Test budget compliance and exhaustion handling
 */
async function testBudgetCompliance(vm, results, config) {
  const stressMultiplier = config.params.budget_stress_multiplier || 5;
  
  // Create a program that should exceed budget limits
  const expensiveProgram = {
    programId: 'budget_test',
    instructions: []
  };
  
  // Generate many expensive operations
  for (let i = 0; i < 100; i++) {
    expensiveProgram.instructions.push({
      op: 'ASSERT',
      args: {
        predicate: 'test:expensive',
        arguments: { id: `item_${i}`, value: i }
      }
    });
  }
  
  // Add expensive query
  expensiveProgram.instructions.push({
    op: 'QUERY',
    args: {
      predicate: 'test:expensive',
      pattern: {},
      outputVar: 'all_results'
    }
  });
  
  expensiveProgram.instructions.push({
    op: 'RETURN',
    args: { value: { var: 'all_results' } }
  });
  
  // Test with very restrictive budget
  const restrictiveBudget = {
    maxDepth: 1,
    maxSteps: 5,  // Very low
    maxBranches: 1,
    maxTimeMs: 100
  };
  
  const startTime = performance.now();
  let budgetRespected = false;
  let error = null;
  let result = null;
  
  try {
    result = await vm.execute(expensiveProgram, {
      budget: restrictiveBudget
    });
    
    // Budget should be respected - either complete within limits or graceful degradation
    budgetRespected = result && (
      result.mode === 'INDETERMINATE' ||  // Graceful degradation
      result.budget_used?.steps <= restrictiveBudget.maxSteps  // Completed within budget
    );
    
  } catch (err) {
    // Budget exhaustion errors are acceptable
    budgetRespected = err.message.includes('budget') || err.message.includes('limit');
    error = err.message;
  }
  
  const executionTime = performance.now() - startTime;
  
  results.details.budget_tests.push({
    name: 'restrictive_budget',
    budget_respected: budgetRespected,
    execution_ms: executionTime,
    error,
    result_mode: result?.mode || null,
    budget_used: result?.budget_used || null
  });
}

/**
 * Extract result count from VM execution result
 */
function extractResultCount(vmResult) {
  if (!vmResult) return 0;
  
  if (vmResult.claims && Array.isArray(vmResult.claims)) {
    return vmResult.claims.length;
  }
  
  if (vmResult.result && Array.isArray(vmResult.result)) {
    return vmResult.result.length;
  }
  
  return 0;
}

/**
 * Summarize VM result for logging
 */
function summarizeResult(result) {
  return {
    mode: result.mode,
    claimCount: result.claims?.length || 0,
    hasConflicts: (result.conflicts?.length || 0) > 0,
    budgetUsed: result.budget_used
  };
}

export default { runVMExecutionTests };
