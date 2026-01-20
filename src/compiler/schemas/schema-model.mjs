/**
 * Schema Model
 * Per DS003/DS007: Query schema representation for compilation
 * Schemas map linguistic patterns to executable VM programs
 */

import { createSymbolId, symbolIdToString } from '../../core/types/identifiers.mjs';
import { computeHash } from '../../core/hash.mjs';

/**
 * Slot types for schema slots (per DS007)
 */
export const SlotType = {
  ENTITY: 'entity',
  FACT_PATTERN: 'fact_pattern',
  PREDICATE: 'predicate',
  TERM: 'term',
  NUMBER: 'number',
  STRING: 'string',
  TIME: 'time',
  SCOPE: 'scope'
};

/**
 * Output kinds for schema output contract
 */
export const OutputKind = {
  VERDICT: 'verdict',
  ENTITY_LIST: 'entity_list',
  FACT_LIST: 'fact_list',
  EXPLANATION: 'explanation'
};

/**
 * Response modes for output contract
 */
export const OutputMode = {
  STRICT_ONLY: 'strict_only',
  STRICT_OR_CONDITIONAL: 'strict_or_conditional',
  ANY: 'any'
};

/**
 * Create a schema slot definition
 * @param {string} name - Slot name
 * @param {string} type - Slot type from SlotType
 * @param {Object} [options] - Additional options
 * @returns {Object} SchemaSlot
 */
export function createSchemaSlot(name, type, options = {}) {
  return {
    name,
    type,
    required: options.required ?? true,
    defaultValue: options.defaultValue ?? null,
    constraints: options.constraints ?? []
  };
}

/**
 * Create a schema trigger definition
 * @param {Object} [options] - Trigger options
 * @returns {Object} SchemaTrigger
 */
export function createSchemaTrigger(options = {}) {
  return {
    vsaKey: options.vsaKey ?? null,
    requiredFeatures: options.requiredFeatures ?? [],
    minSimilarity: options.minSimilarity ?? 0.35,
    keywords: options.keywords ?? []
  };
}

/**
 * Create an output contract definition
 * @param {string} kind - Output kind from OutputKind
 * @param {string} [mode] - Output mode from OutputMode
 * @returns {Object} OutputContract
 */
export function createOutputContract(kind, mode = OutputMode.STRICT_OR_CONDITIONAL) {
  return { kind, mode };
}

/**
 * Create schema telemetry (mutable stats)
 * @returns {Object} SchemaTelemetry
 */
export function createSchemaTelemetry() {
  return {
    retrievalCount: 0,
    successCount: 0,
    ambiguityRate: 0,
    closureFailureRate: 0,
    avgExecutionMs: 0,
    lastUsed: null
  };
}

/**
 * QuerySchema class - represents a learned query-to-program mapping
 */
export class QuerySchema {
  /**
   * @param {Object} config - Schema configuration
   * @param {string} config.schemaId - Unique identifier
   * @param {string} [config.name] - Human-readable name
   * @param {number} [config.version] - Schema version
   * @param {Object} config.trigger - Retrieval trigger
   * @param {Array} config.slots - Typed slots
   * @param {Array} config.programTemplate - VM instruction template
   * @param {Object} config.outputContract - Output specification
   */
  constructor(config) {
    this.schemaId = config.schemaId;
    this.name = config.name ?? null;
    this.version = config.version ?? 1;
    this.trigger = config.trigger ?? createSchemaTrigger();
    this.slots = config.slots ?? [];
    this.programTemplate = config.programTemplate ?? [];
    this.outputContract = config.outputContract ?? createOutputContract(OutputKind.VERDICT);
    this.telemetry = config.telemetry ?? createSchemaTelemetry();
  }

  /**
   * Get a slot by name
   * @param {string} name
   * @returns {Object|null}
   */
  getSlot(name) {
    return this.slots.find(s => s.name === name) ?? null;
  }

  /**
   * Get all required slots
   * @returns {Array}
   */
  getRequiredSlots() {
    return this.slots.filter(s => s.required);
  }

  /**
   * Get all optional slots
   * @returns {Array}
   */
  getOptionalSlots() {
    return this.slots.filter(s => !s.required);
  }

  /**
   * Check if schema has all required slots filled in bindings
   * @param {Map<string, any>} bindings
   * @returns {boolean}
   */
  hasRequiredBindings(bindings) {
    for (const slot of this.getRequiredSlots()) {
      if (!bindings.has(slot.name) && slot.defaultValue === null) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validate slot bindings against schema
   * @param {Map<string, any>} bindings
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateBindings(bindings) {
    const errors = [];

    for (const slot of this.slots) {
      const value = bindings.get(slot.name);

      // Check required
      if (slot.required && value === undefined && slot.defaultValue === null) {
        errors.push(`Required slot '${slot.name}' is not bound`);
        continue;
      }

      // Skip type check if no value
      if (value === undefined) continue;

      // Type validation
      if (!this._validateSlotType(value, slot.type)) {
        errors.push(`Slot '${slot.name}' has invalid type: expected ${slot.type}`);
      }

      // Constraint validation
      for (const constraint of slot.constraints) {
        if (!this._validateConstraint(value, constraint)) {
          errors.push(`Slot '${slot.name}' violates constraint: ${constraint.description ?? constraint.type}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Record a retrieval attempt
   * @param {boolean} success
   * @param {boolean} ambiguous
   * @param {number} executionMs
   */
  recordUsage(success, ambiguous, executionMs) {
    this.telemetry.retrievalCount++;
    if (success) this.telemetry.successCount++;
    
    // Update running averages
    const n = this.telemetry.retrievalCount;
    this.telemetry.ambiguityRate = 
      ((n - 1) * this.telemetry.ambiguityRate + (ambiguous ? 1 : 0)) / n;
    this.telemetry.avgExecutionMs = 
      ((n - 1) * this.telemetry.avgExecutionMs + executionMs) / n;
    this.telemetry.lastUsed = Date.now();
  }

  /**
   * Record a closure failure
   */
  recordClosureFailure() {
    const n = this.telemetry.retrievalCount;
    this.telemetry.closureFailureRate = 
      ((n - 1) * this.telemetry.closureFailureRate + 1) / n;
  }

  /**
   * Compute schema hash for identity
   * @returns {string}
   */
  computeHash() {
    const identity = JSON.stringify({
      schemaId: this.schemaId,
      version: this.version,
      slots: this.slots,
      programTemplate: this.programTemplate
    });
    return computeHash(identity);
  }

  /**
   * Convert to JSON representation
   * @returns {Object}
   */
  toJSON() {
    return {
      schemaId: this.schemaId,
      name: this.name,
      version: this.version,
      trigger: this.trigger,
      slots: this.slots,
      programTemplate: this.programTemplate,
      outputContract: this.outputContract,
      telemetry: this.telemetry
    };
  }

  /**
   * Create schema from JSON
   * @param {Object} json
   * @returns {QuerySchema}
   */
  static fromJSON(json) {
    return new QuerySchema(json);
  }

  /**
   * Validate slot type
   * @private
   */
  _validateSlotType(value, type) {
    switch (type) {
      case SlotType.STRING:
        return typeof value === 'string' || 
          (value?.type === 'string');
      case SlotType.NUMBER:
        return typeof value === 'number' || 
          (value?.type === 'number') || 
          (value?.type === 'integer');
      case SlotType.ENTITY:
        return value?.source !== undefined && value?.localId !== undefined;
      case SlotType.PREDICATE:
        return value?.namespace !== undefined && value?.name !== undefined;
      case SlotType.TIME:
        return value?.type === 'instant' || 
          value?.type === 'interval' || 
          value?.type === 'relative' ||
          value?.type === 'unknown';
      case SlotType.SCOPE:
        return Array.isArray(value?.path);
      case SlotType.TERM:
      case SlotType.FACT_PATTERN:
        return value !== undefined;
      default:
        return true;
    }
  }

  /**
   * Validate a constraint
   * @private
   */
  _validateConstraint(value, constraint) {
    switch (constraint.type) {
      case 'min':
        return value >= constraint.value;
      case 'max':
        return value <= constraint.value;
      case 'pattern':
        return new RegExp(constraint.value).test(String(value));
      case 'enum':
        return constraint.values.includes(value);
      case 'notNull':
        return value !== null && value !== undefined;
      default:
        return true;
    }
  }
}

/**
 * Create a new QuerySchema
 * @param {Object} config
 * @returns {QuerySchema}
 */
export function createQuerySchema(config) {
  return new QuerySchema(config);
}

export default {
  QuerySchema,
  createQuerySchema,
  createSchemaSlot,
  createSchemaTrigger,
  createOutputContract,
  createSchemaTelemetry,
  SlotType,
  OutputKind,
  OutputMode
};
