/**
 * Complexity Cost Calculator
 * Per DS003/DS008: Program description length component of MDL
 */

/**
 * Default complexity weights
 */
export const COMPLEXITY_WEIGHTS = {
  instructionBase: 1.0,        // Base cost per instruction
  uniqueSymbolCost: 0.5,       // Cost per unique symbol (vocabulary)
  nestingDepthCost: 0.3,       // Cost per nesting level
  macroBonusFactor: -0.2,      // Bonus (negative cost) per macro use
  variableCost: 0.1,           // Cost per variable binding
  literalCost: 0.2,            // Cost per literal value
  minCost: 0.1                 // Minimum complexity cost
};

/**
 * Complexity Cost Calculator
 * Computes the description length of a program
 */
export class ComplexityCostCalculator {
  /**
   * @param {Object} [weights]
   */
  constructor(weights = {}) {
    this.weights = { ...COMPLEXITY_WEIGHTS, ...weights };
  }

  /**
   * Compute total complexity cost for a program
   * Per DS008 compute_complexity_cost
   * @param {Object} program - Program to evaluate
   * @returns {number} - Complexity cost (lower is simpler)
   */
  compute(program) {
    let cost = 0;

    // Base: instruction count
    const instructionCount = this._countInstructions(program);
    cost += instructionCount * this.weights.instructionBase;

    // Vocabulary cost: unique symbols/entities
    const uniqueSymbols = this._countUniqueSymbols(program);
    cost += Math.log2(uniqueSymbols + 1) * this.weights.uniqueSymbolCost;

    // Nesting depth penalty
    const maxDepth = this._computeMaxNesting(program);
    cost += maxDepth * this.weights.nestingDepthCost;

    // Variable binding cost
    const variableCount = this._countVariables(program);
    cost += variableCount * this.weights.variableCost;

    // Literal value cost
    const literalCount = this._countLiterals(program);
    cost += literalCount * this.weights.literalCost;

    // Macro usage bonus (negative cost)
    const macroUses = this._countMacroCalls(program);
    cost += macroUses * this.weights.macroBonusFactor;

    // Floor at minimum
    return Math.max(cost, this.weights.minCost);
  }

  /**
   * Get detailed breakdown of complexity components
   * @param {Object} program
   * @returns {Object}
   */
  breakdown(program) {
    const instructionCount = this._countInstructions(program);
    const uniqueSymbols = this._countUniqueSymbols(program);
    const maxDepth = this._computeMaxNesting(program);
    const variableCount = this._countVariables(program);
    const literalCount = this._countLiterals(program);
    const macroUses = this._countMacroCalls(program);

    return {
      instructionCount,
      instructionCost: instructionCount * this.weights.instructionBase,
      uniqueSymbols,
      symbolCost: Math.log2(uniqueSymbols + 1) * this.weights.uniqueSymbolCost,
      maxDepth,
      depthCost: maxDepth * this.weights.nestingDepthCost,
      variableCount,
      variableCost: variableCount * this.weights.variableCost,
      literalCount,
      literalCost: literalCount * this.weights.literalCost,
      macroUses,
      macroBonus: macroUses * this.weights.macroBonusFactor,
      total: this.compute(program)
    };
  }

  /**
   * Count instructions in program
   * @private
   */
  _countInstructions(program) {
    if (!program) return 0;
    
    if (program.instructions && Array.isArray(program.instructions)) {
      return program.instructions.length;
    }
    if (program.program?.instructions) {
      return program.program.instructions.length;
    }
    if (typeof program.instructionCount === 'number') {
      return program.instructionCount;
    }
    return 0;
  }

  /**
   * Count unique symbols in program
   * @private
   */
  _countUniqueSymbols(program) {
    const symbols = new Set();

    const instructions = this._getInstructions(program);
    
    for (const instr of instructions) {
      // Collect predicate symbols
      if (instr.predicate) {
        symbols.add(this._symbolToString(instr.predicate));
      }
      // Collect from arguments
      if (instr.args) {
        for (const arg of Object.values(instr.args)) {
          if (this._isSymbol(arg)) {
            symbols.add(this._symbolToString(arg));
          }
        }
      }
      // Collect from operands
      if (instr.operands) {
        for (const op of instr.operands) {
          if (this._isSymbol(op)) {
            symbols.add(this._symbolToString(op));
          }
        }
      }
    }

    return symbols.size;
  }

  /**
   * Compute maximum nesting depth
   * @private
   */
  _computeMaxNesting(program) {
    const instructions = this._getInstructions(program);
    
    let maxDepth = 0;
    let currentDepth = 0;

    for (const instr of instructions) {
      const op = instr.opcode ?? instr.op;
      
      if (op === 'CALL' || op === 'PUSH_CONTEXT') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (op === 'RETURN' || op === 'POP_CONTEXT') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Count variable bindings
   * @private
   */
  _countVariables(program) {
    const variables = new Set();
    const instructions = this._getInstructions(program);

    for (const instr of instructions) {
      // Check for variable references (start with ?)
      const checkValue = (val) => {
        if (typeof val === 'string' && val.startsWith('?')) {
          variables.add(val);
        }
      };

      if (instr.args) {
        for (const arg of Object.values(instr.args)) {
          checkValue(arg);
        }
      }
      if (instr.operands) {
        for (const op of instr.operands) {
          checkValue(op);
        }
      }
      if (instr.target) {
        checkValue(instr.target);
      }
    }

    return variables.size;
  }

  /**
   * Count literal values
   * @private
   */
  _countLiterals(program) {
    let count = 0;
    const instructions = this._getInstructions(program);

    for (const instr of instructions) {
      const checkValue = (val) => {
        if (val === null || val === undefined) return;
        if (typeof val === 'number') count++;
        else if (typeof val === 'boolean') count++;
        else if (typeof val === 'string' && !val.startsWith('?')) count++;
        else if (typeof val === 'object' && val.type && val.value !== undefined) count++;
      };

      if (instr.args) {
        for (const arg of Object.values(instr.args)) {
          checkValue(arg);
        }
      }
      if (instr.operands) {
        for (const op of instr.operands) {
          checkValue(op);
        }
      }
      if (instr.value !== undefined) {
        checkValue(instr.value);
      }
    }

    return count;
  }

  /**
   * Count macro/subroutine calls
   * @private
   */
  _countMacroCalls(program) {
    const instructions = this._getInstructions(program);
    let count = 0;

    for (const instr of instructions) {
      const op = instr.opcode ?? instr.op;
      if (op === 'CALL' && instr.target) {
        // Check if it's a macro call (not a built-in)
        const target = instr.target;
        if (typeof target === 'string' && !target.startsWith('__builtin__')) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Get instructions array from program
   * @private
   */
  _getInstructions(program) {
    if (!program) return [];
    if (Array.isArray(program.instructions)) return program.instructions;
    if (program.program?.instructions) return program.program.instructions;
    return [];
  }

  /**
   * Check if value is a symbol
   * @private
   */
  _isSymbol(val) {
    if (!val) return false;
    if (typeof val === 'object' && val.namespace && val.name) return true;
    return false;
  }

  /**
   * Convert symbol to string
   * @private
   */
  _symbolToString(sym) {
    if (typeof sym === 'string') return sym;
    if (sym?.namespace && sym?.name) return `${sym.namespace}:${sym.name}`;
    return String(sym);
  }
}

/**
 * Create a complexity cost calculator
 * @param {Object} [weights]
 * @returns {ComplexityCostCalculator}
 */
export function createComplexityCostCalculator(weights = {}) {
  return new ComplexityCostCalculator(weights);
}

/**
 * Quick compute complexity cost
 * @param {Object} program
 * @param {Object} [weights]
 * @returns {number}
 */
export function computeComplexityCost(program, weights = {}) {
  const calc = new ComplexityCostCalculator(weights);
  return calc.compute(program);
}

export default {
  ComplexityCostCalculator,
  createComplexityCostCalculator,
  computeComplexityCost,
  COMPLEXITY_WEIGHTS
};
