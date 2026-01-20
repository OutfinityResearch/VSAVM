#!/usr/bin/env node
/**
 * VSAVM Evaluation Runner
 * 
 * Usage:
 *   node evals/run.mjs                    # Run all evaluations
 *   node evals/run.mjs --category reasoning
 *   node evals/run.mjs --verbose
 *   node evals/run.mjs --json             # Output JSON only
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.mjs';
import { runRuleLearningTests } from './tests/rule-learning.mjs';
import { runReasoningTests } from './tests/reasoning.mjs';
import { runQueryResponseTests } from './tests/query-response.mjs';
import { runCompressionTests } from './tests/compression.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    category: null,
    verbose: false,
    json: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      options.category = args[++i];
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  
  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
VSAVM Evaluation Runner

Usage:
  node evals/run.mjs [options]

Options:
  --category <name>   Run only specified category
                      (rule-learning, reasoning, query-response, compression)
  --verbose, -v       Show detailed output
  --json              Output results as JSON only
  --help, -h          Show this help message

Examples:
  node evals/run.mjs
  node evals/run.mjs --category reasoning --verbose
  node evals/run.mjs --json > results.json
`);
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Print progress bar
 */
function printProgress(current, total, label) {
  const width = 30;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = ((current / total) * 100).toFixed(0);
  process.stdout.write(`\r  ${bar} ${percent}% ${label}`);
}

/**
 * Print section header
 */
function printHeader(title) {
  console.log();
  console.log('─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

/**
 * Print metric with threshold check
 */
function printMetric(name, value, threshold, isHigherBetter = true) {
  const passed = isHigherBetter ? value >= threshold : value <= threshold;
  const status = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  const displayValue = typeof value === 'number' ? value.toFixed(3) : value;
  console.log(`  ${color}${status}${reset} ${name}: ${displayValue} (threshold: ${threshold})`);
}

/**
 * Run all evaluation categories
 */
async function runAllEvaluations(options) {
  const categories = [
    { name: 'rule-learning', runner: runRuleLearningTests },
    { name: 'reasoning', runner: runReasoningTests },
    { name: 'query-response', runner: runQueryResponseTests },
    { name: 'compression', runner: runCompressionTests }
  ];
  
  // Filter by category if specified
  const toRun = options.category
    ? categories.filter(c => c.name === options.category)
    : categories;
  
  if (toRun.length === 0) {
    console.error(`Unknown category: ${options.category}`);
    console.error('Available: ' + categories.map(c => c.name).join(', '));
    process.exit(1);
  }
  
  const results = {
    timestamp: new Date().toISOString(),
    config: config,
    categories: {},
    summary: {
      total_categories: toRun.length,
      passed_categories: 0,
      failed_categories: 0,
      total_duration_ms: 0
    }
  };
  
  const startTime = Date.now();
  
  if (!options.json) {
    console.log('\n🚀 VSAVM Evaluation Suite\n');
    console.log(`Running ${toRun.length} evaluation category(ies)...`);
  }
  
  for (const category of toRun) {
    if (!options.json) {
      printHeader(`📊 ${category.name}`);
    }
    
    const categoryStart = Date.now();
    
    try {
      const result = await category.runner(config);
      result.duration_ms = Date.now() - categoryStart;
      result.passed = evaluateCategoryResult(result, config.thresholds);
      
      results.categories[category.name] = result;
      
      if (result.passed) {
        results.summary.passed_categories++;
      } else {
        results.summary.failed_categories++;
      }
      
      if (!options.json) {
        printCategoryResult(result, config.thresholds, options.verbose);
      }
      
    } catch (error) {
      results.categories[category.name] = {
        error: error.message,
        passed: false,
        duration_ms: Date.now() - categoryStart
      };
      results.summary.failed_categories++;
      
      if (!options.json) {
        console.error(`  ✗ Error: ${error.message}`);
        if (options.verbose) {
          console.error(error.stack);
        }
      }
    }
  }
  
  results.summary.total_duration_ms = Date.now() - startTime;
  
  // Print summary
  if (!options.json) {
    printSummary(results);
  }
  
  // Save results
  await saveResults(results);
  
  // Output JSON if requested
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  }
  
  // Exit with appropriate code
  const allPassed = results.summary.failed_categories === 0;
  return allPassed;
}

/**
 * Evaluate if a category passed based on thresholds
 */
function evaluateCategoryResult(result, thresholds) {
  const metrics = result.metrics || {};
  
  // Check accuracy threshold
  if (metrics.accuracy !== undefined && metrics.accuracy < thresholds.rule_accuracy) {
    return false;
  }
  
  // Check consistency
  if (metrics.consistency_score !== undefined && metrics.consistency_score < thresholds.reasoning_consistency) {
    return false;
  }
  
  // Check compression
  if (metrics.avg_compression_ratio !== undefined && metrics.avg_compression_ratio < thresholds.compression_ratio) {
    return false;
  }
  
  // Check response time
  if (metrics.avg_response_ms !== undefined && metrics.avg_response_ms > thresholds.query_response_ms) {
    return false;
  }

  // Check response accuracy
  if (metrics.response_accuracy !== undefined && metrics.response_accuracy < thresholds.query_accuracy) {
    return false;
  }
  
  return true;
}

/**
 * Print category result
 */
function printCategoryResult(result, thresholds, verbose) {
  const metrics = result.metrics || {};
  
  console.log(`  Duration: ${formatDuration(result.duration_ms)}`);
  console.log();
  
  // Print key metrics
  if (metrics.accuracy !== undefined) {
    printMetric('Accuracy', metrics.accuracy, thresholds.rule_accuracy);
  }
  if (metrics.consistency_score !== undefined) {
    printMetric('Consistency', metrics.consistency_score, thresholds.reasoning_consistency);
  }
  if (metrics.avg_compression_ratio !== undefined) {
    printMetric('Compression Ratio', metrics.avg_compression_ratio, thresholds.compression_ratio);
  }
  if (metrics.avg_response_ms !== undefined) {
    printMetric('Avg Response', metrics.avg_response_ms, thresholds.query_response_ms, false);
  }
  if (metrics.response_accuracy !== undefined) {
    printMetric('Response Accuracy', metrics.response_accuracy, thresholds.query_accuracy);
  }
  if (metrics.inference_accuracy !== undefined) {
    printMetric('Inference Accuracy', metrics.inference_accuracy, 0.9);
  }
  
  // Print verbose details
  if (verbose && result.details) {
    console.log();
    console.log('  Details:');
    
    if (result.details.passed) {
      console.log(`    Passed: ${result.details.passed.length}`);
    }
    if (result.details.failed) {
      console.log(`    Failed: ${result.details.failed.length}`);
      for (const f of result.details.failed.slice(0, 3)) {
        console.log(`      - ${f.name || f.reason || JSON.stringify(f)}`);
      }
    }
  }
  
  console.log();
  const status = result.passed ? '\x1b[32m✓ PASSED\x1b[0m' : '\x1b[31m✗ FAILED\x1b[0m';
  console.log(`  ${status}`);
}

/**
 * Print overall summary
 */
function printSummary(results) {
  printHeader('📋 Summary');
  
  const { summary } = results;
  const successRate = (summary.passed_categories / summary.total_categories * 100).toFixed(1);
  
  console.log(`  Total Categories: ${summary.total_categories}`);
  console.log(`  Passed: \x1b[32m${summary.passed_categories}\x1b[0m`);
  console.log(`  Failed: \x1b[31m${summary.failed_categories}\x1b[0m`);
  console.log(`  Success Rate: ${successRate}%`);
  console.log(`  Total Duration: ${formatDuration(summary.total_duration_ms)}`);
  console.log();
  
  if (summary.failed_categories === 0) {
    console.log('  \x1b[32m✓ All evaluations passed!\x1b[0m');
  } else {
    console.log('  \x1b[31m✗ Some evaluations failed.\x1b[0m');
  }
  console.log();
}

/**
 * Save results to file
 */
async function saveResults(results) {
  const resultsDir = join(__dirname, 'results');
  
  try {
    await mkdir(resultsDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `eval-${timestamp}.json`;
  const filepath = join(resultsDir, filename);
  
  await writeFile(filepath, JSON.stringify(results, null, 2));
  
  // Also save as latest
  await writeFile(join(resultsDir, 'latest.json'), JSON.stringify(results, null, 2));
}

// Main execution
const options = parseArgs();
runAllEvaluations(options)
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
