#!/usr/bin/env node
/**
 * VSAVM vs TinyStories Comprehensive Comparison
 * 
 * Compares VSAVM with TinyStories baseline models at different scales.
 * Generates an HTML report with metrics, generation samples, and analysis.
 * 
 * Usage:
 *   node eval_tinyLLM/tools/comprehensive-compare.mjs [--records N]
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { config } from '../config.mjs';
import { createTimestampedResultPaths, writeLatestResultPointer } from '../lib/results.mjs';
import {
  datasetPaths,
  makeDatasetId,
  makeVsavmModelId,
  modelPaths,
  resolveDatasetId,
  writeLatestModelPointer
} from '../lib/artifacts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVAL_DIR = join(__dirname, '..');
const CACHE_DIR = join(EVAL_DIR, 'cache');
const MODELS_DIR = join(CACHE_DIR, 'tinystories_models');

// Test prompts for generation comparison
const TEST_PROMPTS = [
  { prompt: 'Once upon a time', category: 'story_start' },
  { prompt: 'The little girl wanted to', category: 'action' },
  { prompt: 'One day, a boy named Tom', category: 'character' },
  { prompt: 'She was very happy because', category: 'emotion' },
  { prompt: 'The dog ran to the', category: 'movement' }
];

// TinyStories models
const TINYSTORIES_MODELS = [
  { name: 'TinyStories-1M', params: 1_000_000 },
  { name: 'TinyStories-3M', params: 3_000_000 },
  { name: 'TinyStories-8M', params: 8_000_000 },
  { name: 'TinyStories-33M', params: 33_000_000 }
];

async function main() {
  const args = parseArgs();
  const startTime = performance.now();
  
  console.log('='.repeat(70));
  console.log('VSAVM vs TinyStories Comprehensive Comparison');
  console.log('='.repeat(70));
  
  const results = {
    timestamp: new Date().toISOString(),
    config: args,
    vsavm: null,
    tinystories: {},
    comparison: null,
    samples: []
  };
  
  await mkdir(CACHE_DIR, { recursive: true });
  
  // =========================================================================
  // 1. Train or Load VSAVM
  // =========================================================================
  console.log('\n[1/5] Training/Loading VSAVM...');
  results.vsavm = await trainOrLoadVSAVM(args);
  
  // =========================================================================
  // 2. Load TinyStories baselines
  // =========================================================================
  console.log('\n[2/5] Loading TinyStories baselines...');
  results.tinystories = await loadTinyStoriesBaselines();
  
  // =========================================================================
  // 3. Generate samples from all models
  // =========================================================================
  console.log('\n[3/5] Generating comparison samples...');
  results.samples = await generateComparisonSamples(results.vsavm, results.tinystories);
  
  // =========================================================================
  // 4. Calculate metrics
  // =========================================================================
  console.log('\n[4/5] Calculating comparison metrics...');
  results.comparison = calculateComparison(results);
  
  // =========================================================================
  // 5. Generate HTML report
  // =========================================================================
  console.log('\n[5/5] Generating HTML report...');
  const reportPath = await generateHtmlReport(results);
  
  const totalTime = (performance.now() - startTime) / 1000;
  
  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal time: ${totalTime.toFixed(1)}s`);
  console.log(`Report: ${reportPath}`);
  
  // Print summary
  printSummary(results);
}

function parseArgs() {
  const args = { records: 5000, force: false };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--force') args.force = true;
    else if (arg === '--records' && process.argv[i + 1]) {
      args.records = parseInt(process.argv[++i], 10);
    }
    else if (arg === '--dataset-id' && process.argv[i + 1]) {
      args.datasetId = process.argv[++i];
    }
    else if (arg === '--max-bytes' && process.argv[i + 1]) {
      args.maxBytes = Number(process.argv[++i]);
    }
    else if (arg === '--train-ratio' && process.argv[i + 1]) {
      args.trainRatio = Number(process.argv[++i]);
    }
    else if (arg === '--vsavm-model-id' && process.argv[i + 1]) {
      args.vsavmModelId = process.argv[++i];
    }
  }
  return args;
}

async function trainOrLoadVSAVM(args) {
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

  const modelId = args.vsavmModelId ?? makeVsavmModelId({
    tag: 'comprehensive',
    contextWindow: 16,
    minFrequency: 5,
    minLength: 2,
    maxLength: 16,
    mdlThreshold: 0.03,
    pruneThreshold: undefined,
    maxMacroUnits: undefined,
    exportMaxOrders: 4,
    exportMaxMacroUnits: 5000,
    exportMinNgramCount: 3,
    exportFull: false
  });

  const managed = modelPaths({
    modelsDir: config.paths.modelsDir,
    engine: 'vsavm',
    datasetId,
    modelId
  });

  const modelPath = managed.modelPath;
  const metaPath = managed.metaPath;
  const trainPath = dataset.trainText;

  let needsTraining = args.force;
  try {
    await access(modelPath);
    console.log(`  Found existing VSAVM model: ${modelId}`);
  } catch {
    needsTraining = true;
  }

  if (needsTraining) {
    console.log(`  Training VSAVM model: ${modelId}`);
    const { createMacroUnitModel } = await import(join(ROOT, 'src/training/index.mjs'));

    const model = createMacroUnitModel({
      minFrequency: 5,
      minLength: 2,
      maxLength: 16,
      contextWindow: 16,
      mdlThreshold: 0.03
    });

    const sequences = [];
    const rl = createInterface({
      input: createReadStream(trainPath),
      crlfDelay: Infinity
    });

    let count = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (count >= args.records) break;
      sequences.push(Array.from(Buffer.from(line, 'utf8')));
      count++;
      if (count % 1000 === 0) console.log(`    Loaded ${count} sequences...`);
    }

    console.log(`  Training on ${sequences.length} sequences...`);
    const trainStart = performance.now();
    await model.train(sequences);
    const durationMs = performance.now() - trainStart;

    const modelState = model.export({ compact: true, maxOrders: 4, maxMacroUnits: 5000 });
    await mkdir(dirname(modelPath), { recursive: true });
    await writeFile(modelPath, JSON.stringify(modelState), 'utf8');

    const stats = model.getStats();
    const modelSizeBytes = Buffer.byteLength(JSON.stringify(modelState));
    await writeFile(
      metaPath,
      JSON.stringify({
        engine: 'vsavm',
        datasetId,
        modelId,
        trainedAt: new Date().toISOString(),
        durationMs,
        training: { minFrequency: 5, minLength: 2, maxLength: 16, contextWindow: 16, mdlThreshold: 0.03 },
        export: { compact: true, maxOrders: 4, maxMacroUnits: 5000 },
        stats,
        artifacts: { modelPath, metaPath, modelSizeBytes }
      }, null, 2),
      'utf8'
    );
    await writeLatestModelPointer({ modelsDir: config.paths.modelsDir, engine: 'vsavm', datasetId, modelId });

    console.log(`  Trained: ${stats.macroUnitCount} macro-units`);

    return {
      datasetId,
      modelId,
      model,
      stats,
      modelSizeKB: modelSizeBytes / 1024,
      params: estimateVSAVMParams(stats)
    };
  }

  const { createMacroUnitModel } = await import(join(ROOT, 'src/training/index.mjs'));
  const model = createMacroUnitModel();
  const modelState = JSON.parse(await readFile(modelPath, 'utf8'));
  model.import(modelState);

  const stats = model.getStats();
  console.log(`  Loaded: ${stats.macroUnitCount} macro-units`);

  return {
    datasetId,
    modelId,
    model,
    stats,
    modelSizeKB: Buffer.byteLength(JSON.stringify(modelState)) / 1024,
    params: estimateVSAVMParams(stats)
  };
}

function estimateVSAVMParams(stats) {
  // Estimate "equivalent parameters":
  // - Each n-gram context: ~4 bytes for key + counts
  // - Each macro-unit: ~20 bytes
  // This is very rough - VSAVM is fundamentally different from neural models
  return stats.ngramContexts * 8 + stats.macroUnitCount * 40;
}

async function loadTinyStoriesBaselines() {
  const baselines = {};
  
  for (const model of TINYSTORIES_MODELS) {
    const modelDir = join(MODELS_DIR, model.name);
    
    try {
      await access(join(modelDir, 'config.json'));
      console.log(`  ${model.name}: Available`);
      
      // Get perplexity from cached results if available
      const baselinesPath = join(CACHE_DIR, 'tinystories_baselines.json');
      try {
        const baselineData = JSON.parse(await readFile(baselinesPath, 'utf8'));
        if (baselineData.models && baselineData.models[model.name]) {
          baselines[model.name] = {
            ...model,
            available: true,
            perplexity: baselineData.models[model.name].perplexity
          };
          continue;
        }
      } catch {}
      
      baselines[model.name] = { ...model, available: true, perplexity: null };
    } catch {
      console.log(`  ${model.name}: Not downloaded (run setup-tinystories-baselines.mjs)`);
      baselines[model.name] = { ...model, available: false };
    }
  }
  
  return baselines;
}

async function generateComparisonSamples(vsavmData, tinystoriesData) {
  const samples = [];
  
  for (const testCase of TEST_PROMPTS) {
    const sample = {
      prompt: testCase.prompt,
      category: testCase.category,
      generations: {}
    };
    
    // Generate with VSAVM
    console.log(`  "${testCase.prompt.slice(0, 20)}..."`);
    
    try {
      const promptBytes = Array.from(Buffer.from(testCase.prompt, 'utf8'));
      const result = await vsavmData.model.generate(promptBytes, {
        maxTokens: 60,
        temperature: 0.8,
        topK: 40,
        repetitionPenalty: 1.3
      });
      
      sample.generations['VSAVM'] = {
        text: Buffer.from(result.tokens).toString('utf8'),
        generatedLength: result.generatedLength,
        macroUnits: result.macroUnits.length,
        compressionRatio: result.compressionRatio
      };
    } catch (err) {
      sample.generations['VSAVM'] = { error: err.message };
    }
    
    // Generate with TinyStories models
    for (const [name, data] of Object.entries(tinystoriesData)) {
      if (!data.available) {
        sample.generations[name] = { error: 'Not available' };
        continue;
      }
      
      try {
        const result = await generateWithTinyStories(name, testCase.prompt, 60);
        sample.generations[name] = {
          text: result.text,
          generatedLength: result.text.length - testCase.prompt.length
        };
      } catch (err) {
        sample.generations[name] = { error: err.message };
      }
    }
    
    samples.push(sample);
  }
  
  return samples;
}

async function generateWithTinyStories(modelName, prompt, maxLength) {
  const modelDir = join(MODELS_DIR, modelName);
  
  const pythonScript = `
import sys
import json
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_path = "${modelDir}"
prompt = """${prompt.replace(/"/g, '\\"')}"""

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(model_path)

inputs = tokenizer(prompt, return_tensors="pt")

with torch.no_grad():
    outputs = model.generate(
        inputs.input_ids,
        max_length=${maxLength},
        do_sample=True,
        temperature=0.8,
        top_k=40,
        pad_token_id=tokenizer.eos_token_id
    )

generated = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(json.dumps({"text": generated}))
`;
  
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-c', pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);
    
    proc.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error('Failed to parse output'));
        }
      } else {
        reject(new Error(stderr || 'Process failed'));
      }
    });
    
    proc.on('error', reject);
  });
}

function calculateComparison(results) {
  const comparison = {
    vsavm: {
      params: results.vsavm.params,
      modelSizeKB: results.vsavm.modelSizeKB,
      macroUnits: results.vsavm.stats.macroUnitCount,
      avgCompressionRatio: 0
    },
    models: {},
    rankings: {}
  };
  
  // Calculate VSAVM average compression
  let totalCompression = 0;
  let compressionCount = 0;
  for (const sample of results.samples) {
    const vsavmGen = sample.generations['VSAVM'];
    if (vsavmGen && vsavmGen.compressionRatio) {
      totalCompression += vsavmGen.compressionRatio;
      compressionCount++;
    }
  }
  comparison.vsavm.avgCompressionRatio = compressionCount > 0 
    ? totalCompression / compressionCount : 0;
  
  // Add TinyStories model info
  for (const [name, data] of Object.entries(results.tinystories)) {
    comparison.models[name] = {
      params: data.params,
      available: data.available,
      perplexity: data.perplexity
    };
  }
  
  // Calculate where VSAVM fits in the parameter count
  const allParams = [
    { name: 'VSAVM', params: results.vsavm.params },
    ...TINYSTORIES_MODELS.map(m => ({ name: m.name, params: m.params }))
  ].sort((a, b) => a.params - b.params);
  
  comparison.rankings.byParams = allParams;
  
  return comparison;
}

async function generateHtmlReport(results) {
  const outPaths = await createTimestampedResultPaths({
    outDir: join(EVAL_DIR, 'results'),
    tag: 'comprehensive_results'
  });
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VSAVM vs TinyStories Comparison Report</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --good: #3fb950;
      --bad: #f85149;
      --warn: #d29922;
      --purple: #a371f7;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container { max-width: 1400px; margin: 0 auto; }
    
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, var(--accent), var(--purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .subtitle { color: var(--text-muted); margin-bottom: 2rem; font-size: 1.1rem; }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
    }
    
    .card h2 {
      font-size: 0.9rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    
    .metric {
      font-size: 2rem;
      font-weight: bold;
      color: var(--accent);
    }
    
    .metric.good { color: var(--good); }
    .metric.warn { color: var(--warn); }
    .metric.bad { color: var(--bad); }
    
    .label { color: var(--text-muted); font-size: 0.85rem; }
    
    .section { margin-bottom: 3rem; }
    .section h2 { 
      font-size: 1.5rem; 
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    
    th { 
      color: var(--text-muted); 
      font-weight: 500;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    
    .model-name { color: var(--accent); font-weight: 600; }
    .vsavm-row { background: rgba(88, 166, 255, 0.1); }
    
    .sample-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .sample-prompt {
      color: var(--accent);
      font-weight: 600;
      margin-bottom: 1rem;
      font-size: 1.1rem;
    }
    
    .generation {
      margin-bottom: 1rem;
      padding: 1rem;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
    }
    
    .generation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    
    .generation-model {
      font-weight: 600;
      color: var(--purple);
    }
    
    .generation-text {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.9rem;
      word-break: break-word;
      white-space: pre-wrap;
    }
    
    .highlight { 
      background: rgba(163, 113, 247, 0.2); 
      padding: 0 2px;
      border-radius: 2px;
    }
    
    .stats-inline {
      display: flex;
      gap: 1rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    
    .chart-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .bar-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .bar-label {
      width: 120px;
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    
    .bar-container {
      flex: 1;
      height: 24px;
      background: rgba(255,255,255,0.05);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .bar {
      height: 100%;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
    }
    
    .bar.vsavm { background: linear-gradient(90deg, var(--accent), var(--purple)); }
    .bar.ts { background: var(--good); }
    
    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
      text-align: center;
    }
    
    .tag {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .tag.vsavm { background: rgba(88, 166, 255, 0.2); color: var(--accent); }
    .tag.neural { background: rgba(63, 185, 80, 0.2); color: var(--good); }
  </style>
</head>
<body>
  <div class="container">
    <h1>VSAVM vs TinyStories</h1>
    <p class="subtitle">Comprehensive comparison of VSAVM architecture against neural language models at different scales</p>
    
    <div class="grid">
      <div class="card">
        <h2>VSAVM Parameters</h2>
        <div class="metric">${formatNumber(results.vsavm.params)}</div>
        <div class="label">Estimated equivalent params</div>
      </div>
      
      <div class="card">
        <h2>VSAVM Model Size</h2>
        <div class="metric good">${results.vsavm.modelSizeKB.toFixed(0)} KB</div>
        <div class="label">Compact format</div>
      </div>
      
      <div class="card">
        <h2>Macro-Units</h2>
        <div class="metric">${results.vsavm.stats.macroUnitCount.toLocaleString()}</div>
        <div class="label">MDL-discovered phrases</div>
      </div>
      
      <div class="card">
        <h2>N-gram Contexts</h2>
        <div class="metric">${results.vsavm.stats.ngramContexts.toLocaleString()}</div>
        <div class="label">Kneser-Ney smoothed</div>
      </div>
      
      <div class="card">
        <h2>Compression</h2>
        <div class="metric good">${(results.comparison.vsavm.avgCompressionRatio * 100).toFixed(1)}%</div>
        <div class="label">Average compression ratio</div>
      </div>
      
      <div class="card">
        <h2>Models Compared</h2>
        <div class="metric">${Object.keys(results.tinystories).length + 1}</div>
        <div class="label">VSAVM + TinyStories variants</div>
      </div>
    </div>
    
    <div class="section">
      <h2>Model Comparison by Parameter Count</h2>
      <div class="chart-container">
        <div class="bar-chart">
          ${results.comparison.rankings.byParams.map(m => {
            const maxParams = Math.max(...results.comparison.rankings.byParams.map(x => x.params));
            const width = Math.max(5, (m.params / maxParams) * 100);
            const isVSAVM = m.name === 'VSAVM';
            return `
          <div class="bar-row">
            <div class="bar-label">${m.name}</div>
            <div class="bar-container">
              <div class="bar ${isVSAVM ? 'vsavm' : 'ts'}" style="width: ${width}%">
                ${formatNumber(m.params)}
              </div>
            </div>
          </div>`;
          }).join('')}
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>Model Details</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Type</th>
              <th>Parameters</th>
              <th>Status</th>
              <th>Perplexity</th>
            </tr>
          </thead>
          <tbody>
            <tr class="vsavm-row">
              <td class="model-name">VSAVM</td>
              <td><span class="tag vsavm">Symbolic+Statistical</span></td>
              <td>${formatNumber(results.vsavm.params)}</td>
              <td>✓ Trained</td>
              <td>—</td>
            </tr>
            ${Object.entries(results.tinystories).map(([name, data]) => `
            <tr>
              <td class="model-name">${name}</td>
              <td><span class="tag neural">Transformer</span></td>
              <td>${formatNumber(data.params)}</td>
              <td>${data.available ? '✓ Available' : '✗ Not downloaded'}</td>
              <td>${data.perplexity ? data.perplexity.toFixed(2) : '—'}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="section">
      <h2>Generation Samples</h2>
      ${results.samples.map(sample => `
      <div class="sample-card">
        <div class="sample-prompt">"${sample.prompt}"</div>
        ${Object.entries(sample.generations).map(([model, gen]) => `
        <div class="generation">
          <div class="generation-header">
            <span class="generation-model">${model}</span>
            ${gen.compressionRatio ? `
            <span class="stats-inline">
              <span>Compression: ${(gen.compressionRatio * 100).toFixed(1)}%</span>
              <span>Macro-units: ${gen.macroUnits}</span>
            </span>
            ` : ''}
          </div>
          <div class="generation-text">${gen.error ? `<em style="color: var(--bad)">${gen.error}</em>` : 
            escapeHtml(gen.text || '').replace(sample.prompt, `<span class="highlight">${sample.prompt}</span>`)}</div>
        </div>
        `).join('')}
      </div>
      `).join('')}
    </div>
    
    <div class="section">
      <h2>Key Insights</h2>
      <div class="card">
        <ul style="list-style: none; padding: 0;">
          <li style="margin-bottom: 1rem;">
            <strong style="color: var(--accent)">Architecture Difference:</strong>
            VSAVM uses symbolic macro-units with n-gram prediction, while TinyStories uses neural transformers.
          </li>
          <li style="margin-bottom: 1rem;">
            <strong style="color: var(--accent)">Compression Advantage:</strong>
            VSAVM provides ${(results.comparison.vsavm.avgCompressionRatio * 100).toFixed(1)}% compression via MDL-discovered macro-units - a capability neural models lack.
          </li>
          <li style="margin-bottom: 1rem;">
            <strong style="color: var(--accent)">Parameter Efficiency:</strong>
            VSAVM's ~${formatNumber(results.vsavm.params)} "parameters" are fundamentally different from neural weights - they represent discrete n-gram counts and macro-unit patterns.
          </li>
          <li style="margin-bottom: 1rem;">
            <strong style="color: var(--accent)">Coherence Gap:</strong>
            Neural models achieve coherence through attention mechanisms that capture long-range dependencies. VSAVM's local context window limits this capability.
          </li>
          <li>
            <strong style="color: var(--accent)">Future Direction:</strong>
            VM State Conditioning and Claims Validation (now implemented) will improve VSAVM's factual consistency - a unique advantage over neural models.
          </li>
        </ul>
      </div>
    </div>
    
    <footer>
      <p>Generated: ${results.timestamp}</p>
      <p>VSAVM Training Pipeline per DS001, DS005, DS011</p>
    </footer>
  </div>
</body>
</html>`;
  
  await writeFile(outPaths.jsonPath, JSON.stringify(results, null, 2), 'utf8');
  await writeFile(outPaths.htmlPath, html, 'utf8');
  await writeLatestResultPointer({
    outDir: join(EVAL_DIR, 'results'),
    id: outPaths.id,
    tag: 'comprehensive_results',
    jsonPath: outPaths.jsonPath,
    htmlPath: outPaths.htmlPath
  });
  return outPaths.htmlPath;
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toString();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printSummary(results) {
  console.log('\n--- SUMMARY ---');
  console.log(`\nVSAVM:`);
  console.log(`  Parameters: ~${formatNumber(results.vsavm.params)}`);
  console.log(`  Model size: ${results.vsavm.modelSizeKB.toFixed(0)} KB`);
  console.log(`  Macro-units: ${results.vsavm.stats.macroUnitCount}`);
  console.log(`  Compression: ${(results.comparison.vsavm.avgCompressionRatio * 100).toFixed(1)}%`);
  
  console.log(`\nTinyStories baselines:`);
  for (const [name, data] of Object.entries(results.tinystories)) {
    const status = data.available ? '✓' : '✗';
    const ppl = data.perplexity ? `ppl=${data.perplexity.toFixed(2)}` : '';
    console.log(`  ${status} ${name}: ${formatNumber(data.params)} params ${ppl}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
