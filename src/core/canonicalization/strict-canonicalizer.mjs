/**
 * Strict canonicalizer
 * Per DS007/DS008: deterministic canonicalization.
 */

import { CanonicalizerStrategy } from '../interfaces/canonicalizer-strategy.mjs';
import { termsEqual } from '../types/terms.mjs';
import { sha256Truncate, base64urlEncode } from '../hash.mjs';
import { DEFAULT_CONFIG } from '../config/config-schema.mjs';
import { canonicalizeTerm, serializeCanonicalTerm } from './canonicalize.mjs';

export class StrictCanonicalizer extends CanonicalizerStrategy {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    super('strict');
    this.options = { ...DEFAULT_CONFIG.canonicalization, ...options };
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

