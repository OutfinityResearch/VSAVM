/**
 * Program IR (Intermediate Representation)
 * Per DS003/DS007: Executable program representation for the VM
 */

import { computeHash } from '../../core/hash.mjs';

/**
 * OpCode enumeration (per DS007)
 */
export const OpCode = {
  // Term ops
  MAKE_TERM: 'MAKE_TERM',
  CANONICALIZE: 'CANONICALIZE',
  BIND_SLOTS: 'BIND_SLOTS',
  
  // Fact ops
  ASSERT: 'ASSERT',
  DENY: 'DENY',
  QUERY: 'QUERY',
  
  // Logic ops
  MATCH: 'MATCH',
  APPLY_RULE: 'APPLY_RULE',
  CLOSURE: 'CLOSURE',
  
  // Control ops
  BRANCH: 'BRANCH',
  JUMP: 'JUMP',
  CALL: 'CALL',
  RETURN: 'RETURN',
  
  // Context ops
  PUSH_CONTEXT: 'PUSH_CONTEXT',
  POP_CONTEXT: 'POP_CONTEXT',
  MERGE_CONTEXT: 'MERGE_CONTEXT',
  ISOLATE_CONTEXT: 'ISOLATE_CONTEXT',
  
  // Built-in functions
  COUNT: 'COUNT',
  FILTER: 'FILTER',
  MAP: 'MAP',
  REDUCE: 'REDUCE'
};

/**
 * Instruction argument types
 */
export const ArgType = {
  LITERAL: 'literal',
  BINDING: 'binding',
  SLOT: 'slot',
  LABEL: 'label'
};

/**
 * Trace policy levels
 */
export const TracePolicy = {
  NONE: 'none',
  MINIMAL: 'minimal',
  FULL: 'full'
};

/**
 * Create an instruction argument
 * @param {string} type - ArgType value
 * @param {*} value - Argument value
 * @returns {Object} InstructionArg
 */
export function createArg(type, value) {
  switch (type) {
    case ArgType.LITERAL:
      return { type: ArgType.LITERAL, value };
    case ArgType.BINDING:
      return { type: ArgType.BINDING, name: value };
    case ArgType.SLOT:
      return { type: ArgType.SLOT, name: value };
    case ArgType.LABEL:
      return { type: ArgType.LABEL, name: value };
    default:
      return { type, value };
  }
}

/**
 * Create a literal argument
 */
export function literal(value) {
  return createArg(ArgType.LITERAL, value);
}

/**
 * Create a binding reference argument
 */
export function binding(name) {
  return createArg(ArgType.BINDING, name);
}

/**
 * Create a slot reference argument
 */
export function slot(name) {
  return createArg(ArgType.SLOT, name);
}

/**
 * Create a label reference argument
 */
export function label(name) {
  return createArg(ArgType.LABEL, name);
}

/**
 * Create an instruction
 * @param {string} op - OpCode
 * @param {Object} [args] - Instruction arguments
 * @param {string|string[]} [out] - Output binding name(s)
 * @param {string} [labelName] - Optional label for this instruction
 * @returns {Object} Instruction
 */
export function createInstruction(op, args = {}, out = null, labelName = null) {
  const instruction = { op, args };
  if (out !== null) instruction.out = out;
  if (labelName !== null) instruction.label = labelName;
  return instruction;
}

/**
 * Program metadata
 */
export function createProgramMetadata(options = {}) {
  return {
    sourceSchemaId: options.sourceSchemaId ?? null,
    compiledAt: options.compiledAt ?? Date.now(),
    estimatedSteps: options.estimatedSteps ?? 0,
    estimatedBranches: options.estimatedBranches ?? 0,
    tracePolicy: options.tracePolicy ?? TracePolicy.MINIMAL
  };
}

/**
 * Program class - executable artifact for the VM
 */
export class Program {
  /**
   * @param {Object} config
   * @param {string} [config.programId] - Unique identifier
   * @param {Array} config.instructions - Ordered instruction list
   * @param {Object} [config.metadata] - Program metadata
   */
  constructor(config) {
    this.programId = config.programId ?? this._generateId();
    this.instructions = config.instructions ?? [];
    this.metadata = config.metadata ?? createProgramMetadata();
    
    // Build label index
    this._labelIndex = new Map();
    this._buildLabelIndex();
  }

  /**
   * Generate a program ID
   * @private
   */
  _generateId() {
    return `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Build label → instruction index mapping
   * @private
   */
  _buildLabelIndex() {
    for (let i = 0; i < this.instructions.length; i++) {
      const instr = this.instructions[i];
      if (instr.label) {
        this._labelIndex.set(instr.label, i);
      }
    }
  }

  /**
   * Get instruction by index
   * @param {number} index
   * @returns {Object|null}
   */
  getInstruction(index) {
    return this.instructions[index] ?? null;
  }

  /**
   * Get instruction index by label
   * @param {string} labelName
   * @returns {number} Index or -1 if not found
   */
  getLabelIndex(labelName) {
    return this._labelIndex.get(labelName) ?? -1;
  }

  /**
   * Get instruction count
   * @returns {number}
   */
  get length() {
    return this.instructions.length;
  }

  /**
   * Add an instruction
   * @param {Object} instruction
   * @returns {number} Index of added instruction
   */
  addInstruction(instruction) {
    const index = this.instructions.length;
    this.instructions.push(instruction);
    
    if (instruction.label) {
      this._labelIndex.set(instruction.label, index);
    }
    
    return index;
  }

  /**
   * Insert an instruction at index
   * @param {number} index
   * @param {Object} instruction
   */
  insertInstruction(index, instruction) {
    this.instructions.splice(index, 0, instruction);
    this._buildLabelIndex();  // Rebuild index
  }

  /**
   * Remove instruction at index
   * @param {number} index
   * @returns {Object|null} Removed instruction
   */
  removeInstruction(index) {
    const removed = this.instructions.splice(index, 1)[0];
    this._buildLabelIndex();  // Rebuild index
    return removed ?? null;
  }

  /**
   * Replace instruction at index
   * @param {number} index
   * @param {Object} instruction
   * @returns {Object|null} Previous instruction
   */
  replaceInstruction(index, instruction) {
    const previous = this.instructions[index];
    this.instructions[index] = instruction;
    this._buildLabelIndex();
    return previous ?? null;
  }

  /**
   * Validate program structure
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    for (let i = 0; i < this.instructions.length; i++) {
      const instr = this.instructions[i];

      // Check op is valid
      if (!Object.values(OpCode).includes(instr.op)) {
        errors.push(`Instruction ${i}: Unknown opcode '${instr.op}'`);
      }

      // Check label references exist
      if (instr.op === OpCode.JUMP || instr.op === OpCode.BRANCH) {
        const targets = instr.op === OpCode.BRANCH 
          ? [instr.args.then, instr.args.else].filter(Boolean)
          : [instr.args.target].filter(Boolean);

        for (const target of targets) {
          if (target?.type === ArgType.LABEL && !this._labelIndex.has(target.name)) {
            errors.push(`Instruction ${i}: Unknown label '${target.name}'`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Estimate execution cost
   * Updates metadata.estimatedSteps
   * @returns {number}
   */
  estimateCost() {
    let cost = 0;
    let branches = 0;

    for (const instr of this.instructions) {
      switch (instr.op) {
        case OpCode.MAKE_TERM:
          cost += 1;
          break;
        case OpCode.CANONICALIZE:
          cost += 2;
          break;
        case OpCode.ASSERT:
          cost += 3;
          break;
        case OpCode.DENY:
          cost += 2;
          break;
        case OpCode.QUERY:
          cost += 5;
          break;
        case OpCode.MATCH:
          cost += 2;
          break;
        case OpCode.APPLY_RULE:
          cost += 5;
          break;
        case OpCode.CLOSURE:
          cost += 10;  // Variable, but estimate
          break;
        case OpCode.BRANCH:
          cost += 1;
          branches += 1;
          break;
        case OpCode.PUSH_CONTEXT:
        case OpCode.POP_CONTEXT:
          cost += 1;
          break;
        case OpCode.MERGE_CONTEXT:
          cost += 3;
          break;
        default:
          cost += 1;
      }
    }

    this.metadata.estimatedSteps = cost;
    this.metadata.estimatedBranches = branches;
    return cost;
  }

  /**
   * Compute program hash for identity/caching
   * @returns {string}
   */
  computeHash() {
    const content = JSON.stringify(this.instructions);
    return computeHash(content);
  }

  /**
   * Clone the program
   * @returns {Program}
   */
  clone() {
    return new Program({
      programId: this._generateId(),
      instructions: JSON.parse(JSON.stringify(this.instructions)),
      metadata: { ...this.metadata, compiledAt: Date.now() }
    });
  }

  /**
   * Convert to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      programId: this.programId,
      instructions: this.instructions,
      metadata: this.metadata
    };
  }

  /**
   * Create from JSON
   * @param {Object} json
   * @returns {Program}
   */
  static fromJSON(json) {
    return new Program(json);
  }
}

/**
 * Create a new program
 * @param {Object} config
 * @returns {Program}
 */
export function createProgram(config = {}) {
  return new Program(config);
}

/**
 * Program builder for fluent construction
 */
export class ProgramBuilder {
  constructor() {
    this._instructions = [];
    this._metadata = {};
  }

  /**
   * Add MAKE_TERM instruction
   */
  makeTerm(args, out) {
    this._instructions.push(createInstruction(OpCode.MAKE_TERM, args, out));
    return this;
  }

  /**
   * Add CANONICALIZE instruction
   */
  canonicalize(input, out) {
    this._instructions.push(createInstruction(OpCode.CANONICALIZE, { input: binding(input) }, out));
    return this;
  }

  /**
   * Add QUERY instruction
   */
  query(pattern, out) {
    const args = typeof pattern === 'string' 
      ? { pattern: binding(pattern) }
      : { pattern: literal(pattern) };
    this._instructions.push(createInstruction(OpCode.QUERY, args, out));
    return this;
  }

  /**
   * Add ASSERT instruction
   */
  assert(fact) {
    const args = typeof fact === 'string'
      ? { fact: binding(fact) }
      : { fact: literal(fact) };
    this._instructions.push(createInstruction(OpCode.ASSERT, args));
    return this;
  }

  /**
   * Add BRANCH instruction
   */
  branch(condition, thenLabel, elseLabel) {
    this._instructions.push(createInstruction(OpCode.BRANCH, {
      condition: typeof condition === 'string' ? binding(condition) : literal(condition),
      then: label(thenLabel),
      else: label(elseLabel)
    }));
    return this;
  }

  /**
   * Add labeled instruction
   */
  label(name) {
    // Add a no-op with label (will be attached to next instruction)
    this._nextLabel = name;
    return this;
  }

  /**
   * Add JUMP instruction
   */
  jump(targetLabel) {
    this._instructions.push(createInstruction(OpCode.JUMP, { target: label(targetLabel) }));
    return this;
  }

  /**
   * Add RETURN instruction
   */
  return_(value) {
    const args = value !== undefined
      ? { value: typeof value === 'string' ? binding(value) : literal(value) }
      : {};
    this._instructions.push(createInstruction(OpCode.RETURN, args));
    return this;
  }

  /**
   * Add PUSH_CONTEXT instruction
   */
  pushContext(mode = 'inherit') {
    this._instructions.push(createInstruction(OpCode.PUSH_CONTEXT, { mode: literal(mode) }));
    return this;
  }

  /**
   * Add POP_CONTEXT instruction
   */
  popContext() {
    this._instructions.push(createInstruction(OpCode.POP_CONTEXT, {}));
    return this;
  }

  /**
   * Add COUNT instruction
   */
  count(input, out) {
    this._instructions.push(createInstruction(OpCode.COUNT, { input: binding(input) }, out));
    return this;
  }

  /**
   * Add FILTER instruction
   */
  filter(input, predicate, out) {
    this._instructions.push(createInstruction(OpCode.FILTER, {
      input: binding(input),
      predicate: literal(predicate)
    }, out));
    return this;
  }

  /**
   * Set metadata
   */
  withMetadata(metadata) {
    this._metadata = { ...this._metadata, ...metadata };
    return this;
  }

  /**
   * Build the program
   * @returns {Program}
   */
  build() {
    // Attach pending label to last instruction
    if (this._nextLabel && this._instructions.length > 0) {
      this._instructions[this._instructions.length - 1].label = this._nextLabel;
    }

    const program = createProgram({
      instructions: this._instructions,
      metadata: createProgramMetadata(this._metadata)
    });

    program.estimateCost();
    return program;
  }
}

/**
 * Create a program builder
 * @returns {ProgramBuilder}
 */
export function programBuilder() {
  return new ProgramBuilder();
}

export default {
  Program,
  createProgram,
  ProgramBuilder,
  programBuilder,
  createInstruction,
  createArg,
  createProgramMetadata,
  literal,
  binding,
  slot,
  label,
  OpCode,
  ArgType,
  TracePolicy
};
