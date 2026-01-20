/**
 * Canonicalization utilities for VSAVM
 * Per DS007/DS008: deterministic normalization for text, numbers, time, and terms.
 */

import { DEFAULT_CONFIG } from '../config/config-schema.mjs';
import { AtomType, isAtom, isStruct } from '../types/terms.mjs';
import { entityIdToString, symbolIdToString } from '../types/identifiers.mjs';

export const DEFAULT_CANONICALIZATION_OPTIONS = { ...DEFAULT_CONFIG.canonicalization };

/**
 * Merge canonicalization options with defaults.
 * @param {Object} [options]
 * @returns {Object}
 */
export function resolveCanonicalizationOptions(options = undefined) {
  return { ...DEFAULT_CANONICALIZATION_OPTIONS, ...(options || {}) };
}

/**
 * Canonicalize free text (user-provided strings, slot names, etc).
 * @param {string} input
 * @param {Object} [options]
 * @returns {string}
 */
export function canonicalizeText(input, options = undefined) {
  const opts = resolveCanonicalizationOptions(options);
  let text = String(input ?? '');

  // Step 1: Unicode normalization (NFC)
  text = text.normalize('NFC');

  // Step 2: Case normalization
  if (!opts.caseSensitive) {
    text = text.toLowerCase();
  }

  // Step 3: Whitespace normalization
  if (opts.normalizeWhitespace) {
    text = text.replace(/\s+/g, ' ').trim();
  } else {
    text = text.trim();
  }

  // Step 4: Punctuation removal
  if (opts.stripPunctuation) {
    // Keep letters, numbers, whitespace, and underscore.
    text = text.replace(/[^\p{L}\p{N}\s_]/gu, '');
  }

  return text;
}

/**
 * Canonicalize a number by rounding to configured precision.
 * Unit conversion is not implemented (placeholder for future unit system).
 * @param {number} input
 * @param {Object} [options]
 * @param {string} [unit]
 * @returns {number}
 */
export function canonicalizeNumber(input, options = undefined, unit = undefined) {
  const opts = resolveCanonicalizationOptions(options);
  const value = Number(input);

  if (!Number.isFinite(value)) {
    return value; // NaN / ±Infinity stay as-is (still deterministic)
  }

  const precisionDigits = Number.isInteger(opts.numberPrecision) ? opts.numberPrecision : 6;
  const factor = 10 ** precisionDigits;
  const rounded = Math.round(value * factor) / factor;

  return rounded;
}

const PRECISION_RANK = {
  ms: 0,
  second: 1,
  minute: 2,
  hour: 3,
  day: 4,
  month: 5,
  year: 6
};

/**
 * Return the coarser (larger) of two time precisions.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function coarserPrecision(a, b) {
  const ra = PRECISION_RANK[a] ?? PRECISION_RANK.second;
  const rb = PRECISION_RANK[b] ?? PRECISION_RANK.second;
  return ra >= rb ? a : b;
}

/**
 * Truncate epoch milliseconds to a given precision (UTC).
 * @param {number} timestampMs
 * @param {string} precision
 * @returns {number}
 */
export function truncateToPrecision(timestampMs, precision) {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts)) return ts;

  switch (precision) {
    case 'ms':
      return ts;
    case 'second':
      return Math.floor(ts / 1000) * 1000;
    case 'minute':
      return Math.floor(ts / 60000) * 60000;
    case 'hour':
      return Math.floor(ts / 3600000) * 3600000;
    case 'day':
      return Math.floor(ts / 86400000) * 86400000;
    case 'month': {
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
    }
    case 'year': {
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    }
    default:
      return Math.floor(ts / 1000) * 1000;
  }
}

/**
 * Canonicalize a TimeRef value.
 * @param {Object} input
 * @param {Object} [options]
 * @returns {Object}
 */
export function canonicalizeTimeRef(input, options = undefined) {
  const opts = resolveCanonicalizationOptions(options);
  if (!input || typeof input !== 'object') return input;

  const precision = input.precision ?? opts.timePrecision ?? 'second';

  switch (input.type) {
    case 'instant': {
      const instant = truncateToPrecision(input.instant, precision);
      return { type: 'instant', instant, precision };
    }
    case 'interval': {
      const start = input.start ?? null;
      const end = input.end ?? null;

      const startTr = start === null ? null : truncateToPrecision(start, precision);
      const endTr = end === null ? null : truncateToPrecision(end, precision);

      if (startTr !== null && endTr !== null && startTr > endTr) {
        return { type: 'interval', start: endTr, end: startTr, precision };
      }

      const out = { type: 'interval', precision };
      if (startTr !== null) out.start = startTr;
      if (endTr !== null) out.end = endTr;
      return out;
    }
    case 'relative': {
      const out = { type: 'relative', precision };
      if (input.anchor !== undefined) out.anchor = input.anchor;
      if (input.offset !== undefined) out.offset = input.offset;
      return out;
    }
    case 'unknown':
      return { type: 'unknown', precision };
    default:
      return { ...input, precision };
  }
}

/**
 * Canonicalize a SymbolId. This is intentionally conservative (no punctuation stripping).
 * @param {{namespace: string, name: string}} symbolId
 * @param {Object} [options]
 * @returns {{namespace: string, name: string}}
 */
export function canonicalizeSymbolId(symbolId, options = undefined) {
  const opts = resolveCanonicalizationOptions(options);
  const nsRaw = String(symbolId?.namespace ?? '').normalize('NFC').trim();
  const nameRaw = String(symbolId?.name ?? '').normalize('NFC').trim();

  return {
    namespace: opts.caseSensitive ? nsRaw : nsRaw.toLowerCase(),
    name: opts.caseSensitive ? nameRaw : nameRaw.toLowerCase()
  };
}

/**
 * Canonicalize an EntityId. This is intentionally conservative (no punctuation stripping).
 * @param {{source: string, localId: string, version?: number}} entityId
 * @returns {{source: string, localId: string, version?: number}}
 */
export function canonicalizeEntityId(entityId) {
  const source = String(entityId?.source ?? '').normalize('NFC').trim();
  const localId = String(entityId?.localId ?? '').normalize('NFC').trim();
  const out = { source, localId };
  if (entityId?.version !== undefined) out.version = entityId.version;
  return out;
}

/**
 * Canonicalize a term (Atom or Struct). Unknown shapes are returned unchanged.
 * @param {Object} term
 * @param {Object} [options]
 * @returns {Object}
 */
export function canonicalizeTerm(term, options = undefined) {
  const opts = resolveCanonicalizationOptions(options);

  if (isAtom(term)) {
    switch (term.type) {
      case AtomType.STRING:
        return { type: AtomType.STRING, value: canonicalizeText(term.value, opts) };
      case AtomType.NUMBER:
        return { type: AtomType.NUMBER, value: canonicalizeNumber(term.value, opts) };
      case AtomType.INTEGER:
        return { type: AtomType.INTEGER, value: Math.trunc(Number(term.value)) };
      case AtomType.BOOLEAN:
        return { type: AtomType.BOOLEAN, value: Boolean(term.value) };
      case AtomType.TIME:
        return { type: AtomType.TIME, value: canonicalizeTimeRef(term.value, opts) };
      case AtomType.ENTITY:
        return { type: AtomType.ENTITY, value: canonicalizeEntityId(term.value) };
      case AtomType.SYMBOL:
        return { type: AtomType.SYMBOL, value: canonicalizeSymbolId(term.value, opts) };
      case AtomType.NULL:
        return { type: AtomType.NULL, value: null };
      default:
        return { ...term };
    }
  }

  if (isStruct(term)) {
    const canonicalType = canonicalizeSymbolId(term.structType, opts);

    const slotEntries = [...term.slots.entries()].map(([slotName, slotValue]) => ([
      canonicalizeText(slotName, opts),
      canonicalizeTerm(slotValue, opts)
    ]));

    slotEntries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    return {
      structType: canonicalType,
      slots: new Map(slotEntries)
    };
  }

  return term;
}

/**
 * Serialize a canonical term to a deterministic JSON string (stable slot ordering).
 * @param {Object} term
 * @param {Object} [options]
 * @returns {string}
 */
export function serializeCanonicalTerm(term, options = undefined) {
  const opts = resolveCanonicalizationOptions(options);
  const canonical = canonicalizeTerm(term, opts);

  const toJson = (t) => {
    if (isAtom(t)) {
      if (t.type === AtomType.ENTITY) {
        return { kind: 'atom', type: t.type, value: entityIdToString(t.value) };
      }
      if (t.type === AtomType.SYMBOL) {
        return { kind: 'atom', type: t.type, value: symbolIdToString(t.value) };
      }
      if (t.type === AtomType.TIME) {
        return { kind: 'atom', type: t.type, value: canonicalizeTimeRef(t.value, opts) };
      }
      return { kind: 'atom', type: t.type, value: t.value };
    }

    if (isStruct(t)) {
      const slots = [...t.slots.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => [k, toJson(v)]);
      return { kind: 'struct', type: symbolIdToString(t.structType), slots };
    }

    return { kind: 'unknown', value: t };
  };

  return JSON.stringify(toJson(canonical));
}

