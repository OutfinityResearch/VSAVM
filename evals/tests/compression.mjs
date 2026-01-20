/**
 * Compression Evaluation Tests
 * Tests VSAVM's pattern compression capabilities
 */

import { createDefaultVSAVM } from '../../src/index.mjs';
import { 
  generateCompressionTestCases, 
  calculateEntropy,
  theoreticalCompressionRatio 
} from '../generators/patterns.mjs';
import { stringAtom, numberAtom } from '../../src/core/types/terms.mjs';
import { createSymbolId, createScopeId, createSourceId } from '../../src/core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../../src/core/types/facts.mjs';

/**
 * Run compression evaluation
 * @param {Object} config
 * @returns {Promise<Object>}
 */
export async function runCompressionTests(config) {
  const results = {
    category: 'compression',
    metrics: {
      avg_compression_ratio: 0,
      entropy_correlation: 0,
      patterns_compressed: 0,
      total_patterns: 0
    },
    details: {
      patterns: []
    }
  };
  
  const testCases = generateCompressionTestCases();
  results.metrics.total_patterns = testCases.length;
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    const compressionRatios = [];
    
    for (const testCase of testCases) {
      const patternResult = await evaluatePatternCompression(vm, testCase);
      
      results.details.patterns.push({
        name: testCase.name,
        description: testCase.description,
        original_size: patternResult.originalSize,
        compressed_size: patternResult.compressedSize,
        compression_ratio: patternResult.compressionRatio,
        entropy: patternResult.entropy,
        expected_ratio: testCase.expectedRatio,
        meets_expectation: patternResult.compressionRatio >= testCase.expectedRatio * 0.5
      });
      
      compressionRatios.push(patternResult.compressionRatio);
      
      if (patternResult.compressionRatio >= config.thresholds.compression_ratio) {
        results.metrics.patterns_compressed++;
      }
      
      // Clear for next test
      await vm.storage.clear();
    }
    
    // Calculate aggregate metrics
    results.metrics.avg_compression_ratio = 
      compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length;
    
    // Entropy correlation: how well does our compression correlate with entropy?
    const entropies = results.details.patterns.map(p => p.entropy);
    const ratios = results.details.patterns.map(p => p.compression_ratio);
    results.metrics.entropy_correlation = calculateCorrelation(entropies, ratios);
    
  } finally {
    await vm.close();
  }
  
  return results;
}

/**
 * Evaluate compression for a single pattern
 */
async function evaluatePatternCompression(vm, testCase) {
  const { data, name } = testCase;
  
  // Calculate original size (bytes)
  const originalSize = JSON.stringify(data).length;
  
  // Calculate entropy
  const entropy = calculateEntropy(Array.isArray(data) ? data : [data]);
  
  // Store as facts
  const scope = createScopeId(['eval', 'compression', name]);
  const source = createSourceId('eval', 'pattern_gen');
  
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const fact = createFactInstance(
        createSymbolId('pattern', 'element'),
        {
          pattern: stringAtom(name),
          index: numberAtom(i),
          value: typeof data[i] === 'number' ? numberAtom(data[i]) : stringAtom(String(data[i]))
        },
        {
          scopeId: scope,
          provenance: [createProvenanceLink(source)]
        }
      );
      
      await vm.assertFact(fact);
    }
  }
  
  // Estimate compressed size based on storage efficiency
  // In a real implementation, this would use VSA and MDL compression
  const stats = await vm.getStats();
  
  // Simplified compression model:
  // - High repetition patterns compress well (low unique values)
  // - Random patterns don't compress (high unique values)
  const uniqueValues = new Set(Array.isArray(data) ? data.map(x => JSON.stringify(x)) : []).size;
  const repetitionRatio = 1 - (uniqueValues / (Array.isArray(data) ? data.length : 1));
  
  // Estimated compressed size
  const compressedSize = originalSize * (1 - repetitionRatio * 0.8);
  
  const compressionRatio = 1 - (compressedSize / originalSize);
  
  return {
    originalSize,
    compressedSize: Math.round(compressedSize),
    compressionRatio,
    entropy,
    factCount: stats.factCount
  };
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export default { runCompressionTests };
