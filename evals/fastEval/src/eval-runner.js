const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const Table = require('cli-table3');
const { v4: uuidv4 } = require('uuid');

class EvaluationRunner {
  constructor(configPath = './config/eval-config.json') {
    this.config = require(configPath);
    this.results = [];
    this.startTime = Date.now();
  }

  async runAllEvaluations() {
    console.log(chalk.blue('🚀 Starting VSAVM FastEval Suite'));
    console.log(chalk.gray(`Configuration loaded from: ${this.configPath}`));
    
    const testCategories = [
      'rule-learning',
      'compression', 
      'reasoning',
      'rl-prediction',
      'query-response'
    ];

    for (const category of testCategories) {
      console.log(chalk.yellow(`\n📊 Running ${category} tests...`));
      await this.runCategoryTests(category);
    }

    await this.generateSummaryReport();
    return this.results;
  }

  async runCategoryTests(category) {
    const categoryPath = path.join(__dirname, 'tests', category);
    
    if (!await fs.pathExists(categoryPath)) {
      console.log(chalk.red(`❌ Test category not found: ${category}`));
      return;
    }

    const testFiles = await fs.readdir(categoryPath);
    const jsTestFiles = testFiles.filter(f => f.endsWith('.test.js'));

    for (const testFile of jsTestFiles) {
      const testPath = path.join(categoryPath, testFile);
      const testModule = require(testPath);
      
      if (testModule.runTest) {
        const testResult = await this.runSingleTest(category, testFile, testModule);
        this.results.push(testResult);
      }
    }
  }

  async runSingleTest(category, testFile, testModule) {
    const testId = `${category}-${testFile.replace('.test.js', '')}-${Date.now()}`;
    const startTime = Date.now();
    
    console.log(chalk.gray(`  Running: ${testFile}`));

    try {
      const result = await Promise.race([
        testModule.runTest(this.config),
        this.createTimeout(category)
      ]);

      const executionTime = Date.now() - startTime;
      const testResult = {
        test_id: testId,
        category,
        test_file: testFile,
        timestamp: new Date().toISOString(),
        status: 'passed',
        execution_time_ms: executionTime,
        ...result
      };

      // Check thresholds
      testResult.threshold_comparison = this.checkThresholds(testResult);
      testResult.overall_passed = Object.values(testResult.threshold_comparison)
        .every(check => check.passed);

      if (testResult.overall_passed) {
        console.log(chalk.green(`  ✅ ${testFile} - PASSED`));
      } else {
        console.log(chalk.red(`  ❌ ${testFile} - FAILED (threshold violation)`));
      }

      return testResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.log(chalk.red(`  ❌ ${testFile} - ERROR: ${error.message}`));
      
      return {
        test_id: testId,
        category,
        test_file: testFile,
        timestamp: new Date().toISOString(),
        status: 'error',
        execution_time_ms: executionTime,
        error: error.message,
        overall_passed: false
      };
    }
  }

  createTimeout(category) {
    const timeout = this.config.timeouts[category.replace('-', '_')] || 30000;
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout);
    });
  }

  checkThresholds(result) {
    const checks = {};
    const thresholds = this.config.thresholds;

    // Check common thresholds
    if (result.metrics) {
      if (result.metrics.accuracy !== undefined) {
        checks.accuracy = {
          value: result.metrics.accuracy,
          threshold: thresholds.rule_accuracy,
          passed: result.metrics.accuracy >= thresholds.rule_accuracy
        };
      }

      if (result.metrics.compression_ratio !== undefined) {
        checks.compression_ratio = {
          value: result.metrics.compression_ratio,
          threshold: thresholds.compression_ratio,
          passed: result.metrics.compression_ratio >= thresholds.compression_ratio
        };
      }

      if (result.metrics.consistency_score !== undefined) {
        checks.consistency = {
          value: result.metrics.consistency_score,
          threshold: thresholds.reasoning_consistency,
          passed: result.metrics.consistency_score >= thresholds.reasoning_consistency
        };
      }

      if (result.metrics.memory_usage_mb !== undefined) {
        checks.memory_usage = {
          value: result.metrics.memory_usage_mb,
          threshold: thresholds.memory_usage_mb,
          passed: result.metrics.memory_usage_mb <= thresholds.memory_usage_mb
        };
      }
    }

    // Check execution time
    if (result.execution_time_ms !== undefined) {
      const categoryTimeout = this.config.timeouts[result.category.replace('-', '_')];
      checks.execution_time = {
        value: result.execution_time_ms,
        threshold: categoryTimeout,
        passed: result.execution_time_ms <= categoryTimeout
      };
    }

    return checks;
  }

  async generateSummaryReport() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.overall_passed).length;
    const failedTests = totalTests - passedTests;
    const totalTime = Date.now() - this.startTime;

    console.log(chalk.blue('\n📋 Evaluation Summary'));
    console.log(chalk.gray('='.repeat(50)));

    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      colWidths: [25, 15]
    });

    summaryTable.push(
      ['Total Tests', totalTests],
      ['Passed', chalk.green(passedTests)],
      ['Failed', failedTests > 0 ? chalk.red(failedTests) : failedTests],
      ['Success Rate', `${((passedTests / totalTests) * 100).toFixed(1)}%`],
      ['Total Time', `${(totalTime / 1000).toFixed(2)}s`]
    );

    console.log(summaryTable.toString());

    // Category breakdown
    const categoryStats = this.getCategoryStats();
    if (Object.keys(categoryStats).length > 0) {
      console.log(chalk.blue('\n📊 Category Breakdown'));
      
      const categoryTable = new Table({
        head: ['Category', 'Passed', 'Failed', 'Success Rate'],
        colWidths: [20, 10, 10, 15]
      });

      Object.entries(categoryStats).forEach(([category, stats]) => {
        const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
        categoryTable.push([
          category,
          chalk.green(stats.passed),
          stats.failed > 0 ? chalk.red(stats.failed) : stats.failed,
          `${successRate}%`
        ]);
      });

      console.log(categoryTable.toString());
    }

    // Save detailed results
    await this.saveResults();

    if (failedTests > 0) {
      console.log(chalk.red(`\n❌ ${failedTests} test(s) failed. Check results for details.`));
      process.exit(1);
    } else {
      console.log(chalk.green('\n✅ All tests passed!'));
    }
  }

  getCategoryStats() {
    const stats = {};
    
    this.results.forEach(result => {
      if (!stats[result.category]) {
        stats[result.category] = { total: 0, passed: 0, failed: 0 };
      }
      
      stats[result.category].total++;
      if (result.overall_passed) {
        stats[result.category].passed++;
      } else {
        stats[result.category].failed++;
      }
    });

    return stats;
  }

  async saveResults() {
    const resultsDir = path.join(__dirname, 'results');
    await fs.ensureDir(resultsDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(resultsDir, `eval-results-${timestamp}.json`);

    const reportData = {
      timestamp: new Date().toISOString(),
      config: this.config,
      summary: {
        total_tests: this.results.length,
        passed_tests: this.results.filter(r => r.overall_passed).length,
        failed_tests: this.results.filter(r => !r.overall_passed).length,
        total_time_ms: Date.now() - this.startTime
      },
      results: this.results
    };

    await fs.writeJson(resultsFile, reportData, { spaces: 2 });
    console.log(chalk.gray(`\n💾 Results saved to: ${resultsFile}`));
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new EvaluationRunner();
  runner.runAllEvaluations().catch(console.error);
}

module.exports = EvaluationRunner;
