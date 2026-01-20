/**
 * Fact types for VSAVM
 * Per DS007: FactId, FactInstance, Polarity, ProvenanceLink
 */

import { symbolIdToString } from './identifiers.mjs';
import { termToString } from './terms.mjs';
import { sha256Truncate, base64urlEncode } from '../hash.mjs';
import { 
  resolveCanonicalizationOptions,
  canonicalizeText,
  canonicalizeTerm,
  canonicalizeTimeRef,
  canonicalizeSymbolId,
  serializeCanonicalTerm
} from '../canonicalization/canonicalize.mjs';

/**
 * Polarity enum
 */
export const Polarity = {
  ASSERT: 'assert',
  DENY: 'deny'
};

/**
 * Create a ProvenanceLink
 * @param {{type: string, id: string}} sourceId
 * @param {Object} [options]
 * @param {{start: number, end: number}} [options.eventSpan]
 * @param {string} [options.extractorId]
 * @param {number} [options.timestamp]
 * @returns {Object}
 */
export function createProvenanceLink(sourceId, options = {}) {
  const link = {
    sourceId,
    timestamp: options.timestamp ?? Date.now()
  };
  if (options.eventSpan) link.eventSpan = options.eventSpan;
  if (options.extractorId) link.extractorId = options.extractorId;
  return link;
}

/**
 * Compute FactId from fact components (per DS007)
 * @param {{namespace: string, name: string}} predicate
 * @param {Map<string, Object>} args - slot name → Term
 * @param {Map<string, Object>} [qualifiers] - excluding time, scope, provenance
 * @param {Object} [canonicalization] - Canonicalization options (DS007)
 * @returns {string} Base64url encoded FactId
 */
export function computeFactId(predicate, args, qualifiers = new Map(), canonicalization = undefined) {
  const opts = resolveCanonicalizationOptions(canonicalization);

  // Step 1: Canonicalize + hash predicate (truncate SHA-256 to 16 bytes)
  const canonicalPredicate = canonicalizeSymbolId(predicate, opts);
  const predSerialized = symbolIdToString(canonicalPredicate);
  const predHash = sha256Truncate(predSerialized, 16);

  // Step 2: Canonicalize + sort arguments, then hash
  const argPairs = [...args.entries()].map(([slotName, slotValue]) => ([
    canonicalizeText(slotName, opts),
    canonicalizeTerm(slotValue, opts)
  ]));
  argPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const argsSerialized = JSON.stringify(argPairs.map(([k, v]) => [k, serializeCanonicalTerm(v, opts)]));
  const argsHash = sha256Truncate(argsSerialized, 16);

  // Step 3: Canonicalize qualifiers (exclude provenance, time, scope, confidence), then hash
  const excluded = new Set(['time', 'scope', 'provenance', 'confidence']);
  const qualPairs = [...qualifiers.entries()]
    .map(([k, v]) => [canonicalizeText(k, opts), v])
    .filter(([k]) => !excluded.has(k))
    .map(([k, v]) => [k, canonicalizeTerm(v, opts)]);
  qualPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const qualsSerialized = JSON.stringify(qualPairs.map(([k, v]) => [k, serializeCanonicalTerm(v, opts)]));
  const qualsHash = sha256Truncate(qualsSerialized, 16);

  // Step 4: Concatenate and base64url encode (48 bytes total)
  const factIdBytes = new Uint8Array(48);
  factIdBytes.set(predHash, 0);
  factIdBytes.set(argsHash, 16);
  factIdBytes.set(qualsHash, 32);

  return base64urlEncode(factIdBytes);
}

/**
 * Create a FactInstance
 * @param {{namespace: string, name: string}} predicate
 * @param {Object<string, Object>} args - slot name → Term
 * @param {Object} options
 * @param {string} [options.polarity='assert']
 * @param {{path: string[]}} options.scopeId
 * @param {Object} [options.time]
 * @param {number} [options.confidence]
 * @param {Array} options.provenance
 * @param {Object<string, Object>} [options.qualifiers]
 * @returns {Object}
 */
export function createFactInstance(predicate, args, options) {
  const argsMap = args instanceof Map ? args : new Map(Object.entries(args));
  const qualifiersMap = options.qualifiers 
    ? (options.qualifiers instanceof Map ? options.qualifiers : new Map(Object.entries(options.qualifiers)))
    : new Map();
  
  const canonicalization = options.canonicalization ?? options.canonicalizer?.options;
  const canonOpts = resolveCanonicalizationOptions(canonicalization);

  // Canonicalize predicate/args/qualifiers before hashing and storage (DS007/DS008).
  const canonicalPredicate = canonicalizeSymbolId(predicate, canonOpts);

  const canonicalArgPairs = [...argsMap.entries()].map(([k, v]) => ([
    canonicalizeText(k, canonOpts),
    canonicalizeTerm(v, canonOpts)
  ]));
  canonicalArgPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalArgsMap = new Map(canonicalArgPairs);

  const canonicalQualPairs = [...qualifiersMap.entries()].map(([k, v]) => ([
    canonicalizeText(k, canonOpts),
    canonicalizeTerm(v, canonOpts)
  ]));
  canonicalQualPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalQualifiersMap = new Map(canonicalQualPairs);

  const factId = computeFactId(canonicalPredicate, canonicalArgsMap, canonicalQualifiersMap, canonOpts);
  
  const fact = {
    factId,
    predicate: canonicalPredicate,
    arguments: canonicalArgsMap,
    polarity: options.polarity ?? Polarity.ASSERT,
    scopeId: options.scopeId,
    provenance: options.provenance
  };
  
  if (options.time !== undefined) fact.time = canonicalizeTimeRef(options.time, canonOpts);
  if (options.confidence !== undefined) fact.confidence = options.confidence;
  if (canonicalQualifiersMap.size > 0) fact.qualifiers = canonicalQualifiersMap;
  
  return fact;
}

/**
 * Get string representation of a fact
 * @param {Object} fact
 * @returns {string}
 */
export function factToString(fact) {
  const polaritySign = fact.polarity === Polarity.DENY ? '~' : '';
  const predStr = symbolIdToString(fact.predicate);
  
  const argStrs = [];
  for (const [name, term] of fact.arguments) {
    argStrs.push(`${name}: ${termToString(term)}`);
  }
  argStrs.sort();
  
  return `${polaritySign}${predStr}(${argStrs.join(', ')})`;
}

/**
 * Check if two facts have the same identity (same factId)
 * @param {Object} factA
 * @param {Object} factB
 * @returns {boolean}
 */
export function factsHaveSameId(factA, factB) {
  return factA.factId === factB.factId;
}

/**
 * Check if two facts are in direct conflict (same id, opposite polarity)
 * @param {Object} factA
 * @param {Object} factB
 * @returns {boolean}
 */
export function factsConflict(factA, factB) {
  return factsHaveSameId(factA, factB) && factA.polarity !== factB.polarity;
}

/**
 * Clone a fact with optional modifications
 * @param {Object} fact
 * @param {Object} [modifications]
 * @returns {Object}
 */
export function cloneFact(fact, modifications = {}) {
  return {
    ...fact,
    arguments: new Map(fact.arguments),
    qualifiers: fact.qualifiers ? new Map(fact.qualifiers) : undefined,
    provenance: [...fact.provenance],
    ...modifications
  };
}
