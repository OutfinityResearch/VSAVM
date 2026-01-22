/**
 * Macro-Unit Model for Byte-Level Language Modeling
 * Per DS011: Discovers macro-units via MDL compression and generates continuations
 * 
 * A macro-unit is a frequently occurring byte sequence that compresses well.
 * This is the "phrase layer" from DS001 §167.
 * 
 * Improvements over basic n-gram:
 * - Kneser-Ney smoothing for better probability estimates
 * - Hierarchical backoff from long to short contexts
 * - Pruning to reduce model size
 * - Optimized encoding with trie-based lookup
 * - VM State Conditioning (DS011)
 * - Claims Validation (DS004)
 */

import { VMStateConditioner, createVMStateConditioner } from '../../generation/vm-state-conditioner.mjs';
import { ClaimGate, createClaimGate } from '../../generation/constraints/claim-gate.mjs';

/**
 * @typedef {Object} MacroUnit
 * @property {string} unitId - Unique identifier
 * @property {number[]} tokens - Byte sequence
 * @property {number} frequency - Occurrence count
 * @property {number} mdlScore - MDL improvement score
 * @property {number} promotedAt - Timestamp when promoted
 * @property {number} version - Schema version
 */

/**
 * @typedef {Object} Proposal
 * @property {string} unitId - Macro-unit ID or 'byte'
 * @property {number[]} tokens - Token sequence to emit
 * @property {number} score - Prediction score
 */

// Kneser-Ney discount parameter (typically 0.75)
const KN_DISCOUNT = 0.75;

/**
 * MacroUnitModel - Discovers and uses macro-units for text generation
 * Implements DS011 interfaces with MDL-based compression and Kneser-Ney smoothing
 */
export class MacroUnitModel {
  /**
   * @param {Object} [config]
   * @param {number} [config.minFrequency=3] - Minimum occurrences for macro-unit
   * @param {number} [config.minLength=2] - Minimum macro-unit length
   * @param {number} [config.maxLength=32] - Maximum macro-unit length
   * @param {number} [config.contextWindow=16] - Context window for prediction
   * @param {number} [config.mdlThreshold=0.05] - Minimum MDL improvement for promotion
   * @param {number} [config.pruneThreshold=2] - Minimum count to keep n-gram
   * @param {number} [config.maxMacroUnits=10000] - Maximum macro-units to promote
   * @param {number} [config.maxNgramOrder=8] - Max n-gram order to store
   * @param {number} [config.maxSubsequenceLength=16] - Max subsequence length for mining
   * @param {number} [config.maxSubsequenceEntries=500000] - Max subsequence entries to track
   * @param {number|null} [config.subsequenceSampleRate=null] - Optional subsequence sampling rate
   * @param {number} [config.subsequencePruneThreshold=2] - Min count when pruning subsequences
   * @param {number} [config.subsequencePruneInterval=100000] - Steps between subsequence pruning
   */
  constructor(config = {}) {
    this.config = {
      minFrequency: config.minFrequency ?? 3,
      minLength: config.minLength ?? 2,
      maxLength: config.maxLength ?? 32,
      contextWindow: config.contextWindow ?? 32,
      mdlThreshold: config.mdlThreshold ?? 0.05,
      pruneThreshold: config.pruneThreshold ?? 2,
      maxMacroUnits: config.maxMacroUnits ?? 10000,
      maxNgramOrder: config.maxNgramOrder ?? 8,
      maxSubsequenceLength: config.maxSubsequenceLength ?? 16,
      maxSubsequenceEntries: config.maxSubsequenceEntries ?? 500000,
      subsequenceSampleRate: config.subsequenceSampleRate ?? null,
      subsequencePruneThreshold: config.subsequencePruneThreshold ?? 2,
      subsequencePruneInterval: config.subsequencePruneInterval ?? 100000,
      useVMConditioning: config.useVMConditioning ?? true,
      useClaimValidation: config.useClaimValidation ?? true
    };

    // Learned macro-units: unitId -> MacroUnit
    this.macroUnits = new Map();

    // N-gram counts for multiple orders (1 to contextWindow)
    // Key: order, Value: Map<context, Map<nextByte, count>>
    this.ngramsByOrder = new Map();

    // VM-conditioned n-grams: bucket -> order -> context -> counts
    // This allows different predictions based on VM state
    this.vmConditionedNgrams = new Map();

    // Continuation counts for Kneser-Ney
    // How many unique contexts does each byte follow?
    this.continuationCounts = new Map();

    // Byte counts for unigram
    this.byteCounts = new Map();
    this.totalBytes = 0;

    // Macro-unit trie for fast encoding
    this.macroUnitTrie = null;

    // Next unit ID
    this.nextUnitId = 0;

    // VM State Conditioner (DS011)
    this.conditioner = createVMStateConditioner({
      contextWindowSize: this.config.contextWindow
    });

    // Claim Gate (DS004)
    this.claimGate = createClaimGate();
  }

  /**
   * Train on token sequences, discovering and consolidating macro-units.
   * @param {number[][]} tokenSequences - Array of byte sequences
   * @param {Object[]} [vmStateSignatures] - Optional VM state signatures
   */
  async train(tokenSequences, vmStateSignatures = []) {
    if (tokenSequences && typeof tokenSequences[Symbol.asyncIterator] === 'function') {
      await this.trainStream(tokenSequences);
      return;
    }

    // Phase 1: Count all n-grams at multiple orders
    for (const tokens of tokenSequences) {
      this._countNgramsAllOrders(tokens);
    }

    // Phase 2: Prune low-frequency n-grams
    this._pruneNgrams();

    // Phase 3: Compute continuation counts for Kneser-Ney
    this._computeContinuationCounts();

    // Phase 4: Discover macro-units via MDL
    await this._discoverMacroUnits(tokenSequences);

    // Phase 5: Build macro-unit trie for fast encoding
    this._buildMacroUnitTrie();
  }

  /**
   * Train on a streaming iterator of token sequences.
   * @param {AsyncIterable<number[]>} tokenSequenceStream
   * @param {Object} [options]
   */
  async trainStream(tokenSequenceStream, options = {}) {
    const subsequenceCounts = options.subsequenceCounts ?? new Map();
    const subsequenceConfig = this._getSubsequenceConfig(options);
    if (!Number.isFinite(subsequenceConfig.sampleRate)) {
      subsequenceConfig.sampleRate = 1.0;
    }
    const state = {
      totalSubseq: options.totalSubseq ?? 0,
      sequences: options.sequences ?? 0,
      totalBytes: options.totalBytes ?? 0
    };
    const checkpointEvery = options.checkpointEvery ?? 0;

    for await (const tokens of tokenSequenceStream) {
      if (!tokens || tokens.length === 0) continue;

      state.sequences += 1;
      state.totalBytes += tokens.length;

      this._countNgramsAllOrders(tokens);
      this._updateSubsequenceCounts(tokens, subsequenceCounts, subsequenceConfig, state);

      if (checkpointEvery > 0 && state.sequences % checkpointEvery === 0) {
        await options.onCheckpoint?.({
          state: { ...state },
          subsequenceConfig: { ...subsequenceConfig },
          subsequenceCounts: Array.from(subsequenceCounts.entries()),
          modelState: this.export({ compact: false })
        });
      }
    }

    this._pruneNgrams();
    this._computeContinuationCounts();
    this._promoteMacroUnitsFromCounts(subsequenceCounts, subsequenceConfig);
    this._buildMacroUnitTrie();
  }

  /**
   * Count n-grams at all orders from 1 to contextWindow
   * Optimized: Limits higher-order n-grams for memory efficiency
   * @private
   */
  _countNgramsAllOrders(tokens) {
    // Unigrams
    for (const byte of tokens) {
      this.byteCounts.set(byte, (this.byteCounts.get(byte) ?? 0) + 1);
      this.totalBytes++;
    }

    // Higher order n-grams - limit to a bounded order for memory efficiency
    // Higher orders are less useful and explode combinatorially
    const maxEffectiveOrder = Math.min(this.config.contextWindow, this.config.maxNgramOrder);
    
    for (let order = 1; order <= maxEffectiveOrder; order++) {
      if (!this.ngramsByOrder.has(order)) {
        this.ngramsByOrder.set(order, new Map());
      }
      const orderMap = this.ngramsByOrder.get(order);

      for (let i = order; i < tokens.length; i++) {
        const context = tokens.slice(i - order, i);
        const contextKey = this._contextToKey(context);
        const nextByte = tokens[i];

        if (!orderMap.has(contextKey)) {
          orderMap.set(contextKey, new Map());
        }
        const counts = orderMap.get(contextKey);
        counts.set(nextByte, (counts.get(nextByte) ?? 0) + 1);
      }
    }
  }

  /**
   * Convert context array to compact key
   * @private
   */
  _contextToKey(context) {
    // Use Buffer for more compact representation
    return Buffer.from(context).toString('base64');
  }

  /**
   * Convert key back to context array
   * @private
   */
  _keyToContext(key) {
    return Array.from(Buffer.from(key, 'base64'));
  }

  /**
   * Prune low-frequency n-grams to reduce model size
   * @private
   */
  _pruneNgrams() {
    const threshold = this.config.pruneThreshold;

    for (const [order, orderMap] of this.ngramsByOrder) {
      for (const [contextKey, counts] of orderMap) {
        // Remove low-frequency entries
        for (const [byte, count] of counts) {
          if (count < threshold) {
            counts.delete(byte);
          }
        }
        // Remove empty contexts
        if (counts.size === 0) {
          orderMap.delete(contextKey);
        }
      }
    }
  }

  /**
   * Compute continuation counts for Kneser-Ney smoothing
   * @private
   */
  _computeContinuationCounts() {
    this.continuationCounts.clear();

    // For each bigram context, count unique bytes that follow
    const bigramOrder = this.ngramsByOrder.get(1);
    if (bigramOrder) {
      for (const [contextKey, counts] of bigramOrder) {
        for (const byte of counts.keys()) {
          this.continuationCounts.set(byte, (this.continuationCounts.get(byte) ?? 0) + 1);
        }
      }
    }
  }

  /**
   * Get probability with Kneser-Ney smoothing and backoff
   * @param {number} nextByte - The byte to predict
   * @param {number[]} context - The context bytes
   * @returns {number} - Probability
   */
  _getKneserNeyProbability(nextByte, context) {
    // Start with the longest context and back off
    for (let order = Math.min(context.length, this.config.contextWindow); order >= 1; order--) {
      const orderMap = this.ngramsByOrder.get(order);
      if (!orderMap) continue;

      const ctx = context.slice(-order);
      const contextKey = this._contextToKey(ctx);
      const counts = orderMap.get(contextKey);

      if (counts && counts.size > 0) {
        const count = counts.get(nextByte) ?? 0;
        let total = 0;
        for (const c of counts.values()) total += c;

        if (count > 0) {
          // Kneser-Ney: discounted probability + backoff weight * lower-order prob
          const discountedProb = Math.max(count - KN_DISCOUNT, 0) / total;
          const numTypes = counts.size;
          const backoffWeight = (KN_DISCOUNT * numTypes) / total;
          const lowerOrderProb = this._getLowerOrderProbability(nextByte, ctx.slice(1));

          return discountedProb + backoffWeight * lowerOrderProb;
        } else {
          // Backoff to lower order
          const numTypes = counts.size;
          const backoffWeight = (KN_DISCOUNT * numTypes) / total;
          return backoffWeight * this._getLowerOrderProbability(nextByte, ctx.slice(1));
        }
      }
    }

    // Fallback to unigram with add-1 smoothing
    return this._getUnigramProbability(nextByte);
  }

  /**
   * Get lower-order probability for Kneser-Ney backoff
   * @private
   */
  _getLowerOrderProbability(nextByte, context) {
    if (context.length === 0) {
      return this._getUnigramProbability(nextByte);
    }

    const order = context.length;
    const orderMap = this.ngramsByOrder.get(order);
    if (!orderMap) {
      return this._getLowerOrderProbability(nextByte, context.slice(1));
    }

    const contextKey = this._contextToKey(context);
    const counts = orderMap.get(contextKey);

    if (counts && counts.size > 0) {
      const count = counts.get(nextByte) ?? 0;
      let total = 0;
      for (const c of counts.values()) total += c;

      if (count > 0) {
        const discountedProb = Math.max(count - KN_DISCOUNT, 0) / total;
        const numTypes = counts.size;
        const backoffWeight = (KN_DISCOUNT * numTypes) / total;
        return discountedProb + backoffWeight * this._getLowerOrderProbability(nextByte, context.slice(1));
      }
    }

    return this._getLowerOrderProbability(nextByte, context.slice(1));
  }

  /**
   * Get unigram probability with add-1 smoothing
   * @private
   */
  _getUnigramProbability(byte) {
    const count = this.byteCounts.get(byte) ?? 0;
    // Add-1 smoothing
    return (count + 1) / (this.totalBytes + 256);
  }

  /**
   * Discover macro-units using MDL criterion
   * Optimized: Uses sampling + pruning to stay memory bounded
   * @private
   */
  async _discoverMacroUnits(tokenSequences) {
    const subsequenceCounts = new Map();
    const subsequenceConfig = this._getSubsequenceConfig();
    const state = { totalSubseq: 0 };

    if (!Number.isFinite(subsequenceConfig.sampleRate)) {
      let totalPossibleSubseq = 0;
      for (const tokens of tokenSequences) {
        const effectiveMaxLen = Math.min(
          tokens.length,
          this.config.maxLength,
          subsequenceConfig.maxSubsequenceLength
        );
        for (let len = this.config.minLength; len <= effectiveMaxLen; len++) {
          totalPossibleSubseq += Math.max(0, tokens.length - len + 1);
        }
      }
      const computedRate = Math.min(
        1.0,
        subsequenceConfig.maxSubsequenceEntries / (totalPossibleSubseq || 1)
      );
      subsequenceConfig.sampleRate = computedRate;
    }

    for (const tokens of tokenSequences) {
      if (!tokens || tokens.length === 0) continue;
      this._updateSubsequenceCounts(tokens, subsequenceCounts, subsequenceConfig, state);
    }

    this._promoteMacroUnitsFromCounts(subsequenceCounts, subsequenceConfig);
  }

  _getSubsequenceConfig(overrides = {}) {
    const sampleRateOverride = Number.isFinite(overrides.subsequenceSampleRate)
      ? overrides.subsequenceSampleRate
      : overrides.sampleRate;
    const resolvedSampleRate = Number.isFinite(sampleRateOverride)
      ? sampleRateOverride
      : this.config.subsequenceSampleRate;

    return {
      maxSubsequenceLength: overrides.maxSubsequenceLength ?? this.config.maxSubsequenceLength,
      maxSubsequenceEntries: overrides.maxSubsequenceEntries ?? this.config.maxSubsequenceEntries,
      sampleRate: Number.isFinite(resolvedSampleRate) ? resolvedSampleRate : null,
      pruneThreshold: overrides.subsequencePruneThreshold ?? this.config.subsequencePruneThreshold,
      pruneInterval: overrides.subsequencePruneInterval ?? this.config.subsequencePruneInterval
    };
  }

  _updateSubsequenceCounts(tokens, subsequenceCounts, config, state) {
    const sampleRate = Number.isFinite(config.sampleRate) ? config.sampleRate : 1.0;
    const effectiveMaxLen = Math.min(
      tokens.length,
      this.config.maxLength,
      config.maxSubsequenceLength
    );

    for (let len = this.config.minLength; len <= effectiveMaxLen; len++) {
      for (let i = 0; i <= tokens.length - len; i++) {
        if (sampleRate < 1.0 && Math.random() > sampleRate) continue;

        const subseq = tokens.slice(i, i + len);
        const key = this._contextToKey(subseq);
        subsequenceCounts.set(key, (subsequenceCounts.get(key) ?? 0) + 1);

        state.totalSubseq++;
        if (
          state.totalSubseq % config.pruneInterval === 0 &&
          subsequenceCounts.size > config.maxSubsequenceEntries
        ) {
          this._pruneSubsequenceCounts(subsequenceCounts, config);
        }
      }
    }
  }

  _pruneSubsequenceCounts(subsequenceCounts, config) {
    let threshold = config.pruneThreshold;
    const maxEntries = config.maxSubsequenceEntries;

    while (subsequenceCounts.size > maxEntries && threshold <= config.pruneThreshold + 3) {
      for (const [key, count] of subsequenceCounts) {
        if (count <= threshold) {
          subsequenceCounts.delete(key);
        }
      }
      threshold++;
    }
  }

  _promoteMacroUnitsFromCounts(subsequenceCounts, config) {
    const candidates = [];
    const sampleRate = Number.isFinite(config.sampleRate) ? config.sampleRate : 1.0;
    const maxMacroUnits = this.config.maxMacroUnits ?? 10000;

    for (const [key, count] of subsequenceCounts) {
      const adjustedCount = sampleRate < 1.0 ? Math.max(1, Math.round(count / sampleRate)) : count;
      if (adjustedCount >= this.config.minFrequency) {
        const tokens = this._keyToContext(key);
        candidates.push({ tokens, frequency: adjustedCount, key });
      }
    }

    subsequenceCounts.clear();

    candidates.sort((a, b) => {
      const mdlA = this._calculateMDL(a.tokens, a.frequency);
      const mdlB = this._calculateMDL(b.tokens, b.frequency);
      return mdlB - mdlA;
    });

    const promotedTokenStrings = new Set();
    for (const candidate of candidates) {
      if (this.macroUnits.size >= maxMacroUnits) break;

      const mdlScore = this._calculateMDL(candidate.tokens, candidate.frequency);
      if (mdlScore < this.config.mdlThreshold) {
        continue;
      }

      const tokenStr = candidate.tokens.join(',');
      let overlaps = false;

      for (const promotedStr of promotedTokenStrings) {
        if (tokenStr.includes(promotedStr) || promotedStr.includes(tokenStr)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        const unitId = `mu_${this.nextUnitId++}`;
        this.macroUnits.set(unitId, {
          unitId,
          tokens: candidate.tokens,
          frequency: candidate.frequency,
          mdlScore,
          promotedAt: Date.now(),
          version: 1
        });
        promotedTokenStrings.add(tokenStr);
      }
    }
  }

  /**
   * Calculate MDL improvement for a candidate macro-unit
   * @private
   */
  _calculateMDL(tokens, frequency) {
    const vocabularySize = 256;
    const pointerCost = 2;

    // Cost without macro-unit
    const rawCost = frequency * tokens.length * Math.log2(vocabularySize);

    // Cost with macro-unit
    const descriptionCost = tokens.length * Math.log2(vocabularySize) + 8;
    const usageCost = frequency * pointerCost * 8;

    const withMacroUnit = descriptionCost + usageCost;
    const improvement = (rawCost - withMacroUnit) / rawCost;

    return improvement;
  }

  /**
   * Build trie for fast macro-unit matching
   * @private
   */
  _buildMacroUnitTrie() {
    this.macroUnitTrie = { children: new Map(), unit: null };

    for (const [unitId, unit] of this.macroUnits) {
      let node = this.macroUnitTrie;
      for (const byte of unit.tokens) {
        if (!node.children.has(byte)) {
          node.children.set(byte, { children: new Map(), unit: null });
        }
        node = node.children.get(byte);
      }
      node.unit = unit;
    }
  }

  /**
   * Propose next macro-units given context
   * @param {number[]} contextTokens - Recent token context
   * @param {string} [vmStateSignature] - Optional VM state signature
   * @param {number} [limit=10] - Maximum proposals
   * @returns {Promise<Proposal[]>}
   */
  async propose(contextTokens, vmStateSignature = null, limit = 10) {
    const proposals = [];

    // Get top byte predictions using Kneser-Ney
    const byteScores = [];
    for (let byte = 0; byte < 256; byte++) {
      const prob = this._getKneserNeyProbability(byte, contextTokens);
      if (prob > 0.001) { // Only consider likely bytes
        byteScores.push({ byte, prob });
      }
    }
    byteScores.sort((a, b) => b.prob - a.prob);

    // For top byte candidates, check if they start a macro-unit
    const topBytes = byteScores.slice(0, 30);

    for (const { byte, prob } of topBytes) {
      // Check if this byte starts a macro-unit
      if (this.macroUnitTrie && this.macroUnitTrie.children.has(byte)) {
        const macroUnitsStartingWithByte = this._findMacroUnitsStartingWith(byte);
        for (const unit of macroUnitsStartingWithByte) {
          // Score improvement: check how well the macro-unit fits the context
          // by computing the joint probability of all tokens in the unit
          let jointProb = prob;
          let contextForNextToken = [...contextTokens];
          
          // Score subsequent tokens in the macro-unit
          for (let i = 1; i < Math.min(unit.tokens.length, 4); i++) {
            contextForNextToken.push(unit.tokens[i - 1]);
            const nextProb = this._getKneserNeyProbability(unit.tokens[i], contextForNextToken);
            jointProb *= nextProb;
          }
          
          // Geometric mean for comparable scoring across different lengths
          const avgProb = Math.pow(jointProb, 1 / Math.min(unit.tokens.length, 4));
          
          // Length bonus (prefer longer coherent units)
          const lengthBonus = Math.sqrt(unit.tokens.length);
          
          // Frequency bonus
          const freqBonus = Math.log2(unit.frequency + 1) / 10;
          
          const score = avgProb * lengthBonus * (1 + freqBonus);
          
          proposals.push({
            unitId: unit.unitId,
            tokens: unit.tokens,
            score
          });
        }
      }

      // Also propose single byte with lower score
      proposals.push({
        unitId: 'byte',
        tokens: [byte],
        score: prob * 0.5 // Stronger penalty for single bytes
      });
    }

    // Sort and limit
    proposals.sort((a, b) => b.score - a.score);
    
    // Deduplicate by unitId
    const seen = new Set();
    const unique = [];
    for (const p of proposals) {
      if (!seen.has(p.unitId)) {
        seen.add(p.unitId);
        unique.push(p);
      }
    }

    return unique.slice(0, limit);
  }

  /**
   * Find all macro-units starting with a given byte
   * @private
   */
  _findMacroUnitsStartingWith(byte) {
    const results = [];
    if (!this.macroUnitTrie) return results;

    const startNode = this.macroUnitTrie.children.get(byte);
    if (!startNode) return results;

    // BFS to find all units in subtree
    const queue = [startNode];
    while (queue.length > 0) {
      const node = queue.shift();
      if (node.unit) {
        results.push(node.unit);
      }
      for (const child of node.children.values()) {
        queue.push(child);
      }
    }

    return results;
  }

  /**
   * Get all consolidated macro-units
   * @returns {MacroUnit[]}
   */
  getMacroUnits() {
    return Array.from(this.macroUnits.values());
  }

  /**
   * Encode token sequence using learned macro-units (compression)
   * Uses trie for O(n) encoding
   * @param {number[]} tokens
   * @returns {Array<{unitId: string, tokens: number[]}>}
   */
  encode(tokens) {
    if (!this.macroUnitTrie) {
      return tokens.map(t => ({ unitId: 'byte', tokens: [t] }));
    }

    const encoded = [];
    let i = 0;

    while (i < tokens.length) {
      // Greedy longest match using trie
      let node = this.macroUnitTrie;
      let bestMatch = null;
      let matchLength = 0;

      for (let j = i; j < tokens.length && node.children.has(tokens[j]); j++) {
        node = node.children.get(tokens[j]);
        if (node.unit) {
          bestMatch = node.unit;
          matchLength = j - i + 1;
        }
      }

      if (bestMatch) {
        encoded.push({ unitId: bestMatch.unitId, tokens: bestMatch.tokens });
        i += matchLength;
      } else {
        encoded.push({ unitId: 'byte', tokens: [tokens[i]] });
        i++;
      }
    }

    return encoded;
  }

  /**
   * Decode macro-unit sequence back to tokens
   * @param {string[]} macroUnitIds
   * @returns {number[]}
   */
  decode(macroUnitIds) {
    const tokens = [];

    for (const unitId of macroUnitIds) {
      if (unitId === 'byte') {
        continue;
      }

      const unit = this.macroUnits.get(unitId);
      if (unit) {
        tokens.push(...unit.tokens);
      }
    }

    return tokens;
  }

  /**
   * Generate tokens from a prompt
   * Per DS011: Generation is proposal + validation, conditioned on VM state
   * 
   * @param {number[]} prompt - Prompt tokens
   * @param {Object} [options]
   * @param {number} [options.maxTokens=100] - Maximum tokens to generate
   * @param {number} [options.temperature=1.0] - Sampling temperature
   * @param {number} [options.topK=40] - Top-k sampling
   * @param {number} [options.repetitionPenalty=1.2] - Penalty for repeated tokens
   * @param {number} [options.repetitionWindow=32] - Window for repetition detection
   * @param {number} [options.ngramBlockSize=4] - Block exact n-gram repetitions of this size
   * @param {number} [options.diversityBonus=0.3] - Bonus for tokens not in recent window
   * @param {Object} [options.vmState] - VM state for conditioning (DS011)
   * @param {string} [options.mode='CONDITIONAL'] - Generation mode (STRICT|CONDITIONAL)
   * @returns {Promise<Object>}
   */
  async generate(prompt, options = {}) {
    const maxTokens = options.maxTokens ?? 100;
    const temperature = options.temperature ?? 1.0;
    const topK = options.topK ?? 40;
    const repetitionPenalty = options.repetitionPenalty ?? 1.2;
    const repetitionWindow = options.repetitionWindow ?? 32;
    const ngramBlockSize = options.ngramBlockSize ?? 4;
    const diversityBonus = options.diversityBonus ?? 0.3;
    const vmState = options.vmState ?? null;
    const mode = options.mode ?? 'CONDITIONAL';
    const budgetMs = Number.isFinite(options.budgetMs) ? options.budgetMs : null;
    
    const generated = [...prompt];
    const macroUnitsUsed = [];
    const validationStats = { validated: 0, rejected: 0, conditional: 0 };
    const startTime = budgetMs !== null ? performance.now() : 0;

    // Track recent tokens for repetition penalty
    const recentTokens = new Set();
    const recentMacroUnits = new Set();
    
    // Track n-grams for blocking
    const recentNgrams = new Set();

    // Get initial VM state signature for conditioning
    let vmSignature = null;
    if (this.config.useVMConditioning && vmState) {
      vmSignature = this.conditioner.encode(vmState, { recentTokens: prompt });
    }

    for (let step = 0; step < maxTokens && generated.length < prompt.length + maxTokens; step++) {
      if (budgetMs !== null && (performance.now() - startTime) >= budgetMs) {
        break;
      }
      // Update recent tokens window
      recentTokens.clear();
      recentNgrams.clear();
      const windowStart = Math.max(0, generated.length - repetitionWindow);
      for (let i = windowStart; i < generated.length; i++) {
        recentTokens.add(generated[i]);
        
        // Track n-grams for blocking
        if (i >= windowStart + ngramBlockSize - 1) {
          const ngram = generated.slice(i - ngramBlockSize + 1, i + 1).join(',');
          recentNgrams.add(ngram);
        }
      }

      // Update VM signature with current context
      if (this.config.useVMConditioning && vmState) {
        vmSignature = this.conditioner.encode(vmState, { 
          recentTokens: generated.slice(-this.config.contextWindow),
          budgetUsed: step / maxTokens
        });
      }

      const context = generated.slice(-this.config.contextWindow);
      let proposals = await this.propose(context, vmSignature, Math.max(topK * 2, 20));

      if (proposals.length === 0) {
        break;
      }

      // DS004: Validate proposals against claims
      if (this.config.useClaimValidation && vmState) {
        proposals = proposals.map(p => {
          const validation = this.claimGate.validateMacroUnit(p, vmState, mode);
          return { 
            ...p, 
            valid: validation.valid,
            conditional: validation.conditional,
            score: validation.valid ? p.score : 0
          };
        }).filter(p => p.valid);

        // Update stats
        for (const p of proposals) {
          if (p.conditional) validationStats.conditional++;
          validationStats.validated++;
        }
      }

      if (proposals.length === 0) {
        // No valid proposals - try byte-level fallback
        const fallbackByte = this._getFallbackByte(context);
        if (fallbackByte !== null) {
          generated.push(fallbackByte);
          continue;
        }
        break;
      }

      // Apply repetition penalty and n-gram blocking
      proposals = proposals.map(p => {
        let penalty = 1.0;
        let blocked = false;
        
        // N-gram blocking: completely block proposals that would create repeated n-grams
        if (p.tokens.length >= ngramBlockSize) {
          const proposalNgram = p.tokens.slice(0, ngramBlockSize).join(',');
          if (recentNgrams.has(proposalNgram)) {
            blocked = true;
          }
        } else {
          // For shorter proposals, check if combining with recent context creates repetition
          const contextTail = generated.slice(-(ngramBlockSize - p.tokens.length));
          const combined = [...contextTail, ...p.tokens].join(',');
          if (recentNgrams.has(combined)) {
            blocked = true;
          }
        }
        
        if (blocked) {
          return { ...p, score: 0 }; // Block completely
        }
        
        // Diversity bonus: reward tokens not recently seen
        let diverseCount = 0;
        for (const token of p.tokens) {
          if (!recentTokens.has(token)) {
            diverseCount++;
          }
        }
        const diversityMultiplier = 1 + (diverseCount / p.tokens.length) * diversityBonus;
        
        // Penalize if first token was recently seen
        if (recentTokens.has(p.tokens[0])) {
          penalty *= repetitionPenalty;
        }
        
        // Penalize repeated macro-units more heavily
        if (p.unitId !== 'byte' && recentMacroUnits.has(p.unitId)) {
          penalty *= repetitionPenalty * 1.5;
        }
        
        // Penalize if tokens overlap with recent output (sliding window check)
        const tokenStr = p.tokens.join(',');
        for (let i = windowStart; i < generated.length - p.tokens.length; i++) {
          const windowStr = generated.slice(i, i + p.tokens.length).join(',');
          if (tokenStr === windowStr) {
            penalty *= repetitionPenalty * 2;
            break;
          }
        }
        
        return { ...p, score: (p.score / penalty) * diversityMultiplier };
      }).filter(p => p.score > 0); // Remove blocked proposals

      if (proposals.length === 0) {
        // All proposals were blocked/penalized away - fall back to byte-level.
        const fallbackByte = this._getFallbackByte(context);
        if (fallbackByte !== null) {
          generated.push(fallbackByte);
          continue;
        }
        break;
      }

      // Re-sort after penalty
      proposals.sort((a, b) => b.score - a.score);
      
      // Top-k filtering
      proposals = proposals.slice(0, topK);

      // Temperature-based sampling
      let selected;
      if (temperature <= 0.01) {
        // Greedy
        selected = proposals[0];
      } else {
        // Sample with temperature
        const scores = proposals.map(p => Math.exp(Math.log(Math.max(p.score, 1e-10)) / temperature));
        const totalScore = scores.reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalScore;
        selected = proposals[0];
        for (let i = 0; i < proposals.length; i++) {
          rand -= scores[i];
          if (rand <= 0) {
            selected = proposals[i];
            break;
          }
        }
      }

      generated.push(...selected.tokens);
      
      if (selected.unitId !== 'byte') {
        macroUnitsUsed.push(selected.unitId);
        recentMacroUnits.add(selected.unitId);
        // Keep only recent macro-units
        if (recentMacroUnits.size > 20) {
          const first = recentMacroUnits.values().next().value;
          recentMacroUnits.delete(first);
        }
      }
    }

    // Calculate compression ratio
    const encoded = this.encode(generated);
    const compressionRatio = encoded.length / generated.length;

    return {
      tokens: generated,
      macroUnits: macroUnitsUsed,
      compressionRatio,
      generatedLength: generated.length - prompt.length,
      vmConditioned: vmSignature !== null,
      validationStats,
      mode,
      timedOut: budgetMs !== null && (performance.now() - startTime) >= budgetMs
    };
  }

  /**
   * Get a fallback byte when no valid proposals exist
   * @private
   */
  _getFallbackByte(context) {
    // Use most common byte following this context
    for (let order = Math.min(context.length, 4); order >= 1; order--) {
      const ctx = context.slice(-order);
      const contextKey = this._contextToKey(ctx);
      const orderMap = this.ngramsByOrder.get(order);
      
      if (orderMap && orderMap.has(contextKey)) {
        const counts = orderMap.get(contextKey);
        let maxCount = 0;
        let bestByte = null;
        for (const [byte, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            bestByte = byte;
          }
        }
        if (bestByte !== null) return bestByte;
      }
    }
    
    // Ultimate fallback - space character
    return 32;
  }

  /**
   * Calculate perplexity on a token sequence using Kneser-Ney
   * @param {number[]} tokens
   * @returns {number}
   */
  calculatePerplexity(tokens) {
    if (tokens.length < 2) return Infinity;

    let logProb = 0;
    let count = 0;

    for (let i = 1; i < tokens.length; i++) {
      const contextStart = Math.max(0, i - this.config.contextWindow);
      const context = tokens.slice(contextStart, i);
      const nextByte = tokens[i];

      const prob = this._getKneserNeyProbability(nextByte, context);
      logProb += Math.log2(prob);
      count++;
    }

    const avgLogProb = logProb / count;
    return Math.pow(2, -avgLogProb);
  }

  /**
   * Export model state for serialization (compact format)
   * @param {Object} [options]
   * @param {boolean} [options.compact=false] - Use aggressive compression
   * @param {number} [options.maxOrders=4] - Max n-gram orders to keep in compact mode
   * @param {number} [options.maxMacroUnits=5000] - Max macro-units in compact mode
   * @param {number} [options.minNgramCount=3] - Min count to keep n-gram in compact mode
   * @returns {Object}
   */
  export(options = {}) {
    const compact = options.compact ?? false;
    const maxOrders = options.maxOrders ?? 4;
    const maxMacroUnits = options.maxMacroUnits ?? 5000;
    const minNgramCount = options.minNgramCount ?? 3;

    // Convert n-grams to compact array format
    const ngramsCompact = [];
    for (const [order, orderMap] of this.ngramsByOrder) {
      // In compact mode, skip high orders
      if (compact && order > maxOrders) continue;

      const orderData = [];
      for (const [contextKey, counts] of orderMap) {
        if (compact) {
          // Filter low-count entries
          const filteredCounts = [];
          for (const [byte, count] of counts) {
            if (count >= minNgramCount) {
              filteredCounts.push([byte, count]);
            }
          }
          if (filteredCounts.length > 0) {
            orderData.push([contextKey, filteredCounts]);
          }
        } else {
          orderData.push([contextKey, Array.from(counts.entries())]);
        }
      }
      if (orderData.length > 0) {
        ngramsCompact.push([order, orderData]);
      }
    }

    // Limit macro-units in compact mode
    let macroUnitsToExport = Array.from(this.macroUnits.entries());
    if (compact && macroUnitsToExport.length > maxMacroUnits) {
      // Keep highest frequency macro-units
      macroUnitsToExport.sort((a, b) => b[1].frequency - a[1].frequency);
      macroUnitsToExport = macroUnitsToExport.slice(0, maxMacroUnits);
    }

    return {
      version: 2,
      compact,
      macroUnits: macroUnitsToExport,
      ngramsByOrder: ngramsCompact,
      byteCounts: Array.from(this.byteCounts.entries()),
      totalBytes: this.totalBytes,
      continuationCounts: Array.from(this.continuationCounts.entries()),
      nextUnitId: this.nextUnitId,
      config: this.config
    };
  }

  /**
   * Import model state from serialization
   * @param {Object} state
   */
  import(state) {
    // Handle version 1 (old format)
    if (!state.version || state.version === 1) {
      this._importV1(state);
      return;
    }

    // Version 2
    if (state.macroUnits) {
      this.macroUnits = new Map(state.macroUnits);
    }
    if (state.ngramsByOrder) {
      this.ngramsByOrder = new Map();
      for (const [order, orderData] of state.ngramsByOrder) {
        const orderMap = new Map();
        for (const [contextKey, countsArray] of orderData) {
          orderMap.set(contextKey, new Map(countsArray));
        }
        this.ngramsByOrder.set(order, orderMap);
      }
    }
    if (state.byteCounts) {
      this.byteCounts = new Map(state.byteCounts);
    }
    if (state.totalBytes !== undefined) {
      this.totalBytes = state.totalBytes;
    }
    if (state.continuationCounts) {
      this.continuationCounts = new Map(state.continuationCounts);
    }
    if (state.nextUnitId !== undefined) {
      this.nextUnitId = state.nextUnitId;
    }
    if (state.config) {
      Object.assign(this.config, state.config);
    }

    // Rebuild trie
    this._buildMacroUnitTrie();
  }

  /**
   * Import from version 1 format
   * @private
   */
  _importV1(state) {
    if (state.macroUnits) {
      this.macroUnits = new Map(state.macroUnits);
    }
    if (state.ngramCounts) {
      // Convert old format to new
      this.ngramsByOrder = new Map();
      const orderMap = new Map();
      for (const [key, counts] of state.ngramCounts) {
        orderMap.set(key, new Map(counts));
      }
      // Determine order from first key
      if (orderMap.size > 0) {
        const firstKey = orderMap.keys().next().value;
        const context = this._keyToContext(firstKey);
        this.ngramsByOrder.set(context.length, orderMap);
      }
    }
    if (state.byteCounts) {
      this.byteCounts = new Map(state.byteCounts);
    }
    if (state.totalBytes !== undefined) {
      this.totalBytes = state.totalBytes;
    }
    if (state.nextUnitId !== undefined) {
      this.nextUnitId = state.nextUnitId;
    }
    if (state.config) {
      Object.assign(this.config, state.config);
    }

    // Compute missing continuation counts
    this._computeContinuationCounts();

    // Rebuild trie
    this._buildMacroUnitTrie();
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    let totalNgramContexts = 0;
    for (const orderMap of this.ngramsByOrder.values()) {
      totalNgramContexts += orderMap.size;
    }

    return {
      macroUnitCount: this.macroUnits.size,
      ngramContexts: totalNgramContexts,
      totalBytes: this.totalBytes,
      vocabularySize: this.byteCounts.size,
      avgMacroUnitLength: this.macroUnits.size > 0
        ? Array.from(this.macroUnits.values()).reduce((sum, u) => sum + u.tokens.length, 0) / this.macroUnits.size
        : 0,
      ngramOrders: Array.from(this.ngramsByOrder.keys()).sort((a, b) => a - b)
    };
  }
}

/**
 * Create a macro-unit model
 * @param {Object} [config]
 * @returns {MacroUnitModel}
 */
export function createMacroUnitModel(config = {}) {
  return new MacroUnitModel(config);
}

export default { MacroUnitModel, createMacroUnitModel };
