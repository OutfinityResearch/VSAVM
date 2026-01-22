import { access, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.mjs';
import { loadBytesFromText } from '../lib/dataset.mjs';
import { createTransformer } from '../lib/tf-model.mjs';
import { loadTf } from '../lib/tf-runtime.mjs';
import { appendLog } from '../lib/logging.mjs';
import {
  datasetPaths,
  makeDatasetId,
  makeTfModelId,
  modelPaths,
  resolveDatasetId,
  writeLatestModelPointer
} from '../lib/artifacts.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) options.input = args[++i];
    else if (arg === '--model-out' && args[i + 1]) options.modelOut = args[++i];
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--model-id' && args[i + 1]) options.modelId = args[++i];
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--epochs' && args[i + 1]) options.epochs = Number(args[++i]);
    else if (arg === '--steps' && args[i + 1]) options.steps = Number(args[++i]);
    else if (arg === '--batch' && args[i + 1]) options.batch = Number(args[++i]);
    else if (arg === '--seq-len' && args[i + 1]) options.seqLen = Number(args[++i]);
    else if (arg === '--lr' && args[i + 1]) options.lr = Number(args[++i]);
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
    else if (arg === '--force') options.force = true;
    else if (arg === '--quick') options.quick = true;
  }

  return options;
}

function sampleBatch(tf, bytes, seqLen, batchSize) {
  const maxStart = Math.max(0, bytes.length - seqLen - 1);
  const xs = [];
  const ys = [];

  for (let i = 0; i < batchSize; i++) {
    const start = maxStart > 0 ? Math.floor(Math.random() * maxStart) : 0;
    const input = Array.from(bytes.slice(start, start + seqLen));
    const target = Array.from(bytes.slice(start + 1, start + seqLen + 1));
    xs.push(input);
    ys.push(target);
  }

  return {
    xs: tf.tensor2d(xs, [batchSize, seqLen], 'int32'),
    ys: tf.tensor2d(ys, [batchSize, seqLen], 'int32')
  };
}

async function main() {
  const args = parseArgs();
  const quick = args.quick ?? false;
  const maxBytes = Number.isFinite(args.maxBytes) ? args.maxBytes : config.prep.maxBytes;
  const trainRatio = Number.isFinite(args.trainRatio) ? args.trainRatio : config.prep.trainRatio;
  const seqLen = Number.isFinite(args.seqLen) ? args.seqLen : config.tf.seqLen;
  const batchSize = Number.isFinite(args.batch)
    ? args.batch
    : (quick ? Math.max(8, Math.floor(config.tf.batchSize / 2)) : config.tf.batchSize);
  const epochs = Number.isFinite(args.epochs) ? args.epochs : (quick ? 1 : config.tf.epochs);
  const stepsPerEpoch = Number.isFinite(args.steps) ? args.steps : (quick ? 100 : config.tf.stepsPerEpoch);
  const lr = Number.isFinite(args.lr) ? args.lr : config.tf.learningRate;

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

  const defaultModelId = makeTfModelId({
    tag: args.tag,
    seqLen,
    dModel: config.tf.model.dModel,
    numHeads: config.tf.model.numHeads,
    numLayers: config.tf.model.numLayers,
    ffDim: config.tf.model.ffDim,
    batchSize,
    epochs,
    stepsPerEpoch,
    learningRate: lr
  });
  const modelId = args.modelId ?? defaultModelId;
  const managed = modelPaths({
    modelsDir: config.paths.modelsDir,
    engine: 'tf',
    datasetId,
    modelId
  });
  const modelOut = args.modelOut ?? managed.modelPath;
  const metaOut = args.modelOut ? `${dirname(modelOut)}/meta.json` : managed.metaPath;

  if (!args.force) {
    try {
      await access(modelOut);
      console.log(`TF model already present: ${modelOut}`);
      await appendLog(
        config.paths.trainingLog,
        `TF training skipped (model exists). datasetId=${datasetId}, modelId=${modelId}`
      );
      return;
    } catch {}
  }

  const startTime = performance.now();
  const tf = await loadTf();
  const bytes = await loadBytesFromText(inputPath, maxBytes);
  const model = createTransformer(tf, {
    vocabSize: 256,
    seqLen,
    dModel: config.tf.model.dModel,
    numHeads: config.tf.model.numHeads,
    numLayers: config.tf.model.numLayers,
    ffDim: config.tf.model.ffDim
  });

  const optimizer = tf.train.adam(lr);

  for (let epoch = 0; epoch < epochs; epoch++) {
    let avgLoss = 0;

    for (let step = 0; step < stepsPerEpoch; step++) {
      const { xs, ys } = sampleBatch(tf, bytes, seqLen, batchSize);

      const { value, grads } = tf.variableGrads(() => tf.tidy(() => {
        const logits = model.forward(xs);
        const oneHot = tf.oneHot(ys, 256);
        const loss = tf.losses.softmaxCrossEntropy(oneHot, logits);
        return tf.mean(loss);
      }), model.variables);

      optimizer.applyGradients(grads);

      const lossValue = value.dataSync()[0];
      avgLoss += lossValue;

      xs.dispose();
      ys.dispose();
      value.dispose();
      Object.values(grads).forEach((g) => g.dispose());

      if ((step + 1) % 100 === 0) {
        console.log(`epoch ${epoch + 1} step ${step + 1}/${stepsPerEpoch} loss=${lossValue.toFixed(4)}`);
      }
    }

    avgLoss /= stepsPerEpoch;
    console.log(`epoch ${epoch + 1} avg_loss=${avgLoss.toFixed(4)}`);
  }

  await model.save(modelOut);
  const durationMs = performance.now() - startTime;
  const modelSizeBytes = (await stat(modelOut)).size;

  const meta = {
    engine: 'tf',
    datasetId,
    modelId,
    trainedAt: new Date().toISOString(),
    inputPath,
    maxBytes,
    trainRatio,
    training: {
      epochs,
      stepsPerEpoch,
      batchSize,
      learningRate: lr
    },
    transformer: model.config,
    artifacts: {
      modelPath: modelOut,
      modelSizeBytes,
      metaPath: metaOut
    },
    durationMs
  };

  await writeFile(metaOut, JSON.stringify(meta, null, 2), 'utf8');
  if (!args.modelOut) {
    await writeLatestModelPointer({ modelsDir: config.paths.modelsDir, engine: 'tf', datasetId, modelId });
  }

  console.log(`Saved model to ${modelOut}`);
  console.log(`Model ID: ${modelId}`);
  console.log(`Dataset ID: ${datasetId}`);
  console.log(`TF training duration: ${durationMs.toFixed(2)} ms`);
  await appendLog(
    config.paths.trainingLog,
    `TF training duration: ${durationMs.toFixed(2)} ms (datasetId=${datasetId}, modelId=${modelId}, ` +
    `epochs=${epochs}, steps=${stepsPerEpoch})`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
