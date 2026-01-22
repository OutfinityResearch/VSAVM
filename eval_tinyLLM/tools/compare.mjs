/**
 * Comparison Script for VSAVM vs TensorFlow
 * Per DS011: Fair comparison of generation capabilities
 * 
 * Compares:
 * 1. Perplexity (language modeling quality)
 * 2. Compression ratio (VSAVM macro-unit efficiency)
 * 3. Generation throughput
 * 4. Reference match (byte accuracy)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.mjs';
import { encodeBytes, loadTextFile, streamRecords } from '../lib/dataset.mjs';
import { 
  loadMacroUnitModel, 
  generateWithVSAVM, 
  calculateVSAVMPerplexity,
  calculateVSAVMCompression 
} from '../lib/vsavm-driver.mjs';
import {
  datasetPaths,
  findLatestModelId,
  makeDatasetId,
  modelPaths,
  resolveDatasetId,
  resolveModelId
} from '../lib/artifacts.mjs';
import { createTimestampedResultPaths, writeLatestResultPointer } from '../lib/results.mjs';
import { createTransformer, sampleFromLogits } from '../lib/tf-model.mjs';
import { loadTf } from '../lib/tf-runtime.mjs';
import { mean, bytesPerSecond, distinctNgramRatio, repetitionRate } from '../lib/metrics.mjs';
import { computeHash } from '../../src/core/hash.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--runs' && args[i + 1]) options.runs = Number(args[++i]);
    else if (arg === '--prompts' && args[i + 1]) options.prompts = Number(args[++i]);
    else if (arg === '--budget-ms' && args[i + 1]) options.budgetMs = Number(args[++i]);
    else if (arg === '--budgets' && args[i + 1]) options.budgets = args[++i];
    else if (arg === '--max-tokens' && args[i + 1]) options.maxTokens = Number(args[++i]);
    else if (arg === '--temperature' && args[i + 1]) options.temperature = Number(args[++i]);
    else if (arg === '--target-bytes' && args[i + 1]) options.targetBytes = Number(args[++i]);
    else if (arg === '--prompt-bytes' && args[i + 1]) options.promptBytes = Number(args[++i]);
    else if (arg === '--reference-bytes' && args[i + 1]) options.referenceBytes = Number(args[++i]);
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--vsavm-model' && args[i + 1]) options.vsavmModel = args[++i];
    else if (arg === '--vsavm-model-id' && args[i + 1]) options.vsavmModelId = args[++i];
    else if (arg === '--tf-model' && args[i + 1]) options.tfModel = args[++i];
    else if (arg === '--tf-model-id' && args[i + 1]) options.tfModelId = args[++i];
    else if (arg === '--out-dir' && args[i + 1]) options.outDir = args[++i];
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--reference') options.reference = true;
    else if (arg === '--perplexity') options.perplexity = true;
    else if (arg === '--quick') options.quick = true;
    else if (arg === '--no-vsa') options.vsaEnabled = false;
    else if (arg === '--vsa-enabled') options.vsaEnabled = true;
    else if (arg === '--vsa-context-bytes' && args[i + 1]) options.vsaContextBytes = Number(args[++i]);
    else if (arg === '--vsa-boost' && args[i + 1]) options.vsaBoost = Number(args[++i]);
    else if (arg === '--vsa-retrieve-k' && args[i + 1]) options.vsaRetrieveK = Number(args[++i]);
    else if (arg === '--vsa-retrieve-limit' && args[i + 1]) options.vsaRetrieveLimit = Number(args[++i]);
    else if (arg === '--vsa-retrieve-every' && args[i + 1]) options.vsaRetrieveEvery = Number(args[++i]);
    else if (arg === '--vsa-retrieve-weight' && args[i + 1]) options.vsaRetrieveWeight = Number(args[++i]);
    else if (arg === '--vsa-topic-penalty' && args[i + 1]) options.vsaTopicPenalty = Number(args[++i]);
    else if (arg === '--vsa-topic-threshold' && args[i + 1]) options.vsaTopicThreshold = Number(args[++i]);
    else if (arg === '--vsa-min-similarity' && args[i + 1]) options.vsaMinSimilarity = Number(args[++i]);
    else if (arg === '--heartbeat-ms' && args[i + 1]) options.heartbeatMs = Number(args[++i]);
  }

  return options;
}

function parseBudgets(value, fallback) {
  if (!value) return fallback;
  const parts = value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
  return parts.length ? parts : fallback;
}

function selectPromptSegments(text, count, promptBytes, continuationBytes) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = lines.map((line) => {
    const bytes = Buffer.from(line, 'utf8');
    return { line, bytes };
  }).filter((item) => item.bytes.length >= promptBytes + continuationBytes);

  const ranked = candidates.map((item) => ({
    ...item,
    key: computeHash(item.line)
  })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return ranked.slice(0, count).map((entry) => {
    const prompt = entry.bytes.slice(0, promptBytes);
    const reference = entry.bytes.slice(promptBytes, promptBytes + continuationBytes);
    return {
      prompt: prompt.toString('utf8'),
      promptBytes: Array.from(prompt),
      referenceBytes: Array.from(reference),
      fullLine: entry.line
    };
  });
}

async function tryReadJson(path) {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function loadTrainingDurations(options = {}) {
  const vsavmMeta = await tryReadJson(options.vsavmMetaPath);
  const tfMeta = await tryReadJson(options.tfMetaPath);

  const durations = {
    vsavm: Number.isFinite(vsavmMeta?.durationMs) ? vsavmMeta.durationMs : null,
    tf: Number.isFinite(tfMeta?.durationMs) ? tfMeta.durationMs : null
  };

  if (durations.vsavm !== null || durations.tf !== null) {
    return durations;
  }

  // Fallback: legacy global log (not model-specific).
  try {
    const raw = await readFile(config.paths.trainingLog, 'utf8');
    const lines = raw.trim().split(/\r?\n/);

    for (const line of lines) {
      if (line.includes('VSAVM DS011 training complete') || line.includes('VSAVM training duration')) {
        const match = line.match(/duration[=:]?\s*([0-9.]+)\s*ms/i);
        if (match) durations.vsavm = Number(match[1]);
      }
      if (line.includes('TF training duration')) {
        const match = line.match(/duration[=:]?\s*([0-9.]+)\s*ms/i);
        if (match) durations.tf = Number(match[1]);
      }
    }
  } catch {}

  return durations;
}

function compareToReference(outputBytes, referenceBytes) {
  const refLength = referenceBytes.length;
  if (!refLength) {
    return { coverage: 0, byteAccuracy: 0, prefixMatch: 0 };
  }

  const outLength = outputBytes.length;
  const minLen = Math.min(outLength, refLength);
  let match = 0;
  let prefix = 0;

  for (let i = 0; i < minLen; i++) {
    if (outputBytes[i] === referenceBytes[i]) {
      match += 1;
      if (prefix === i) {
        prefix += 1;
      }
    }
  }

  return {
    coverage: outLength / refLength,
    byteAccuracy: match / refLength,
    prefixMatch: prefix / refLength
  };
}

async function generateTfResponse(tf, model, promptBytes, options) {
  const seqLen = model.config.seqLen;
  const maxTokens = options.maxTokens;
  const temperature = options.temperature;
  const budgetMs = options.budgetMs;
  const start = performance.now();

  const context = Array.from(promptBytes);
  let produced = 0;

  while (produced < maxTokens && (performance.now() - start) < budgetMs) {
    const window = context.slice(Math.max(0, context.length - seqLen));
    const padded = new Array(seqLen).fill(0);
    const offset = seqLen - window.length;
    for (let i = 0; i < window.length; i++) {
      padded[offset + i] = window[i];
    }

    const nextToken = tf.tidy(() => {
      const input = tf.tensor2d([padded], [1, seqLen], 'int32');
      const logits = model.forward(input);
      const lastLogits = logits.slice([0, seqLen - 1, 0], [1, 1, model.config.vocabSize])
        .reshape([model.config.vocabSize]);
      return sampleFromLogits(tf, lastLogits, temperature);
    });

    context.push(nextToken);
    produced += 1;
  }

  const durationMs = performance.now() - start;
  const outputBytes = context.slice(promptBytes.length);
  return {
    outputBytes,
    durationMs,
    tokensGenerated: produced,
    timedOut: durationMs >= budgetMs
  };
}

function calculateTfPerplexity(tf, model, bytes) {
  const seqLen = model.config.seqLen;
  if (bytes.length < 2) return Infinity;

  let logProb = 0;
  let count = 0;

  for (let i = 1; i < bytes.length && i < seqLen; i++) {
    const context = bytes.slice(0, i);
    const padded = new Array(seqLen).fill(0);
    const offset = seqLen - context.length;
    for (let j = 0; j < context.length; j++) {
      padded[offset + j] = context[j];
    }

    const nextByte = bytes[i];
    
    const prob = tf.tidy(() => {
      const input = tf.tensor2d([padded], [1, seqLen], 'int32');
      const logits = model.forward(input);
      const lastLogits = logits.slice([0, seqLen - 1, 0], [1, 1, model.config.vocabSize])
        .reshape([model.config.vocabSize]);
      const probs = tf.softmax(lastLogits);
      return probs.arraySync()[nextByte];
    });

    if (prob > 0) {
      logProb += Math.log2(prob);
      count++;
    }
  }

  if (count === 0) return Infinity;
  const avgLogProb = logProb / count;
  return Math.pow(2, -avgLogProb);
}

function renderHtml(report) {
  const esc = (value) => String(value).replace(/[&<>]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  }[ch]));

  const fmt = (value, decimals = 2) => 
    typeof value === 'number' && Number.isFinite(value) 
      ? value.toFixed(decimals) 
      : 'N/A';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>VSAVM vs TensorFlow Comparison (DS011)</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 32px; color: #222; max-width: 1200px; }
    h1 { margin-bottom: 8px; color: #1a1a2e; }
    h2 { color: #16213e; border-bottom: 2px solid #e94560; padding-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #0f3460; color: white; }
    tr:nth-child(even) { background: #f8f9fa; }
    .highlight { background: #e8f5e9; font-weight: bold; }
    .metric-card { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; 
      padding: 20px; 
      border-radius: 10px; 
      margin: 10px 0;
      display: inline-block;
      min-width: 200px;
    }
    .metric-card h3 { margin: 0 0 10px 0; font-size: 14px; opacity: 0.9; }
    .metric-card .value { font-size: 28px; font-weight: bold; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 20px 0; }
    section { margin-bottom: 32px; }
    .winner { color: #27ae60; }
    .loser { color: #c0392b; }
    .summary { background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 12px; }
    .samples-table td { vertical-align: top; }
  </style>
</head>
<body>
  <h1>VSAVM vs TensorFlow Comparison Report</h1>
  <p>Generated: ${esc(report.generatedAt)}</p>
  <p><em>Per DS011: Fair comparison of language modeling capabilities</em></p>

  <div class="summary">
    <h2>Key Findings</h2>
    <div class="grid">
      <div class="metric-card">
        <h3>VSAVM Perplexity</h3>
        <div class="value">${fmt(report.metrics?.vsavm?.avgPerplexity)}</div>
      </div>
      <div class="metric-card">
        <h3>TensorFlow Perplexity</h3>
        <div class="value">${fmt(report.metrics?.tf?.avgPerplexity)}</div>
      </div>
      <div class="metric-card">
        <h3>VSAVM Compression</h3>
        <div class="value">${fmt(report.metrics?.vsavm?.avgCompression * 100, 1)}%</div>
      </div>
      <div class="metric-card">
        <h3>VSAVM Model Size</h3>
        <div class="value">${fmt(report.modelSizes?.vsavm / 1024, 1)} KB</div>
      </div>
      <div class="metric-card">
        <h3>TF Model Size</h3>
        <div class="value">${fmt(report.modelSizes?.tf / 1024, 1)} KB</div>
      </div>
    </div>
  </div>

  <section>
    <h2>Configuration</h2>
    <table>
      <tr><th>Setting</th><th>Value</th></tr>
      <tr><td>Dataset ID</td><td>${esc(report.dataset?.datasetId ?? 'N/A')}</td></tr>
      <tr><td>VSAVM Model ID</td><td>${esc(report.models?.vsavm?.modelId ?? 'N/A')}</td></tr>
      <tr><td>TF Model ID</td><td>${esc(report.models?.tf?.modelId ?? 'N/A')}</td></tr>
      <tr><td>Runs</td><td>${report.config.runs}</td></tr>
      <tr><td>Prompts</td><td>${report.config.prompts}</td></tr>
      <tr><td>Prompt Bytes</td><td>${report.config.promptBytes}</td></tr>
      <tr><td>Reference Bytes</td><td>${report.config.referenceBytes}</td></tr>
      <tr><td>Max Tokens</td><td>${report.config.maxTokens}</td></tr>
      <tr><td>Temperature</td><td>${report.config.temperature}</td></tr>
      <tr><td>Dataset Max Bytes</td><td>${report.config.maxBytes ?? 'N/A'}</td></tr>
      <tr><td>Train Ratio</td><td>${report.config.trainRatio ?? 'N/A'}</td></tr>
    </table>
  </section>

  <section>
    <h2>Training Performance</h2>
    <table>
      <tr><th>System</th><th>Training Time (ms)</th><th>Model Size (KB)</th></tr>
      <tr>
        <td>VSAVM</td>
        <td>${fmt(report.training?.vsavm)}</td>
        <td>${fmt(report.modelSizes?.vsavm / 1024, 1)}</td>
      </tr>
      <tr>
        <td>TensorFlow</td>
        <td>${fmt(report.training?.tf)}</td>
        <td>${fmt(report.modelSizes?.tf / 1024, 1)}</td>
      </tr>
    </table>
  </section>

  <section>
    <h2>Language Modeling Quality</h2>
    <table>
      <tr>
        <th>Metric</th>
        <th>VSAVM</th>
        <th>TensorFlow</th>
        <th>Better</th>
      </tr>
      <tr>
        <td>Perplexity (lower is better)</td>
        <td>${fmt(report.metrics?.vsavm?.avgPerplexity)}</td>
        <td>${fmt(report.metrics?.tf?.avgPerplexity)}</td>
        <td class="${(report.metrics?.vsavm?.avgPerplexity ?? Infinity) < (report.metrics?.tf?.avgPerplexity ?? Infinity) ? 'winner' : 'loser'}">
          ${(report.metrics?.vsavm?.avgPerplexity ?? Infinity) < (report.metrics?.tf?.avgPerplexity ?? Infinity) ? 'VSAVM' : 'TF'}
        </td>
      </tr>
      <tr>
        <td>Compression Ratio</td>
        <td>${fmt(report.metrics?.vsavm?.avgCompression * 100, 1)}%</td>
        <td>N/A (no macro-units)</td>
        <td>VSAVM unique</td>
      </tr>
    </table>
  </section>

  <section>
    <h2>Generation Comparison</h2>
    <table>
      <tr>
        <th>Budget (ms)</th>
        <th>VSAVM Latency</th>
        <th>VSAVM Output Bytes</th>
        <th>TF Latency</th>
        <th>TF Output Bytes</th>
      </tr>
      ${(report.budgetResults ?? []).map((item) => `
      <tr>
        <td>${item.budgetMs}</td>
        <td>${fmt(item.vsavm?.avgLatencyMs)}</td>
        <td>${fmt(item.vsavm?.avgOutputBytes, 0)}</td>
        <td>${fmt(item.tf?.avgLatencyMs)}</td>
        <td>${fmt(item.tf?.avgOutputBytes, 0)}</td>
      </tr>
      `).join('')}
    </table>
  </section>

  ${report.referenceResults ? `
  <section>
    <h2>Reference Match (Byte-level Accuracy)</h2>
    <table>
      <tr>
        <th>Budget (ms)</th>
        <th>VSAVM Prefix Match</th>
        <th>VSAVM Byte Accuracy</th>
        <th>TF Prefix Match</th>
        <th>TF Byte Accuracy</th>
      </tr>
      ${(report.referenceResults ?? []).map((item) => `
      <tr>
        <td>${item.budgetMs}</td>
        <td>${fmt(item.vsavm?.prefixMatch * 100, 1)}%</td>
        <td>${fmt(item.vsavm?.byteAccuracy * 100, 1)}%</td>
        <td>${fmt(item.tf?.prefixMatch * 100, 1)}%</td>
        <td>${fmt(item.tf?.byteAccuracy * 100, 1)}%</td>
      </tr>
      `).join('')}
    </table>
  </section>
  ` : ''}

  ${report.samples?.length ? `
  <section>
    <h2>Side-by-side Samples (Budget ${report.sampleBudgetMs}ms)</h2>
    <table class="samples-table">
      <tr>
        <th>#</th>
        <th>Prompt</th>
        <th>VSAVM Output</th>
        <th>TensorFlow Output</th>
      </tr>
      ${(report.samples ?? []).map((sample, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><pre>${esc(sample.prompt)}</pre></td>
        <td><pre>${esc(sample.vsavm)}</pre></td>
        <td><pre>${esc(sample.tf)}</pre></td>
      </tr>
      `).join('')}
    </table>
  </section>
  ` : ''}

  <section>
    <h2>Macro-Unit Statistics (VSAVM)</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Macro-units Discovered</td><td>${report.vsavmStats?.macroUnitCount ?? 'N/A'}</td></tr>
      <tr><td>Avg Macro-unit Length</td><td>${fmt(report.vsavmStats?.avgMacroUnitLength)} bytes</td></tr>
      <tr><td>N-gram Contexts</td><td>${report.vsavmStats?.ngramContexts ?? 'N/A'}</td></tr>
      <tr><td>Vocabulary Size</td><td>${report.vsavmStats?.vocabularySize ?? 'N/A'}</td></tr>
    </table>
  </section>

</body>
</html>`;
}

async function main() {
  const args = parseArgs();
  const runs = Number.isFinite(args.runs) ? args.runs : (args.quick ? 1 : config.compare.runs);
  const promptCount = Number.isFinite(args.prompts) ? args.prompts : (args.quick ? 20 : config.compare.prompts);
  const maxTokens = Number.isFinite(args.maxTokens) ? args.maxTokens : config.compare.maxTokens;
  const temperature = Number.isFinite(args.temperature) ? args.temperature : config.compare.temperature;
  const budgets = parseBudgets(args.budgets, config.compare.budgets ?? [config.compare.budgetMs]);
  const promptBytes = Number.isFinite(args.promptBytes) ? args.promptBytes : (config.compare.promptBytes ?? 64);
  const referenceBytes = Number.isFinite(args.referenceBytes) ? args.referenceBytes : (config.compare.targetOutputBytes ?? 64);
  const maxBytes = Number.isFinite(args.maxBytes) ? args.maxBytes : config.prep.maxBytes;
  const trainRatio = Number.isFinite(args.trainRatio) ? args.trainRatio : config.prep.trainRatio;

  const datasetIdRaw = args.datasetId ?? makeDatasetId({
    dataset: config.hf.dataset,
    split: config.hf.split,
    maxBytes,
    trainRatio,
    textField: config.hf.textField
  });
  const datasetId = datasetIdRaw === 'latest'
    ? await resolveDatasetId({ datasetsDir: config.paths.datasetsDir, datasetId: datasetIdRaw })
    : datasetIdRaw;
  const dataset = datasetPaths({ datasetsDir: config.paths.datasetsDir, datasetId });

  console.log('=== VSAVM vs TensorFlow Comparison (DS011) ===\n');
  console.log(`Prompts: ${promptCount}, Runs: ${runs}, Budgets: ${budgets.join(', ')}ms`);
  console.log(`Dataset ID: ${datasetId}`);

  // Load validation text
  const validTextPath = dataset.validText;
  let text;
  try {
    text = await loadTextFile(validTextPath, maxBytes);
  } catch (error) {
    throw new Error(
      `Dataset not prepared: ${validTextPath}. ` +
      'Run: node eval_tinyLLM/tools/fetch-and-prepare.mjs'
    );
  }
  const prompts = selectPromptSegments(text, promptCount, promptBytes, referenceBytes);
  console.log(`\nLoaded ${prompts.length} prompts from validation set`);

  const sampleBudgetMs = budgets[0];
  const samples = [];
  const heartbeatMs = Number.isFinite(args.heartbeatMs) ? args.heartbeatMs : 60000;
  let lastHeartbeat = Date.now();
  const vsaOptions = {
    vsaEnabled: args.vsaEnabled ?? true,
    vsaContextBytes: args.vsaContextBytes,
    vsaBoost: args.vsaBoost,
    vsaRetrieveK: args.vsaRetrieveK,
    vsaRetrieveLimit: args.vsaRetrieveLimit,
    vsaRetrieveEvery: args.vsaRetrieveEvery,
    vsaRetrieveWeight: args.vsaRetrieveWeight,
    vsaTopicPenalty: args.vsaTopicPenalty,
    vsaTopicThreshold: args.vsaTopicThreshold,
    vsaMinSimilarity: args.vsaMinSimilarity
  };

  // Load VSAVM model
  console.log('\nLoading VSAVM model...');
  let vsavmModelPath = args.vsavmModel;
  let vsavmModelId = args.vsavmModelId ?? null;
  let vsavmMetaPath = vsavmModelPath ? `${dirname(vsavmModelPath)}/meta.json` : null;

  if (!vsavmModelPath) {
    const modelIdRaw = args.vsavmModelId ?? 'latest';
    try {
      vsavmModelId = await resolveModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'vsavm',
        datasetId,
        modelId: modelIdRaw
      });
    } catch {
      vsavmModelId = await findLatestModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'vsavm',
        datasetId
      });
    }

    if (!vsavmModelId) {
      throw new Error(
        `No VSAVM model found for datasetId=${datasetId}. ` +
        'Run: node eval_tinyLLM/tools/train-vsavm.mjs'
      );
    }
    const paths = modelPaths({
      modelsDir: config.paths.modelsDir,
      engine: 'vsavm',
      datasetId,
      modelId: vsavmModelId
    });
    vsavmModelPath = paths.modelPath;
    vsavmMetaPath = paths.metaPath;
  }
  let vsavmModel;
  try {
    vsavmModel = await loadMacroUnitModel(vsavmModelPath);
    console.log('  VSAVM model loaded successfully');
  } catch (e) {
    console.error(`  Failed to load VSAVM model: ${e.message}`);
    console.error('  Run training first: node eval_tinyLLM/tools/train-vsavm.mjs --force');
    process.exitCode = 1;
    return;
  }

  const vsavmStats = vsavmModel.getStats();
  console.log(`  Macro-units: ${vsavmStats.macroUnitCount}`);
  console.log(`  Vocabulary: ${vsavmStats.vocabularySize}`);
  if (vsavmModelId) {
    console.log(`  Model ID: ${vsavmModelId}`);
  }

  // Load TF model
  console.log('\nLoading TensorFlow model...');
  const tf = await loadTf();
  let tfModel;
  let tfModelPath = args.tfModel;
  let tfModelId = args.tfModelId ?? null;
  let tfMetaPath = tfModelPath ? `${dirname(tfModelPath)}/meta.json` : null;
  try {
    if (!tfModelPath) {
      const modelIdRaw = args.tfModelId ?? 'latest';
      try {
        tfModelId = await resolveModelId({
          modelsDir: config.paths.modelsDir,
          engine: 'tf',
          datasetId,
          modelId: modelIdRaw
        });
      } catch {
        tfModelId = await findLatestModelId({
          modelsDir: config.paths.modelsDir,
          engine: 'tf',
          datasetId
        });
      }

      if (!tfModelId) {
        throw new Error(
          `No TF model found for datasetId=${datasetId}. ` +
          'Run: node eval_tinyLLM/tools/train-tf.mjs'
        );
      }
      const paths = modelPaths({
        modelsDir: config.paths.modelsDir,
        engine: 'tf',
        datasetId,
        modelId: tfModelId
      });
      tfModelPath = paths.modelPath;
      tfMetaPath = paths.metaPath;
    }

    const payload = JSON.parse(await readFile(tfModelPath, 'utf8'));
    tfModel = createTransformer(tf, payload.config);
    await tfModel.load(tfModelPath);
    console.log('  TensorFlow model loaded successfully');
  } catch (e) {
    console.error(`  Failed to load TF model: ${e.message}`);
    console.error('  Run training first: node eval_tinyLLM/tools/train-tf.mjs');
    process.exitCode = 1;
    return;
  }
  if (tfModelId) {
    console.log(`  Model ID: ${tfModelId}`);
  }

  // Get model sizes
  let vsavmModelSize = 0;
  let tfModelSize = 0;
  try {
    const vsavmModelContent = await readFile(vsavmModelPath, 'utf8');
    vsavmModelSize = Buffer.byteLength(vsavmModelContent, 'utf8');
  } catch {}
  try {
    const tfModelContent = await readFile(tfModelPath, 'utf8');
    tfModelSize = Buffer.byteLength(tfModelContent, 'utf8');
  } catch {}

  // Calculate perplexity
  console.log('\nCalculating perplexity...');
  const perpSamples = prompts.slice(0, Math.min(50, prompts.length));
  let vsavmPerp = 0, tfPerp = 0;
  let perpCount = 0;

  for (const sample of perpSamples) {
    const bytes = [...sample.promptBytes, ...sample.referenceBytes];
    
    const vp = calculateVSAVMPerplexity(vsavmModel, Buffer.from(bytes).toString('utf8'));
    if (Number.isFinite(vp) && vp < 10000) {
      vsavmPerp += vp;
      perpCount++;
    }
  }
  
  // TF perplexity is expensive, sample fewer
  let tfPerpCount = 0;
  for (const sample of perpSamples.slice(0, 10)) {
    const bytes = [...sample.promptBytes, ...sample.referenceBytes];
    const tp = calculateTfPerplexity(tf, tfModel, bytes);
    if (Number.isFinite(tp) && tp < 10000) {
      tfPerp += tp;
      tfPerpCount++;
    }
  }

  const avgVsavmPerp = perpCount > 0 ? vsavmPerp / perpCount : Infinity;
  const avgTfPerp = tfPerpCount > 0 ? tfPerp / tfPerpCount : Infinity;
  console.log(`  VSAVM perplexity: ${avgVsavmPerp.toFixed(2)}`);
  console.log(`  TF perplexity: ${avgTfPerp.toFixed(2)}`);

  // Calculate compression
  console.log('\nCalculating VSAVM compression...');
  let totalCompression = 0;
  for (const sample of perpSamples) {
    const text = Buffer.from([...sample.promptBytes, ...sample.referenceBytes]).toString('utf8');
    totalCompression += calculateVSAVMCompression(vsavmModel, text);
  }
  const avgCompression = totalCompression / perpSamples.length;
  console.log(`  VSAVM compression: ${(avgCompression * 100).toFixed(1)}%`);

  // Generation comparison
  console.log('\nComparing generation...');
  const budgetResults = [];
  const referenceResults = [];

  for (const budgetMs of budgets) {
    console.log(`\n  Budget: ${budgetMs}ms`);
    
    let vsavmLatencySum = 0, vsavmOutputSum = 0;
    let tfLatencySum = 0, tfOutputSum = 0;
    let vsavmPrefixSum = 0, vsavmAccuracySum = 0;
    let tfPrefixSum = 0, tfAccuracySum = 0;
    let count = 0;

    for (const sample of prompts) {
      // VSAVM generation
      const vsStart = performance.now();
      const vsResult = await generateWithVSAVM(vsavmModel, sample.prompt, {
        budgetMs,
        maxTokens,
        temperature,
        ...vsaOptions
      });
      const vsDuration = performance.now() - vsStart;
      
      const vsOutputBytes = vsResult.tokens.slice(sample.promptBytes.length);
      vsavmLatencySum += vsDuration;
      vsavmOutputSum += vsOutputBytes.length;

      const vsRef = compareToReference(vsOutputBytes, sample.referenceBytes);
      vsavmPrefixSum += vsRef.prefixMatch;
      vsavmAccuracySum += vsRef.byteAccuracy;

      // TF generation
      const tfResult = await generateTfResponse(tf, tfModel, sample.promptBytes, {
        budgetMs,
        maxTokens,
        temperature
      });
      
      tfLatencySum += tfResult.durationMs;
      tfOutputSum += tfResult.outputBytes.length;

      const tfRef = compareToReference(tfResult.outputBytes, sample.referenceBytes);
      tfPrefixSum += tfRef.prefixMatch;
      tfAccuracySum += tfRef.byteAccuracy;

      if (budgetMs === sampleBudgetMs) {
        const vsText = vsResult.text ?? Buffer.from(vsResult.tokens ?? []).toString('utf8');
        const tfText = Buffer.from([...sample.promptBytes, ...tfResult.outputBytes]).toString('utf8');
        samples.push({
          prompt: sample.prompt,
          vsavm: vsText.slice(sample.prompt.length),
          tf: tfText.slice(sample.prompt.length),
          vsavmFull: vsText,
          tfFull: tfText
        });
      }

      count++;

      if (heartbeatMs > 0 && Date.now() - lastHeartbeat >= heartbeatMs) {
        console.log(
          `Heartbeat: processed ${count}/${prompts.length} prompts at budget ${budgetMs}ms`
        );
        lastHeartbeat = Date.now();
      }
    }

    budgetResults.push({
      budgetMs,
      vsavm: {
        avgLatencyMs: vsavmLatencySum / count,
        avgOutputBytes: vsavmOutputSum / count
      },
      tf: {
        avgLatencyMs: tfLatencySum / count,
        avgOutputBytes: tfOutputSum / count
      }
    });

    referenceResults.push({
      budgetMs,
      vsavm: {
        prefixMatch: vsavmPrefixSum / count,
        byteAccuracy: vsavmAccuracySum / count
      },
      tf: {
        prefixMatch: tfPrefixSum / count,
        byteAccuracy: tfAccuracySum / count
      }
    });

    console.log(`    VSAVM: ${(vsavmLatencySum / count).toFixed(1)}ms, ${(vsavmOutputSum / count).toFixed(0)} bytes`);
    console.log(`    TF: ${(tfLatencySum / count).toFixed(1)}ms, ${(tfOutputSum / count).toFixed(0)} bytes`);
  }

  // Build report
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: {
      datasetId,
      validText: validTextPath,
      metaPath: dataset.metaPath,
      meta: await tryReadJson(dataset.metaPath)
    },
    models: {
      vsavm: {
        modelId: vsavmModelId,
        modelPath: vsavmModelPath,
        metaPath: vsavmMetaPath
      },
      tf: {
        modelId: tfModelId,
        modelPath: tfModelPath,
        metaPath: tfMetaPath
      }
    },
    config: {
      runs,
      prompts: promptCount,
      promptBytes,
      referenceBytes,
      maxTokens,
      temperature,
      budgets,
      maxBytes,
      trainRatio
    },
    sampleBudgetMs,
    samples,
    training: await loadTrainingDurations({ vsavmMetaPath, tfMetaPath }),
    modelSizes: {
      vsavm: vsavmModelSize,
      tf: tfModelSize
    },
    metrics: {
      vsavm: {
        avgPerplexity: avgVsavmPerp,
        avgCompression: avgCompression
      },
      tf: {
        avgPerplexity: avgTfPerp
      }
    },
    vsavmStats,
    budgetResults,
    referenceResults
  };

  const outDir = args.outDir ?? config.paths.resultsDir;
  const tag = args.tag ?? 'results';
  const outPaths = await createTimestampedResultPaths({ outDir, tag });

  // Save reports (timestamped)
  await writeFile(outPaths.jsonPath, JSON.stringify(report, null, 2));
  await writeFile(outPaths.htmlPath, renderHtml(report));
  await writeLatestResultPointer({
    outDir,
    id: outPaths.id,
    tag,
    jsonPath: outPaths.jsonPath,
    htmlPath: outPaths.htmlPath
  });

  console.log('\n=== Comparison Complete ===');
  console.log(`Report JSON: ${outPaths.jsonPath}`);
  console.log(`Report HTML: ${outPaths.htmlPath}`);

  // Summary
  console.log('\n--- Summary ---');
  console.log(`VSAVM Perplexity: ${avgVsavmPerp.toFixed(2)}`);
  console.log(`TF Perplexity: ${avgTfPerp.toFixed(2)}`);
  console.log(`VSAVM Compression: ${(avgCompression * 100).toFixed(1)}%`);
  console.log(`VSAVM Macro-units: ${vsavmStats.macroUnitCount}`);
  console.log(`Model Size - VSAVM: ${(vsavmModelSize / 1024).toFixed(1)}KB, TF: ${(tfModelSize / 1024).toFixed(1)}KB`);
}

main().catch((error) => {
  console.error(error.message);
  console.error(error.stack);
  process.exitCode = 1;
});
