import { access } from 'node:fs/promises';
import { config } from '../config.mjs';
import { streamRecords, encodeBytes } from '../lib/dataset.mjs';
import { createVSAVMInstance, loadFacts, answerWithVSAVM } from '../lib/vsavm-driver.mjs';
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
    else if (arg === '--facts' && args[i + 1]) options.facts = args[++i];
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--model-id' && args[i + 1]) options.modelId = args[++i];
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
    else if (arg === '--max-records' && args[i + 1]) options.maxRecords = Number(args[++i]);
  }

  return options;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

  let factsPath = args.facts ?? null;
  if (!factsPath) {
    const modelIdRaw = args.modelId ?? 'latest';
    let modelId = null;
    try {
      modelId = await resolveModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'vsavm',
        datasetId,
        modelId: modelIdRaw
      });
    } catch {
      modelId = await findLatestModelId({
        modelsDir: config.paths.modelsDir,
        engine: 'vsavm',
        datasetId
      });
    }
    if (!modelId) {
      throw new Error(
        `No VSAVM model found for datasetId=${datasetId}. ` +
        'Run: node eval_tinyLLM/tools/train-vsavm.mjs (without --skip-ingest)'
      );
    }
    factsPath = modelPaths({
      modelsDir: config.paths.modelsDir,
      engine: 'vsavm',
      datasetId,
      modelId
    }).factsPath;
  }
  const maxRecords = Number.isFinite(args.maxRecords) ? args.maxRecords : 50;

  const vm = await createVSAVMInstance();

  if (!(await fileExists(factsPath))) {
    throw new Error(
      `Facts file missing: ${factsPath}. ` +
      'Run train-vsavm without --skip-ingest or pass --facts.'
    );
  }
  const count = await loadFacts(vm, factsPath);
  console.log(`Loaded facts: ${count}`);

  const compressionRatios = [];
  const prompts = [];

  let idx = 0;
  for await (const record of streamRecords(inputPath, {
    maxRecords
  })) {
    const bytes = Array.from(encodeBytes(record));
    const result = await vm.compressPattern({ name: `record_${idx}`, data: bytes });
    const ratio = result?.compressionRatio ?? 0;
    compressionRatios.push(ratio);
    if (prompts.length < 10) {
      prompts.push(record.slice(0, 200));
    }
    idx += 1;
  }

  const avgCompression = mean(compressionRatios);

  const determinismChecks = [];
  const latencyChecks = [];

  for (const prompt of prompts) {
    const start = performance.now();
    const first = await answerWithVSAVM(vm, prompt);
    const second = await answerWithVSAVM(vm, prompt);
    latencyChecks.push(performance.now() - start);
    determinismChecks.push(first.text === second.text);
  }

  const determinismRate = determinismChecks.length
    ? determinismChecks.filter(Boolean).length / determinismChecks.length
    : 0;
  const avgLatency = mean(latencyChecks);

  await vm.close();

  console.log(`avg_compression_ratio=${avgCompression.toFixed(3)}`);
  console.log(`determinism_rate=${determinismRate.toFixed(3)}`);
  console.log(`avg_latency_ms=${avgLatency.toFixed(2)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
