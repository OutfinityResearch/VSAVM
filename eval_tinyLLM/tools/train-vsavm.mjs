/**
 * VSAVM Training Pipeline
 * Per DS011: Full training including macro-unit discovery and model training
 * 
 * This script:
 * 1. Ingests events from dataset
 * 2. Mines byte patterns for macro-unit discovery (DS005 inner loop)
 * 3. Trains prediction model (DS011 outer loop)
 * 4. Saves facts, macro-units, and model
 */

import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.mjs';
import { createVSAVMInstance, ingestDataset, saveFacts } from '../lib/vsavm-driver.mjs';
import { appendLog } from '../lib/logging.mjs';
import { streamRecords, encodeBytes } from '../lib/dataset.mjs';
import {
  datasetPaths,
  makeDatasetId,
  makeVsavmModelId,
  modelPaths,
  resolveDatasetId,
  writeLatestModelPointer
} from '../lib/artifacts.mjs';
import { createMacroUnitModel } from '../../src/training/index.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) options.input = args[++i];
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--model-id' && args[i + 1]) options.modelId = args[++i];
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--max-records' && args[i + 1]) options.maxRecords = Number(args[++i]);
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--max-bytes-per-record' && args[i + 1]) options.maxBytesPerRecord = Number(args[++i]);
    else if (arg === '--facts-out' && args[i + 1]) options.factsOut = args[++i];
    else if (arg === '--model-out' && args[i + 1]) options.modelOut = args[++i];
    else if (arg === '--text-field' && args[i + 1]) options.textField = args[++i];
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
    else if (arg === '--skip-ingest') options.skipIngest = true;
    else if (arg === '--context-window' && args[i + 1]) options.contextWindow = Number(args[++i]);
    else if (arg === '--prune-threshold' && args[i + 1]) options.pruneThreshold = Number(args[++i]);
    else if (arg === '--min-frequency' && args[i + 1]) options.minFrequency = Number(args[++i]);
    else if (arg === '--min-length' && args[i + 1]) options.minLength = Number(args[++i]);
    else if (arg === '--max-length' && args[i + 1]) options.maxLength = Number(args[++i]);
    else if (arg === '--mdl-threshold' && args[i + 1]) options.mdlThreshold = Number(args[++i]);
    else if (arg === '--max-macro-units' && args[i + 1]) options.maxMacroUnits = Number(args[++i]);
    else if (arg === '--max-ngram-order' && args[i + 1]) options.maxNgramOrder = Number(args[++i]);
    else if (arg === '--max-subsequence-length' && args[i + 1]) options.maxSubsequenceLength = Number(args[++i]);
    else if (arg === '--max-subsequence-entries' && args[i + 1]) options.maxSubsequenceEntries = Number(args[++i]);
    else if (arg === '--subsequence-sample-rate' && args[i + 1]) options.subsequenceSampleRate = Number(args[++i]);
    else if (arg === '--subsequence-prune-threshold' && args[i + 1]) options.subsequencePruneThreshold = Number(args[++i]);
    else if (arg === '--subsequence-prune-interval' && args[i + 1]) options.subsequencePruneInterval = Number(args[++i]);
    else if (arg === '--export-max-orders' && args[i + 1]) options.exportMaxOrders = Number(args[++i]);
    else if (arg === '--export-max-macro-units' && args[i + 1]) options.exportMaxMacroUnits = Number(args[++i]);
    else if (arg === '--export-min-ngram-count' && args[i + 1]) options.exportMinNgramCount = Number(args[++i]);
    else if (arg === '--export-full') options.exportFull = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--checkpoint-every' && args[i + 1]) options.checkpointEvery = Number(args[++i]);
    else if (arg === '--checkpoint-path' && args[i + 1]) options.checkpointPath = args[++i];
    else if (arg === '--force') options.force = true;
  }

  return options;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function createSequenceStream(inputPath, options = {}) {
  const maxRecords = options.maxRecords ?? config.vsavm.maxRecords;
  const maxBytesPerRecord = options.maxBytesPerRecord ?? config.vsavm.maxBytesPerRecord;
  const logEvery = options.logEvery ?? 1000;
  const compressionSampleSize = options.compressionSampleSize ?? 100;
  const perplexitySampleSize = options.perplexitySampleSize ?? 100;
  const startRecord = options.startRecord ?? 0;
  const startBytes = options.startBytes ?? 0;

  const stats = {
    sequences: startRecord,
    totalBytes: startBytes,
    skipped: 0
  };

  const compressionSample = [];
  const perplexitySample = [];

  async function* generator() {
    let skipped = 0;
    const effectiveMaxRecords = Number.isFinite(maxRecords)
      ? maxRecords + startRecord
      : maxRecords;

    for await (const record of streamRecords(inputPath, {
      textField: options.textField ?? config.hf.textField,
      maxBytes: options.maxBytes ?? config.prep.maxBytes,
      maxRecords: effectiveMaxRecords
    })) {
      if (skipped < startRecord) {
        skipped += 1;
        continue;
      }
      const clipped = record.length > maxBytesPerRecord
        ? record.slice(0, maxBytesPerRecord)
        : record;

      const bytes = encodeBytes(clipped);
      if (bytes.length === 0) {
        stats.skipped++;
        continue;
      }

      stats.sequences++;
      stats.totalBytes += bytes.length;

      if (compressionSample.length < compressionSampleSize) {
        compressionSample.push(bytes);
      }

      perplexitySample.push(bytes);
      if (perplexitySample.length > perplexitySampleSize) {
        perplexitySample.shift();
      }

      if (stats.sequences % logEvery === 0) {
        const mem = process.memoryUsage();
        console.log(
          `Streamed ${stats.sequences} sequences (${formatBytes(stats.totalBytes)}) | ` +
          `heap ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`
        );
      }

      yield bytes;
    }
  }

  return {
    generator,
    stats,
    compressionSample,
    perplexitySample
  };
}

async function loadCheckpoint(checkpointPath) {
  const raw = await readFile(checkpointPath, 'utf8');
  const payload = JSON.parse(raw);
  return {
    ...payload,
    subsequenceCounts: new Map(payload.subsequenceCounts ?? [])
  };
}

async function saveCheckpoint(checkpointPath, payload) {
  const checkpoint = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  await mkdir(dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint));
}

async function main() {
  const args = parseArgs();
  const maxBytes = Number.isFinite(args.maxBytes) ? args.maxBytes : config.prep.maxBytes;
  const trainRatio = Number.isFinite(args.trainRatio) ? args.trainRatio : config.prep.trainRatio;

  const datasetIdRaw = args.datasetId ?? makeDatasetId({
    dataset: args.input ? undefined : config.hf.dataset,
    split: args.input ? undefined : config.hf.split,
    inputPath: args.input,
    maxBytes,
    trainRatio,
    textField: args.textField ?? config.hf.textField
  });
  const datasetId = datasetIdRaw === 'latest'
    ? await resolveDatasetId({ datasetsDir: config.paths.datasetsDir, datasetId: datasetIdRaw })
    : datasetIdRaw;
  const dataset = datasetPaths({ datasetsDir: config.paths.datasetsDir, datasetId });
  let inputPath = args.input ?? dataset.trainText;
  if (!args.input) {
    try {
      await access(inputPath);
    } catch {
      throw new Error(
        `Dataset not prepared: ${dataset.trainText}. ` +
        'Run: node eval_tinyLLM/tools/fetch-and-prepare.mjs'
      );
    }
  }

  const contextWindow = Number.isFinite(args.contextWindow) ? args.contextWindow : 8;
  const minFrequency = Number.isFinite(args.minFrequency) ? args.minFrequency : 10;
  const minLength = Number.isFinite(args.minLength) ? args.minLength : 2;
  const maxLength = Number.isFinite(args.maxLength) ? args.maxLength : 16;
  const mdlThreshold = Number.isFinite(args.mdlThreshold) ? args.mdlThreshold : 0.05;
  const pruneThreshold = Number.isFinite(args.pruneThreshold) ? args.pruneThreshold : undefined;
  const maxMacroUnits = Number.isFinite(args.maxMacroUnits) ? args.maxMacroUnits : undefined;
  const maxNgramOrder = Number.isFinite(args.maxNgramOrder) ? args.maxNgramOrder : undefined;
  const maxSubsequenceLength = Number.isFinite(args.maxSubsequenceLength) ? args.maxSubsequenceLength : undefined;
  const maxSubsequenceEntries = Number.isFinite(args.maxSubsequenceEntries) ? args.maxSubsequenceEntries : undefined;
  const subsequenceSampleRate = Number.isFinite(args.subsequenceSampleRate) ? args.subsequenceSampleRate : undefined;
  const subsequencePruneThreshold = Number.isFinite(args.subsequencePruneThreshold)
    ? args.subsequencePruneThreshold
    : undefined;
  const subsequencePruneInterval = Number.isFinite(args.subsequencePruneInterval)
    ? args.subsequencePruneInterval
    : undefined;

  const exportMaxOrders = Number.isFinite(args.exportMaxOrders) ? args.exportMaxOrders : 4;
  const exportMaxMacroUnits = Number.isFinite(args.exportMaxMacroUnits) ? args.exportMaxMacroUnits : 5000;
  const exportMinNgramCount = Number.isFinite(args.exportMinNgramCount) ? args.exportMinNgramCount : 3;
  const exportFull = args.exportFull ?? false;

  const defaultModelId = makeVsavmModelId({
    tag: args.tag,
    contextWindow,
    minFrequency,
    minLength,
    maxLength,
    mdlThreshold,
    pruneThreshold,
    maxMacroUnits,
    exportMaxOrders,
    exportMaxMacroUnits,
    exportMinNgramCount,
    exportFull
  });

  const modelId = args.modelId ?? defaultModelId;
  const managed = modelPaths({
    modelsDir: config.paths.modelsDir,
    engine: 'vsavm',
    datasetId,
    modelId
  });

  const factsOut = args.factsOut ?? managed.factsPath;
  const modelOut = args.modelOut ?? managed.modelPath;
  const metaOut = args.modelOut ? `${dirname(modelOut)}/meta.json` : managed.metaPath;

  // Check if already trained
  if (!args.force && !args.resume) {
    try {
      await access(modelOut);
      console.log(`VSAVM model already present: ${modelOut}`);
      await appendLog(
        config.paths.trainingLog,
        `VSAVM training skipped (model exists). datasetId=${datasetId}, modelId=${modelId}`
      );
      return;
    } catch {}
  }

  const startTime = performance.now();
  console.log('=== VSAVM Training Pipeline (DS011) ===');
  console.log(`Input: ${inputPath}`);

  let ingestStats = null;
  if (!args.skipIngest) {
    // Phase 1: Initialize VSAVM and ingest events
    console.log('\n[Phase 1] Ingesting events into VSAVM...');
    const vm = await createVSAVMInstance();

    ingestStats = await ingestDataset(vm, inputPath, {
      sourceId: 'tinyllm_train',
      textField: args.textField ?? config.hf.textField,
      maxRecords: Number.isFinite(args.maxRecords) ? args.maxRecords : config.vsavm.maxRecords,
      maxBytes,
      maxBytesPerRecord: Number.isFinite(args.maxBytesPerRecord)
        ? args.maxBytesPerRecord
        : config.vsavm.maxBytesPerRecord
    });
    console.log(`  Events ingested: ${ingestStats.events}`);
    console.log(`  Records processed: ${ingestStats.records}`);

    // Phase 2: Save facts (existing behavior)
    console.log('\n[Phase 2] Saving facts...');
    const factCount = await saveFacts(vm, factsOut);
    console.log(`  Facts saved: ${factCount}`);
    await vm.close();
  } else {
    console.log('\n[Phase 1-2] Skipping VSAVM ingest/facts (macro-unit model only)...');
  }

  // Phase 3: Stream token sequences for training
  console.log('\n[Phase 3] Streaming token sequences for macro-unit training...');
  const checkpointEvery = Number.isFinite(args.checkpointEvery) ? args.checkpointEvery : 50000;
  const checkpointPath = args.checkpointPath ?? `${dirname(modelOut)}/checkpoint.json`;
  let resumeState = null;

  if (args.resume) {
    resumeState = await loadCheckpoint(checkpointPath);
    if (resumeState?.datasetId && resumeState.datasetId !== datasetId) {
      throw new Error(
        `Checkpoint dataset mismatch (${resumeState.datasetId} != ${datasetId}). ` +
        'Use matching --dataset-id or delete the checkpoint.'
      );
    }
    if (resumeState?.modelId && resumeState.modelId !== modelId) {
      throw new Error(
        `Checkpoint model mismatch (${resumeState.modelId} != ${modelId}). ` +
        'Use matching --model-id or delete the checkpoint.'
      );
    }
  }

  const streamState = createSequenceStream(inputPath, {
    textField: args.textField,
    maxRecords: args.maxRecords ?? config.vsavm.maxRecords,
    maxBytes,
    maxBytesPerRecord: args.maxBytesPerRecord ?? config.vsavm.maxBytesPerRecord,
    startRecord: resumeState?.state?.sequences ?? 0,
    startBytes: resumeState?.state?.totalBytes ?? 0
  });

  // Phase 4: Train MacroUnitModel (DS011)
  console.log('\n[Phase 4] Training MacroUnitModel (DS011)...');
  const model = createMacroUnitModel({
    minFrequency,
    minLength,
    maxLength,
    contextWindow,
    mdlThreshold,
    pruneThreshold,
    maxMacroUnits,
    maxNgramOrder,
    maxSubsequenceLength,
    maxSubsequenceEntries,
    subsequenceSampleRate: resumeState?.subsequenceConfig?.sampleRate ?? subsequenceSampleRate,
    subsequencePruneThreshold,
    subsequencePruneInterval
  });

  if (resumeState?.modelState) {
    model.import(resumeState.modelState);
  }

  await model.trainStream(streamState.generator(), {
    subsequenceCounts: resumeState?.subsequenceCounts,
    totalSubseq: resumeState?.state?.totalSubseq,
    sequences: resumeState?.state?.sequences,
    totalBytes: resumeState?.state?.totalBytes,
    checkpointEvery,
    onCheckpoint: async (payload) => {
      await saveCheckpoint(checkpointPath, {
        version: 1,
        datasetId,
        modelId,
        state: payload.state,
        subsequenceConfig: payload.subsequenceConfig,
        subsequenceCounts: payload.subsequenceCounts,
        modelState: payload.modelState
      });
      console.log(`  Checkpoint saved: ${checkpointPath}`);
    }
  });

  const modelStats = model.getStats();
  const totalBytes = streamState.stats.totalBytes;
  const sequenceCount = streamState.stats.sequences;
  console.log(`  Sequences streamed: ${sequenceCount}`);
  console.log(`  Total bytes: ${totalBytes.toLocaleString()}`);
  console.log(`  Macro-units discovered: ${modelStats.macroUnitCount}`);
  console.log(`  N-gram contexts: ${modelStats.ngramContexts}`);
  console.log(`  Vocabulary size: ${modelStats.vocabularySize}`);
  console.log(`  Avg macro-unit length: ${modelStats.avgMacroUnitLength.toFixed(2)}`);

  // Phase 5: Evaluate compression
  console.log('\n[Phase 5] Evaluating compression...');
  let totalOriginalLength = 0;
  let totalEncodedLength = 0;

  for (const seq of streamState.compressionSample) {
    const encoded = model.encode(seq);
    totalOriginalLength += seq.length;
    totalEncodedLength += encoded.length;
  }

  const compressionRatio = totalOriginalLength > 0
    ? totalEncodedLength / totalOriginalLength
    : 1;
  console.log(`  Compression ratio: ${compressionRatio.toFixed(4)}`);
  console.log(`  (${totalOriginalLength} bytes -> ${totalEncodedLength} macro-units)`);

  // Phase 6: Calculate perplexity on validation data
  console.log('\n[Phase 6] Calculating perplexity...');
  const sampleSeqs = streamState.perplexitySample;
  let totalPerplexity = 0;
  let perpCount = 0;

  for (const seq of sampleSeqs) {
    if (seq.length > 10) {
      const perp = model.calculatePerplexity(seq);
      if (Number.isFinite(perp) && perp < 10000) {
        totalPerplexity += perp;
        perpCount++;
      }
    }
  }

  const avgPerplexity = perpCount > 0 ? totalPerplexity / perpCount : Infinity;
  console.log(`  Average perplexity: ${avgPerplexity.toFixed(2)}`);

  // Phase 7: Save model
  console.log('\n[Phase 7] Saving model...');
  await mkdir(dirname(modelOut), { recursive: true });
  
  const compact = exportFull ? false : true;
  const modelState = model.export({
    compact,
    maxOrders: exportMaxOrders,
    maxMacroUnits: exportMaxMacroUnits,
    minNgramCount: exportMinNgramCount
  });
  await writeFile(modelOut, JSON.stringify(modelState), 'utf8');
  console.log(`  Model saved: ${modelOut}`);
  console.log(`  Model ID: ${modelId}`);
  console.log(`  Dataset ID: ${datasetId}`);

  // Calculate model size
  const modelSizeBytes = Buffer.byteLength(JSON.stringify(modelState), 'utf8');
  console.log(`  Model size: ${(modelSizeBytes / 1024).toFixed(2)} KB`);

  const durationMs = performance.now() - startTime;

  const meta = {
    engine: 'vsavm',
    datasetId,
    modelId,
    trainedAt: new Date().toISOString(),
    inputPath,
    maxBytes,
    trainRatio,
    skipIngest: args.skipIngest ?? false,
    ingest: ingestStats,
    sequences: {
      count: sequenceCount,
      totalBytes
    },
    training: {
      contextWindow,
      minFrequency,
      minLength,
      maxLength,
      mdlThreshold,
      pruneThreshold,
      maxMacroUnits,
      maxNgramOrder,
      maxSubsequenceLength,
      maxSubsequenceEntries,
      subsequenceSampleRate,
      subsequencePruneThreshold,
      subsequencePruneInterval,
      checkpointEvery
    },
    export: {
      exportFull,
      compact: !exportFull,
      maxOrders: exportMaxOrders,
      maxMacroUnits: exportMaxMacroUnits,
      minNgramCount: exportMinNgramCount
    },
    stats: modelStats,
    metrics: {
      compressionRatio,
      avgPerplexity
    },
    artifacts: {
      modelPath: modelOut,
      factsPath: args.skipIngest ? null : factsOut,
      metaPath: metaOut,
      modelSizeBytes
    },
    durationMs
  };

  await writeFile(metaOut, JSON.stringify(meta, null, 2), 'utf8');
  if (!args.modelOut) {
    await writeLatestModelPointer({ modelsDir: config.paths.modelsDir, engine: 'vsavm', datasetId, modelId });
  }
  await rm(checkpointPath, { force: true });

  console.log('\n=== Training Complete ===');
  console.log(`  Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`  Macro-units: ${modelStats.macroUnitCount}`);
  console.log(`  Compression: ${(compressionRatio * 100).toFixed(1)}%`);
  console.log(`  Perplexity: ${avgPerplexity.toFixed(2)}`);

  const ingestLine = ingestStats
    ? `records=${ingestStats.records}, events=${ingestStats.events}, `
    : 'records=skipped, events=skipped, ';

  await appendLog(
    config.paths.trainingLog,
    `VSAVM DS011 training complete: duration=${durationMs.toFixed(2)}ms, ` +
    `datasetId=${datasetId}, modelId=${modelId}, ` +
    ingestLine +
    `macroUnits=${modelStats.macroUnitCount}, compression=${compressionRatio.toFixed(4)}, ` +
    `perplexity=${avgPerplexity.toFixed(2)}`
  );
}

main().catch((error) => {
  console.error('Training failed:', error.message);
  console.error(error.stack);
  process.exitCode = 1;
});
