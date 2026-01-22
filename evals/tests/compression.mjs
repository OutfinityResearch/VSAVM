/**
 * Compression Evaluation Tests
 * Tests VSAVM's pattern compression capabilities
 */

import { createDefaultVSAVM } from '../../src/index.mjs';
import { 
  generateCompressionTestCases, 
  calculateEntropy
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
      total_patterns: 0,
      avg_decompression_fidelity: 0  // New: average decompression fidelity
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
    const compressor = resolveCompressor(vm);
    const compressionRatios = [];
    
    for (const testCase of testCases) {
      const patternResult = await evaluatePatternCompression(vm, testCase, compressor);
      
      results.details.patterns.push({
        name: testCase.name,
        description: testCase.description,
        original_size: patternResult.originalSize,
        compressed_size: patternResult.compressedSize,
        compression_ratio: patternResult.compressionRatio,
        entropy: patternResult.entropy,
        expected_ratio: testCase.expectedRatio,
        meets_expectation: patternResult.compressionRatio >= testCase.expectedRatio,
        decompression_fidelity: patternResult.decompressionFidelity || 0,  // New
        error: patternResult.error
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
    
    // NEW: Average decompression fidelity
    const fidelities = results.details.patterns.map(p => p.decompression_fidelity).filter(f => typeof f === 'number');
    results.metrics.avg_decompression_fidelity = fidelities.length > 0 ? 
      fidelities.reduce((a, b) => a + b, 0) / fidelities.length : 0;
    
  } finally {
    await vm.close();
  }
  
  return results;
}

/**
 * Evaluate compression for a single pattern
 */
async function evaluatePatternCompression(vm, testCase, compressor) {
  const { data, name } = testCase;
  
  // Calculate original size (bytes)
  const originalSize = JSON.stringify(data).length;
  
  // Calculate entropy
  const entropy = calculateEntropy(Array.isArray(data) ? data : [data]);
  
  if (!compressor) {
    return {
      originalSize,
      compressedSize: null,
      compressionRatio: 0,
      entropy,
      decompressionFidelity: 0,
      error: 'Compression API not available'
    };
  }

  // Store as facts to support compressors that read from the VM
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

  let compressionResult;
  try {
    compressionResult = await compressor({
      name,
      data,
      scopeId: scope,
      vm
    });
  } catch (error) {
    return {
      originalSize,
      compressedSize: null,
      compressionRatio: 0,
      entropy,
      decompressionFidelity: 0,
      error: `Compression failed: ${error.message}`
    };
  }

  const compressedSize = extractCompressedSize(compressionResult);
  if (!Number.isFinite(compressedSize) || compressedSize <= 0) {
    return {
      originalSize,
      compressedSize: null,
      compressionRatio: 0,
      entropy,
      decompressionFidelity: 0,
      error: 'Compression result missing size information'
    };
  }

  const compressionRatio = 1 - (compressedSize / originalSize);

  // CRITICAL: Test decompression fidelity (DS005 requirement)
  let decompressionFidelity = 0;
  try {
    const decompressed = await decompressData(compressionResult, vm);
    decompressionFidelity = calculateFidelity(data, decompressed);
  } catch (decompError) {
    return {
      originalSize,
      compressedSize,
      compressionRatio,
      entropy,
      decompressionFidelity: 0,
      error: `Decompression failed: ${decompError.message}`
    };
  }

  return {
    originalSize,
    compressedSize,
    compressionRatio,
    entropy,
    decompressionFidelity
  };
}

function resolveCompressor(vm) {
  if (typeof vm.compressPattern === 'function') {
    return (payload) => vm.compressPattern(payload);
  }
  if (typeof vm.compressPatterns === 'function') {
    return (payload) => vm.compressPatterns(payload);
  }
  if (vm.compressor && typeof vm.compressor.compress === 'function') {
    return (payload) => vm.compressor.compress(payload);
  }
  if (vm.vsa && typeof vm.vsa.compress === 'function') {
    return (payload) => vm.vsa.compress(payload);
  }
  return null;
}

function extractCompressedSize(result) {
  if (!result) return null;

  if (Number.isFinite(result.compressedBytes)) return result.compressedBytes;
  if (Number.isFinite(result.compressedSize)) return result.compressedSize;
  if (Number.isFinite(result.byteLength)) return result.byteLength;
  if (Number.isFinite(result.size)) return result.size;

  if (result.compressed && typeof result.compressed === 'string') {
    return Buffer.byteLength(result.compressed, 'utf8');
  }
  if (result.compressed instanceof Uint8Array) {
    return result.compressed.byteLength;
  }
  if (result.bytes instanceof Uint8Array) {
    return result.bytes.byteLength;
  }

  return null;
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

/**
 * Decompress data using the compression result
 */
async function decompressData(compressionResult, vm) {
  // Try built-in decompress function first
  if (typeof compressionResult.decompress === 'function') {
    return compressionResult.decompress();
  }
  
  // Try compressed data directly
  if (compressionResult.compressed && vm.decompressPattern) {
    return vm.decompressPattern(compressionResult.compressed);
  }
  
  // Try full result
  if (vm.decompressPattern) {
    return vm.decompressPattern(compressionResult);
  }
  
  // If no decompression method available, assume identity (no compression)
  if (compressionResult.original) {
    return compressionResult.original;
  }
  
  throw new Error('No decompression method available');
}

/**
 * Calculate fidelity between original and decompressed data
 */
function calculateFidelity(original, decompressed) {
  if (!original || !decompressed) return 0;
  
  // Convert to comparable format
  const origStr = JSON.stringify(original);
  const decompStr = JSON.stringify(decompressed);
  
  if (origStr === decompStr) return 1.0;
  
  // Calculate character-level similarity for partial credit
  const maxLen = Math.max(origStr.length, decompStr.length);
  if (maxLen === 0) return 1.0;
  
  let matches = 0;
  const minLen = Math.min(origStr.length, decompStr.length);
  
  for (let i = 0; i < minLen; i++) {
    if (origStr[i] === decompStr[i]) {
      matches++;
    }
  }
  
  return matches / maxLen;
}

export default { runCompressionTests };
