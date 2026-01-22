import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import readline from 'node:readline';
import { computeHash } from '../../src/core/hash.mjs';

export function detectFormat(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.jsonl') return 'jsonl';
  if (ext === '.json') return 'json';
  if (ext === '.txt') return 'txt';
  return 'txt';
}

export async function *readLines(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    yield line;
  }
}

export async function *readJsonlRecords(filePath, textField = 'text') {
  for await (const line of readLines(filePath)) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const text = obj?.[textField] ?? obj?.text ?? obj?.content ?? obj?.sentence;
    if (typeof text === 'string' && text.trim()) {
      yield text.trim();
    }
  }
}

export async function *readJsonRecords(filePath, textField = 'text') {
  const content = await new Promise((resolve, reject) => {
    const chunks = [];
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(chunks.join('')));
  });

  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return;
  }

  const records = Array.isArray(data) ? data : data?.data ?? [];
  for (const obj of records) {
    const text = obj?.[textField] ?? obj?.text ?? obj?.content ?? obj?.sentence;
    if (typeof text === 'string' && text.trim()) {
      yield text.trim();
    }
  }
}

export async function *readTextRecords(filePath) {
  for await (const line of readLines(filePath)) {
    if (line.trim()) {
      yield line.trim();
    }
  }
}

export async function *streamRecords(filePath, options = {}) {
  const format = options.format ?? detectFormat(filePath);
  const textField = options.textField ?? 'text';
  const maxBytes = options.maxBytes ?? Infinity;
  const maxRecords = options.maxRecords ?? Infinity;

  let totalBytes = 0;
  let count = 0;

  const iterator = format === 'jsonl'
    ? readJsonlRecords(filePath, textField)
    : format === 'json'
      ? readJsonRecords(filePath, textField)
      : readTextRecords(filePath);

  for await (const record of iterator) {
    const bytes = Buffer.byteLength(record, 'utf8');
    if (totalBytes + bytes > maxBytes) break;
    if (count >= maxRecords) break;

    totalBytes += bytes;
    count += 1;
    yield record;
  }
}

export function assignSplit(record, trainRatio = 0.9) {
  const hash = computeHash(record);
  const bucket = parseInt(hash.slice(0, 4), 16) % 1000;
  return bucket < Math.floor(trainRatio * 1000) ? 'train' : 'valid';
}

export async function prepareSplits(inputPath, outputTrain, outputValid, options = {}) {
  await mkdir(dirname(outputTrain), { recursive: true });
  await mkdir(dirname(outputValid), { recursive: true });

  const trainStream = createWriteStream(outputTrain, { encoding: 'utf8' });
  const validStream = createWriteStream(outputValid, { encoding: 'utf8' });

  let trainCount = 0;
  let validCount = 0;

  for await (const record of streamRecords(inputPath, options)) {
    const split = assignSplit(record, options.trainRatio ?? 0.9);
    if (split === 'train') {
      trainStream.write(record + '\n');
      trainCount += 1;
    } else {
      validStream.write(record + '\n');
      validCount += 1;
    }
  }

  await new Promise((resolve) => trainStream.end(resolve));
  await new Promise((resolve) => validStream.end(resolve));

  return { trainCount, validCount };
}

export function encodeBytes(text) {
  return Uint8Array.from(Buffer.from(String(text ?? ''), 'utf8'));
}

export async function loadTextFile(filePath, maxBytes = Infinity) {
  const stream = createReadStream(filePath);
  const chunks = [];
  let total = 0;

  for await (const chunk of stream) {
    if (total + chunk.length > maxBytes) {
      const slice = chunk.slice(0, maxBytes - total);
      chunks.push(slice);
      total += slice.length;
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }

  return Buffer.concat(chunks).toString('utf8');
}

export async function loadBytesFromText(filePath, maxBytes = Infinity) {
  const text = await loadTextFile(filePath, maxBytes);
  return encodeBytes(text);
}
