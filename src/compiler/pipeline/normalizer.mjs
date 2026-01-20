/**
 * Query Normalizer
 * Per DS003: Converts query text to normalized span with extracted features
 * First stage of the compilation pipeline
 */

import { normalizeText } from '../../canonicalization/normalizers/text-normalizer.mjs';

/**
 * Query feature types
 */
export const QueryFeature = {
  QUESTION_MARKER: 'QUESTION_MARKER',
  NEGATION: 'NEGATION',
  COMPARISON: 'COMPARISON',
  TEMPORAL: 'TEMPORAL',
  QUANTIFIER: 'QUANTIFIER',
  CONDITIONAL: 'CONDITIONAL',
  CAUSAL: 'CAUSAL',
  EXISTENTIAL: 'EXISTENTIAL',
  DEFINITION: 'DEFINITION',
  LIST_REQUEST: 'LIST_REQUEST',
  EXPLANATION_REQUEST: 'EXPLANATION_REQUEST'
};

/**
 * Question word patterns
 */
const QUESTION_PATTERNS = [
  { pattern: /^(who|what|where|when|why|how|which)\b/i, type: 'wh_question' },
  { pattern: /^(is|are|was|were|do|does|did|can|could|will|would|should|has|have|had)\b/i, type: 'yes_no_question' },
  { pattern: /\?$/, type: 'question_mark' }
];

/**
 * Negation patterns
 */
const NEGATION_PATTERNS = [
  /\b(not|no|never|neither|nor|none|nobody|nothing|nowhere|cannot|can't|won't|wouldn't|shouldn't|couldn't|didn't|doesn't|don't|isn't|aren't|wasn't|weren't)\b/i
];

/**
 * Comparison patterns
 */
const COMPARISON_PATTERNS = [
  /\b(more|less|greater|smaller|bigger|larger|higher|lower|better|worse|same|different|equal|than|compare|comparison)\b/i
];

/**
 * Temporal patterns
 */
const TEMPORAL_PATTERNS = [
  /\b(when|before|after|during|while|since|until|now|today|yesterday|tomorrow|always|never|ever|often|sometimes|recently|currently|previously)\b/i,
  /\b(year|month|week|day|hour|minute|second|date|time|period|century|decade)\b/i,
  /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/
];

/**
 * Quantifier patterns
 */
const QUANTIFIER_PATTERNS = [
  /\b(all|every|each|any|some|many|few|most|several|both|none|no|one|two|three|first|last|only)\b/i,
  /\b(how many|how much|count|number of|total|average|sum)\b/i
];

/**
 * Conditional patterns
 */
const CONDITIONAL_PATTERNS = [
  /\b(if|unless|whether|provided|assuming|suppose|given that|in case)\b/i
];

/**
 * Causal patterns
 */
const CAUSAL_PATTERNS = [
  /\b(because|since|due to|caused by|reason|why|therefore|thus|hence|so that|leads to|results in)\b/i
];

/**
 * Existential patterns
 */
const EXISTENTIAL_PATTERNS = [
  /\b(exist|exists|there is|there are|is there|are there|have|has)\b/i
];

/**
 * Definition patterns
 */
const DEFINITION_PATTERNS = [
  /\b(what is|what are|define|definition|meaning|means|called|known as)\b/i
];

/**
 * List request patterns
 */
const LIST_PATTERNS = [
  /\b(list|enumerate|give me|show me|tell me|what are all|find all|get all)\b/i
];

/**
 * Explanation patterns
 */
const EXPLANATION_PATTERNS = [
  /\b(explain|why|how does|how do|how is|describe|elaborate)\b/i
];

/**
 * NormalizedQuery class - result of query normalization
 */
export class NormalizedQuery {
  /**
   * @param {Object} config
   * @param {string} config.originalText - Original query text
   * @param {string} config.normalizedText - Normalized text
   * @param {string[]} config.tokens - Tokenized words
   * @param {string[]} config.features - Detected features
   * @param {Object[]} config.spans - Token spans with metadata
   * @param {Object} config.metadata - Additional metadata
   */
  constructor(config) {
    this.originalText = config.originalText;
    this.normalizedText = config.normalizedText;
    this.tokens = config.tokens;
    this.features = config.features;
    this.spans = config.spans ?? [];
    this.metadata = config.metadata ?? {};
  }

  /**
   * Check if query has a feature
   * @param {string} feature
   * @returns {boolean}
   */
  hasFeature(feature) {
    return this.features.includes(feature);
  }

  /**
   * Get all features
   * @returns {string[]}
   */
  getFeatures() {
    return [...this.features];
  }

  /**
   * Check if query is a question
   * @returns {boolean}
   */
  isQuestion() {
    return this.hasFeature(QueryFeature.QUESTION_MARKER);
  }

  /**
   * Check if query has negation
   * @returns {boolean}
   */
  hasNegation() {
    return this.hasFeature(QueryFeature.NEGATION);
  }

  /**
   * Get token at index
   * @param {number} index
   * @returns {string|null}
   */
  getToken(index) {
    return this.tokens[index] ?? null;
  }

  /**
   * Get token count
   * @returns {number}
   */
  get tokenCount() {
    return this.tokens.length;
  }

  /**
   * Find tokens matching a pattern
   * @param {RegExp} pattern
   * @returns {string[]}
   */
  findTokens(pattern) {
    return this.tokens.filter(t => pattern.test(t));
  }

  /**
   * Get keywords (content words, not stopwords)
   * @returns {string[]}
   */
  getKeywords() {
    const stopwords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'of', 'in', 'to',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'and', 'or', 'but', 'if', 'then', 'that', 'which', 'who', 'what',
      'where', 'when', 'why', 'how', 'this', 'these', 'those', 'it', 'its'
    ]);

    return this.tokens.filter(t => 
      t.length > 2 && !stopwords.has(t.toLowerCase())
    );
  }

  /**
   * Convert to context object for schema retrieval
   * @returns {Object}
   */
  toQueryContext() {
    return {
      text: this.normalizedText,
      features: this.features,
      keywords: this.getKeywords(),
      tokens: this.tokens,
      metadata: this.metadata
    };
  }

  /**
   * Convert to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      originalText: this.originalText,
      normalizedText: this.normalizedText,
      tokens: this.tokens,
      features: this.features,
      spans: this.spans,
      metadata: this.metadata
    };
  }

  /**
   * Create from JSON
   * @param {Object} json
   * @returns {NormalizedQuery}
   */
  static fromJSON(json) {
    return new NormalizedQuery(json);
  }
}

/**
 * Query Normalizer - normalizes and analyzes query text
 */
export class QueryNormalizer {
  /**
   * @param {Object} [options] - Normalizer options
   */
  constructor(options = {}) {
    this.options = {
      caseSensitive: false,
      stripPunctuation: false,  // Keep punctuation for feature detection
      normalizeWhitespace: true,
      ...options
    };
  }

  /**
   * Normalize a query
   * @param {string} queryText - Raw query text
   * @returns {NormalizedQuery}
   */
  normalize(queryText) {
    const originalText = queryText.trim();

    // Detect features before normalization (punctuation matters)
    const features = this._detectFeatures(originalText);

    // Normalize text
    const normalizedText = normalizeText(originalText, {
      caseSensitive: this.options.caseSensitive,
      stripPunctuation: true,  // Strip for tokens
      normalizeWhitespace: this.options.normalizeWhitespace
    });

    // Tokenize
    const tokens = this._tokenize(normalizedText);

    // Extract spans with metadata
    const spans = this._extractSpans(originalText, tokens);

    // Build metadata
    const metadata = {
      originalLength: originalText.length,
      normalizedLength: normalizedText.length,
      tokenCount: tokens.length,
      featureCount: features.length,
      normalizedAt: Date.now()
    };

    return new NormalizedQuery({
      originalText,
      normalizedText,
      tokens,
      features,
      spans,
      metadata
    });
  }

  /**
   * Detect query features
   * @private
   */
  _detectFeatures(text) {
    const features = [];

    // Question detection
    for (const { pattern, type } of QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.QUESTION_MARKER);
        break;
      }
    }

    // Negation detection
    for (const pattern of NEGATION_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.NEGATION);
        break;
      }
    }

    // Comparison detection
    for (const pattern of COMPARISON_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.COMPARISON);
        break;
      }
    }

    // Temporal detection
    for (const pattern of TEMPORAL_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.TEMPORAL);
        break;
      }
    }

    // Quantifier detection
    for (const pattern of QUANTIFIER_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.QUANTIFIER);
        break;
      }
    }

    // Conditional detection
    for (const pattern of CONDITIONAL_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.CONDITIONAL);
        break;
      }
    }

    // Causal detection
    for (const pattern of CAUSAL_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.CAUSAL);
        break;
      }
    }

    // Existential detection
    for (const pattern of EXISTENTIAL_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.EXISTENTIAL);
        break;
      }
    }

    // Definition detection
    for (const pattern of DEFINITION_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.DEFINITION);
        break;
      }
    }

    // List request detection
    for (const pattern of LIST_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.LIST_REQUEST);
        break;
      }
    }

    // Explanation detection
    for (const pattern of EXPLANATION_PATTERNS) {
      if (pattern.test(text)) {
        features.push(QueryFeature.EXPLANATION_REQUEST);
        break;
      }
    }

    return features;
  }

  /**
   * Tokenize normalized text
   * @private
   */
  _tokenize(text) {
    return text
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Extract token spans with positions
   * @private
   */
  _extractSpans(originalText, tokens) {
    const spans = [];
    let position = 0;

    for (const token of tokens) {
      // Find token in original text (case-insensitive search)
      const lowerOriginal = originalText.toLowerCase();
      const lowerToken = token.toLowerCase();
      const start = lowerOriginal.indexOf(lowerToken, position);

      if (start !== -1) {
        spans.push({
          token,
          start,
          end: start + token.length,
          original: originalText.slice(start, start + token.length)
        });
        position = start + token.length;
      } else {
        // Token not found exactly, approximate position
        spans.push({
          token,
          start: position,
          end: position + token.length,
          original: token
        });
        position += token.length + 1;
      }
    }

    return spans;
  }
}

/**
 * Create a query normalizer
 * @param {Object} [options]
 * @returns {QueryNormalizer}
 */
export function createQueryNormalizer(options = {}) {
  return new QueryNormalizer(options);
}

export default {
  QueryNormalizer,
  NormalizedQuery,
  createQueryNormalizer,
  QueryFeature
};
