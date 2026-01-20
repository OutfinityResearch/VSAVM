/**
 * Strict Canonicalizer Strategy
 * Per DS006, DS007, DS008: Full normalization of terms
 * Implements term canonicalization with all normalizers
 */

import { CanonicalizerStrategy } from '../../core/interfaces/canonicalizer-strategy.mjs';
import { 
  AtomType, 
  termToString, 
  isAtom, 
  isStruct,
  stringAtom,
  numberAtom,
  integerAtom,
  booleanAtom,
  nullAtom,
  entityAtom,
  symbolAtom,
  timeAtom
} from '../../core/types/terms.mjs';
import { 
  symbolIdToString, 
  entityIdToString,
  createSymbolId
} from '../../core/types/identifiers.mjs';
import { sha256Truncate, base64urlEncode, computeHash } from '../../core/hash.mjs';
import { normalizeText, TEXT_NORMALIZE_DEFAULTS } from '../normalizers/text-normalizer.mjs';
import { normalizeNumber, canonicalNumberToString } from '../normalizers/number-normalizer.mjs';
import { normalizeTime, canonicalTimeToString, canonicalTimeToTimeRef } from '../normalizers/time-normalizer.mjs';

/**
 * Strict canonicalizer - full normalization
 * Per DS008 canonicalize_term algorithm
 */
export class StrictCanonicalizer extends CanonicalizerStrategy {
  /**
   * @param {Object} [options] - Canonicalization options
   */
  constructor(options = {}) {
    super('strict');
    this.options = {
      caseSensitive: false,
      stripPunctuation: true,
      normalizeWhitespace: true,
      numberPrecision: 6,
      timePrecision: 'second',
      ...options
    };
  }

  /**
   * Canonicalize a term per DS008 algorithm
   * @param {Object} term
   * @returns {Object} Canonical term
   */
  canonicalize(term) {
    if (!term) return term;

    if (isAtom(term)) {
      return this._canonicalizeAtom(term);
    }

    if (isStruct(term)) {
      return this._canonicalizeStruct(term);
    }

    // Unknown term type, return as-is
    return term;
  }

  /**
   * Check if two terms are canonically equivalent
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  areEquivalent(a, b) {
    const canonA = this.canonicalize(a);
    const canonB = this.canonicalize(b);
    return this.hash(canonA) === this.hash(canonB);
  }

  /**
   * Generate stable hash for canonical term
   * Per DS007/DS008: SHA-256 truncated to 16 bytes
   * @param {Object} term
   * @returns {string} Base64url encoded hash
   */
  hash(term) {
    const canonical = this.canonicalize(term);
    const serialized = this._serializeCanonical(canonical);
    const hashBytes = sha256Truncate(serialized, 16);
    return base64urlEncode(hashBytes);
  }

  /**
   * Canonicalize an atom
   * @private
   */
  _canonicalizeAtom(atom) {
    const { type, value } = atom;

    switch (type) {
      case AtomType.STRING: {
        const normalized = normalizeText(value, {
          caseSensitive: this.options.caseSensitive,
          stripPunctuation: this.options.stripPunctuation,
          normalizeWhitespace: this.options.normalizeWhitespace
        });
        return stringAtom(normalized);
      }

      case AtomType.NUMBER: {
        const canonical = normalizeNumber(value, null, {
          precision: this.options.numberPrecision
        });
        // Return with canonical value
        return canonical.type === 'finite'
          ? numberAtom(canonical.value)
          : numberAtom(value);  // NaN/Infinity unchanged
      }

      case AtomType.INTEGER:
        // Integers are already canonical
        return integerAtom(Math.floor(value));

      case AtomType.BOOLEAN:
        return booleanAtom(!!value);

      case AtomType.NULL:
        return nullAtom();

      case AtomType.TIME: {
        const canonical = normalizeTime(value, {
          defaultPrecision: this.options.timePrecision
        });
        return timeAtom(canonicalTimeToTimeRef(canonical));
      }

      case AtomType.ENTITY: {
        // Canonicalize EntityId
        const canonicalEntity = this._canonicalizeEntityId(value);
        return entityAtom(canonicalEntity);
      }

      case AtomType.SYMBOL: {
        // Canonicalize SymbolId
        const canonicalSymbol = this._canonicalizeSymbolId(value);
        return symbolAtom(canonicalSymbol);
      }

      default:
        // Unknown atom type, return as-is
        return atom;
    }
  }

  /**
   * Canonicalize a struct
   * @private
   */
  _canonicalizeStruct(struct) {
    // Canonicalize struct type
    const canonicalType = this._canonicalizeSymbolId(struct.structType);

    // Canonicalize all slots and sort by name
    const sortedSlots = new Map();
    const slotEntries = [];

    for (const [name, value] of struct.slots) {
      // Canonicalize slot name (per DS008: canonicalize_text for slot names)
      const canonicalName = normalizeText(name, {
        caseSensitive: true,  // Slot names preserve case
        stripPunctuation: false,
        normalizeWhitespace: true
      });
      const canonicalValue = this.canonicalize(value);
      slotEntries.push([canonicalName, canonicalValue]);
    }

    // Sort by slot name (lexicographic, per DS007)
    slotEntries.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, value] of slotEntries) {
      sortedSlots.set(name, value);
    }

    return {
      structType: canonicalType,
      slots: sortedSlots
    };
  }

  /**
   * Canonicalize a SymbolId
   * @private
   */
  _canonicalizeSymbolId(symbolId) {
    if (!symbolId) return symbolId;

    // Normalize namespace and name
    const namespace = normalizeText(symbolId.namespace, {
      caseSensitive: true,  // Namespaces are case-sensitive
      stripPunctuation: false,
      normalizeWhitespace: true
    });
    const name = normalizeText(symbolId.name, {
      caseSensitive: true,  // Names are case-sensitive
      stripPunctuation: false,
      normalizeWhitespace: true
    });

    return createSymbolId(namespace, name);
  }

  /**
   * Canonicalize an EntityId
   * @private
   */
  _canonicalizeEntityId(entityId) {
    if (!entityId) return entityId;

    return {
      source: normalizeText(entityId.source, {
        caseSensitive: true,
        stripPunctuation: false,
        normalizeWhitespace: true
      }),
      localId: normalizeText(entityId.localId, {
        caseSensitive: true,
        stripPunctuation: false,
        normalizeWhitespace: true
      }),
      version: entityId.version
    };
  }

  /**
   * Serialize canonical term to string for hashing
   * @private
   */
  _serializeCanonical(term) {
    if (!term) return 'null';

    if (isAtom(term)) {
      return this._serializeAtom(term);
    }

    if (isStruct(term)) {
      return this._serializeStruct(term);
    }

    return JSON.stringify(term);
  }

  /**
   * Serialize atom to deterministic string
   * @private
   */
  _serializeAtom(atom) {
    const { type, value } = atom;

    switch (type) {
      case AtomType.STRING:
        return `S:${value}`;
      case AtomType.NUMBER:
        return `N:${canonicalNumberToString(normalizeNumber(value))}`;
      case AtomType.INTEGER:
        return `I:${value}`;
      case AtomType.BOOLEAN:
        return `B:${value ? '1' : '0'}`;
      case AtomType.NULL:
        return 'NULL';
      case AtomType.TIME:
        return `T:${canonicalTimeToString(normalizeTime(value))}`;
      case AtomType.ENTITY:
        return `E:${entityIdToString(value)}`;
      case AtomType.SYMBOL:
        return `Y:${symbolIdToString(value)}`;
      default:
        return `?:${JSON.stringify(value)}`;
    }
  }

  /**
   * Serialize struct to deterministic string
   * @private
   */
  _serializeStruct(struct) {
    const typeStr = symbolIdToString(struct.structType);
    const slotStrs = [];

    // Slots are already sorted in canonical form
    for (const [name, value] of struct.slots) {
      slotStrs.push(`${name}=${this._serializeCanonical(value)}`);
    }

    return `{${typeStr}|${slotStrs.join(',')}}`; 
  }
}

export default StrictCanonicalizer;
