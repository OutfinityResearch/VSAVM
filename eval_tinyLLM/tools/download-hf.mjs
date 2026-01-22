import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { config } from '../config.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dataset' && args[i + 1]) options.dataset = args[++i];
    else if (arg === '--split' && args[i + 1]) options.split = args[++i];
    else if (arg === '--file' && args[i + 1]) options.file = args[++i];
    else if (arg === '--out' && args[i + 1]) options.out = args[++i];
    else if (arg === '--text-field' && args[i + 1]) options.textField = args[++i];
  }

  return options;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function downloadFile(url, outPath, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }

  await mkdir(dirname(outPath), { recursive: true });
  const fileStream = createWriteStream(outPath);
  const body = res.body;
  if (!body) {
    throw new Error(`Empty response body for ${url}`);
  }
  const readable = body.getReader ? Readable.fromWeb(body) : body;
  await pipeline(readable, fileStream);
}

function pickFile(siblings, split) {
  const list = siblings.map((entry) => entry.rfilename);
  const candidates = list.filter((name) => name.toLowerCase().includes(split.toLowerCase()));

  const byExt = (items, ext) => items.find((name) => name.endsWith(ext));
  return (
    byExt(candidates, '.jsonl') ||
    byExt(candidates, '.txt') ||
    byExt(candidates, '.json') ||
    byExt(list, '.jsonl') ||
    byExt(list, '.txt') ||
    byExt(list, '.json') ||
    null
  );
}

async function main() {
  const args = parseArgs();
  const dataset = args.dataset ?? config.hf.dataset;
  const split = args.split ?? config.hf.split;
  const outPath = args.out ?? config.paths.rawDataset;
  const token = process.env.HUGGINGFACE_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let remoteFile = args.file;

  if (!remoteFile) {
    const metaUrl = `${config.hf.apiBase}/${dataset}`;
    const meta = await fetchJson(metaUrl, headers);
    remoteFile = pickFile(meta.siblings ?? [], split);

    if (!remoteFile) {
      throw new Error(`No JSONL/TXT/JSON file found for split "${split}" in ${dataset}.`);
    }
  }

  const fileUrl = `https://huggingface.co/datasets/${dataset}/resolve/main/${remoteFile}`;
  await downloadFile(fileUrl, outPath, headers);

  const ext = extname(remoteFile) || extname(outPath);
  const format = ext === '.jsonl' ? 'jsonl' : ext === '.json' ? 'json' : 'txt';

  const meta = {
    dataset,
    split,
    remoteFile,
    path: outPath,
    format,
    downloadedAt: new Date().toISOString()
  };
  await writeFile(config.paths.datasetMeta, JSON.stringify(meta, null, 2));
  console.log(`Downloaded ${fileUrl} -> ${outPath} (${ext || 'unknown'})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
