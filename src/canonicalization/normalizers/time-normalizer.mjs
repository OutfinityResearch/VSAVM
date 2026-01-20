/**
 * Time Normalizer
 * Per DS007 TimeRef format and DS008 time canonicalization algorithm
 */

import { 
  TimeRefType, 
  TimePrecision, 
  createInstant, 
  createInterval, 
  createUnknownTime 
} from '../../core/types/terms.mjs';

/**
 * Default time normalization options (per DS007)
 */
export const TIME_NORMALIZE_DEFAULTS = {
  defaultPrecision: 'second',  // CANON_TIME_PRECISION
};

/**
 * Canonical time result type
 * @typedef {Object} CanonicalTime
 * @property {'instant'|'interval'|'relative'|'unknown'} type
 * @property {number} [value] - Truncated instant (for instant type)
 * @property {number} [start] - Truncated start (for interval type)
 * @property {number} [end] - Truncated end (for interval type)
 * @property {string} [anchor] - Anchor reference (for relative type)
 * @property {number} [offset] - Offset in ms (for relative type)
 * @property {string} precision - Time precision
 */

/**
 * Truncate timestamp to specified precision per DS008 algorithm
 * @param {number} timestampMs - Unix epoch milliseconds
 * @param {string} precision - Precision level
 * @returns {number} Truncated timestamp
 */
export function truncateToPrecision(timestampMs, precision) {
  if (timestampMs === null || timestampMs === undefined) {
    return timestampMs;
  }
  
  if (!Number.isFinite(timestampMs)) {
    return timestampMs;
  }

  switch (precision) {
    case TimePrecision.MS:
      return timestampMs;
    case TimePrecision.SECOND:
      return Math.floor(timestampMs / 1000) * 1000;
    case TimePrecision.MINUTE:
      return Math.floor(timestampMs / 60000) * 60000;
    case TimePrecision.HOUR:
      return Math.floor(timestampMs / 3600000) * 3600000;
    case TimePrecision.DAY:
      return Math.floor(timestampMs / 86400000) * 86400000;
    case TimePrecision.MONTH: {
      const d = new Date(timestampMs);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
    }
    case TimePrecision.YEAR: {
      const d = new Date(timestampMs);
      return Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    }
    default:
      // Default to second precision
      return Math.floor(timestampMs / 1000) * 1000;
  }
}

/**
 * Normalize a TimeRef to canonical form per DS008 algorithm
 * @param {Object} input - TimeRef to normalize
 * @param {Object} [options] - Normalization options
 * @returns {CanonicalTime}
 */
export function normalizeTime(input, options = {}) {
  const opts = { ...TIME_NORMALIZE_DEFAULTS, ...options };

  if (!input || typeof input !== 'object') {
    return { type: 'unknown', precision: opts.defaultPrecision };
  }

  const precision = input.precision ?? opts.defaultPrecision;

  switch (input.type) {
    case TimeRefType.INSTANT: {
      const truncated = truncateToPrecision(input.instant, precision);
      return {
        type: 'instant',
        value: truncated,
        precision
      };
    }

    case TimeRefType.INTERVAL: {
      let start = truncateToPrecision(input.start, precision);
      let end = truncateToPrecision(input.end, precision);

      // Per DS008: Ensure start <= end
      if (start !== null && end !== null && start > end) {
        [start, end] = [end, start];
      }

      return {
        type: 'interval',
        start: start ?? null,
        end: end ?? null,
        precision
      };
    }

    case TimeRefType.RELATIVE: {
      // Per DS008: Cannot canonicalize without resolving anchor
      return {
        type: 'relative',
        anchor: input.anchor ?? null,
        offset: input.offset ?? 0,
        precision
      };
    }

    case TimeRefType.UNKNOWN:
    default:
      return { type: 'unknown', precision };
  }
}

/**
 * Check if two times are canonically equivalent
 * @param {Object} a - First TimeRef
 * @param {Object} b - Second TimeRef
 * @param {Object} [options] - Normalization options
 * @returns {boolean}
 */
export function timesEquivalent(a, b, options = {}) {
  const canonA = normalizeTime(a, options);
  const canonB = normalizeTime(b, options);

  if (canonA.type !== canonB.type) return false;
  if (canonA.precision !== canonB.precision) return false;

  switch (canonA.type) {
    case 'instant':
      return canonA.value === canonB.value;
    case 'interval':
      return canonA.start === canonB.start && canonA.end === canonB.end;
    case 'relative':
      return canonA.anchor === canonB.anchor && canonA.offset === canonB.offset;
    case 'unknown':
      return true;
    default:
      return false;
  }
}

/**
 * Convert canonical time to string for hashing
 * @param {CanonicalTime} canonical
 * @returns {string}
 */
export function canonicalTimeToString(canonical) {
  switch (canonical.type) {
    case 'instant':
      return `instant:${canonical.value}@${canonical.precision}`;
    case 'interval': {
      const start = canonical.start ?? '-inf';
      const end = canonical.end ?? '+inf';
      return `interval:${start}..${end}@${canonical.precision}`;
    }
    case 'relative': {
      const anchor = canonical.anchor ?? '?';
      const offset = canonical.offset ?? 0;
      const sign = offset >= 0 ? '+' : '';
      return `relative:${anchor}${sign}${offset}@${canonical.precision}`;
    }
    case 'unknown':
      return `unknown@${canonical.precision}`;
    default:
      return `${canonical.type}@${canonical.precision}`;
  }
}

/**
 * Convert canonical time back to TimeRef
 * @param {CanonicalTime} canonical
 * @returns {Object} TimeRef
 */
export function canonicalTimeToTimeRef(canonical) {
  switch (canonical.type) {
    case 'instant':
      return createInstant(canonical.value, canonical.precision);
    case 'interval':
      return createInterval(canonical.start, canonical.end, canonical.precision);
    case 'relative':
      return {
        type: TimeRefType.RELATIVE,
        anchor: canonical.anchor,
        offset: canonical.offset,
        precision: canonical.precision
      };
    case 'unknown':
    default:
      return createUnknownTime();
  }
}

/**
 * Create a time normalizer with preset options
 * @param {Object} options - Normalization options
 * @returns {function(Object): CanonicalTime}
 */
export function createTimeNormalizer(options = {}) {
  const opts = { ...TIME_NORMALIZE_DEFAULTS, ...options };
  return (input) => normalizeTime(input, opts);
}

export default {
  normalizeTime,
  timesEquivalent,
  canonicalTimeToString,
  canonicalTimeToTimeRef,
  truncateToPrecision,
  createTimeNormalizer,
  TIME_NORMALIZE_DEFAULTS
};
