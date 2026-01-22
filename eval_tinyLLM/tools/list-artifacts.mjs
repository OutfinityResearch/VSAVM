#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.mjs';
import { resolveDatasetsDir, resolveModelsDir } from '../lib/artifacts.mjs';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

async function tryReadJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function listDatasets() {
  const datasetsDir = resolveDatasetsDir(config.paths.datasetsDir);
  let entries = [];
  try {
    entries = await readdir(datasetsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const datasets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const datasetId = entry.name;
    const metaPath = join(datasetsDir, datasetId, 'meta.json');
    const meta = await tryReadJson(metaPath);
    datasets.push({ datasetId, metaPath, meta });
  }

  return datasets.sort((a, b) => (a.datasetId < b.datasetId ? -1 : 1));
}

async function listModels(engine) {
  const modelsDir = resolveModelsDir(config.paths.modelsDir);
  const engineDir = join(modelsDir, engine);

  let datasetEntries = [];
  try {
    datasetEntries = await readdir(engineDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const rows = [];
  for (const datasetEntry of datasetEntries) {
    if (!datasetEntry.isDirectory()) continue;
    const datasetId = datasetEntry.name;
    const datasetDir = join(engineDir, datasetId);
    const latestPath = join(datasetDir, 'latest.json');
    const latest = await tryReadJson(latestPath);
    const latestModelId = latest?.modelId ?? null;

    let modelEntries = [];
    try {
      modelEntries = await readdir(datasetDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const modelEntry of modelEntries) {
      if (!modelEntry.isDirectory()) continue;
      const modelId = modelEntry.name;
      const metaPath = join(datasetDir, modelId, 'meta.json');
      const modelPath = join(datasetDir, modelId, 'model.json');
      const meta = await tryReadJson(metaPath);
      let modelSizeBytes = null;
      try {
        modelSizeBytes = (await stat(modelPath)).size;
      } catch {}

      rows.push({
        engine,
        datasetId,
        modelId,
        latest: modelId === latestModelId,
        trainedAt: meta?.trainedAt ?? null,
        durationMs: meta?.durationMs ?? null,
        modelSizeBytes
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.engine !== b.engine) return a.engine < b.engine ? -1 : 1;
    if (a.datasetId !== b.datasetId) return a.datasetId < b.datasetId ? -1 : 1;
    if (a.latest !== b.latest) return a.latest ? -1 : 1;
    return a.modelId < b.modelId ? -1 : 1;
  });
}

async function main() {
  console.log('=== eval_tinyLLM Artifacts ===\n');

  const datasets = await listDatasets();
  if (!datasets.length) {
    console.log('Datasets: none found.');
  } else {
    console.log('Datasets:');
    for (const entry of datasets) {
      const meta = entry.meta;
      const maxBytes = meta?.prep?.maxBytes ?? null;
      const trainBytes = meta?.outputs?.trainBytes ?? null;
      const validBytes = meta?.outputs?.validBytes ?? null;
      const trainCount = meta?.counts?.trainCount ?? null;
      const validCount = meta?.counts?.validCount ?? null;
      const createdAt = meta?.createdAt ?? null;

      console.log(
        `- ${entry.datasetId} ` +
        `(maxBytes=${maxBytes ?? 'N/A'}, train=${trainCount ?? 'N/A'} ${formatBytes(trainBytes)}, ` +
        `valid=${validCount ?? 'N/A'} ${formatBytes(validBytes)}, createdAt=${createdAt ?? 'N/A'})`
      );
    }
  }

  console.log('\nModels:');
  const tf = await listModels('tf');
  const vsavm = await listModels('vsavm');
  const all = [...tf, ...vsavm];

  if (!all.length) {
    console.log('  none found.');
    return;
  }

  for (const row of all) {
    const duration = Number.isFinite(row.durationMs) ? `${(row.durationMs / 1000).toFixed(1)}s` : 'N/A';
    const marker = row.latest ? '*' : ' ';
    console.log(
      `  ${marker} ${row.engine}/${row.datasetId}/${row.modelId} ` +
      `(size=${formatBytes(row.modelSizeBytes)}, duration=${duration}, trainedAt=${row.trainedAt ?? 'N/A'})`
    );
  }

  console.log('\nLegend: "*" = latest model per (engine, datasetId).');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

