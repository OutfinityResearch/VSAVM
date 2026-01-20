/**
 * Term types for VSAVM
 * Per DS007: Atom, TimeRef, Struct, Term
 */

import { symbolIdToString, entityIdToString } from './identifiers.mjs';

/**
 * Atom types enum
 */
export const AtomType = {
  ENTITY: 'entity',
  SYMBOL: 'symbol',
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  TIME: 'time',
  NULL: 'null'
};

/**
 * Time precision levels
 */
export const TimePrecision = {
  MS: 'ms',
  SECOND: 'second',
  MINUTE: 'minute',
  HOUR: 'hour',
  DAY: 'day',
  MONTH: 'month',
  YEAR: 'year'
};

/**
 * TimeRef types
 */
export const TimeRefType = {
  INSTANT: 'instant',
  INTERVAL: 'interval',
  RELATIVE: 'relative',
  UNKNOWN: 'unknown'
};

/**
 * Create a TimeRef for an instant
 * @param {number} epochMs - Unix epoch milliseconds
 * @param {string} [precision='ms'] - Time precision
 * @returns {{type: 'instant', instant: number, precision: string}}
 */
export function createInstant(epochMs, precision = TimePrecision.MS) {
  return {
    type: TimeRefType.INSTANT,
    instant: epochMs,
    precision
  };
}

/**
 * Create a TimeRef for an interval
 * @param {number|null} start - Start epoch ms (null = unbounded)
 * @param {number|null} end - End epoch ms (null = unbounded)
 * @param {string} [precision='ms'] - Time precision
 * @returns {{type: 'interval', start?: number, end?: number, precision: string}}
 */
export function createInterval(start, end, precision = TimePrecision.MS) {
  const ref = {
    type: TimeRefType.INTERVAL,
    precision
  };
  if (start !== null) ref.start = start;
  if (end !== null) ref.end = end;
  return ref;
}

/**
 * Create an unknown TimeRef
 * @returns {{type: 'unknown', precision: string}}
 */
export function createUnknownTime() {
  return {
    type: TimeRefType.UNKNOWN,
    precision: TimePrecision.DAY
  };
}

/**
 * Check if two time intervals overlap
 * @param {Object} timeA - TimeRef
 * @param {Object} timeB - TimeRef
 * @param {boolean} [strict=true] - Use strict overlap policy
 * @returns {boolean}
 */
export function timeOverlaps(timeA, timeB, strictOrPolicy = true) {
  // Default policy is strict (per DS007).
  const policy = typeof strictOrPolicy === 'string'
    ? strictOrPolicy
    : (strictOrPolicy ? 'strict' : 'lenient');

  // Null/undefined time is unbounded (always overlaps).
  if (!timeA || !timeB) return true;

  // Unknown time handling is policy-dependent (per DS008).
  if (timeA.type === TimeRefType.UNKNOWN || timeB.type === TimeRefType.UNKNOWN) {
    return policy === 'lenient';
  }

  // Relative time cannot be compared without anchor resolution; treat as overlap only in lenient mode.
  if (timeA.type === TimeRefType.RELATIVE || timeB.type === TimeRefType.RELATIVE) {
    return policy === 'lenient';
  }

  const precisionRank = {
    ms: 0,
    second: 1,
    minute: 2,
    hour: 3,
    day: 4,
    month: 5,
    year: 6
  };

  const coarserPrecision = (a, b) => {
    const ra = precisionRank[a] ?? precisionRank.second;
    const rb = precisionRank[b] ?? precisionRank.second;
    return ra >= rb ? a : b;
  };

  const truncateToPrecision = (timestampMs, precision) => {
    const ts = Number(timestampMs);
    if (!Number.isFinite(ts)) return ts;

    switch (precision) {
      case TimePrecision.MS:
        return ts;
      case TimePrecision.SECOND:
        return Math.floor(ts / 1000) * 1000;
      case TimePrecision.MINUTE:
        return Math.floor(ts / 60000) * 60000;
      case TimePrecision.HOUR:
        return Math.floor(ts / 3600000) * 3600000;
      case TimePrecision.DAY:
        return Math.floor(ts / 86400000) * 86400000;
      case TimePrecision.MONTH: {
        const d = new Date(ts);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
      }
      case TimePrecision.YEAR: {
        const d = new Date(ts);
        return Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
      }
      default:
        return Math.floor(ts / 1000) * 1000;
    }
  };

  const timeToInterval = (t) => {
    if (t.type === TimeRefType.INSTANT) {
      return { start: t.instant, end: t.instant, precision: t.precision ?? TimePrecision.MS };
    }
    if (t.type === TimeRefType.INTERVAL) {
      return {
        start: t.start ?? -Infinity,
        end: t.end ?? Infinity,
        precision: t.precision ?? TimePrecision.MS
      };
    }
    return null;
  };

  const i1 = timeToInterval(timeA);
  const i2 = timeToInterval(timeB);
  if (!i1 || !i2) return policy === 'lenient';

  let precision = coarserPrecision(i1.precision, i2.precision);
  if (policy === 'lenient') {
    precision = TimePrecision.DAY;
  }

  const s1 = truncateToPrecision(i1.start, precision);
  const e1 = truncateToPrecision(i1.end, precision);
  const s2 = truncateToPrecision(i2.start, precision);
  const e2 = truncateToPrecision(i2.end, precision);

  return s1 <= e2 && s2 <= e1;
}

/**
 * Deterministic string form for TimeRef (for hashing/debugging).
 * @param {Object} timeRef
 * @returns {string}
 */
export function timeRefToString(timeRef) {
  if (!timeRef || typeof timeRef !== 'object') return String(timeRef);

  const precision = timeRef.precision ?? TimePrecision.MS;

  switch (timeRef.type) {
    case TimeRefType.INSTANT:
      return `instant:${timeRef.instant}@${precision}`;
    case TimeRefType.INTERVAL: {
      const start = timeRef.start ?? '-inf';
      const end = timeRef.end ?? '+inf';
      return `interval:${start}..${end}@${precision}`;
    }
    case TimeRefType.RELATIVE: {
      const anchor = timeRef.anchor ?? '?';
      const offset = timeRef.offset ?? 0;
      return `relative:${anchor}${offset >= 0 ? '+' : ''}${offset}@${precision}`;
    }
    case TimeRefType.UNKNOWN:
      return `unknown@${precision}`;
    default:
      return `${String(timeRef.type)}@${precision}`;
  }
}

/**
 * Structural equality for TimeRef objects.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function timeRefsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if ((a.precision ?? TimePrecision.MS) !== (b.precision ?? TimePrecision.MS)) return false;

  switch (a.type) {
    case TimeRefType.INSTANT:
      return a.instant === b.instant;
    case TimeRefType.INTERVAL:
      return (a.start ?? null) === (b.start ?? null) && (a.end ?? null) === (b.end ?? null);
    case TimeRefType.RELATIVE:
      return (a.anchor ?? null) === (b.anchor ?? null) && (a.offset ?? null) === (b.offset ?? null);
    case TimeRefType.UNKNOWN:
      return true;
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * Create an Atom
 * @param {string} type - AtomType value
 * @param {*} value - The atom value
 * @returns {{type: string, value: *}}
 */
export function createAtom(type, value) {
  return { type, value };
}

/**
 * Create a string atom
 * @param {string} value
 * @returns {{type: 'string', value: string}}
 */
export function stringAtom(value) {
  return createAtom(AtomType.STRING, value);
}

/**
 * Create a number atom
 * @param {number} value
 * @returns {{type: 'number', value: number}}
 */
export function numberAtom(value) {
  return createAtom(AtomType.NUMBER, value);
}

/**
 * Create an integer atom
 * @param {number} value
 * @returns {{type: 'integer', value: number}}
 */
export function integerAtom(value) {
  return createAtom(AtomType.INTEGER, Math.floor(value));
}

/**
 * Create a boolean atom
 * @param {boolean} value
 * @returns {{type: 'boolean', value: boolean}}
 */
export function booleanAtom(value) {
  return createAtom(AtomType.BOOLEAN, !!value);
}

/**
 * Create a null atom
 * @returns {{type: 'null', value: null}}
 */
export function nullAtom() {
  return createAtom(AtomType.NULL, null);
}

/**
 * Create an entity atom
 * @param {{source: string, localId: string, version?: number}} entityId
 * @returns {{type: 'entity', value: Object}}
 */
export function entityAtom(entityId) {
  return createAtom(AtomType.ENTITY, entityId);
}

/**
 * Create a symbol atom
 * @param {{namespace: string, name: string}} symbolId
 * @returns {{type: 'symbol', value: Object}}
 */
export function symbolAtom(symbolId) {
  return createAtom(AtomType.SYMBOL, symbolId);
}

/**
 * Create a time atom
 * @param {Object} timeRef
 * @returns {{type: 'time', value: Object}}
 */
export function timeAtom(timeRef) {
  return createAtom(AtomType.TIME, timeRef);
}

/**
 * Create a Struct (typed record with named slots)
 * @param {{namespace: string, name: string}} type - Struct type identifier
 * @param {Object<string, Object>} slots - slot name → Term
 * @returns {{structType: Object, slots: Map<string, Object>}}
 */
export function createStruct(type, slots) {
  return {
    structType: type,
    slots: new Map(Object.entries(slots))
  };
}

/**
 * Check if a term is an Atom
 * @param {*} term
 * @returns {boolean}
 */
export function isAtom(term) {
  return term && typeof term.type === 'string' && 'value' in term && !('structType' in term);
}

/**
 * Check if a term is a Struct
 * @param {*} term
 * @returns {boolean}
 */
export function isStruct(term) {
  return term && 'structType' in term && term.slots instanceof Map;
}

/**
 * Get canonical string representation of a term
 * @param {Object} term
 * @returns {string}
 */
export function termToString(term) {
  if (isAtom(term)) {
    switch (term.type) {
      case AtomType.STRING:
        return `"${term.value}"`;
      case AtomType.NUMBER:
      case AtomType.INTEGER:
        return String(term.value);
      case AtomType.BOOLEAN:
        return term.value ? 'true' : 'false';
      case AtomType.NULL:
        return 'null';
      case AtomType.ENTITY:
        return `@${entityIdToString(term.value)}`;
      case AtomType.SYMBOL:
        return symbolIdToString(term.value);
      case AtomType.TIME:
        return `#time(${timeRefToString(term.value)})`;
      default:
        return String(term.value);
    }
  }
  
  if (isStruct(term)) {
    const slotStrs = [];
    for (const [name, value] of term.slots) {
      slotStrs.push(`${name}: ${termToString(value)}`);
    }
    slotStrs.sort();
    return `${symbolIdToString(term.structType)}(${slotStrs.join(', ')})`;
  }
  
  return String(term);
}

/**
 * Compare two terms for equality
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function termsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  
  if (isAtom(a) && isAtom(b)) {
    if (a.type !== b.type) return false;
    if (a.type === AtomType.ENTITY) {
      return entityIdToString(a.value) === entityIdToString(b.value);
    }
    if (a.type === AtomType.SYMBOL) {
      return symbolIdToString(a.value) === symbolIdToString(b.value);
    }
    if (a.type === AtomType.TIME) {
      return timeRefsEqual(a.value, b.value);
    }
    return a.value === b.value;
  }
  
  if (isStruct(a) && isStruct(b)) {
    if (symbolIdToString(a.structType) !== symbolIdToString(b.structType)) {
      return false;
    }
    if (a.slots.size !== b.slots.size) return false;
    for (const [key, val] of a.slots) {
      if (!b.slots.has(key)) return false;
      if (!termsEqual(val, b.slots.get(key))) return false;
    }
    return true;
  }
  
  return false;
}
