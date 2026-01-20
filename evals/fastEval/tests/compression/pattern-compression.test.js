/**
 * Data Compression Test
 * Tests the system's ability to compress learned patterns using MDL principles
 */

class CompressionTester {
  constructor() {
    this.schemas = new Map();
    this.compressionStats = {
      originalSize: 0,
      compressedSize: 0,
      schemaOverhead: 0
    };
  }

  // Simulate pattern-based compression
  compressData(data, patterns) {
    let compressed = [];
    let schemaSize = 0;

    // Calculate schema overhead
    for (const [patternId, pattern] of Object.entries(patterns)) {
      schemaSize += this.calculatePatternSize(pattern);
      this.schemas.set(patternId, pattern);
    }

    // Compress data using patterns
    let i = 0;
    while (i < data.length) {
      let bestMatch = null;
      let bestLength = 0;

      // Find longest matching pattern
      for (const [patternId, pattern] of Object.entries(patterns)) {
        const matchLength = this.findPatternMatch(data, i, pattern);
        if (matchLength > bestLength) {
          bestMatch = patternId;
          bestLength = matchLength;
        }
      }

      if (bestMatch && bestLength > 1) {
        // Use pattern reference
        compressed.push({ type: 'pattern_ref', id: bestMatch, length: bestLength });
        i += bestLength;
      } else {
        // Store literal value
        compressed.push({ type: 'literal', value: data[i] });
        i++;
      }
    }

    this.compressionStats = {
      originalSize: this.calculateDataSize(data),
      compressedSize: this.calculateCompressedSize(compressed),
      schemaOverhead: schemaSize
    };

    return compressed;
  }

  findPatternMatch(data, startIndex, pattern) {
    if (startIndex + pattern.length > data.length) return 0;

    for (let i = 0; i < pattern.length; i++) {
      if (data[startIndex + i] !== pattern[i]) return 0;
    }

    return pattern.length;
  }

  calculatePatternSize(pattern) {
    // Simplified: each pattern element costs 4 bytes + overhead
    return pattern.length * 4 + 16;
  }

  calculateDataSize(data) {
    // Simplified: each data element costs 4 bytes
    return data.length * 4;
  }

  calculateCompressedSize(compressed) {
    let size = 0;
    for (const item of compressed) {
      if (item.type === 'pattern_ref') {
        size += 8; // pattern ID + length
      } else {
        size += 4; // literal value
      }
    }
    return size;
  }

  getCompressionRatio() {
    const totalCompressed = this.compressionStats.compressedSize + this.compressionStats.schemaOverhead;
    return 1 - (totalCompressed / this.compressionStats.originalSize);
  }

  getMDLScore() {
    // Simplified MDL: description length + data length given description
    const descriptionLength = this.compressionStats.schemaOverhead;
    const dataLength = this.compressionStats.compressedSize;
    return descriptionLength + dataLength;
  }
}

class PatternGenerator {
  static generateRepeatingPattern(basePattern, repetitions) {
    const data = [];
    for (let i = 0; i < repetitions; i++) {
      data.push(...basePattern);
    }
    return data;
  }

  static generateNestedPattern(outerPattern, innerPattern, nestingFactor) {
    const data = [];
    for (const outerElement of outerPattern) {
      data.push(outerElement);
      for (let i = 0; i < nestingFactor; i++) {
        data.push(...innerPattern);
      }
    }
    return data;
  }

  static generateNoiseData(length, maxValue = 100) {
    const data = [];
    for (let i = 0; i < length; i++) {
      data.push(Math.floor(Math.random() * maxValue));
    }
    return data;
  }

  static addNoise(data, noiseLevel = 0.1) {
    return data.map(value => {
      if (Math.random() < noiseLevel) {
        return Math.floor(Math.random() * 100);
      }
      return value;
    });
  }
}

class MockVSAVMCompressor {
  constructor() {
    this.learnedPatterns = {};
    this.compressionHistory = [];
  }

  async learnPatterns(data, maxPatternLength = 5) {
    // Simulate pattern discovery
    await this.delay(200 + Math.random() * 300);

    const patterns = {};
    const patternCounts = new Map();

    // Find repeating subsequences
    for (let length = 2; length <= maxPatternLength; length++) {
      for (let i = 0; i <= data.length - length; i++) {
        const pattern = data.slice(i, i + length);
        const patternKey = pattern.join(',');
        
        patternCounts.set(patternKey, (patternCounts.get(patternKey) || 0) + 1);
      }
    }

    // Keep patterns that appear multiple times
    let patternId = 0;
    for (const [patternKey, count] of patternCounts.entries()) {
      if (count >= 2) {
        const pattern = patternKey.split(',').map(Number);
        patterns[`pattern_${patternId++}`] = pattern;
      }
    }

    this.learnedPatterns = { ...this.learnedPatterns, ...patterns };
    return patterns;
  }

  async compressWithLearning(data) {
    const patterns = await this.learnPatterns(data);
    const compressor = new CompressionTester();
    const compressed = compressor.compressData(data, patterns);
    
    const result = {
      compressed,
      patterns,
      stats: compressor.compressionStats,
      compressionRatio: compressor.getCompressionRatio(),
      mdlScore: compressor.getMDLScore()
    };

    this.compressionHistory.push(result);
    return result;
  }

  async testSchemaReuse(datasets) {
    let totalReuse = 0;
    let totalSchemas = 0;

    for (let i = 0; i < datasets.length; i++) {
      const patterns = await this.learnPatterns(datasets[i]);
      const newSchemas = Object.keys(patterns).length;
      
      if (i > 0) {
        // Count how many patterns are reused from previous datasets
        const reuseCount = Object.values(patterns).filter(pattern => {
          return Object.values(this.learnedPatterns).some(existing => 
            this.patternsEqual(pattern, existing)
          );
        }).length;
        
        totalReuse += reuseCount;
      }
      
      totalSchemas += newSchemas;
    }

    return totalSchemas > 0 ? totalReuse / totalSchemas : 0;
  }

  patternsEqual(pattern1, pattern2) {
    if (pattern1.length !== pattern2.length) return false;
    return pattern1.every((val, idx) => val === pattern2[idx]);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMemoryUsage() {
    const patternMemory = Object.keys(this.learnedPatterns).length * 50; // bytes per pattern
    const historyMemory = this.compressionHistory.length * 100; // bytes per history entry
    return (patternMemory + historyMemory) / (1024 * 1024); // Convert to MB
  }
}

async function runTest(config) {
  const compressor = new MockVSAVMCompressor();
  const results = {
    metrics: {
      compression_ratio: 0,
      mdl_score: 0,
      schema_reuse_rate: 0,
      memory_usage_mb: 0,
      pattern_discovery_accuracy: 0
    },
    details: {
      test_cases: [],
      learned_patterns: {},
      compression_stats: []
    }
  };

  // Test cases with different compression scenarios
  const testCases = [
    {
      name: 'high_repetition',
      data: PatternGenerator.generateRepeatingPattern([1, 2, 3], 20),
      expectedCompressionRatio: 0.7
    },
    {
      name: 'nested_patterns',
      data: PatternGenerator.generateNestedPattern([10, 20], [1, 2], 3),
      expectedCompressionRatio: 0.5
    },
    {
      name: 'mixed_patterns',
      data: [
        ...PatternGenerator.generateRepeatingPattern([5, 6, 7], 10),
        ...PatternGenerator.generateRepeatingPattern([8, 9], 15)
      ],
      expectedCompressionRatio: 0.6
    },
    {
      name: 'noisy_data',
      data: PatternGenerator.addNoise(
        PatternGenerator.generateRepeatingPattern([1, 2, 3, 4], 15),
        0.2
      ),
      expectedCompressionRatio: 0.3
    },
    {
      name: 'random_data',
      data: PatternGenerator.generateNoiseData(100),
      expectedCompressionRatio: 0.0
    }
  ];

  let totalCompressionRatio = 0;
  let totalMDLScore = 0;
  let successfulCompressions = 0;

  // Run compression tests
  for (const testCase of testCases) {
    try {
      const compressionResult = await compressor.compressWithLearning(testCase.data);
      
      const testResult = {
        name: testCase.name,
        originalSize: compressionResult.stats.originalSize,
        compressedSize: compressionResult.stats.compressedSize,
        schemaOverhead: compressionResult.stats.schemaOverhead,
        compressionRatio: compressionResult.compressionRatio,
        mdlScore: compressionResult.mdlScore,
        patternsFound: Object.keys(compressionResult.patterns).length,
        expectedRatio: testCase.expectedCompressionRatio,
        meetsExpectation: compressionResult.compressionRatio >= testCase.expectedCompressionRatio
      };

      results.details.test_cases.push(testResult);
      results.details.compression_stats.push(compressionResult.stats);

      if (compressionResult.compressionRatio > 0) {
        totalCompressionRatio += compressionResult.compressionRatio;
        totalMDLScore += compressionResult.mdlScore;
        successfulCompressions++;
      }

      // Merge learned patterns
      results.details.learned_patterns = {
        ...results.details.learned_patterns,
        ...compressionResult.patterns
      };

    } catch (error) {
      results.details.test_cases.push({
        name: testCase.name,
        error: error.message,
        compressionRatio: 0,
        meetsExpectation: false
      });
    }
  }

  // Test schema reuse across different datasets
  const reuseTestData = [
    PatternGenerator.generateRepeatingPattern([1, 2, 3], 10),
    PatternGenerator.generateRepeatingPattern([1, 2, 3, 4, 5], 8),
    PatternGenerator.generateNestedPattern([1, 2, 3], [10, 20], 2)
  ];

  const schemaReuseRate = await compressor.testSchemaReuse(reuseTestData);

  // Calculate pattern discovery accuracy
  const patternDiscoveryAccuracy = results.details.test_cases
    .filter(tc => tc.meetsExpectation !== undefined)
    .reduce((acc, tc) => acc + (tc.meetsExpectation ? 1 : 0), 0) / 
    results.details.test_cases.filter(tc => tc.meetsExpectation !== undefined).length;

  // Final metrics
  results.metrics.compression_ratio = successfulCompressions > 0 ? 
    totalCompressionRatio / successfulCompressions : 0;
  results.metrics.mdl_score = successfulCompressions > 0 ? 
    totalMDLScore / successfulCompressions : Infinity;
  results.metrics.schema_reuse_rate = schemaReuseRate;
  results.metrics.memory_usage_mb = compressor.getMemoryUsage();
  results.metrics.pattern_discovery_accuracy = patternDiscoveryAccuracy || 0;

  return results;
}

module.exports = { 
  runTest, 
  CompressionTester, 
  PatternGenerator, 
  MockVSAVMCompressor 
};
