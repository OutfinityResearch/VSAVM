# VSAVM Evaluation System

Fast-eval is a capability gate, not a smoke test. It is meant to fail unless the corresponding VSAVM modules are implemented and wired correctly. The suite avoids heuristic shortcuts and uses real execution paths.

## Structure

```
evals/
├── run.mjs              # Main evaluation runner
├── config.mjs           # Evaluation configuration
├── generators/          # Synthetic data generators
├── tests/               # Test implementations
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

## Evaluation Categories (Strict)

1. **Rule Learning** - Requires a real rule-learning module. If no rule learner is wired, the category fails.
2. **Compression** - Requires a real compression implementation. Estimated ratios are not accepted.
3. **Reasoning** - Uses bounded forward chaining and conflict detection to verify inference correctness.
4. **Query Response** - Checks correctness and latency for structured queries.

## Required Interfaces (Adapters)

Rule learning (one of these must exist):
- `VSAVM.learnRule(payload)`
- `VSAVM.learnRules([payload])`
- `VSAVM.ruleLearner.learnRule(payload)`
- `VSAVM.ruleLearner.learn(payload)`

Payload shape:
`{ name, type, sequence, expectedRule, scopeId }`

Return shape (minimum):
`{ rule, confidence? }` or a rule object (`{ type, ... }`)

Compression (one of these must exist):
- `VSAVM.compressPattern(payload)`
- `VSAVM.compressPatterns(payload)`
- `VSAVM.compressor.compress(payload)`
- `VSAVM.vsa.compress(payload)`

Return must include a concrete size via one of:
`compressedBytes`, `compressedSize`, `byteLength`, `size`, or `compressed` (string/Uint8Array).

## Thresholds

| Metric | Threshold |
|--------|-----------|
| Rule Learning Accuracy | ≥0.90 |
| Compression Ratio | ≥0.50 |
| Reasoning Consistency | ≥0.95 |
| Query Response Time | ≤100ms |
| Query Response Accuracy | ≥0.95 |
