import readline from 'node:readline';
import { access } from 'node:fs/promises';
import { config } from '../config.mjs';
import { createVSAVMInstance, loadFacts, answerWithVSAVM } from '../lib/vsavm-driver.mjs';
import { createTransformer, generateText } from '../lib/tf-model.mjs';
import { loadTf } from '../lib/tf-runtime.mjs';
import { encodeBytes } from '../lib/dataset.mjs';
import { readFile } from 'node:fs/promises';
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
  const options = { engine: 'vsavm' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--engine' && args[i + 1]) options.engine = args[++i];
    else if (arg === '--model' && args[i + 1]) options.model = args[++i];
    else if (arg === '--facts' && args[i + 1]) options.facts = args[++i];
    else if (arg === '--dataset-id' && args[i + 1]) options.datasetId = args[++i];
    else if (arg === '--tf-model-id' && args[i + 1]) options.tfModelId = args[++i];
    else if (arg === '--vsavm-model-id' && args[i + 1]) options.vsavmModelId = args[++i];
    else if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--train-ratio' && args[i + 1]) options.trainRatio = Number(args[++i]);
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
  let engine = args.engine;

  let vsavm = null;
  let tfModel = null;
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

  const loadVSAVM = async () => {
    if (vsavm) return vsavm;
    vsavm = await createVSAVMInstance();
    let factsPath = args.facts ?? null;
    if (!factsPath) {
      const modelIdRaw = args.vsavmModelId ?? 'latest';
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
      if (modelId) {
        factsPath = modelPaths({
          modelsDir: config.paths.modelsDir,
          engine: 'vsavm',
          datasetId,
          modelId
        }).factsPath;
      } else {
        throw new Error(
          `No VSAVM facts found for datasetId=${datasetId}. ` +
          'Run: node eval_tinyLLM/tools/train-vsavm.mjs (without --skip-ingest)'
        );
      }
    }
    if (!(await fileExists(factsPath))) {
      throw new Error(
        `Facts file missing: ${factsPath}. ` +
        'Run train-vsavm without --skip-ingest or pass --facts.'
      );
    }
    await loadFacts(vsavm, factsPath);
    return vsavm;
  };

  const loadTF = async () => {
    if (tfModel) return tfModel;
    let modelPath = args.model ?? null;
    if (!modelPath) {
      const modelIdRaw = args.tfModelId ?? 'latest';
      let modelId = null;
      try {
        modelId = await resolveModelId({
          modelsDir: config.paths.modelsDir,
          engine: 'tf',
          datasetId,
          modelId: modelIdRaw
        });
      } catch {
        modelId = await findLatestModelId({
          modelsDir: config.paths.modelsDir,
          engine: 'tf',
          datasetId
        });
      }
      if (!modelId) {
        throw new Error(
          `No TF model found for datasetId=${datasetId}. ` +
          'Run: node eval_tinyLLM/tools/train-tf.mjs'
        );
      } else {
        modelPath = modelPaths({
          modelsDir: config.paths.modelsDir,
          engine: 'tf',
          datasetId,
          modelId
        }).modelPath;
      }
    }
    const payload = JSON.parse(await readFile(modelPath, 'utf8'));
    const tf = await loadTf();
    tfModel = { tf, model: createTransformer(tf, payload.config) };
    await tfModel.model.load(modelPath);
    return tfModel;
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${engine}> `
  });

  console.log('Type /engine vsavm or /engine tf to switch. /exit to quit.');
  console.log(`Dataset ID: ${dataset.datasetId}`);
  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    if (text === '/exit') {
      rl.close();
      return;
    }

    if (text.startsWith('/engine')) {
      const next = text.split(/\s+/)[1];
      if (next === 'vsavm' || next === 'tf') {
        engine = next;
        rl.setPrompt(`${engine}> `);
      }
      rl.prompt();
      return;
    }

    if (engine === 'vsavm') {
      const vm = await loadVSAVM();
      const response = await answerWithVSAVM(vm, text, {});
      console.log(response.text);
    } else {
      const { tf, model } = await loadTF();
      const promptBytes = encodeBytes(text + '\n');
      const outputBytes = await generateText(tf, model, promptBytes, {
        maxTokens: config.tf.sampling.maxTokens,
        temperature: config.tf.sampling.temperature
      });
      const reply = Buffer.from(outputBytes).toString('utf8');
      console.log(reply.trim());
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    if (vsavm) {
      await vsavm.close();
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
