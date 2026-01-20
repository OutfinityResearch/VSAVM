/**
 * Text Normalizer
 * Per DS007 canonicalization constants and DS008 text canonicalization algorithm
 */

/**
 * Default text normalization options (per DS007)
 */
export const TEXT_NORMALIZE_DEFAULTS = {
  caseSensitive: false,          // CANON_CASE_SENSITIVE
  stripPunctuation: true,        // CANON_STRIP_PUNCTUATION
  normalizeWhitespace: true,     // CANON_NORMALIZE_WHITESPACE
  unicodeForm: 'NFC'             // Unicode normalization form
};

/**
 * Normalize text according to DS008 algorithm
 * @param {string} input - Text to normalize
 * @param {Object} [options] - Normalization options
 * @returns {string} Normalized text
 */
export function normalizeText(input, options = {}) {
  if (typeof input !== 'string') {
    return String(input ?? '');
  }

  const opts = { ...TEXT_NORMALIZE_DEFAULTS, ...options };
  let text = input;

  // Step 1: Unicode normalization (NFC by default)
  if (opts.unicodeForm) {
    text = text.normalize(opts.unicodeForm);
  }

  // Step 2: Case normalization (if not case sensitive)
  if (!opts.caseSensitive) {
    text = text.toLowerCase();
  }

  // Step 3: Whitespace normalization
  if (opts.normalizeWhitespace) {
    text = text.replace(/\s+/g, ' ').trim();
  }

  // Step 4: Punctuation removal (if enabled)
  if (opts.stripPunctuation) {
    // Remove punctuation but keep alphanumeric and whitespace
    // Unicode-aware: keep letters, numbers, and spaces
    text = text.replace(/[^\p{L}\p{N}\s]/gu, '');
    // Re-normalize whitespace after punctuation removal
    if (opts.normalizeWhitespace) {
      text = text.replace(/\s+/g, ' ').trim();
    }
  }

  return text;
}

/**
 * Check if two texts are equivalent after normalization
 * @param {string} a - First text
 * @param {string} b - Second text
 * @param {Object} [options] - Normalization options
 * @returns {boolean}
 */
export function textsEquivalent(a, b, options = {}) {
  return normalizeText(a, options) === normalizeText(b, options);
}

/**
 * Create a text normalizer with preset options
 * @param {Object} options - Normalization options
 * @returns {function(string): string}
 */
export function createTextNormalizer(options = {}) {
  const opts = { ...TEXT_NORMALIZE_DEFAULTS, ...options };
  return (input) => normalizeText(input, opts);
}

export default {
  normalizeText,
  textsEquivalent,
  createTextNormalizer,
  TEXT_NORMALIZE_DEFAULTS
};
