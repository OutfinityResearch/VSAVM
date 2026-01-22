/**
 * VSA Service - Facade for hypervector operations
 * Per DS006: VSA proposes candidates for VM validation
 */

import { termToString } from '../core/types/terms.mjs';
import { symbolIdToString } from '../core/types/identifiers.mjs';

/**
 * VSA Service provides high-level operations using a VSA strategy
 */
export class VSAService {
  /**
   * @param {Object} strategy - VSA strategy implementation
   */
  constructor(strategy) {
    this.strategy = strategy;
    
    // Caches for common hypervectors
    this.schemaVectors = new Map();  // schemaId → HyperVector
    this.factVectors = new Map();    // factId → HyperVector
  }

  /**
   * Get strategy name
   */
  get name() {
    return this.strategy.name;
  }

  /**
   * Get dimensionality
   */
  get dimensions() {
    return this.strategy.dimensions;
  }

  /**
   * Generate hypervector for a term
   * @param {Object} term
   * @returns {Object} HyperVector
   */
  vectorizeTerm(term) {
    const termStr = termToString(term);
    return this.strategy.generate(termStr);
  }

  /**
   * Generate hypervector for plain text
   * @param {string} text
   * @returns {Object} HyperVector
   */
  vectorizeText(text) {
    const key = `text:${String(text ?? '')}`;
    return this.strategy.generate(key);
  }

  /**
   * Generate hypervector for a predicate
   * @param {{namespace: string, name: string}} symbolId
   * @returns {Object} HyperVector
   */
  vectorizePredicate(symbolId) {
    const key = `pred:${symbolIdToString(symbolId)}`;
    return this.strategy.generate(key);
  }

  /**
   * Generate hypervector for a fact pattern
   * @param {Object} fact
   * @returns {Object} HyperVector
   */
  vectorizeFact(fact) {
    const factId = fact.factId;
    
    if (this.factVectors.has(factId)) {
      return this.factVectors.get(factId);
    }
    
    // Bundle predicate with bound arguments
    const predVec = this.vectorizePredicate(fact.predicate);
    const argVectors = [];
    
    for (const [slot, term] of fact.arguments) {
      const roleVec = this.strategy.generate(`role:${slot}`);
      const valueVec = this.vectorizeTerm(term);
      const boundVec = this.strategy.bind(roleVec, valueVec);
      argVectors.push(boundVec);
    }
    
    const argsBundle = this.strategy.bundle(argVectors);
    const factVec = this.strategy.bundle([predVec, argsBundle]);
    
    this.factVectors.set(factId, factVec);
    return factVec;
  }

  /**
   * Index a schema for retrieval
   * @param {Object} schema
   */
  indexSchema(schema) {
    const schemaId = schema.schemaId;
    
    // Generate from schema trigger or name
    const key = schema.trigger?.vsaKey || `schema:${schemaId}`;
    const vec = typeof key === 'string' ? this.strategy.generate(key) : key;
    
    this.schemaVectors.set(schemaId, vec);
  }

  /**
   * Retrieve top-k similar schemas
   * @param {Object} queryVector
   * @param {number} k
   * @returns {Array<{schemaId: string, similarity: number}>}
   */
  retrieveSchemas(queryVector, k = 10) {
    const results = [];
    
    for (const [schemaId, vec] of this.schemaVectors) {
      const sim = this.strategy.similarity(queryVector, vec);
      results.push({ schemaId, similarity: sim });
    }
    
    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    
    // Filter by threshold and take top-k
    return results
      .filter(r => r.similarity >= this.strategy.similarityThreshold)
      .slice(0, k);
  }

  /**
   * Retrieve top-k similar facts
   * @param {Object} queryVector
   * @param {number} k
   * @returns {Array<{factId: string, similarity: number}>}
   */
  retrieveFacts(queryVector, k = 10) {
    const results = [];
    
    for (const [factId, vec] of this.factVectors) {
      const sim = this.strategy.similarity(queryVector, vec);
      results.push({ factId, similarity: sim });
    }
    
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results
      .filter(r => r.similarity >= this.strategy.similarityThreshold)
      .slice(0, k);
  }

  /**
   * Compute similarity between two hypervectors
   * @param {Object} vecA
   * @param {Object} vecB
   * @returns {number}
   */
  similarity(vecA, vecB) {
    return this.strategy.similarity(vecA, vecB);
  }

  /**
   * Check if two items are similar
   * @param {Object} vecA
   * @param {Object} vecB
   * @returns {boolean}
   */
  areSimilar(vecA, vecB) {
    return this.strategy.isSimilar(vecA, vecB);
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.schemaVectors.clear();
    this.factVectors.clear();
  }
}
