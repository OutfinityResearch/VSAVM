/**
 * Slot Filler
 * Per DS003/DS008: Fills schema slots from query context
 * Implements the fill_slots algorithm from DS008
 */

import { SlotType } from '../schemas/schema-model.mjs';
import { normalizeText } from '../../canonicalization/normalizers/text-normalizer.mjs';
import { stringAtom, numberAtom } from '../../core/types/terms.mjs';
import { createSymbolId, createEntityId } from '../../core/types/identifiers.mjs';
import { resolveEntity } from '../../canonicalization/normalizers/entity-resolver.mjs';

/**
 * Slot fill methods
 */
export const FillMethod = {
  DIRECT: 'direct',
  TYPE_INFERENCE: 'type_inference',
  VSA_RANKED: 'vsa_ranked',
  VSA_SEARCH: 'vsa_search',
  DEFAULT: 'default',
  NOT_FILLED: 'not_filled'
};

/**
 * Single slot fill result
 */
export class SingleSlotResult {
  constructor(config = {}) {
    this.isFilled = config.isFilled ?? false;
    this.value = config.value ?? null;
    this.confidence = config.confidence ?? 0;
    this.method = config.method ?? FillMethod.NOT_FILLED;
    this.alternatives = config.alternatives ?? [];
    this.sourceToken = config.sourceToken ?? null;
  }
}

/**
 * Slot fill result for entire schema
 */
export class SlotFillResult {
  constructor(config = {}) {
    this.success = config.success ?? false;
    this.bindings = config.bindings ?? new Map();
    this.confidence = config.confidence ?? 0;
    this.ambiguities = config.ambiguities ?? [];
    this.errors = config.errors ?? [];
    this.slotResults = config.slotResults ?? {};
  }

  /**
   * Get a binding value
   */
  getBinding(slotName) {
    return this.bindings.get(slotName);
  }

  /**
   * Check if has binding
   */
  hasBinding(slotName) {
    return this.bindings.has(slotName);
  }

  /**
   * Get all ambiguous slots
   */
  getAmbiguousSlots() {
    return this.ambiguities.map(a => a.slot);
  }
}

/**
 * Slot Filler class - fills schema slots from query
 */
export class SlotFiller {
  /**
   * @param {Object} [options]
   * @param {Object} [options.vsaService] - VSA service for similarity matching
   * @param {Object} [options.entityStore] - Entity store for entity resolution
   */
  constructor(options = {}) {
    this.options = options;
    this.vsaService = options.vsaService ?? null;
    this.entityStore = options.entityStore ?? null;
  }

  /**
   * Fill slots for a schema from query context
   * Per DS008 fill_slots algorithm
   * @param {Object} schema - QuerySchema
   * @param {Object} query - NormalizedQuery
   * @param {Object} [context] - Additional context
   * @returns {SlotFillResult}
   */
  fillSlots(schema, query, context = {}) {
    const bindings = new Map();
    let confidence = 1.0;
    const ambiguities = [];
    const errors = [];
    const slotResults = {};

    for (const slot of schema.slots) {
      const result = this._fillSingleSlot(slot, query, context, bindings);
      slotResults[slot.name] = result;

      if (result.isFilled) {
        bindings.set(slot.name, result.value);
        confidence = Math.min(confidence, result.confidence);

        if (result.alternatives.length > 0) {
          ambiguities.push({
            slot: slot.name,
            chosen: result.value,
            alternatives: result.alternatives,
            confidence: result.confidence
          });
        }
      } else if (slot.required) {
        // Required slot not filled
        if (slot.defaultValue !== null) {
          bindings.set(slot.name, slot.defaultValue);
          confidence *= 0.8;  // Penalty for using default
          slotResults[slot.name] = new SingleSlotResult({
            isFilled: true,
            value: slot.defaultValue,
            confidence: 0.8,
            method: FillMethod.DEFAULT
          });
        } else {
          errors.push(`Required slot '${slot.name}' could not be filled`);
        }
      }
      // Optional slots not filled are OK
    }

    return new SlotFillResult({
      success: errors.length === 0,
      bindings,
      confidence,
      ambiguities,
      errors,
      slotResults
    });
  }

  /**
   * Fill a single slot
   * Per DS008 fill_single_slot algorithm
   * @private
   */
  _fillSingleSlot(slot, query, context, existingBindings) {
    // Step 1: Direct syntactic match
    const directResult = this._findDirectMatch(slot, query);
    if (directResult.isFilled) {
      return directResult;
    }

    // Step 2: Type-based inference
    const typeMatches = this._findByType(slot.type, query, existingBindings, context);
    
    if (typeMatches.length === 1) {
      return new SingleSlotResult({
        isFilled: true,
        value: typeMatches[0].value,
        confidence: 0.9,
        method: FillMethod.TYPE_INFERENCE,
        sourceToken: typeMatches[0].token
      });
    }
    
    if (typeMatches.length > 1) {
      // Ambiguous - use VSA to rank if available
      if (this.vsaService) {
        const ranked = this._rankByVSASimilarity(slot, typeMatches, context);
        if (ranked.length > 0) {
          return new SingleSlotResult({
            isFilled: true,
            value: ranked[0].value,
            confidence: ranked[0].similarity,
            method: FillMethod.VSA_RANKED,
            alternatives: ranked.slice(1),
            sourceToken: ranked[0].token
          });
        }
      } else {
        // No VSA, pick first match
        return new SingleSlotResult({
          isFilled: true,
          value: typeMatches[0].value,
          confidence: 0.7,
          method: FillMethod.TYPE_INFERENCE,
          alternatives: typeMatches.slice(1).map(m => ({
            value: m.value,
            token: m.token
          })),
          sourceToken: typeMatches[0].token
        });
      }
    }

    // Step 3: VSA semantic search (if available)
    if (this.vsaService && context.vsaVectors) {
      const vsaResult = this._vsaSearch(slot, context);
      if (vsaResult.isFilled) {
        return vsaResult;
      }
    }

    // No match found
    return new SingleSlotResult({
      isFilled: false,
      method: FillMethod.NOT_FILLED
    });
  }

  /**
   * Find direct syntactic match for slot
   * @private
   */
  _findDirectMatch(slot, query) {
    const slotNameLower = slot.name.toLowerCase();
    const slotNameNormalized = normalizeText(slot.name);

    // Look for "slotName: value" or "slotName is value" patterns
    const patterns = [
      new RegExp(`\\b${slotNameLower}\\s*[:=]\\s*([\\w\\s]+)`, 'i'),
      new RegExp(`\\b${slotNameLower}\\s+(?:is|are|was|were)\\s+([\\w\\s]+)`, 'i'),
      new RegExp(`\\b(?:the\\s+)?${slotNameLower}\\s+([\\w]+)`, 'i')
    ];

    for (const pattern of patterns) {
      const match = query.originalText.match(pattern);
      if (match && match[1]) {
        const valueText = normalizeText(match[1].trim());
        const value = this._createValueForType(valueText, slot.type);
        
        if (value !== null) {
          return new SingleSlotResult({
            isFilled: true,
            value,
            confidence: 1.0,
            method: FillMethod.DIRECT,
            sourceToken: match[1].trim()
          });
        }
      }
    }

    return new SingleSlotResult({ isFilled: false });
  }

  /**
   * Find candidates by type
   * @private
   */
  _findByType(slotType, query, existingBindings, context = {}) {
    const candidates = [];
    const usedValues = new Set([...existingBindings.values()].map(v => JSON.stringify(v)));

    if (slotType === SlotType.PREDICATE && query.originalText) {
      const matches = query.originalText.matchAll(/\b([A-Za-z][\w-]*):([\w-]+)\b/g);
      for (const match of matches) {
        const namespace = normalizeText(match[1]);
        const name = normalizeText(match[2]);
        const value = createSymbolId(namespace, name);
        const valueKey = JSON.stringify(value);
        if (!usedValues.has(valueKey)) {
          candidates.push({ value, token: match[0], score: 1.0 });
        }
      }
      if (candidates.length > 0) {
        return candidates;
      }
    }

    const entityCandidates = slotType === SlotType.ENTITY
      ? (context.entityCandidates ?? context.entities ?? this.entityStore?.getAll?.() ?? [])
      : [];

    for (const token of query.tokens) {
      let value = null;
      let score = this._scoreCandidate(token, slotType);

      if (slotType === SlotType.ENTITY && entityCandidates.length > 0) {
        const resolved = resolveEntity(token, context, entityCandidates, {
          vsa: this.vsaService
        });
        if (resolved.entityId) {
          value = resolved.entityId;
          score = resolved.confidence;
        }
      } else {
        value = this._createValueForType(token, slotType);
      }
      
      if (value !== null) {
        const valueKey = JSON.stringify(value);
        if (!usedValues.has(valueKey)) {
          candidates.push({ value, token, score });
        }
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * Create a value of the appropriate type
   * @private
   */
  _createValueForType(text, slotType) {
    const normalized = normalizeText(text);

    switch (slotType) {
      case SlotType.STRING:
        return stringAtom(normalized);

      case SlotType.NUMBER: {
        const num = parseFloat(text);
        if (!isNaN(num)) {
          return numberAtom(num);
        }
        // Try word numbers
        const wordNum = this._wordToNumber(normalized);
        if (wordNum !== null) {
          return numberAtom(wordNum);
        }
        return null;
      }

      case SlotType.ENTITY: {
        // Create entity ID from text
        // In production, would use entity resolution
        if (normalized.length > 0 && /^[a-z]/.test(normalized)) {
          return createEntityId('query', normalized);
        }
        return null;
      }

      case SlotType.PREDICATE: {
        // Create predicate from text
        if (normalized.length > 0 && /^[a-z_]/.test(normalized)) {
          return createSymbolId('query', normalized);
        }
        return null;
      }

      case SlotType.TERM:
        // Accept any string as term
        return stringAtom(normalized);

      case SlotType.FACT_PATTERN:
        // Fact patterns need more complex parsing
        return { pattern: normalized };

      default:
        return stringAtom(normalized);
    }
  }

  /**
   * Convert word numbers to numeric
   * @private
   */
  _wordToNumber(word) {
    const words = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
      'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
      'eighteen': 18, 'nineteen': 19, 'twenty': 20,
      'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
      'seventy': 70, 'eighty': 80, 'ninety': 90,
      'hundred': 100, 'thousand': 1000, 'million': 1000000
    };
    return words[word.toLowerCase()] ?? null;
  }

  /**
   * Score a candidate for a slot type
   * @private
   */
  _scoreCandidate(token, slotType) {
    let score = 0.5;

    // Boost for proper nouns (capitalized in original)
    if (/^[A-Z]/.test(token)) {
      score += 0.2;
    }

    // Boost for longer tokens (more specific)
    if (token.length > 5) {
      score += 0.1;
    }

    // Type-specific scoring
    switch (slotType) {
      case SlotType.NUMBER:
        if (/^\d+$/.test(token)) score += 0.3;
        break;
      case SlotType.ENTITY:
        if (/^[A-Z]/.test(token)) score += 0.3;
        break;
      case SlotType.PREDICATE:
        if (/^[a-z_]+$/.test(token)) score += 0.2;
        break;
    }

    return score;
  }

  /**
   * Rank candidates by VSA similarity
   * @private
   */
  _rankByVSASimilarity(slot, candidates, context) {
    if (!this.vsaService) return candidates;

    const slotVector = this.vsaService.generate(slot.name);
    
    const ranked = candidates.map(candidate => {
      const candidateVector = this.vsaService.generate(
        typeof candidate.value === 'string' ? candidate.value : JSON.stringify(candidate.value)
      );
      const similarity = this.vsaService.similarity(slotVector, candidateVector);
      return { ...candidate, similarity };
    });

    ranked.sort((a, b) => b.similarity - a.similarity);
    return ranked;
  }

  /**
   * VSA semantic search for slot value
   * @private
   */
  _vsaSearch(slot, context) {
    // Placeholder for VSA-based semantic search
    // Would search for semantically similar terms in context
    return new SingleSlotResult({ isFilled: false });
  }

  /**
   * Set VSA service
   * @param {Object} vsaService
   */
  setVSAService(vsaService) {
    this.vsaService = vsaService;
  }

  /**
   * Set entity store
   * @param {Object} entityStore
   */
  setEntityStore(entityStore) {
    this.entityStore = entityStore;
  }
}

/**
 * Create a slot filler
 * @param {Object} [options]
 * @returns {SlotFiller}
 */
export function createSlotFiller(options = {}) {
  return new SlotFiller(options);
}

export default {
  SlotFiller,
  SlotFillResult,
  SingleSlotResult,
  createSlotFiller,
  FillMethod
};
