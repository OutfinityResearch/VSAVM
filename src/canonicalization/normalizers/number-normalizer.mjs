/**
 * Number Normalizer
 * Per DS007 CANON_NUMBER_PRECISION and DS008 number canonicalization algorithm
 */

/**
 * Default number normalization options (per DS007)
 */
export const NUMBER_NORMALIZE_DEFAULTS = {
  precision: 6,  // CANON_NUMBER_PRECISION: decimal places
};

/**
 * Unit conversion factors to base SI units
 * Per DS008: convert_to_base_unit()
 */
const UNIT_CONVERSIONS = {
  // Length → meters
  m: { factor: 1, base: 'm' },
  km: { factor: 1000, base: 'm' },
  cm: { factor: 0.01, base: 'm' },
  mm: { factor: 0.001, base: 'm' },
  mi: { factor: 1609.344, base: 'm' },
  ft: { factor: 0.3048, base: 'm' },
  in: { factor: 0.0254, base: 'm' },
  
  // Mass → kilograms
  kg: { factor: 1, base: 'kg' },
  g: { factor: 0.001, base: 'kg' },
  mg: { factor: 0.000001, base: 'kg' },
  lb: { factor: 0.453592, base: 'kg' },
  oz: { factor: 0.0283495, base: 'kg' },
  
  // Time → seconds
  s: { factor: 1, base: 's' },
  ms: { factor: 0.001, base: 's' },
  min: { factor: 60, base: 's' },
  h: { factor: 3600, base: 's' },
  hr: { factor: 3600, base: 's' },
  d: { factor: 86400, base: 's' },
  
  // Temperature (special handling)
  c: { factor: 1, base: 'c', type: 'celsius' },
  f: { factor: 1, base: 'c', type: 'fahrenheit' },
  k: { factor: 1, base: 'c', type: 'kelvin' },
  
  // Volume → liters
  l: { factor: 1, base: 'l' },
  ml: { factor: 0.001, base: 'l' },
  gal: { factor: 3.78541, base: 'l' },
  
  // Data → bytes
  b: { factor: 1, base: 'b' },
  kb: { factor: 1024, base: 'b' },
  mb: { factor: 1048576, base: 'b' },
  gb: { factor: 1073741824, base: 'b' },
  tb: { factor: 1099511627776, base: 'b' },
};

/**
 * Canonical number result type
 * @typedef {Object} CanonicalNumber
 * @property {'finite'|'nan'|'infinity'} type
 * @property {number} [value] - Canonical value (for finite)
 * @property {number} [sign] - Sign for infinity (-1 or 1)
 * @property {string|null} [unit] - Base unit (or null)
 */

/**
 * Convert value with unit to base unit
 * @param {number} value
 * @param {string} unit
 * @returns {{value: number, baseUnit: string|null}}
 */
function convertToBaseUnit(value, unit) {
  if (!unit) {
    return { value, baseUnit: null };
  }

  const unitLower = unit.toLowerCase();
  const conversion = UNIT_CONVERSIONS[unitLower];

  if (!conversion) {
    // Unknown unit, return as-is
    return { value, baseUnit: unit };
  }

  // Handle temperature specially
  if (conversion.type === 'fahrenheit') {
    // Fahrenheit to Celsius
    return { value: (value - 32) * (5 / 9), baseUnit: 'c' };
  }
  if (conversion.type === 'kelvin') {
    // Kelvin to Celsius
    return { value: value - 273.15, baseUnit: 'c' };
  }

  return {
    value: value * conversion.factor,
    baseUnit: conversion.base
  };
}

/**
 * Normalize a number to canonical form per DS008 algorithm
 * @param {number} input - Number to normalize
 * @param {string} [unit] - Optional unit
 * @param {Object} [options] - Normalization options
 * @returns {CanonicalNumber}
 */
export function normalizeNumber(input, unit = null, options = {}) {
  const opts = { ...NUMBER_NORMALIZE_DEFAULTS, ...options };

  // Handle NaN
  if (Number.isNaN(input)) {
    return { type: 'nan' };
  }

  // Handle infinity
  if (!Number.isFinite(input)) {
    return {
      type: 'infinity',
      sign: input > 0 ? 1 : -1
    };
  }

  // Step 1: Convert to base unit if unit provided
  const { value, baseUnit } = convertToBaseUnit(input, unit);

  // Step 2: Round to canonical precision
  const precision = Math.pow(10, opts.precision);
  const canonicalValue = Math.round(value * precision) / precision;

  return {
    type: 'finite',
    value: canonicalValue,
    unit: baseUnit
  };
}

/**
 * Check if two numbers are canonically equivalent
 * @param {number} a - First number
 * @param {number} b - Second number
 * @param {Object} [options] - Normalization options
 * @returns {boolean}
 */
export function numbersEquivalent(a, b, options = {}) {
  const canonA = normalizeNumber(a, null, options);
  const canonB = normalizeNumber(b, null, options);

  if (canonA.type !== canonB.type) return false;

  if (canonA.type === 'nan') return true;  // NaN === NaN for canonicalization
  if (canonA.type === 'infinity') return canonA.sign === canonB.sign;

  return canonA.value === canonB.value && canonA.unit === canonB.unit;
}

/**
 * Convert canonical number to string for hashing
 * @param {CanonicalNumber} canonical
 * @returns {string}
 */
export function canonicalNumberToString(canonical) {
  switch (canonical.type) {
    case 'nan':
      return 'NaN';
    case 'infinity':
      return canonical.sign > 0 ? '+Infinity' : '-Infinity';
    case 'finite':
      return canonical.unit
        ? `${canonical.value}:${canonical.unit}`
        : String(canonical.value);
    default:
      return String(canonical.value);
  }
}

/**
 * Create a number normalizer with preset options
 * @param {Object} options - Normalization options
 * @returns {function(number, string?): CanonicalNumber}
 */
export function createNumberNormalizer(options = {}) {
  const opts = { ...NUMBER_NORMALIZE_DEFAULTS, ...options };
  return (input, unit = null) => normalizeNumber(input, unit, opts);
}

export default {
  normalizeNumber,
  numbersEquivalent,
  canonicalNumberToString,
  createNumberNormalizer,
  NUMBER_NORMALIZE_DEFAULTS
};
