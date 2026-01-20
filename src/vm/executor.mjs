/**
 * VM Executor - Instruction dispatch and execution loop
 * Per DS006: Main execution engine for VM programs
 */

import { allOps } from './instructions/index.mjs';
import { Budget } from './budget.mjs';
import { BindingEnv } from './state/binding-env.mjs';
import { ContextStack } from './state/context-stack.mjs';
import { ExecutionLog } from './state/execution-log.mjs';
import { FactStore } from './state/fact-store.mjs';
import { ExecutionError, ErrorCode } from '../core/errors.mjs';
import { ResponseMode, createQueryResult, createClaim } from '../core/types/results.mjs';

/**
 * VM State during execution
 */
export class VMState {
  constructor(options = {}) {
    this.executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.budget = options.budget || new Budget();
    this.bindings = options.bindings || new BindingEnv();
    this.contextStack = options.contextStack || new ContextStack();
    this.log = options.log || new ExecutionLog({ level: options.traceLevel || 'standard' });
    this.factStore = options.factStore;
    this.canonicalizer = options.canonicalizer || null;
    
    // Program counter
    this.pc = 0;
    
    // Call stack for CALL/RETURN
    this.callStack = [];
    
    // Accumulated results
    this.results = [];
    
    // Conflicts detected
    this.conflicts = [];
  }
}

/**
 * Program executor
 */
export class Executor {
  constructor(options = {}) {
    this.strictMode = options.strictMode ?? true;
    this.traceLevel = options.traceLevel ?? 'standard';
  }

  /**
   * Execute a program
   * @param {Object} program - Program with instructions array
   * @param {Object} vmState - VM state
   * @param {Object} [inputs] - Initial bindings
   * @returns {Promise<Object>} Execution result
   */
  async execute(program, vmState, inputs = {}) {
    const startTime = Date.now();
    
    // Bind inputs
    for (const [name, value] of Object.entries(inputs)) {
      vmState.bindings.bind(name, value);
    }
    
    // Start budget tracking
    vmState.budget.start();
    
    // Build label index
    const labels = this.buildLabelIndex(program.instructions);
    
    // Execute instructions
    vmState.pc = 0;
    const instructions = program.instructions;
    
    try {
      while (vmState.pc < instructions.length) {
        if (vmState.budget.isExhausted()) {
          break;
        }
        
        const instr = instructions[vmState.pc];
        const result = await this.executeInstruction(instr, vmState, labels);
        
        // Handle control flow
        if (result && result._jump) {
          const targetPc = labels.get(result._jump);
          if (targetPc === undefined) {
            throw new ExecutionError(
              ErrorCode.INVALID_INPUT,
              `Unknown label: ${result._jump}`,
              { label: result._jump }
            );
          }
          vmState.pc = targetPc;
        } else if (result && result._return) {
          // Handle return from call
          if (vmState.callStack.length > 0) {
            const frame = vmState.callStack.pop();
            vmState.pc = frame.returnAddress;
            if (result.value !== undefined && frame.outVar) {
              vmState.bindings.bind(frame.outVar, result.value);
            }
          } else {
            // Return from main - exit
            break;
          }
        } else {
          vmState.pc++;
        }
      }
    } catch (error) {
      vmState.log.logError(
        error.code || ErrorCode.INTERNAL_ERROR,
        error.message,
        { pc: vmState.pc, instruction: instructions[vmState.pc] }
      );
      
      if (this.strictMode) {
        throw error;
      }
    }
    
    // Build result
    const executionMs = Date.now() - startTime;
    
    return this.buildResult(vmState, executionMs);
  }

  /**
   * Execute a single instruction
   */
  async executeInstruction(instr, vmState, labels) {
    const { op, args, out, label } = instr;
    
    // Get operation handler
    const handler = allOps[op];
    if (!handler) {
      throw new ExecutionError(
        ErrorCode.UNKNOWN_INSTRUCTION,
        `Unknown instruction: ${op}`,
        { op }
      );
    }
    
    // Execute
    const result = await handler(vmState, args || {});
    
    // Log (verbose)
    vmState.log.logInstruction(op, args, result);
    
    // Bind output
    if (out && result !== undefined) {
      if (Array.isArray(out)) {
        // Multiple outputs
        for (let i = 0; i < out.length; i++) {
          vmState.bindings.bind(out[i], result[i]);
        }
      } else {
        // Single output
        const value = result.fact || result.value || result;
        vmState.bindings.bind(out, value);
      }
    }
    
    // Handle special results
    if (op === 'BRANCH' || op === 'JUMP') {
      if (result) {
        return { _jump: result };
      }
    }
    
    if (op === 'RETURN') {
      return { _return: true, value: result.value };
    }
    
    if (op === 'CALL') {
      // Push call frame
      vmState.callStack.push({
        returnAddress: vmState.pc + 1,
        outVar: out
      });
      return { _jump: result.target };
    }
    
    // Track conflicts
    if (result && result.conflicts && result.conflicts.length > 0) {
      vmState.conflicts.push(...result.conflicts);
    }
    
    return result;
  }

  /**
   * Build label index from instructions
   */
  buildLabelIndex(instructions) {
    const labels = new Map();
    
    for (let i = 0; i < instructions.length; i++) {
      if (instructions[i].label) {
        labels.set(instructions[i].label, i);
      }
    }
    
    return labels;
  }

  /**
   * Build execution result
   */
  buildResult(vmState, executionMs) {
    const budgetUsage = vmState.budget.getUsage();
    
    // Determine mode
    let mode = ResponseMode.STRICT;
    if (vmState.conflicts.length > 0) {
      mode = ResponseMode.CONDITIONAL;
    }
    if (vmState.budget.isExhausted()) {
      mode = ResponseMode.INDETERMINATE;
    }
    
    // Build claims from results
    const claims = vmState.results.map((r, i) => 
      createClaim(`claim_${i}`, r.content || r, {
        confidence: mode === ResponseMode.STRICT ? 1.0 : 0.8,
        supportingFacts: r.supportingFacts || [],
        derivationTrace: vmState.log.createTraceRef(0, vmState.log.entries.length - 1)
      })
    );
    
    // Build conflict reports
    const conflictReports = vmState.conflicts.map((c, i) => ({
      conflictId: `conflict_${i}`,
      type: 'direct',
      facts: [c.factId],
      scopeId: vmState.contextStack.current.scopeId
    }));
    
    return createQueryResult({
      mode,
      budgetUsed: budgetUsage,
      claims,
      assumptions: [],
      conflicts: conflictReports,
      traceRefs: [vmState.log.createTraceRef(0, vmState.log.entries.length - 1)],
      executionMs
    });
  }
}

/**
 * Execute a program with given configuration
 * @param {Object} program
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function executeProgram(program, options = {}) {
  const executor = new Executor({
    strictMode: options.strictMode ?? true,
    traceLevel: options.traceLevel ?? 'standard'
  });
  
  const vmState = new VMState({
    budget: options.budget || new Budget(options.budgetLimits),
    factStore: options.factStore,
    canonicalizer: options.canonicalizer,
    traceLevel: options.traceLevel
  });
  
  return executor.execute(program, vmState, options.inputs);
}
