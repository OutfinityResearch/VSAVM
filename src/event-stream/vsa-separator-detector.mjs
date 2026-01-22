/**
 * VSA-based Separator Detector
 * Minimal implementation of DS010 emergent separator discovery
 */

/**
 * Simple VSA embedding using content hashing
 */
class SimpleVSASpace {
  constructor(dimensions = 512) {
    this.dimensions = dimensions;
  }

  /**
   * Embed event content into VSA space
   */
  embed(event) {
    const content = this.extractContent(event);
    return this.hashToVector(content);
  }

  extractContent(event) {
    if (typeof event.payload === 'string') {
      return event.payload;
    }
    if (event.payload && typeof event.payload === 'object') {
      return JSON.stringify(event.payload);
    }
    return event.type || 'unknown';
  }

  hashToVector(content) {
    const vector = new Float32Array(this.dimensions);
    
    // Simple word-based hashing for better semantic similarity
    const words = content.toLowerCase().split(/\s+/);
    const wordHashes = words.map(word => {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0xffffffff;
      }
      return hash;
    });
    
    // Generate vector from word hashes
    for (let i = 0; i < this.dimensions; i++) {
      let value = 0;
      for (const wordHash of wordHashes) {
        const seed = (wordHash + i) & 0xffffffff;
        value += Math.sin(seed * 0.001) * Math.cos(seed * 0.002);
      }
      vector[i] = Math.tanh(value / wordHashes.length); // Normalize to [-1, 1]
    }
    
    return vector;
  }

  /**
   * Calculate cosine similarity between vectors
   */
  similarity(vec1, vec2) {
    let dot = 0, norm1 = 0, norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dot += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

import { SimpleBoundaryOptimizer } from './boundary-optimizer.mjs';

/**
 * VSA-based separator detector with RL optimization
 */
export class VSASeparatorDetector {
  constructor(options = {}) {
    this.vsaSpace = options.vsaSpace ?? new SimpleVSASpace();
    this.optimizer = options.optimizer ?? new SimpleBoundaryOptimizer(options.optimizerOptions);
    this.boundaryThreshold = options.boundaryThreshold ?? 0.1;
    this.typeMultiplier = {
      major: options.majorMultiplier ?? 6,
      section: options.sectionMultiplier ?? 4
    };
  }

  /**
   * Update threshold based on reasoning performance
   */
  updateThreshold(reasoningSuccess) {
    this.boundaryThreshold = this.optimizer.optimizeThreshold([], reasoningSuccess);
    return this.boundaryThreshold;
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory() {
    return this.optimizer.getHistory();
  }

  /**
   * Detect separators using VSA similarity gradients
   */
  async detectSeparators(events) {
    if (events.length < 2) return [];

    // Embed all events
    const embeddings = events.map(event => this.vsaSpace.embed(event));
    
    // Calculate similarity gradients
    const separators = [];
    let prevSimilarity = 1.0;
    
    for (let i = 0; i < embeddings.length - 1; i++) {
      const similarity = this.vsaSpace.similarity(embeddings[i], embeddings[i + 1]);
      const gradient = Math.abs(similarity - prevSimilarity);
      
      // Sharp similarity drop indicates boundary
      if (gradient > this.boundaryThreshold) {
        separators.push({
          position: i,
          type: this.classifySeparatorType(gradient),
          strength: Math.min(gradient, 1.0)
        });
      }
      
      prevSimilarity = similarity;
    }
    
    // Add context path changes (most reliable)
    for (let i = 0; i < events.length - 1; i++) {
      const event = events[i];
      const nextEvent = events[i + 1];
      
      if (this.hasContextPathChange(event, nextEvent)) {
        const depth = this.getContextChangeDepth(
          this.getContextPath(event),
          this.getContextPath(nextEvent)
        );
        separators.push({
          position: i,
          type: 'context_change',
          strength: Math.min(depth * 0.2, 1.0),
          depth
        });
      }
    }
    
    return separators;
  }

  classifySeparatorType(gradient) {
    const majorThreshold = Math.min(this.boundaryThreshold * this.typeMultiplier.major, 1.0);
    const sectionThreshold = Math.min(this.boundaryThreshold * this.typeMultiplier.section, 1.0);

    if (gradient >= majorThreshold) return 'major_boundary';
    if (gradient >= sectionThreshold) return 'section_boundary';
    return 'minor_boundary';
  }

  getContextPath(event) {
    if (!event) return null;
    if (Array.isArray(event.contextPath)) return event.contextPath;
    if (Array.isArray(event.context_path)) return event.context_path;
    return null;
  }

  hasContextPathChange(event, nextEvent) {
    const path1 = this.getContextPath(event);
    const path2 = this.getContextPath(nextEvent);
    
    if (!path1 || !path2) return false;
    return JSON.stringify(path1) !== JSON.stringify(path2);
  }

  getContextChangeDepth(path1, path2) {
    if (!path1 || !path2) return 0;
    
    let commonPrefix = 0;
    const minLength = Math.min(path1.length, path2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (path1[i] === path2[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }
    
    return Math.max(path1.length, path2.length) - commonPrefix;
  }
}

export default VSASeparatorDetector;
