# eval_tinyLLM

This sandbox trains and compares a tiny neural Transformer (TensorFlow) against VSAVM on a shared dataset. It follows the emergent-scope constraints (DS010/NFS11) for VSAVM and provides a CLI chat that can switch between engines.

## Requirements

- Node.js 18+
- `@tensorflow/tfjs-node` (installed at repo root)

## Quick Start

1) Download a minimal TinyLLM dataset from Hugging Face:

```
npm run downloadTinyLLM
```

2) Prepare train/valid splits:

```
npm run prepareTinyLLM
```

3) Train VSAVM (MacroUnitModel). For large datasets, prefer `--skip-ingest`:

```
node eval_tinyLLM/tools/train-vsavm.mjs --skip-ingest
```

4) Train TensorFlow baseline:

```
node eval_tinyLLM/tools/train-tf.mjs
```

5) Evaluate both:

```
node eval_tinyLLM/tools/eval-vsavm.mjs
node eval_tinyLLM/tools/eval-tf.mjs
```

6) Chat (switch engines with `/engine tf` or `/engine vsavm`):

```
node eval_tinyLLM/tools/chat.mjs --engine vsavm
```

Note: the VSAVM chat engine loads facts if available. If you trained with `--skip-ingest`, either re-train without it or pass `--facts` to a facts file.

## One-command training

```
npm run trainTinyLLM
```

Optional:

- Force re-download + retrain:
  ```
  npm run fetchTinyLLM && npm run trainTinyLLM:force
  ```
- Quick TF training (fewer steps):
  ```
  npm run trainTinyLLM:quick
  ```

## Notes

- VSAVM ingestion uses emergent separator discovery only. No hardcoded text separators are used.
- TensorFlow baseline is a minimal byte-level Transformer for comparison only.
- Cache artifacts are stored in `eval_tinyLLM/cache/` (gitignored).
- Comparison reports are written to `eval_tinyLLM/results/` as timestamped `.html` + `.json` files.
- If the raw dataset file is empty, the fetch script will re-download automatically.
- The downloader writes `eval_tinyLLM/cache/dataset_meta.json` so prepare can parse TXT/JSONL correctly.

## Cache Layout (Datasets + Models)

The cache is structured to support multiple dataset sizes and multiple trained models without overwriting:

- Raw download:
  - `eval_tinyLLM/cache/raw_dataset.*`
  - `eval_tinyLLM/cache/dataset_meta.json`
- Prepared datasets (keyed by `datasetId`):
  - `eval_tinyLLM/cache/datasets/<datasetId>/train.txt`
  - `eval_tinyLLM/cache/datasets/<datasetId>/valid.txt`
  - `eval_tinyLLM/cache/datasets/<datasetId>/meta.json`
  - `eval_tinyLLM/cache/datasets/latest.json`
- Trained models (keyed by `datasetId` + `modelId`):
  - `eval_tinyLLM/cache/models/tf/<datasetId>/<modelId>/model.json`
  - `eval_tinyLLM/cache/models/tf/<datasetId>/<modelId>/meta.json`
  - `eval_tinyLLM/cache/models/tf/<datasetId>/latest.json`
  - `eval_tinyLLM/cache/models/vsavm/<datasetId>/<modelId>/model.json`
  - `eval_tinyLLM/cache/models/vsavm/<datasetId>/<modelId>/meta.json`
  - `eval_tinyLLM/cache/models/vsavm/<datasetId>/<modelId>/facts.json` (only if VSAVM ingest was enabled)
  - `eval_tinyLLM/cache/models/vsavm/<datasetId>/latest.json`

List what you already have in the cache:

```
node eval_tinyLLM/tools/list-artifacts.mjs
```

## Training On Larger Sizes (Keeping Multiple Variants)

Prepare a larger dataset split and train both engines on it:

```
node eval_tinyLLM/tools/fetch-and-prepare.mjs --max-bytes 100000000
node eval_tinyLLM/tools/train-vsavm.mjs --max-bytes 100000000 --skip-ingest --force
node eval_tinyLLM/tools/train-tf.mjs --max-bytes 100000000 --epochs 2 --steps 2000 --force
node eval_tinyLLM/tools/compare.mjs --max-bytes 100000000 --reference --runs 1
```

Quick large VSAVM training with RAM guard (streaming + memory cap):

```
node eval_tinyLLM/tools/train-large.mjs --max-bytes 50000000
```

To keep multiple training variants on the same dataset size, use `--tag` and/or `--model-id` on `train-vsavm.mjs` / `train-tf.mjs`.

## Fair comparison report

Generate an HTML + JSON report with identical time budgets per prompt:

```
npm run compareTinyLLM
```

The script prints the output paths, e.g. `eval_tinyLLM/results/<timestamp>_results.html`.

Defaults: 3 runs, 80 prompts, budgets 400/800/1200ms per prompt, maxTokens=128. VSAVM outputs are capped to targetOutputBytes (default 128) with a diagnostics suffix to keep lengths comparable. The HTML includes latency/output/timeout charts plus byte-level distinct n-gram and repetition metrics.

Reference-based evaluation (prompt + expected continuation from each line):

```
node eval_tinyLLM/tools/compare.mjs --reference
```

This computes prefix-match and byte-accuracy against the next `referenceBytes` bytes (defaults to targetOutputBytes) and disables VSAVM diagnostics unless explicitly re-enabled.

Select specific cached artifacts (optional):

```
node eval_tinyLLM/tools/compare.mjs --dataset-id latest --vsavm-model-id latest --tf-model-id latest
```
