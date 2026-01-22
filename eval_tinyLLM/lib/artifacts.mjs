import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

function sanitizeIdPart(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function numberToId(value) {
  if (!Number.isFinite(value)) return 'na';
  return String(value).replace(/\./g, 'p').replace(/-/g, 'm');
}

export function makeDatasetId(options = {}) {
  const datasetLabel = options.dataset ?? (options.inputPath ? basename(options.inputPath) : 'dataset');
  const split = options.split ?? (options.inputPath ? 'custom' : 'train');
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : 'default';
  const trainRatio = Number.isFinite(options.trainRatio) ? numberToId(options.trainRatio) : 'default';
  const textField = options.textField ? sanitizeIdPart(options.textField) : 'text';

  const datasetSlug = sanitizeIdPart(datasetLabel);
  const splitSlug = sanitizeIdPart(split);

  return `${datasetSlug}_${splitSlug}_bytes${maxBytes}_ratio${trainRatio}_field${textField}`;
}

export function resolveDatasetsDir(datasetsDir) {
  const dir = datasetsDir ?? 'eval_tinyLLM/cache/datasets';
  return resolve(process.cwd(), dir);
}

export function resolveModelsDir(modelsDir) {
  const dir = modelsDir ?? 'eval_tinyLLM/cache/models';
  return resolve(process.cwd(), dir);
}

export async function resolveDatasetId(options = {}) {
  const datasetId = options.datasetId ?? 'latest';
  if (datasetId !== 'latest') return datasetId;

  const datasetsDir = resolveDatasetsDir(options.datasetsDir);
  const latestPath = join(datasetsDir, 'latest.json');
  const payload = JSON.parse(await readFile(latestPath, 'utf8'));
  if (!payload?.datasetId) {
    throw new Error(`Invalid dataset latest pointer: ${latestPath}`);
  }
  return payload.datasetId;
}

export function datasetPaths(options = {}) {
  const datasetsDir = resolveDatasetsDir(options.datasetsDir);
  const datasetId = options.datasetId;
  const dir = join(datasetsDir, datasetId);
  return {
    datasetId,
    dir,
    trainText: join(dir, 'train.txt'),
    validText: join(dir, 'valid.txt'),
    metaPath: join(dir, 'meta.json')
  };
}

export function makeTfModelId(options = {}) {
  const parts = [
    options.tag ? sanitizeIdPart(options.tag) : null,
    `seq${options.seqLen}`,
    `d${options.dModel}`,
    `h${options.numHeads}`,
    `l${options.numLayers}`,
    `ff${options.ffDim}`,
    `b${options.batchSize}`,
    `e${options.epochs}`,
    `s${options.stepsPerEpoch}`,
    options.learningRate ? `lr${numberToId(options.learningRate)}` : null
  ].filter(Boolean);
  return parts.join('_');
}

export function makeVsavmModelId(options = {}) {
  const parts = [
    options.tag ? sanitizeIdPart(options.tag) : null,
    `ctx${options.contextWindow}`,
    `minfreq${options.minFrequency}`,
    `minlen${options.minLength}`,
    `maxlen${options.maxLength}`,
    `mdl${numberToId(options.mdlThreshold)}`,
    Number.isFinite(options.pruneThreshold) ? `prune${options.pruneThreshold}` : null,
    Number.isFinite(options.maxMacroUnits) ? `mu${options.maxMacroUnits}` : null,
    Number.isFinite(options.exportMaxOrders) ? `orders${options.exportMaxOrders}` : null,
    Number.isFinite(options.exportMaxMacroUnits) ? `emu${options.exportMaxMacroUnits}` : null,
    Number.isFinite(options.exportMinNgramCount) ? `minng${options.exportMinNgramCount}` : null,
    options.exportFull ? 'full' : 'compact'
  ].filter(Boolean);
  return parts.join('_');
}

export function modelPaths(options = {}) {
  const modelsDir = resolveModelsDir(options.modelsDir);
  const engine = options.engine;
  const datasetId = options.datasetId;
  const modelId = options.modelId;

  const dir = join(modelsDir, engine, datasetId, modelId);
  return {
    engine,
    datasetId,
    modelId,
    dir,
    modelPath: join(dir, 'model.json'),
    metaPath: join(dir, 'meta.json'),
    factsPath: join(dir, 'facts.json')
  };
}

export async function writeLatestDatasetPointer(options = {}) {
  const datasetsDir = resolveDatasetsDir(options.datasetsDir);
  const latestPath = join(datasetsDir, 'latest.json');
  await mkdir(dirname(latestPath), { recursive: true });
  await writeFile(
    latestPath,
    JSON.stringify({ datasetId: options.datasetId, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
  return latestPath;
}

export async function writeLatestModelPointer(options = {}) {
  const modelsDir = resolveModelsDir(options.modelsDir);
  const pointerPath = join(modelsDir, options.engine, options.datasetId, 'latest.json');
  await mkdir(dirname(pointerPath), { recursive: true });
  await writeFile(
    pointerPath,
    JSON.stringify({ modelId: options.modelId, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
  return pointerPath;
}

export async function resolveModelId(options = {}) {
  const modelId = options.modelId ?? 'latest';
  if (modelId !== 'latest') return modelId;

  const modelsDir = resolveModelsDir(options.modelsDir);
  const pointerPath = join(modelsDir, options.engine, options.datasetId, 'latest.json');
  const payload = JSON.parse(await readFile(pointerPath, 'utf8'));
  if (!payload?.modelId) {
    throw new Error(`Invalid model latest pointer: ${pointerPath}`);
  }
  return payload.modelId;
}

export async function findLatestModelId(options = {}) {
  const modelsDir = resolveModelsDir(options.modelsDir);
  const root = join(modelsDir, options.engine, options.datasetId);

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== 'latest.json');

  let best = null;
  let bestTime = -Infinity;

  for (const modelId of candidates) {
    const meta = join(root, modelId, 'meta.json');
    const model = join(root, modelId, 'model.json');
    let ts = null;

    try {
      const payload = JSON.parse(await readFile(meta, 'utf8'));
      ts = payload?.trainedAt ?? payload?.createdAt ?? null;
    } catch {}

    if (ts) {
      const t = Date.parse(ts);
      if (Number.isFinite(t) && t > bestTime) {
        bestTime = t;
        best = modelId;
        continue;
      }
    }

    try {
      const info = await stat(model);
      const t = info.mtimeMs;
      if (t > bestTime) {
        bestTime = t;
        best = modelId;
      }
    } catch {}
  }

  return best;
}

