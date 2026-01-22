import { spawn } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { config } from '../config.mjs';
import { datasetPaths, makeDatasetId } from '../lib/artifacts.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dataset' && args[i + 1]) options.dataset = args[++i];
    else if (arg === '--split' && args[i + 1]) options.split = args[++i];
    else if (arg === '--input' && args[i + 1]) options.input = args[++i];
    else if (arg === '--text-field' && args[i + 1]) options.textField = args[++i];
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--force') options.force = true;
  }

  return options;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(path) {
  try {
    const info = await stat(path);
    return info.size;
  } catch {
    return 0;
  }
}

async function main() {
  const args = parseArgs();
  const datasetName = args.dataset ?? config.hf.dataset;
  const split = args.split ?? config.hf.split;
  const maxBytes = Number.isFinite(args.maxBytes) ? args.maxBytes : config.prep.maxBytes;
  const trainRatio = Number.isFinite(args.trainRatio) ? args.trainRatio : config.prep.trainRatio;

  const datasetId = args.datasetId ?? makeDatasetId({
    dataset: datasetName,
    split,
    inputPath: args.input,
    maxBytes,
    trainRatio,
    textField: args.textField ?? config.hf.textField
  });

  if (!args.input) {
    const rawSize = await fileSize(config.paths.rawDataset);
    const hasRaw = rawSize > 0;
    if (hasRaw && !args.force) {
      console.log(`Raw dataset already present: ${config.paths.rawDataset}`);
    } else {
      if (args.force && hasRaw) {
        console.log('Force enabled: redownloading raw dataset.');
      } else if (!hasRaw && rawSize === 0 && await fileExists(config.paths.rawDataset)) {
        console.log('Raw dataset exists but is empty. Re-downloading.');
      }
      await runCommand('node', [
        'eval_tinyLLM/tools/download-hf.mjs',
        '--dataset',
        datasetName,
        '--split',
        split
      ]);
    }
  }

  const outputs = datasetPaths({ datasetsDir: config.paths.datasetsDir, datasetId });
  const hasTrain = await fileExists(outputs.trainText);
  const hasValid = await fileExists(outputs.validText);
  if (hasTrain && hasValid && !args.force) {
    console.log(`Prepared dataset already present: ${datasetId}`);
    console.log(`Train: ${outputs.trainText}`);
    console.log(`Valid: ${outputs.validText}`);
    return;
  }

  const prepareArgs = ['eval_tinyLLM/tools/prepare-data.mjs'];
  prepareArgs.push('--dataset-id', datasetId);
  if (args.input) {
    prepareArgs.push('--input', args.input);
  }
  if (args.textField) {
    prepareArgs.push('--text-field', args.textField);
  }
  prepareArgs.push('--max-bytes', String(maxBytes));
  prepareArgs.push('--train-ratio', String(trainRatio));

  await runCommand('node', prepareArgs);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
