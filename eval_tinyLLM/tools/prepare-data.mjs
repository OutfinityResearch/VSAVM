import { config } from '../config.mjs';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { prepareSplits, detectFormat } from '../lib/dataset.mjs';
import { datasetPaths, makeDatasetId, writeLatestDatasetPointer } from '../lib/artifacts.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) options.input = args[++i];
    else if (arg === '--text-field' && args[i + 1]) options.textField = args[++i];
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--train-out' && args[i + 1]) options.trainOut = args[++i];
    else if (arg === '--valid-out' && args[i + 1]) options.validOut = args[++i];
  }

  return options;
}

async function main() {
  const args = parseArgs();
  let inputPath = args.input ?? config.paths.rawDataset;

  let metaFormat = null;
  let metaPayload = null;
  if (!args.input) {
    try {
      metaPayload = JSON.parse(await readFile(config.paths.datasetMeta, 'utf8'));
      if (metaPayload?.path) {
        inputPath = metaPayload.path;
      }
      if (metaPayload?.format) {
        metaFormat = metaPayload.format;
      }
    } catch {}
  }

  const options = {
    format: metaFormat ?? detectFormat(inputPath),
    textField: args.textField ?? config.hf.textField,
    maxBytes: Number.isFinite(args.maxBytes) ? args.maxBytes : config.prep.maxBytes,
    trainRatio: Number.isFinite(args.trainRatio) ? args.trainRatio : config.prep.trainRatio
  };

  const datasetId = args.datasetId ?? makeDatasetId({
    dataset: metaPayload?.dataset ?? config.hf.dataset,
    split: metaPayload?.split ?? config.hf.split,
    inputPath: args.input ? inputPath : undefined,
    maxBytes: options.maxBytes,
    trainRatio: options.trainRatio,
    textField: options.textField
  });

  const outputs = datasetPaths({ datasetsDir: config.paths.datasetsDir, datasetId });
  const trainOut = args.trainOut ?? outputs.trainText;
  const validOut = args.validOut ?? outputs.validText;

  let result = await prepareSplits(inputPath, trainOut, validOut, options);
  if (result.trainCount + result.validCount === 0 && options.format !== 'txt') {
    const fallback = { ...options, format: 'txt' };
    result = await prepareSplits(inputPath, trainOut, validOut, fallback);
  }

  if (result.trainCount + result.validCount === 0) {
    throw new Error(
      'No records parsed. Check that the raw dataset is non-empty and the text field is correct.'
    );
  }
  console.log(`Prepared splits: train=${result.trainCount}, valid=${result.validCount}`);
  console.log(`Dataset ID: ${datasetId}`);
  console.log(`Train: ${trainOut}`);
  console.log(`Valid: ${validOut}`);

  const trainSize = await stat(trainOut);
  const validSize = await stat(validOut);
  const meta = {
    datasetId,
    createdAt: new Date().toISOString(),
    source: {
      inputPath,
      format: options.format,
      dataset: metaPayload?.dataset ?? (args.input ? null : config.hf.dataset),
      split: metaPayload?.split ?? (args.input ? null : config.hf.split),
      remoteFile: metaPayload?.remoteFile ?? null,
      textField: options.textField
    },
    prep: {
      maxBytes: options.maxBytes,
      trainRatio: options.trainRatio
    },
    outputs: {
      trainText: trainOut,
      validText: validOut,
      trainBytes: trainSize.size,
      validBytes: validSize.size
    },
    counts: result
  };

  await mkdir(dirname(outputs.metaPath), { recursive: true });
  await writeFile(outputs.metaPath, JSON.stringify(meta, null, 2), 'utf8');
  await writeLatestDatasetPointer({ datasetsDir: config.paths.datasetsDir, datasetId });
  console.log(`Meta: ${outputs.metaPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
