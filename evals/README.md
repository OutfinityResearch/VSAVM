# VSAVM Evaluation System

Rapid evaluation suite demonstrating core VSAVM capabilities.

## Structure

```
evals/
├── run.mjs              # Main evaluation runner
├── config.mjs           # Evaluation configuration
├── generators/          # Synthetic data generators
│   ├── arithmetic.mjs   # Arithmetic sequence generators
│   ├── logic.mjs        # Logical relation generators
│   └── patterns.mjs     # General pattern generators
├── tests/               # Test implementations
│   ├── rule-learning.mjs
│   ├── compression.mjs
│   ├── reasoning.mjs
│   └── query-response.mjs
└── results/             # Output directory
```

## Running Evaluations

```bash
# Run all evaluations
node evals/run.mjs

# Run specific category
node evals/run.mjs --category rule-learning

# Run with verbose output
node evals/run.mjs --verbose
```

## No External Dependencies

Per NFS requirements, this evaluation system uses:
- Pure JavaScript (ES2022+)
- ES Modules (.mjs)
- Node.js built-in APIs only
- async/await patterns

## Evaluation Categories

1. **Rule Learning** - Learns arithmetic, logical, and pattern rules
2. **Compression** - Tests MDL-based pattern compression
3. **Reasoning** - Forward chaining and inference
4. **Query Response** - Query compilation and execution

## Thresholds

| Metric | Threshold |
|--------|-----------|
| Rule Learning Accuracy | ≥90% |
| Compression Ratio | ≥50% |
| Reasoning Consistency | ≥95% |
| Query Response Time | ≤100ms |
