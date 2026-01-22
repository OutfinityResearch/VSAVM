/**
 * Entity resolution utilities
 * Per DS008: Resolve entity mentions to canonical EntityId values
 */

import { normalizeText, TEXT_NORMALIZE_DEFAULTS } from './text-normalizer.mjs';
import { createEntityId, entityIdToString } from '../../core/types/identifiers.mjs';

export const ENTITY_RESOLUTION_DEFAULTS = {
  similarityThreshold: 0.35,
  allowNewEntities: true,
  defaultSource: 'internal'
};

function getCanonicalMention(mention, options) {
  return normalizeText(mention, {
    ...TEXT_NORMALIZE_DEFAULTS,
    ...options
  });
}

function getCandidateName(candidate) {
  if (!candidate) return '';
  if (typeof candidate === 'string') return candidate;
  if (candidate.canonicalName) return candidate.canonicalName;
  if (candidate.name) return candidate.name;
  if (candidate.localId) return candidate.localId;
  if (candidate.entityId) return entityIdToString(candidate.entityId);
  return entityIdToString(candidate);
}

function defaultCandidateGetter(candidate) {
  if (candidate?.entityId) return candidate.entityId;
  if (candidate?.source && candidate?.localId) return candidate;
  if (typeof candidate === 'string') {
    return createEntityId('external', candidate);
  }
  return null;
}

/**
 * Resolve an entity mention against candidates.
 * @param {string} mention
 * @param {{scopeId?: Object, allowNewEntities?: boolean, source?: string}} context
 * @param {Array} candidates
 * @param {Object} [options]
 * @param {Object} [options.vsa] - VSA strategy with generate/similarity
 * @param {number} [options.similarityThreshold]
 * @param {Function} [options.getEntityId] - candidate -> EntityId
 * @param {Function} [options.getCandidateName] - candidate -> string
 * @returns {{entityId: Object|null, confidence: number, method: string, alternatives?: Array}}
 */
export function resolveEntity(mention, context = {}, candidates = [], options = {}) {
  const opts = {
    ...ENTITY_RESOLUTION_DEFAULTS,
    ...options
  };

  const normalized = getCanonicalMention(mention, opts);
  const getId = options.getEntityId ?? defaultCandidateGetter;
  const getName = options.getCandidateName ?? getCandidateName;

  // Step 1: Exact match
  for (const candidate of candidates) {
    const name = getCanonicalMention(getName(candidate), opts);
    if (name && name === normalized) {
      return {
        entityId: getId(candidate),
        confidence: 1.0,
        method: 'exact_match'
      };
    }
  }

  // Step 2: Alias match (optional explicit aliases field)
  for (const candidate of candidates) {
    const aliases = candidate?.aliases ?? [];
    for (const alias of aliases) {
      const name = getCanonicalMention(alias, opts);
      if (name && name === normalized) {
        return {
          entityId: getId(candidate),
          confidence: 0.95,
          method: 'alias_match'
        };
      }
    }
  }

  // Step 3: VSA similarity match (optional)
  if (options.vsa && typeof options.vsa.generate === 'function' && typeof options.vsa.similarity === 'function') {
    const mentionVector = options.vsa.generate(normalized);
    let bestMatch = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const name = getCanonicalMention(getName(candidate), opts);
      if (!name) continue;
      const candidateVector = options.vsa.generate(name);
      const score = options.vsa.similarity(mentionVector, candidateVector);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch && bestScore >= opts.similarityThreshold) {
      return {
        entityId: getId(bestMatch),
        confidence: bestScore,
        method: 'vsa_similarity'
      };
    }
  }

  // Step 4: Create new entity if allowed
  const allowNew = context.allowNewEntities ?? opts.allowNewEntities;
  if (allowNew) {
    const source = context.source ?? opts.defaultSource;
    return {
      entityId: createEntityId(source, normalized),
      confidence: 1.0,
      method: 'new_entity'
    };
  }

  // Step 5: Ambiguous - return empty with alternatives
  return {
    entityId: null,
    confidence: 0.0,
    method: 'ambiguous',
    alternatives: candidates.map((candidate) => ({
      entityId: getId(candidate),
      name: getName(candidate)
    }))
  };
}

export default {
  resolveEntity,
  ENTITY_RESOLUTION_DEFAULTS
};
