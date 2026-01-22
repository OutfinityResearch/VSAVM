/**
 * Canonical Service
 * Per DS006: High-level facade for term canonicalization
 * Provides unified interface for all canonicalization operations
 */

import { StrictCanonicalizer } from './strategies/strict-canonical.mjs';
import { IdentityCanonicalizer } from './strategies/identity-canonical.mjs';
import { normalizeText } from './normalizers/text-normalizer.mjs';
import { normalizeNumber } from './normalizers/number-normalizer.mjs';
import { normalizeTime } from './normalizers/time-normalizer.mjs';
import { resolveEntity } from './normalizers/entity-resolver.mjs';
import { VSAVMError, ErrorCode } from '../core/errors.mjs';
import { isAtom, isStruct } from '../core/types/terms.mjs';

/**
 * Available canonicalizer strategies
 */
const STRATEGIES = {
  strict: StrictCanonicalizer,
  identity: IdentityCanonicalizer
};

/**
 * Canonical Service - facade for term → canonical form
 */
export class CanonicalService {
  /**
   * @param {Object} [options] - Service options
   * @param {string} [options.strategy='strict'] - Default strategy name
   * @param {Object} [options.strategyOptions] - Options for the strategy
   */
  constructor(options = {}) {
    this.options = {
      strategy: 'strict',
      strategyOptions: {},
      ...options
    };

    // Initialize default canonicalizer
    this._canonicalizer = this._createCanonicalizer(
      this.options.strategy,
      this.options.strategyOptions
    );

    // Cache of registered strategies
    this._strategies = new Map();
    this._strategies.set('strict', this._canonicalizer);
  }

  /**
   * Canonicalize a term using the default strategy
   * @param {Object} term - Term to canonicalize
   * @returns {Object} Canonical term
   */
  canonicalize(term) {
    return this._canonicalizer.canonicalize(term);
  }

  /**
   * Canonicalize a term using a specific strategy
   * @param {Object} term - Term to canonicalize
   * @param {string} strategyName - Strategy name
   * @returns {Object} Canonical term
   */
  canonicalizeWith(term, strategyName) {
    const strategy = this._getOrCreateStrategy(strategyName);
    return strategy.canonicalize(term);
  }

  /**
   * Check if two terms are canonically equivalent
   * @param {Object} a - First term
   * @param {Object} b - Second term
   * @returns {boolean}
   */
  areEquivalent(a, b) {
    return this._canonicalizer.areEquivalent(a, b);
  }

  /**
   * Generate hash for a term
   * @param {Object} term - Term to hash
   * @returns {string} Hash string
   */
  hash(term) {
    return this._canonicalizer.hash(term);
  }

  /**
   * Normalize text directly
   * @param {string} text - Text to normalize
   * @param {Object} [options] - Normalization options
   * @returns {string} Normalized text
   */
  normalizeText(text, options = {}) {
    return normalizeText(text, {
      ...this.options.strategyOptions,
      ...options
    });
  }

  /**
   * Normalize number directly
   * @param {number} value - Number to normalize
   * @param {string} [unit] - Optional unit
   * @param {Object} [options] - Normalization options
   * @returns {Object} Canonical number
   */
  normalizeNumber(value, unit = null, options = {}) {
    return normalizeNumber(value, unit, {
      ...this.options.strategyOptions,
      ...options
    });
  }

  /**
   * Normalize time directly
   * @param {Object} timeRef - TimeRef to normalize
   * @param {Object} [options] - Normalization options
   * @returns {Object} Canonical time
   */
  normalizeTime(timeRef, options = {}) {
    return normalizeTime(timeRef, {
      ...this.options.strategyOptions,
      ...options
    });
  }

  /**
   * Resolve an entity mention against candidates.
   * @param {string} mention
   * @param {Object} context
   * @param {Array} candidates
   * @param {Object} [options]
   * @returns {Object}
   */
  resolveEntity(mention, context = {}, candidates = [], options = {}) {
    return resolveEntity(mention, context, candidates, options);
  }

  /**
   * Set the default canonicalization strategy
   * @param {string} strategyName - Strategy name
   * @param {Object} [options] - Strategy options
   */
  setStrategy(strategyName, options = {}) {
    this._canonicalizer = this._getOrCreateStrategy(strategyName, options);
    this.options.strategy = strategyName;
  }

  /**
   * Get current strategy name
   * @returns {string}
   */
  getStrategyName() {
    return this._canonicalizer.name;
  }

  /**
   * Validate a term can be canonicalized
   * @param {Object} term - Term to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate(term) {
    const errors = [];

    if (!term) {
      errors.push('Term is null or undefined');
      return { valid: false, errors };
    }

    if (!isAtom(term) && !isStruct(term)) {
      errors.push('Term must be an Atom or Struct');
    }

    if (isAtom(term)) {
      if (!term.type) {
        errors.push('Atom must have a type');
      }
      if (!('value' in term)) {
        errors.push('Atom must have a value');
      }
    }

    if (isStruct(term)) {
      if (!term.structType) {
        errors.push('Struct must have a structType');
      }
      if (!(term.slots instanceof Map)) {
        errors.push('Struct slots must be a Map');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Canonicalize with validation
   * @param {Object} term - Term to canonicalize
   * @returns {Object} Canonical term
   * @throws {VSAVMError} If term is invalid
   */
  canonicalizeSafe(term) {
    const validation = this.validate(term);
    if (!validation.valid) {
      throw new VSAVMError(
        ErrorCode.CANONICALIZATION_FAILED,
        `Canonicalization failed: ${validation.errors.join(', ')}`,
        { term, errors: validation.errors }
      );
    }
    return this.canonicalize(term);
  }

  /**
   * Create a canonicalizer instance
   * @private
   */
  _createCanonicalizer(strategyName, options = {}) {
    const StrategyClass = STRATEGIES[strategyName];
    if (!StrategyClass) {
      throw new VSAVMError(
        ErrorCode.INVALID_INPUT,
        `Unknown canonicalizer strategy: ${strategyName}`,
        { availableStrategies: Object.keys(STRATEGIES) }
      );
    }
    return new StrategyClass(options);
  }

  /**
   * Get or create a strategy by name
   * @private
   */
  _getOrCreateStrategy(strategyName, options = {}) {
    const cacheKey = `${strategyName}:${JSON.stringify(options)}`;
    
    if (!this._strategies.has(cacheKey)) {
      const strategy = this._createCanonicalizer(strategyName, options);
      this._strategies.set(cacheKey, strategy);
    }
    
    return this._strategies.get(cacheKey);
  }
}

/**
 * Create a canonical service with default configuration
 * @param {Object} [options]
 * @returns {CanonicalService}
 */
export function createCanonicalService(options = {}) {
  return new CanonicalService(options);
}

export default CanonicalService;
