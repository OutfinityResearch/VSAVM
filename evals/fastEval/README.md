# FastEval - Rapid VSAVM Evaluation Suite

FastEval provides lightweight, deterministic tests to quickly assess VSAVM's core capabilities without extensive training or computational resources.

## Design Principles

- **Minimal Computation**: Tests run in seconds to minutes, not hours
- **Deterministic**: Reproducible results across runs and environments
- **Synthetic Data**: Controlled, generated datasets with known ground truth
- **Progressive Complexity**: Tests start simple and increase in difficulty
- **Clear Metrics**: Quantitative measures with established thresholds

## Test Categories

### 1. Rule Learning Tests (`rule-learning/`)

Tests the system's ability to discover and internalize patterns from synthetic data.

#### Arithmetic Sequences
```javascript
// Example: Learn the rule x[n+1] = x[n] + 3
const sequence = [1, 4, 7, 10, 13, 16, 19, 22];
// Expected: System identifies arithmetic progression with difference 3
```

#### Logical Implications
```javascript
// Example: Learn A ∧ B → C
const facts = [
  {A: true, B: true, C: true},
  {A: true, B: false, C: false},
  {A: false, B: true, C: false}
];
// Expected: System derives implication rule
```

### 2. Compression Tests (`compression/`)

Measures the system's ability to compress learned patterns efficiently.

#### Pattern Consolidation
- Input: Repetitive data with underlying structure
- Output: Compressed representation using learned schemas
- Metric: Compression ratio and information preservation

#### Schema Reuse
- Input: Similar patterns across different domains
- Output: Shared schemas applied to multiple contexts
- Metric: Schema utilization rate and cross-domain transfer

### 3. Reasoning Tests (`reasoning/`)

Evaluates logical inference and consistency maintenance.

#### Deductive Reasoning
- Input: Facts and rules
- Output: Derived conclusions
- Metric: Inference accuracy and completeness

#### Consistency Checking
- Input: Potentially contradictory facts
- Output: Conflict detection and resolution
- Metric: Contradiction identification rate

### 4. RL Prediction Tests (`rl-prediction/`)

Tests reinforcement learning on learned structural patterns.

#### Shape Learning
- Input: Geometric or abstract patterns
- Output: Learned policy for pattern completion
- Metric: Prediction accuracy and convergence speed

#### Transfer Learning
- Input: Learned patterns applied to new contexts
- Output: Adapted predictions
- Metric: Transfer efficiency and accuracy

### 5. Query Response Tests (`query-response/`)

Evaluates natural language query compilation and execution.

#### Factual Queries
- Input: Questions about stored facts
- Output: Accurate answers with provenance
- Metric: Response accuracy and retrieval speed

#### Inferential Queries
- Input: Questions requiring reasoning
- Output: Derived answers with explanation
- Metric: Reasoning correctness and explanation quality

## Running Tests

### Prerequisites
```bash
npm install
```

### Individual Test Categories
```bash
npm run test:rule-learning
npm run test:compression
npm run test:reasoning
npm run test:rl-prediction
npm run test:query-response
```

### Full Evaluation Suite
```bash
npm run eval-all
```

### Continuous Monitoring
```bash
npm run eval-watch  # Re-run tests on code changes
```

## Configuration

Tests are configured via `config/eval-config.json`:

```json
{
  "timeouts": {
    "rule_learning": 30000,
    "compression": 15000,
    "reasoning": 10000,
    "rl_prediction": 60000,
    "query_response": 5000
  },
  "thresholds": {
    "rule_accuracy": 0.90,
    "compression_ratio": 0.50,
    "reasoning_consistency": 0.95,
    "rl_convergence_episodes": 1000,
    "query_response_time": 100
  },
  "data_sizes": {
    "small": 100,
    "medium": 1000,
    "large": 10000
  }
}
```

## Output Format

All tests produce standardized JSON output:

```json
{
  "test_id": "rule-learning-arithmetic-001",
  "timestamp": "2026-01-20T17:50:44.140Z",
  "status": "passed",
  "metrics": {
    "accuracy": 0.95,
    "execution_time_ms": 1250,
    "memory_usage_mb": 45.2
  },
  "details": {
    "rules_discovered": 3,
    "patterns_learned": ["arithmetic_progression", "modular_arithmetic"],
    "compression_achieved": 0.67
  },
  "threshold_comparison": {
    "accuracy": {"value": 0.95, "threshold": 0.90, "passed": true},
    "execution_time": {"value": 1250, "threshold": 30000, "passed": true}
  }
}
```

## Integration with CI/CD

FastEval integrates with continuous integration systems:

```yaml
# .github/workflows/eval.yml
name: VSAVM Evaluation
on: [push, pull_request]
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd evals/fastEval && npm install
      - name: Run evaluation suite
        run: cd evals/fastEval && npm run eval-all
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: evaluation-results
          path: evals/fastEval/results/
```

## Regression Detection

The system tracks performance over time and alerts on regressions:

- **Performance Baselines**: Established benchmarks for each test
- **Trend Analysis**: Statistical analysis of performance changes
- **Alert Thresholds**: Configurable sensitivity for regression detection
- **Historical Comparison**: Performance comparison across versions
