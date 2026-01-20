/**
 * Identity canonicalizer (no-op)
 */

import { CanonicalizerStrategy } from '../interfaces/canonicalizer-strategy.mjs';
import { termsEqual, termToString } from '../types/terms.mjs';
import { sha256Truncate, base64urlEncode } from '../hash.mjs';
import { DEFAULT_CONFIG } from '../config/config-schema.mjs';

export class IdentityCanonicalizer extends CanonicalizerStrategy {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    super('identity');
    this.options = { ...DEFAULT_CONFIG.canonicalization, ...options };
  }

  canonicalize(term) {
    return term;
  }

  areEquivalent(a, b) {
    return termsEqual(a, b);
  }

  hash(term) {
    const bytes = sha256Truncate(termToString(term), 16);
    return base64urlEncode(bytes);
  }
}

