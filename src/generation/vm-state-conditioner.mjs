/**
 * VM State Conditioner for Generation
 * Per DS011: Encodes VM state into a deterministic conditioning signal
 * 
 * The conditioning signal guides generation without determining truth.
 * It is compact, domain-independent, and based on structural state only.
 */

/**
 * @typedef {Object} VMStateSignature
 * @property {string} hash - Deterministic hash of the state
 * @property {number} factCount - Number of facts in active scope
 * @property {number} ruleCount - Number of active rules
 * @property {number} scopeDepth - Current scope nesting depth
 * @property {number} contextHash - Hash of recent token context
 * @property {number} budgetUsed - Fraction of budget consumed (0-1)
 * @property {string} mode - Current mode (STRICT|CONDITIONAL|INDETERMINATE)
 */

/**
 * VMStateConditioner - Creates conditioning signals from VM state
 * Per DS011 §128-138
 */
export class VMStateConditioner {
  constructor(config = {}) {
    this.config = {
      contextWindowSize: config.contextWindowSize ?? 64,
      hashSeed: config.hashSeed ?? 0x9e3779b9
    };
  }

  /**
   * Encode VM state into deterministic signature
   * Independent of domain labels (NFS11)
   * 
   * @param {Object} vmState - Current VM state
   * @param {Object} [options]
   * @param {number[]} [options.recentTokens] - Recent token context
   * @param {number} [options.budgetUsed] - Budget fraction used
   * @returns {VMStateSignature}
   */
  encode(vmState, options = {}) {
    const recentTokens = options.recentTokens ?? [];
    const budgetUsed = options.budgetUsed ?? 0;

    // Extract structural state from VM
    const factCount = this._getFactCount(vmState);
    const ruleCount = this._getRuleCount(vmState);
    const scopeDepth = this._getScopeDepth(vmState);
    const mode = this._getMode(vmState);

    // Hash recent token context
    const contextHash = this._hashTokens(recentTokens);

    // Create deterministic combined hash
    const stateComponents = [
      factCount,
      ruleCount,
      scopeDepth,
      contextHash,
      Math.floor(budgetUsed * 1000)
    ];
    const hash = this._hashComponents(stateComponents);

    return {
      hash: `vmstate:${hash.toString(16)}`,
      factCount,
      ruleCount,
      scopeDepth,
      contextHash,
      budgetUsed,
      mode
    };
  }

  /**
   * Create a compact numeric encoding for use in n-gram lookup
   * Maps VM state to a small set of buckets
   * 
   * @param {VMStateSignature} signature
   * @returns {number} Bucket ID (0-255)
   */
  toBucket(signature) {
    // Create 8-bit bucket from key features
    const factBits = Math.min(signature.factCount, 15) & 0xF;
    const scopeBits = Math.min(signature.scopeDepth, 3) & 0x3;
    const modeBits = signature.mode === 'STRICT' ? 0 : 
                     signature.mode === 'CONDITIONAL' ? 1 : 2;
    
    return (factBits << 4) | (scopeBits << 2) | modeBits;
  }

  /**
   * Get fact count from VM state
   * @private
   */
  _getFactCount(vmState) {
    if (!vmState) return 0;
    
    // Try different VM state structures
    if (vmState.storage?.getAllFacts) {
      const facts = vmState.storage.getAllFacts();
      return Array.isArray(facts) ? facts.length : 0;
    }
    if (vmState.facts) {
      return Array.isArray(vmState.facts) ? vmState.facts.length : 
             typeof vmState.facts.size === 'number' ? vmState.facts.size : 0;
    }
    if (typeof vmState.factCount === 'number') {
      return vmState.factCount;
    }
    
    return 0;
  }

  /**
   * Get rule count from VM state
   * @private
   */
  _getRuleCount(vmState) {
    if (!vmState) return 0;
    
    if (vmState.rules) {
      return Array.isArray(vmState.rules) ? vmState.rules.length :
             typeof vmState.rules.size === 'number' ? vmState.rules.size : 0;
    }
    if (typeof vmState.ruleCount === 'number') {
      return vmState.ruleCount;
    }
    
    return 0;
  }

  /**
   * Get scope depth from VM state
   * @private
   */
  _getScopeDepth(vmState) {
    if (!vmState) return 0;
    
    if (vmState.context?.depth) {
      return vmState.context.depth;
    }
    if (vmState.contextStack?.length) {
      return vmState.contextStack.length;
    }
    if (typeof vmState.scopeDepth === 'number') {
      return vmState.scopeDepth;
    }
    
    return 0;
  }

  /**
   * Get current mode from VM state
   * @private
   */
  _getMode(vmState) {
    if (!vmState) return 'CONDITIONAL';
    
    if (vmState.mode) return vmState.mode;
    if (vmState.closureMode) return vmState.closureMode;
    
    return 'CONDITIONAL';
  }

  /**
   * Hash an array of tokens using FNV-1a
   * @private
   */
  _hashTokens(tokens) {
    if (!tokens || tokens.length === 0) return 0;
    
    // Take last N tokens
    const window = tokens.slice(-this.config.contextWindowSize);
    
    let hash = this.config.hashSeed;
    for (const token of window) {
      hash ^= token;
      hash = Math.imul(hash, 0x01000193);
    }
    
    return hash >>> 0; // Convert to unsigned 32-bit
  }

  /**
   * Hash state components
   * @private
   */
  _hashComponents(components) {
    let hash = this.config.hashSeed;
    for (const val of components) {
      hash ^= val;
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}

/**
 * Create a VM state conditioner
 * @param {Object} [config]
 * @returns {VMStateConditioner}
 */
export function createVMStateConditioner(config = {}) {
  return new VMStateConditioner(config);
}

export default { VMStateConditioner, createVMStateConditioner };
