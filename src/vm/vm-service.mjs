/**
 * VM Service - High-level facade for VM operations
 * Per DS006: Facade that validates and executes programs
 */

import { Executor, VMState } from './executor.mjs';
import { Budget } from './budget.mjs';
import { BindingEnv } from './state/binding-env.mjs';
import { ContextStack } from './state/context-stack.mjs';
import { ExecutionLog } from './state/execution-log.mjs';
import { FactStore } from './state/fact-store.mjs';
import { ExecutionError, ErrorCode } from '../core/errors.mjs';

/**
 * VM Service provides high-level program execution
 */
export class VMService {
  /**
   * @param {Object} storage - StorageStrategy implementation
   * @param {Object} [options]
   */
  constructor(storage, options = {}) {
    this.storage = storage;
    this.options = {
      strictMode: options.strictMode ?? true,
      traceLevel: options.traceLevel ?? 'standard',
      defaultBudget: options.defaultBudget ?? {}
    };
    
    this.executor = new Executor({
      strictMode: this.options.strictMode,
      traceLevel: this.options.traceLevel
    });
    
    this.canonicalizer = options.canonicalizer || null;
  }

  /**
   * Create a fresh VM state
   * @param {Object} [budgetLimits]
   * @returns {VMState}
   */
  createState(budgetLimits) {
    const contextStack = new ContextStack();
    
    return new VMState({
      budget: new Budget({ ...this.options.defaultBudget, ...budgetLimits }),
      bindings: new BindingEnv(),
      contextStack,
      log: new ExecutionLog({ level: this.options.traceLevel }),
      factStore: new FactStore(this.storage, contextStack),
      canonicalizer: this.canonicalizer
    });
  }

  /**
   * Validate a program
   * @param {Object} program
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateProgram(program) {
    const errors = [];
    
    if (!program) {
      errors.push('Program is null or undefined');
      return { valid: false, errors };
    }
    
    if (!program.instructions || !Array.isArray(program.instructions)) {
      errors.push('Program must have instructions array');
      return { valid: false, errors };
    }
    
    const validOps = new Set([
      'MAKE_TERM', 'CANONICALIZE', 'BIND_SLOTS',
      'ASSERT', 'DENY', 'QUERY',
      'MATCH', 'APPLY_RULE', 'CLOSURE',
      'BRANCH', 'JUMP', 'CALL', 'RETURN',
      'PUSH_CONTEXT', 'POP_CONTEXT', 'MERGE_CONTEXT', 'ISOLATE_CONTEXT',
      'COUNT', 'FILTER', 'MAP', 'REDUCE',
      'INFER'  // Add inference operation
    ]);
    
    const labels = new Set();
    const usedLabels = new Set();
    
    for (let i = 0; i < program.instructions.length; i++) {
      const instr = program.instructions[i];
      
      if (!instr.op) {
        errors.push(`Instruction ${i}: missing op`);
        continue;
      }
      
      if (!validOps.has(instr.op)) {
        errors.push(`Instruction ${i}: unknown op '${instr.op}'`);
      }
      
      if (instr.label) {
        if (labels.has(instr.label)) {
          errors.push(`Instruction ${i}: duplicate label '${instr.label}'`);
        }
        labels.add(instr.label);
      }
      
      // Track label usage
      if (instr.op === 'BRANCH') {
        if (instr.args?.then) usedLabels.add(instr.args.then);
        if (instr.args?.else) usedLabels.add(instr.args.else);
      }
      if (instr.op === 'JUMP' && instr.args?.label) {
        usedLabels.add(instr.args.label);
      }
      if (instr.op === 'CALL' && instr.args?.target) {
        usedLabels.add(instr.args.target);
      }
    }
    
    // Check for undefined labels
    for (const label of usedLabels) {
      if (!labels.has(label)) {
        errors.push(`Undefined label: '${label}'`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute a program
   * @param {Object} program
   * @param {Object} [options]
   * @returns {Promise<Object>} QueryResult
   */
  async execute(program, options = {}) {
    // Validate
    const validation = this.validateProgram(program);
    if (!validation.valid) {
      throw new ExecutionError(
        ErrorCode.INVALID_INPUT,
        `Invalid program: ${validation.errors.join(', ')}`,
        { errors: validation.errors }
      );
    }
    
    // Create state
    const vmState = this.createState(options.budget);
    
    // Execute
    return this.executor.execute(program, vmState, options.inputs || {});
  }

  /**
   * Execute a single instruction (for REPL/debugging)
   * @param {Object} instruction
   * @param {VMState} vmState
   * @returns {Promise<*>}
   */
  async executeOne(instruction, vmState) {
    const labels = new Map();
    if (instruction.label) {
      labels.set(instruction.label, 0);
    }
    
    return this.executor.executeInstruction(instruction, vmState, labels);
  }

  /**
   * Execute a list of instructions sequentially
   * @param {Object[]} instructions
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async executeInstructions(instructions, options = {}) {
    const program = {
      programId: `inline_${Date.now()}`,
      instructions,
      metadata: {
        compiledAt: Date.now(),
        estimatedSteps: instructions.length,
        estimatedBranches: 0,
        tracePolicy: 'full'
      }
    };
    
    return this.execute(program, options);
  }

  /**
   * Create a snapshot of current storage state
   * @returns {Promise<string>}
   */
  async createSnapshot() {
    return this.storage.createSnapshot();
  }

  /**
   * Restore storage from snapshot
   * @param {string} snapshotId
   */
  async restoreSnapshot(snapshotId) {
    return this.storage.restoreSnapshot(snapshotId);
  }

  /**
   * Get fact count
   * @returns {Promise<number>}
   */
  async getFactCount() {
    return this.storage.count();
  }
}
