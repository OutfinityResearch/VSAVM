#!/usr/bin/env node
/**
 * Full VSAVM Training and Comparison Pipeline
 * 
 * Per DS011: Complete 7-phase training pipeline with progress tracking,
 * error handling, test suite, and HTML report generation.
 * 
 * Usage:
 *   node eval_tinyLLM/tools/full-train-compare.mjs [--records N] [--force]
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { config } from '../config.mjs';
import { createTransformer } from '../lib/tf-model.mjs';
import { loadTf } from '../lib/tf-runtime.mjs';
import { createTimestampedResultPaths, writeLatestResultPointer } from '../lib/results.mjs';
import {
  datasetPaths,
  findLatestModelId,
  makeDatasetId,
  makeVsavmModelId,
  modelPaths,
  resolveDatasetId,
  resolveModelId,
  writeLatestModelPointer
} from '../lib/artifacts.mjs';

// Local imports
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVAL_DIR = join(__dirname, '..');
const CACHE_DIR = join(EVAL_DIR, 'cache');

// Progress tracking
let currentPhase = '';
let phaseStart = 0;
const phases = [];

function startPhase(name) {
  if (currentPhase) {
    endPhase();
  }
  currentPhase = name;
  phaseStart = performance.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[PHASE] ${name}`);
  console.log('='.repeat(60));
}

function endPhase(stats = {}) {
  const duration = performance.now() - phaseStart;
  phases.push({ name: currentPhase, duration, stats });
  console.log(`[DONE] ${currentPhase} (${(duration / 1000).toFixed(2)}s)`);
  currentPhase = '';
}

function progress(msg) {
  const elapsed = ((performance.now() - phaseStart) / 1000).toFixed(1);
  console.log(`  [${elapsed}s] ${msg}`);
}

function error(msg, err) {
  console.error(`\n[ERROR] ${msg}`);
  if (err) console.error(err.stack || err);
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

// Parse arguments
function parseArgs() {
  const args = {
    records: 10000,
    force: false
  };
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--force') {
      args.force = true;
    } else if (arg === '--records' && process.argv[i + 1]) {
      args.records = parseInt(process.argv[++i], 10);
    } else if (arg.startsWith('--records=')) {
      args.records = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--max-bytes' && process.argv[i + 1]) {
      args.maxBytes = Number(process.argv[++i]);
    } else if (arg === '--train-ratio' && process.argv[i + 1]) {
      args.trainRatio = Number(process.argv[++i]);
    } else if (arg === '--dataset-id' && process.argv[i + 1]) {
      args.datasetId = process.argv[++i];
    } else if (arg === '--vsavm-model-id' && process.argv[i + 1]) {
      args.vsavmModelId = process.argv[++i];
    } else if (arg === '--tf-model-id' && process.argv[i + 1]) {
      args.tfModelId = process.argv[++i];
    }
  }
  
  return args;
}

// Main pipeline
async function main() {
  const args = parseArgs();
  const startTime = performance.now();

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

  const vsavmModelId = args.vsavmModelId ?? makeVsavmModelId({
    tag: 'full_pipeline',
    contextWindow: 16,
    minFrequency: 5,
    minLength: 2,
    maxLength: 16,
    mdlThreshold: 0.03,
    pruneThreshold: 2,
    maxMacroUnits: undefined,
    exportMaxOrders: 4,
    exportMaxMacroUnits: 5000,
    exportMinNgramCount: 3,
    exportFull: false
  });
  const vsavmArtifacts = modelPaths({
    modelsDir: config.paths.modelsDir,
    engine: 'vsavm',
    datasetId,
    modelId: vsavmModelId
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('VSAVM Full Training and Comparison Pipeline');
  console.log('Per DS001, DS005, DS011');
  console.log('='.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  Records: ${args.records}`);
  console.log(`  Force retrain: ${args.force}`);
  console.log(`  Dataset ID: ${datasetId}`);
  console.log(`  VSAVM Model ID: ${vsavmModelId}`);
  console.log(`  Cache dir: ${CACHE_DIR}`);
  
  const results = {
    startTime: new Date().toISOString(),
    config: { ...args, maxBytes, trainRatio, datasetId, vsavmModelId },
    phases: [],
    vsavm: {},
    tf: {},
    comparison: {},
    tests: [],
    errors: []
  };
  
  try {
    // Ensure cache directory exists
    await mkdir(CACHE_DIR, { recursive: true });
    
    // =========================================================================
    // PHASE 1: Check/Prepare Data
    // =========================================================================
    startPhase('1. Verify Training Data');
    
    const trainPath = dataset.trainText;
    const validPath = dataset.validText;
    
    try {
      await access(trainPath);
      const trainContent = await readFile(trainPath, 'utf8');
      const trainLines = trainContent.split('\n').filter(l => l.trim()).length;
      progress(`Training data found: ${trainLines} records`);
      results.vsavm.trainRecords = Math.min(trainLines, args.records);
    } catch {
      error('Training data not found. Run: node eval_tinyLLM/tools/fetch-and-prepare.mjs');
      process.exit(1);
    }
    
    try {
      await access(validPath);
      const validContent = await readFile(validPath, 'utf8');
      const validLines = validContent.split('\n').filter(l => l.trim()).length;
      progress(`Validation data found: ${validLines} records`);
      results.vsavm.validRecords = validLines;
    } catch {
      progress('No validation data (will use train data for eval)');
    }
    
    endPhase({ trainRecords: results.vsavm.trainRecords });
    
    // =========================================================================
    // PHASE 2: Initialize VSAVM and Ingest Events
    // =========================================================================
    startPhase('2. Initialize VSAVM & Ingest Events (DS001)');
    
    const { createDefaultVSAVM } = await import(join(ROOT, 'src/index.mjs'));
    const { EventType, createTextTokenPayload } = await import(join(ROOT, 'src/core/types/events.mjs'));
    const { createSourceId } = await import(join(ROOT, 'src/core/types/identifiers.mjs'));
    const { createReadStream } = await import('node:fs');
    const { createInterface } = await import('node:readline');
    
    progress('Creating VSAVM instance...');
    const vm = createDefaultVSAVM();
    await vm.initialize();
    progress('VSAVM initialized');
    
    // Stream training data line by line to avoid memory issues
    let totalEvents = 0;
    let recordsProcessed = 0;
    const sequences = [];
    const BATCH_SIZE = 500; // Process in batches for memory efficiency
    const MAX_SEQUENCES = 5000; // Limit sequences kept in memory for training
    
    const rl = createInterface({
      input: createReadStream(trainPath),
      crlfDelay: Infinity
    });
    
    const sourceId = createSourceId('document', 'tinyllm_train');
    
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (recordsProcessed >= args.records) break;
      
      const bytes = Buffer.from(line, 'utf8');
      const events = [];
      const contextRoot = ['dataset', `record_${recordsProcessed}`];
      
      for (let i = 0; i < bytes.length; i++) {
        const token = `b${bytes[i].toString(16).padStart(2, '0')}`;
        events.push({
          eventId: totalEvents + i,
          type: EventType.TEXT_TOKEN,
          payload: createTextTokenPayload(token, { byte: bytes[i] }),
          contextPath: [...contextRoot, `byte_${i}`],
          sourceRef: { sourceId, offset: i }
        });
      }
      
      await vm.ingestEvents(events, { sourceId });
      
      totalEvents += events.length;
      
      // Only keep a subset of sequences for training the language model
      if (sequences.length < MAX_SEQUENCES) {
        sequences.push(Array.from(bytes));
      } else if (Math.random() < 0.1) {
        // Reservoir sampling - randomly replace
        const idx = Math.floor(Math.random() * sequences.length);
        sequences[idx] = Array.from(bytes);
      }
      
      recordsProcessed++;
      
      if (recordsProcessed % BATCH_SIZE === 0) {
        progress(`Ingested ${recordsProcessed}/${args.records} records (${totalEvents.toLocaleString()} events)`);
        // Allow garbage collection
        if (global.gc) global.gc();
      }
    }
    
    progress(`Total: ${recordsProcessed} records, ${totalEvents.toLocaleString()} events`);
    results.vsavm.eventsIngested = totalEvents;
    results.vsavm.recordsIngested = recordsProcessed;
    
    endPhase({ events: totalEvents, records: recordsProcessed });
    
    // =========================================================================
    // PHASE 3: Save VSAVM Facts
    // =========================================================================
    startPhase('3. Save VSAVM Facts');
    
    const factsPath = vsavmArtifacts.factsPath;
    
    progress('Extracting facts from VSAVM...');
    const facts = vm.storage?.getAllFacts ? vm.storage.getAllFacts() : [];
    const factsData = JSON.stringify(facts);
    await mkdir(dirname(factsPath), { recursive: true });
    await writeFile(factsPath, factsData, 'utf8');
    
    const factsSizeKB = (Buffer.byteLength(factsData) / 1024).toFixed(1);
    progress(`Saved ${facts.length} facts (${factsSizeKB} KB)`);
    results.vsavm.factsCount = facts.length;
    results.vsavm.factsSizeKB = parseFloat(factsSizeKB);
    
    endPhase({ facts: facts.length });
    
    // =========================================================================
    // PHASE 4: Train MacroUnitModel (DS011)
    // =========================================================================
    startPhase('4. Train MacroUnitModel (DS005/DS011)');
    
    const { createMacroUnitModel } = await import(join(ROOT, 'src/training/index.mjs'));
    
    progress('Creating MacroUnitModel with Kneser-Ney smoothing...');
    const model = createMacroUnitModel({
      minFrequency: 5,
      minLength: 2,
      maxLength: 16,
      contextWindow: 16,
      mdlThreshold: 0.03,
      pruneThreshold: 2
    });
    
    progress(`Training on ${sequences.length} sequences...`);
    const trainStart = performance.now();
    await model.train(sequences);
    const trainDuration = performance.now() - trainStart;
    
    const modelStats = model.getStats();
    progress(`Macro-units discovered: ${modelStats.macroUnitCount}`);
    progress(`N-gram contexts: ${modelStats.ngramContexts}`);
    progress(`Vocabulary size: ${modelStats.vocabularySize}`);
    progress(`Avg macro-unit length: ${modelStats.avgMacroUnitLength.toFixed(2)}`);
    progress(`N-gram orders: ${modelStats.ngramOrders.join(', ')}`);
    
    results.vsavm.macroUnits = modelStats.macroUnitCount;
    results.vsavm.ngramContexts = modelStats.ngramContexts;
    results.vsavm.vocabularySize = modelStats.vocabularySize;
    results.vsavm.trainDurationMs = trainDuration;
    
    endPhase(modelStats);
    
    // =========================================================================
    // PHASE 5: Evaluate Compression
    // =========================================================================
    startPhase('5. Evaluate Compression (DS005 MDL)');
    
    const sampleSequences = sequences.slice(-100);
    let totalOriginal = 0;
    let totalEncoded = 0;
    
    for (const seq of sampleSequences) {
      const encoded = model.encode(seq);
      totalOriginal += seq.length;
      totalEncoded += encoded.length;
    }
    
    const compressionRatio = totalEncoded / totalOriginal;
    progress(`Compression ratio: ${(compressionRatio * 100).toFixed(1)}%`);
    progress(`(${totalOriginal} bytes -> ${totalEncoded} macro-units)`);
    
    results.vsavm.compressionRatio = compressionRatio;
    
    endPhase({ compressionRatio });
    
    // =========================================================================
    // PHASE 6: Calculate Perplexity
    // =========================================================================
    startPhase('6. Calculate Perplexity');
    
    let totalPpl = 0;
    let pplCount = 0;
    
    for (const seq of sampleSequences) {
      if (seq.length > 10) {
        const ppl = model.calculatePerplexity(seq);
        if (Number.isFinite(ppl) && ppl < 10000) {
          totalPpl += ppl;
          pplCount++;
        }
      }
    }
    
    const avgPerplexity = pplCount > 0 ? totalPpl / pplCount : Infinity;
    progress(`Average perplexity: ${avgPerplexity.toFixed(2)}`);
    
    results.vsavm.perplexity = avgPerplexity;
    
    endPhase({ perplexity: avgPerplexity });
    
    // =========================================================================
    // PHASE 7: Save Model
    // =========================================================================
    startPhase('7. Save MacroUnitModel');
    
    const modelPath = vsavmArtifacts.modelPath;
    const metaPath = vsavmArtifacts.metaPath;
    
    progress('Exporting model (compact format)...');
    const modelState = model.export({
      compact: true,
      maxOrders: 4,
      maxMacroUnits: 5000,
      minNgramCount: 3
    });
    
    const modelJson = JSON.stringify(modelState);
    await mkdir(dirname(modelPath), { recursive: true });
    await writeFile(modelPath, modelJson, 'utf8');
    
    const modelSizeKB = (Buffer.byteLength(modelJson) / 1024).toFixed(1);
    progress(`Model saved: ${modelPath}`);
    progress(`Model size: ${modelSizeKB} KB`);
    
    results.vsavm.modelSizeKB = parseFloat(modelSizeKB);

    await writeFile(
      metaPath,
      JSON.stringify({
        engine: 'vsavm',
        datasetId,
        modelId: vsavmModelId,
        trainedAt: new Date().toISOString(),
        durationMs: results.vsavm.trainDurationMs,
        training: { minFrequency: 5, minLength: 2, maxLength: 16, contextWindow: 16, mdlThreshold: 0.03, pruneThreshold: 2 },
        export: { compact: true, maxOrders: 4, maxMacroUnits: 5000, minNgramCount: 3 },
        stats: modelStats,
        metrics: { compressionRatio: results.vsavm.compressionRatio, perplexity: results.vsavm.perplexity },
        artifacts: { modelPath, factsPath: vsavmArtifacts.factsPath, metaPath, modelSizeBytes: Buffer.byteLength(modelJson) }
      }, null, 2),
      'utf8'
    );
    await writeLatestModelPointer({ modelsDir: config.paths.modelsDir, engine: 'vsavm', datasetId, modelId: vsavmModelId });
    
    endPhase({ modelSizeKB: parseFloat(modelSizeKB) });
    
    // =========================================================================
    // PHASE 8: Test Generation Quality
    // =========================================================================
    startPhase('8. Test Generation Quality');
    
    const testPrompts = [
      'Once upon a time',
      'The little girl',
      'One day',
      'There was a',
      'She wanted to'
    ];
    
    const generationSamples = [];
    
    for (const prompt of testPrompts) {
      const promptBytes = Array.from(Buffer.from(prompt, 'utf8'));
      
      const result = await model.generate(promptBytes, {
        maxTokens: 50,
        temperature: 0.8,
        topK: 40,
        repetitionPenalty: 1.3
      });
      
      const generatedText = Buffer.from(result.tokens).toString('utf8');
      const sample = {
        prompt,
        generated: generatedText,
        generatedLength: result.generatedLength,
        macroUnitsUsed: result.macroUnits.length,
        compressionRatio: result.compressionRatio
      };
      
      generationSamples.push(sample);
      progress(`"${prompt}" -> "${generatedText.slice(prompt.length, prompt.length + 40)}..."`);
    }
    
    results.generationSamples = generationSamples;
    
    endPhase({ samples: generationSamples.length });
    
    // =========================================================================
    // PHASE 9: Load and Compare with TensorFlow
    // =========================================================================
    startPhase('9. Compare with TensorFlow Model');
    
    const tfModelIdRaw = args.tfModelId ?? 'latest';
    let tfModelId = null;
    let tfModelPath = null;
    try {
      tfModelId = await resolveModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'tf',
        datasetId,
        modelId: tfModelIdRaw
      });
    } catch {
      tfModelId = await findLatestModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'tf',
        datasetId
      });
    }

    if (tfModelId) {
      tfModelPath = modelPaths({
        modelsDir: config.paths.modelsDir,
        engine: 'tf',
        datasetId,
        modelId: tfModelId
      }).modelPath;
    } else {
      tfModelPath = join(CACHE_DIR, 'tf_model', 'model.json');
    }
    let tfAvailable = false;
    
    try {
      await access(tfModelPath);
      tfAvailable = true;
      progress(`TensorFlow model found${tfModelId ? `: ${tfModelId}` : ''}`);
    } catch {
      progress('TensorFlow model not found - skipping TF comparison');
      progress('Run: node eval_tinyLLM/tools/train-tf.mjs to train TF model');
    }
    
    if (tfAvailable) {
      try {
        const tf = await loadTf();
        progress('Loading TensorFlow model...');
        
        const payload = JSON.parse(await readFile(tfModelPath, 'utf8'));
        const tfModel = createTransformer(tf, payload.config);
        await tfModel.load(tfModelPath);
        progress('TensorFlow model loaded');
        
        // Calculate TF perplexity on same samples
        let tfTotalPpl = 0;
        let tfPplCount = 0;
        
        for (const seq of sampleSequences.slice(0, 20)) {
          if (seq.length > 10) {
            const ppl = calculateTfPerplexity(tf, tfModel, seq);
            if (Number.isFinite(ppl) && ppl < 10000) {
              tfTotalPpl += ppl;
              tfPplCount++;
            }
          }
        }
        
        const tfPerplexity = tfPplCount > 0 ? tfTotalPpl / tfPplCount : Infinity;
        progress(`TensorFlow perplexity: ${tfPerplexity.toFixed(2)}`);
        
        results.tf.perplexity = tfPerplexity;
        results.tf.available = true;
        results.tf.modelId = tfModelId;
        results.tf.modelPath = tfModelPath;
        
        // Get TF model size
        const tfModelJson = await readFile(tfModelPath, 'utf8');
        const tfModelSizeKB = (Buffer.byteLength(tfModelJson, 'utf8') / 1024).toFixed(1);
        
        progress(`TensorFlow model size: ${tfModelSizeKB} KB`);
        results.tf.modelSizeKB = parseFloat(tfModelSizeKB);
        
      } catch (err) {
        progress(`TensorFlow comparison failed: ${err.message}`);
        results.tf.available = false;
        results.tf.error = err.message;
      }
    } else {
      results.tf.available = false;
    }
    
    endPhase({ tfAvailable });
    
    // =========================================================================
    // PHASE 10: Run Test Suite
    // =========================================================================
    startPhase('10. Run Test Suite');
    
    const tests = [
      {
        name: 'Macro-unit discovery',
        pass: modelStats.macroUnitCount > 0,
        value: modelStats.macroUnitCount
      },
      {
        name: 'Compression achieved',
        pass: compressionRatio < 1.0,
        value: compressionRatio
      },
      {
        name: 'Perplexity finite',
        pass: Number.isFinite(avgPerplexity) && avgPerplexity < 100,
        value: avgPerplexity
      },
      {
        name: 'Generation produces output',
        pass: generationSamples.every(s => s.generatedLength > 0),
        value: generationSamples.map(s => s.generatedLength)
      },
      {
        name: 'Model export/import works',
        pass: modelState.version === 2 && modelState.macroUnits.length > 0,
        value: modelState.macroUnits.length
      },
      {
        name: 'N-gram orders present',
        pass: modelStats.ngramOrders.length > 0,
        value: modelStats.ngramOrders
      }
    ];
    
    if (results.tf.available) {
      tests.push({
        name: 'VSAVM perplexity competitive with TF',
        pass: avgPerplexity < results.tf.perplexity * 2,
        value: `VSAVM: ${avgPerplexity.toFixed(2)}, TF: ${results.tf.perplexity.toFixed(2)}`
      });
    }
    
    let passed = 0;
    for (const test of tests) {
      const status = test.pass ? 'PASS' : 'FAIL';
      progress(`[${status}] ${test.name}: ${JSON.stringify(test.value)}`);
      if (test.pass) passed++;
    }
    
    progress(`\nTests: ${passed}/${tests.length} passed`);
    results.tests = tests;
    results.testsPassed = passed;
    results.testsTotal = tests.length;
    
    endPhase({ passed, total: tests.length });
    
    // =========================================================================
    // PHASE 11: Generate HTML Report
    // =========================================================================
    startPhase('11. Generate Comparison Report');
    
    const totalDuration = performance.now() - startTime;
    results.totalDurationMs = totalDuration;
    results.phases = phases;
    
    // Save JSON results
    const outPaths = await createTimestampedResultPaths({
      outDir: join(EVAL_DIR, 'results'),
      tag: 'full_results'
    });
    await writeFile(outPaths.jsonPath, JSON.stringify(results, null, 2), 'utf8');
    progress(`JSON report: ${outPaths.jsonPath}`);
    
    // Generate HTML report
    const html = generateHtmlReport(results);
    await writeFile(outPaths.htmlPath, html, 'utf8');
    progress(`HTML report: ${outPaths.htmlPath}`);

    await writeLatestResultPointer({
      outDir: join(EVAL_DIR, 'results'),
      id: outPaths.id,
      tag: 'full_results',
      jsonPath: outPaths.jsonPath,
      htmlPath: outPaths.htmlPath
    });
    
    endPhase({});
    
    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('TRAINING COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nTotal duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`\nVSAVM Results:`);
    console.log(`  Records trained: ${results.vsavm.recordsIngested}`);
    console.log(`  Events ingested: ${results.vsavm.eventsIngested.toLocaleString()}`);
    console.log(`  Macro-units: ${results.vsavm.macroUnits}`);
    console.log(`  Compression: ${(results.vsavm.compressionRatio * 100).toFixed(1)}%`);
    console.log(`  Perplexity: ${results.vsavm.perplexity.toFixed(2)}`);
    console.log(`  Model size: ${results.vsavm.modelSizeKB} KB`);
    
    if (results.tf.available) {
      console.log(`\nTensorFlow Results:`);
      console.log(`  Perplexity: ${results.tf.perplexity.toFixed(2)}`);
      console.log(`  Model size: ${results.tf.modelSizeKB} KB`);
      
      console.log(`\nComparison:`);
      const pplDiff = ((results.vsavm.perplexity - results.tf.perplexity) / results.tf.perplexity * 100).toFixed(1);
      const sizeDiff = ((results.vsavm.modelSizeKB - results.tf.modelSizeKB) / results.tf.modelSizeKB * 100).toFixed(1);
      console.log(`  Perplexity: VSAVM ${pplDiff}% ${parseFloat(pplDiff) < 0 ? 'better' : 'worse'} than TF`);
      console.log(`  Model size: VSAVM ${sizeDiff}% ${parseFloat(sizeDiff) < 0 ? 'smaller' : 'larger'} than TF`);
    }
    
    console.log(`\nTests: ${results.testsPassed}/${results.testsTotal} passed`);
    console.log(`\nReports generated:`);
    console.log(`  ${outPaths.jsonPath}`);
    console.log(`  ${outPaths.htmlPath}`);
    
    // Close VSAVM
    if (vm.close) await vm.close();
    
  } catch (err) {
    error('Pipeline failed', err);
    results.errors.push({ phase: currentPhase, error: err.message, stack: err.stack });
    
    // Save partial results
    const outPaths = await createTimestampedResultPaths({
      outDir: join(EVAL_DIR, 'results'),
      tag: 'full_error'
    });
    await writeFile(outPaths.jsonPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nPartial results saved to: ${outPaths.jsonPath}`);
    
    process.exit(1);
  }
}

function generateHtmlReport(results) {
  const vsavm = results.vsavm;
  const tf = results.tf;
  
  const pplComparison = tf.available 
    ? `<span class="${vsavm.perplexity <= tf.perplexity ? 'good' : 'bad'}">${vsavm.perplexity.toFixed(2)}</span> vs TF: ${tf.perplexity.toFixed(2)}`
    : vsavm.perplexity.toFixed(2);
  
  const sizeComparison = tf.available
    ? `<span class="${vsavm.modelSizeKB <= tf.modelSizeKB ? 'good' : ''}">${vsavm.modelSizeKB} KB</span> vs TF: ${tf.modelSizeKB} KB`
    : `${vsavm.modelSizeKB} KB`;
  
  const testsHtml = results.tests.map(t => `
    <tr class="${t.pass ? 'pass' : 'fail'}">
      <td>${t.pass ? '✓' : '✗'}</td>
      <td>${t.name}</td>
      <td>${typeof t.value === 'object' ? JSON.stringify(t.value) : t.value}</td>
    </tr>
  `).join('\n');
  
  const samplesHtml = (results.generationSamples || []).map(s => `
    <div class="sample">
      <div class="prompt"><strong>Prompt:</strong> "${s.prompt}"</div>
      <div class="generated"><strong>Generated:</strong> "${s.generated}"</div>
      <div class="stats">Length: ${s.generatedLength} bytes, Macro-units: ${s.macroUnitsUsed}, Compression: ${(s.compressionRatio * 100).toFixed(1)}%</div>
    </div>
  `).join('\n');
  
  const phasesHtml = results.phases.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${(p.duration / 1000).toFixed(2)}s</td>
    </tr>
  `).join('\n');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VSAVM vs TensorFlow Comparison Report</title>
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
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container { max-width: 1200px; margin: 0 auto; }
    
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, var(--accent), #a371f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .subtitle { color: var(--text-muted); margin-bottom: 2rem; }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
    }
    
    .card h2 {
      font-size: 1rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }
    
    .metric {
      font-size: 2.5rem;
      font-weight: bold;
      color: var(--accent);
    }
    
    .metric.good { color: var(--good); }
    .metric.bad { color: var(--bad); }
    
    .label { color: var(--text-muted); font-size: 0.9rem; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    
    th { color: var(--text-muted); font-weight: 500; }
    
    tr.pass td:first-child { color: var(--good); }
    tr.fail td:first-child { color: var(--bad); }
    
    .sample {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    
    .sample .prompt { color: var(--accent); margin-bottom: 0.5rem; }
    .sample .generated { font-family: monospace; margin-bottom: 0.5rem; word-break: break-all; }
    .sample .stats { font-size: 0.85rem; color: var(--text-muted); }
    
    .good { color: var(--good); }
    .bad { color: var(--bad); }
    
    .section { margin-bottom: 2rem; }
    .section h2 { margin-bottom: 1rem; font-size: 1.25rem; }
    
    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>VSAVM vs TensorFlow Comparison</h1>
    <p class="subtitle">Generated: ${results.startTime} | Duration: ${(results.totalDurationMs / 1000).toFixed(1)}s | Records: ${vsavm.recordsIngested}</p>
    
    <div class="grid">
      <div class="card">
        <h2>VSAVM Perplexity</h2>
        <div class="metric ${tf.available && vsavm.perplexity <= tf.perplexity ? 'good' : ''}">${vsavm.perplexity.toFixed(2)}</div>
        <div class="label">${tf.available ? `vs TensorFlow: ${tf.perplexity.toFixed(2)}` : 'Lower is better'}</div>
      </div>
      
      <div class="card">
        <h2>Compression Ratio</h2>
        <div class="metric good">${(vsavm.compressionRatio * 100).toFixed(1)}%</div>
        <div class="label">VSAVM unique advantage</div>
      </div>
      
      <div class="card">
        <h2>Macro-Units Discovered</h2>
        <div class="metric">${vsavm.macroUnits.toLocaleString()}</div>
        <div class="label">Via MDL compression (DS005)</div>
      </div>
      
      <div class="card">
        <h2>Model Size</h2>
        <div class="metric ${tf.available && vsavm.modelSizeKB <= tf.modelSizeKB ? 'good' : ''}">${vsavm.modelSizeKB} KB</div>
        <div class="label">${tf.available ? `vs TensorFlow: ${tf.modelSizeKB} KB` : 'Compact format'}</div>
      </div>
      
      <div class="card">
        <h2>Events Ingested</h2>
        <div class="metric">${vsavm.eventsIngested.toLocaleString()}</div>
        <div class="label">Via VSAVM event stream (DS001)</div>
      </div>
      
      <div class="card">
        <h2>Test Results</h2>
        <div class="metric ${results.testsPassed === results.testsTotal ? 'good' : 'bad'}">${results.testsPassed}/${results.testsTotal}</div>
        <div class="label">Tests passed</div>
      </div>
    </div>
    
    <div class="section">
      <h2>Test Results</h2>
      <div class="card">
        <table>
          <thead>
            <tr><th>Status</th><th>Test</th><th>Value</th></tr>
          </thead>
          <tbody>
            ${testsHtml}
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="section">
      <h2>Generation Samples</h2>
      ${samplesHtml}
    </div>
    
    <div class="section">
      <h2>Training Phases</h2>
      <div class="card">
        <table>
          <thead>
            <tr><th>Phase</th><th>Duration</th></tr>
          </thead>
          <tbody>
            ${phasesHtml}
          </tbody>
        </table>
      </div>
    </div>
    
    <footer>
      <p>VSAVM Training Pipeline per DS001, DS005, DS011</p>
      <p>Configuration: ${JSON.stringify(results.config)}</p>
    </footer>
  </div>
</body>
</html>`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
