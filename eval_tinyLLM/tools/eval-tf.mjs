import { readFile, access } from 'node:fs/promises';
import { config } from '../config.mjs';
import { loadBytesFromText } from '../lib/dataset.mjs';
import { createTransformer } from '../lib/tf-model.mjs';
import { loadTf } from '../lib/tf-runtime.mjs';
import { mean } from '../lib/metrics.mjs';
import {
  datasetPaths,
  findLatestModelId,
  makeDatasetId,
  modelPaths,
  resolveDatasetId,
  resolveModelId
} from '../lib/artifacts.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) options.input = args[++i];
    else if (arg === '--model' && args[i + 1]) options.model = args[++i];
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--model-id' && args[i + 1]) options.modelId = args[++i];
    else if (arg === '--steps' && args[i + 1]) options.steps = Number(args[++i]);
    else if (arg === '--batch' && args[i + 1]) options.batch = Number(args[++i]);
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
  }

  return options;
}

function sampleBatchSequential(tf, bytes, seqLen, batchSize, start) {
  const xs = [];
  const ys = [];
  let offset = start;

  for (let i = 0; i < batchSize; i++) {
    if (offset + seqLen + 1 > bytes.length) {
      offset = 0;
    }
    xs.push(Array.from(bytes.slice(offset, offset + seqLen)));
    ys.push(Array.from(bytes.slice(offset + 1, offset + seqLen + 1)));
    offset += seqLen;
  }

  return {
    xs: tf.tensor2d(xs, [batchSize, seqLen], 'int32'),
    ys: tf.tensor2d(ys, [batchSize, seqLen], 'int32'),
    nextOffset: offset
  };
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
    textField: config.hf.textField
  });
  const datasetId = datasetIdRaw === 'latest'
    ? await resolveDatasetId({ datasetsDir: config.paths.datasetsDir, datasetId: datasetIdRaw })
    : datasetIdRaw;
  const dataset = datasetPaths({ datasetsDir: config.paths.datasetsDir, datasetId });
  let inputPath = args.input ?? dataset.validText;
  if (!args.input) {
    try {
      await access(inputPath);
    } catch {
      throw new Error(
        `Dataset not prepared: ${dataset.validText}. ` +
        'Run: node eval_tinyLLM/tools/fetch-and-prepare.mjs'
      );
    }
  }

  let modelPath = args.model;
  let resolvedModelId = args.modelId;
  if (!modelPath) {
    const modelIdRaw = args.modelId ?? 'latest';
    try {
      resolvedModelId = await resolveModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'tf',
        datasetId,
        modelId: modelIdRaw
      });
    } catch {
      resolvedModelId = await findLatestModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'tf',
        datasetId
      });
    }
    if (!resolvedModelId) {
      throw new Error(
        `No TF model found for datasetId=${datasetId}. Run: node eval_tinyLLM/tools/train-tf.mjs --dataset-id ${datasetId}`
      );
    }
    modelPath = modelPaths({
      modelsDir: config.paths.modelsDir,
      engine: 'tf',
      datasetId,
      modelId: resolvedModelId
    }).modelPath;
  }
  const steps = Number.isFinite(args.steps) ? args.steps : 100;
  const batchSize = Number.isFinite(args.batch) ? args.batch : config.tf.batchSize;

  const payload = JSON.parse(await readFile(modelPath, 'utf8'));
  const seqLen = payload.config.seqLen;

  const tf = await loadTf();
  const model = createTransformer(tf, payload.config);
  await model.load(modelPath);

  const bytes = await loadBytesFromText(inputPath, maxBytes);
  const losses = [];
  let offset = 0;

  for (let step = 0; step < steps; step++) {
    const batch = sampleBatchSequential(tf, bytes, seqLen, batchSize, offset);
    offset = batch.nextOffset;

    const lossValue = tf.tidy(() => {
      const logits = model.forward(batch.xs);
      const oneHot = tf.oneHot(batch.ys, 256);
      const loss = tf.losses.softmaxCrossEntropy(oneHot, logits);
      return tf.mean(loss).dataSync()[0];
    });

    losses.push(lossValue);
    batch.xs.dispose();
    batch.ys.dispose();
  }

  const avgLoss = mean(losses);
  const perplexity = Math.exp(avgLoss);

  if (resolvedModelId) {
    console.log(`datasetId=${datasetId} modelId=${resolvedModelId}`);
  }
  console.log(`avg_loss=${avgLoss.toFixed(4)} perplexity=${perplexity.toFixed(3)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
