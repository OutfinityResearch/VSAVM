/**
 * Fuzzy canonicalizer
 * A slightly more tolerant canonicalizer profile (still deterministic).
 */

import { CanonicalizerStrategy } from '../interfaces/canonicalizer-strategy.mjs';
import { termsEqual } from '../types/terms.mjs';
import { sha256Truncate, base64urlEncode } from '../hash.mjs';
import { DEFAULT_CONFIG } from '../config/config-schema.mjs';
import { canonicalizeTerm, serializeCanonicalTerm } from './canonicalize.mjs';

export class FuzzyCanonicalizer extends CanonicalizerStrategy {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    super('fuzzy');
    this.options = {
      ...DEFAULT_CONFIG.canonicalization,
      ...options,
      caseSensitive: false,
      normalizeWhitespace: true
    };
  }

  canonicalize(term) {
    return canonicalizeTerm(term, this.options);
  }

  areEquivalent(a, b) {
    return termsEqual(this.canonicalize(a), this.canonicalize(b));
  }

  hash(term) {
    const serialized = serializeCanonicalTerm(term, this.options);
    const bytes = sha256Truncate(serialized, 16);
    return base64urlEncode(bytes);
  }
}

