/**
 * Schema Store
 * Per DS003/DS006: Schema library management
 * Stores, retrieves, and manages query schemas
 */

import { QuerySchema, createQuerySchema } from './schema-model.mjs';
import { VSAVMError, ErrorCode } from '../../core/errors.mjs';
import { computeHash } from '../../core/hash.mjs';

/**
 * Schema Store - manages a library of query schemas
 */
export class SchemaStore {
  /**
   * @param {Object} [options] - Store options
   * @param {Object} [options.vsaService] - VSA service for similarity retrieval
   */
  constructor(options = {}) {
    this.options = options;
    this.vsaService = options.vsaService ?? null;

    // Primary storage: schemaId → QuerySchema
    this._schemas = new Map();

    // Indices
    this._byKeyword = new Map();      // keyword → Set<schemaId>
    this._byFeature = new Map();      // feature → Set<schemaId>
    this._byOutputKind = new Map();   // outputKind → Set<schemaId>

    // VSA index: for similarity-based retrieval
    this._vsaIndex = new Map();       // schemaId → hypervector
  }

  /**
   * Add a schema to the store
   * @param {QuerySchema|Object} schema
   * @returns {QuerySchema}
   */
  add(schema) {
    const qs = schema instanceof QuerySchema 
      ? schema 
      : createQuerySchema(schema);

    // Store schema
    this._schemas.set(qs.schemaId, qs);

    // Index by keywords
    for (const keyword of qs.trigger.keywords ?? []) {
      if (!this._byKeyword.has(keyword)) {
        this._byKeyword.set(keyword, new Set());
      }
      this._byKeyword.get(keyword).add(qs.schemaId);
    }

    // Index by required features
    for (const feature of qs.trigger.requiredFeatures ?? []) {
      if (!this._byFeature.has(feature)) {
        this._byFeature.set(feature, new Set());
      }
      this._byFeature.get(feature).add(qs.schemaId);
    }

    // Index by output kind
    const kind = qs.outputContract.kind;
    if (!this._byOutputKind.has(kind)) {
      this._byOutputKind.set(kind, new Set());
    }
    this._byOutputKind.get(kind).add(qs.schemaId);

    // Build VSA index if service available
    if (this.vsaService && qs.trigger.vsaKey) {
      this._vsaIndex.set(qs.schemaId, qs.trigger.vsaKey);
    }

    return qs;
  }

  /**
   * Get a schema by ID
   * @param {string} schemaId
   * @returns {QuerySchema|null}
   */
  get(schemaId) {
    return this._schemas.get(schemaId) ?? null;
  }

  /**
   * Check if schema exists
   * @param {string} schemaId
   * @returns {boolean}
   */
  has(schemaId) {
    return this._schemas.has(schemaId);
  }

  /**
   * Remove a schema
   * @param {string} schemaId
   * @returns {boolean}
   */
  remove(schemaId) {
    const schema = this._schemas.get(schemaId);
    if (!schema) return false;

    // Remove from indices
    for (const keyword of schema.trigger.keywords ?? []) {
      this._byKeyword.get(keyword)?.delete(schemaId);
    }
    for (const feature of schema.trigger.requiredFeatures ?? []) {
      this._byFeature.get(feature)?.delete(schemaId);
    }
    this._byOutputKind.get(schema.outputContract.kind)?.delete(schemaId);
    this._vsaIndex.delete(schemaId);

    // Remove from primary storage
    this._schemas.delete(schemaId);
    return true;
  }

  /**
   * Get all schemas
   * @returns {QuerySchema[]}
   */
  getAll() {
    return [...this._schemas.values()];
  }

  /**
   * Get schema count
   * @returns {number}
   */
  count() {
    return this._schemas.size;
  }

  /**
   * Clear all schemas
   */
  clear() {
    this._schemas.clear();
    this._byKeyword.clear();
    this._byFeature.clear();
    this._byOutputKind.clear();
    this._vsaIndex.clear();
  }

  /**
   * Find schemas by keyword
   * @param {string} keyword
   * @returns {QuerySchema[]}
   */
  findByKeyword(keyword) {
    const ids = this._byKeyword.get(keyword.toLowerCase());
    if (!ids) return [];
    return [...ids].map(id => this._schemas.get(id)).filter(Boolean);
  }

  /**
   * Find schemas by required feature
   * @param {string} feature
   * @returns {QuerySchema[]}
   */
  findByFeature(feature) {
    const ids = this._byFeature.get(feature);
    if (!ids) return [];
    return [...ids].map(id => this._schemas.get(id)).filter(Boolean);
  }

  /**
   * Find schemas by output kind
   * @param {string} kind
   * @returns {QuerySchema[]}
   */
  findByOutputKind(kind) {
    const ids = this._byOutputKind.get(kind);
    if (!ids) return [];
    return [...ids].map(id => this._schemas.get(id)).filter(Boolean);
  }

  /**
   * Find schemas matching query features
   * @param {string[]} features - Features extracted from query
   * @returns {QuerySchema[]}
   */
  findByFeatures(features) {
    const candidates = new Map();  // schemaId → match count

    for (const feature of features) {
      const ids = this._byFeature.get(feature);
      if (ids) {
        for (const id of ids) {
          candidates.set(id, (candidates.get(id) ?? 0) + 1);
        }
      }
    }

    // Filter to schemas that have all required features satisfied
    const results = [];
    for (const [schemaId, matchCount] of candidates) {
      const schema = this._schemas.get(schemaId);
      if (schema) {
        const requiredCount = schema.trigger.requiredFeatures.length;
        // Schema is candidate if all its required features are in the query
        const allRequired = schema.trigger.requiredFeatures.every(f => features.includes(f));
        if (allRequired) {
          results.push({ schema, matchCount, score: matchCount / requiredCount });
        }
      }
    }

    // Sort by score descending, then by match count descending (prefer more specific schemas)
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchCount - a.matchCount;  // Prefer schemas with more features
    });
    return results.map(r => r.schema);
  }

  /**
   * Retrieve schemas by VSA similarity
   * @param {Object} queryVector - Query hypervector
   * @param {number} [k=10] - Top-K to retrieve
   * @returns {Array<{schema: QuerySchema, similarity: number}>}
   */
  async retrieveBySimilarity(queryVector, k = 10) {
    if (!this.vsaService) {
      throw new VSAVMError(
        ErrorCode.SCHEMA_RETRIEVAL_FAILED,
        'VSA service not configured for similarity retrieval'
      );
    }

    const results = [];

    for (const [schemaId, schemaVector] of this._vsaIndex) {
      const similarity = this.vsaService.similarity(queryVector, schemaVector);
      const schema = this._schemas.get(schemaId);
      
      if (schema && similarity >= schema.trigger.minSimilarity) {
        results.push({ schema, similarity });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top-K
    return results.slice(0, k);
  }

  /**
   * Retrieve candidate schemas for a query
   * Combines keyword, feature, and VSA-based retrieval
   * @param {Object} queryContext - Query context with features, keywords, vector
   * @param {number} [k=10] - Max candidates to return
   * @returns {Promise<Array<{schema: QuerySchema, score: number, method: string}>>}
   */
  async retrieveCandidates(queryContext, k = 10) {
    const candidates = new Map();  // schemaId → {schema, score, method}

    // Method 1: Keyword matching
    for (const keyword of queryContext.keywords ?? []) {
      for (const schema of this.findByKeyword(keyword)) {
        if (!candidates.has(schema.schemaId)) {
          candidates.set(schema.schemaId, { 
            schema, 
            score: 0.5, 
            method: 'keyword' 
          });
        }
        candidates.get(schema.schemaId).score += 0.1;
      }
    }

    // Method 2: Feature matching
    const featureMatches = this.findByFeatures(queryContext.features ?? []);
    for (let i = 0; i < featureMatches.length; i++) {
      const schema = featureMatches[i];
      const featureScore = 0.7 - (i * 0.05);  // Decay by rank
      if (!candidates.has(schema.schemaId)) {
        candidates.set(schema.schemaId, { 
          schema, 
          score: featureScore, 
          method: 'feature' 
        });
      } else {
        const existing = candidates.get(schema.schemaId);
        if (featureScore > existing.score) {
          existing.score = featureScore;
          existing.method = 'feature';
        }
      }
    }

    // Method 3: VSA similarity (if available)
    if (this.vsaService && queryContext.vector) {
      try {
        const vsaResults = await this.retrieveBySimilarity(queryContext.vector, k);
        for (const { schema, similarity } of vsaResults) {
          if (!candidates.has(schema.schemaId)) {
            candidates.set(schema.schemaId, { 
              schema, 
              score: similarity, 
              method: 'vsa' 
            });
          } else {
            const existing = candidates.get(schema.schemaId);
            // VSA match boosts score
            existing.score = Math.max(existing.score, similarity);
            if (similarity > 0.5) {
              existing.method = 'vsa+' + existing.method;
            }
          }
        }
      } catch (e) {
        // VSA retrieval failed, continue with other methods
      }
    }

    // Sort by score and return top-K
    const results = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return results;
  }

  /**
   * Export all schemas to JSON
   * @returns {Object[]}
   */
  exportAll() {
    return this.getAll().map(s => s.toJSON());
  }

  /**
   * Import schemas from JSON array
   * @param {Object[]} schemas
   * @returns {number} Count of imported schemas
   */
  importAll(schemas) {
    let count = 0;
    for (const json of schemas) {
      this.add(QuerySchema.fromJSON(json));
      count++;
    }
    return count;
  }

  /**
   * Set VSA service for similarity retrieval
   * @param {Object} vsaService
   */
  setVSAService(vsaService) {
    this.vsaService = vsaService;
  }
}

/**
 * Create a new schema store
 * @param {Object} [options]
 * @returns {SchemaStore}
 */
export function createSchemaStore(options = {}) {
  return new SchemaStore(options);
}

export default {
  SchemaStore,
  createSchemaStore
};
