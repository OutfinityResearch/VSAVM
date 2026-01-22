import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function makeTimestampId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
}

export function resolveResultsDir(outDir) {
  const dir = outDir ?? 'eval_tinyLLM/results';
  return resolve(process.cwd(), dir);
}

export async function createTimestampedResultPaths(options = {}) {
  const tag = options.tag ?? 'results';
  const id = options.id ?? makeTimestampId();
  const dir = resolveResultsDir(options.outDir);
  await mkdir(dir, { recursive: true });
  const base = join(dir, `${id}_${tag}`);
  return {
    id,
    dir,
    base,
    jsonPath: `${base}.json`,
    htmlPath: `${base}.html`
  };
}

export async function writeLatestResultPointer(options = {}) {
  const dir = resolveResultsDir(options.outDir);
  await mkdir(dir, { recursive: true });
  const latestPath = join(dir, 'latest.json');
  const payload = {
    id: options.id,
    tag: options.tag,
    jsonPath: options.jsonPath,
    htmlPath: options.htmlPath,
    generatedAt: new Date().toISOString()
  };
  await writeFile(latestPath, JSON.stringify(payload, null, 2));
  return latestPath;
}
