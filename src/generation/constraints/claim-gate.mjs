/**
 * Claim Gate
 * Per DS004/DS011: Validates that generated content only contains supported claims.
 * 
 * This is critical for maintaining correctness guarantees during generation.
 * In STRICT mode, unsupported factual assertions are rejected.
 * In CONDITIONAL mode, they may pass if marked as conditional.
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the content is valid
 * @property {boolean} conditional - Whether it should be marked conditional
 * @property {string} [reason] - Reason for rejection
 * @property {Object[]} [claims] - Extracted claims
 */

/**
 * ClaimGate - Gates generated content against VM claims
 */
export class ClaimGate {
  constructor(config = {}) {
    this.config = {
      // Patterns that indicate factual assertions
      assertionPatterns: config.assertionPatterns ?? [
        /\b(?:is|are|was|were|has|have|had)\s+(?:a|an|the)\s+/i,
        /\b(?:always|never|every|all|none)\s+/i,
        /\bthere\s+(?:is|are|was|were)\s+/i,
        /\b(?:because|since|therefore|thus)\s+/i,
        /\b(?:must|should|will|would)\s+be\s+/i
      ],
      // Minimum confidence to consider a claim
      minClaimConfidence: config.minClaimConfidence ?? 0.5,
      // Whether to allow any output in strict mode when no claims
      strictModeAllowEmpty: config.strictModeAllowEmpty ?? false
    };
  }

  /**
   * Filter claims from a closure result
   * @param {Object} result - Closure result with claims
   * @returns {Object[]} - Valid claims
   */
  filterClaims(result) {
    return result?.claims ?? [];
  }

  /**
   * Validate a macro-unit against VM state claims
   * Per DS011 §274-300
   * 
   * @param {Object} unit - Macro-unit with tokens
   * @param {Object} vmState - Current VM state
   * @param {string} mode - STRICT|CONDITIONAL|INDETERMINATE
   * @returns {ValidationResult}
   */
  validateMacroUnit(unit, vmState, mode = 'CONDITIONAL') {
    const tokens = unit.tokens || [];
    const text = this._tokensToText(tokens);
    
    // Check if this looks like a factual assertion
    if (!this._isFactualAssertion(text)) {
      // Non-factual content (articles, connectors, etc.) passes freely
      return { valid: true, conditional: false };
    }

    // Extract the claim from the tokens
    const extractedClaim = this._extractClaim(text, tokens);
    
    if (!extractedClaim) {
      // Couldn't extract a clear claim, allow in conditional mode
      return mode === 'STRICT' 
        ? { valid: false, reason: 'unclear_assertion' }
        : { valid: true, conditional: true };
    }

    // Check if VM state supports this claim
    const supported = this._claimSupported(extractedClaim, vmState);

    if (supported) {
      return { valid: true, conditional: false, claims: [extractedClaim] };
    }

    // Not supported
    if (mode === 'STRICT') {
      return { 
        valid: false, 
        reason: 'unsupported_claim',
        claims: [extractedClaim]
      };
    } else {
      return { 
        valid: true, 
        conditional: true,
        claims: [extractedClaim]
      };
    }
  }

  /**
   * Validate a sequence of tokens
   * @param {number[]} tokens - Token sequence
   * @param {Object} vmState - VM state
   * @param {string} mode - Current mode
   * @returns {ValidationResult}
   */
  validateTokens(tokens, vmState, mode = 'CONDITIONAL') {
    return this.validateMacroUnit({ tokens }, vmState, mode);
  }

  /**
   * Check if text appears to be a factual assertion
   * @private
   */
  _isFactualAssertion(text) {
    if (!text || text.length < 5) return false;

    // Check against assertion patterns
    for (const pattern of this.config.assertionPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract a claim from text
   * @private
   */
  _extractClaim(text, tokens) {
    if (!text || text.length < 3) return null;

    // Simple claim extraction - could be enhanced with NLP
    return {
      type: 'assertion',
      text: text.trim(),
      tokens: tokens,
      confidence: 0.7
    };
  }

  /**
   * Check if a claim is supported by VM state
   * @private
   */
  _claimSupported(claim, vmState) {
    if (!vmState) return false;

    // Check claims in closure result
    if (vmState.claims) {
      const claims = Array.isArray(vmState.claims) ? vmState.claims : [];
      
      // Check for exact or fuzzy match
      for (const supported of claims) {
        if (this._claimsMatch(claim, supported)) {
          return true;
        }
      }
    }

    // Check facts in storage
    if (vmState.storage?.getAllFacts) {
      const facts = vmState.storage.getAllFacts();
      for (const fact of facts) {
        if (this._claimMatchesFact(claim, fact)) {
          return true;
        }
      }
    }

    // Check if claim text appears in known facts
    if (vmState.facts) {
      const facts = Array.isArray(vmState.facts) ? vmState.facts : 
                    vmState.facts.values ? Array.from(vmState.facts.values()) : [];
      for (const fact of facts) {
        if (this._claimMatchesFact(claim, fact)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if two claims match
   * @private
   */
  _claimsMatch(claim1, claim2) {
    if (!claim1 || !claim2) return false;

    // Exact text match
    if (claim1.text && claim2.text) {
      if (claim1.text.toLowerCase() === claim2.text.toLowerCase()) {
        return true;
      }
    }

    // Token sequence match
    if (claim1.tokens && claim2.tokens) {
      if (claim1.tokens.join(',') === claim2.tokens.join(',')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a claim matches a fact
   * @private
   */
  _claimMatchesFact(claim, fact) {
    if (!claim || !fact) return false;

    // Convert fact to string if needed
    const factText = typeof fact === 'string' ? fact :
                     fact.text ? fact.text :
                     fact.value ? String(fact.value) : 
                     JSON.stringify(fact);

    // Check if claim text appears in fact
    if (claim.text) {
      const claimLower = claim.text.toLowerCase();
      const factLower = factText.toLowerCase();
      
      if (factLower.includes(claimLower) || claimLower.includes(factLower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert token bytes to text
   * @private
   */
  _tokensToText(tokens) {
    if (!tokens || tokens.length === 0) return '';
    
    try {
      return Buffer.from(tokens).toString('utf8');
    } catch {
      return '';
    }
  }
}

/**
 * Create a claim gate
 * @param {Object} [config]
 * @returns {ClaimGate}
 */
export function createClaimGate(config = {}) {
  return new ClaimGate(config);
}

export default {
  ClaimGate,
  createClaimGate
};
