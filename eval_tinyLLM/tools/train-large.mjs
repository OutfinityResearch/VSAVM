import { spawn } from 'node:child_process';
import os from 'node:os';
import { resolve } from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const defaultWorkers = Math.max(1, Math.min(4, os.cpus().length - 1));
  const options = {
    maxBytes: 50_000_000,
    maxRecords: 30000,
    tag: 'large',
    contextWindow: 24,
    maxNgramOrder: 8,
    minFrequency: 5,
    maxMacroUnits: 12000,
    maxLength: 16,
    maxSubsequenceLength: 16,
    maxSubsequenceEntries: 600000,
    subsequenceSampleRate: 0.5,
    exportMaxOrders: 8,
    exportMaxMacroUnits: 10000,
    workers: defaultWorkers,
    batchSize: 200,
    reserveGb: 5,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--max-records' && args[i + 1]) options.maxRecords = Number(args[++i]);
    else if (arg === '--context-window' && args[i + 1]) options.contextWindow = Number(args[++i]);
    else if (arg === '--max-ngram-order' && args[i + 1]) options.maxNgramOrder = Number(args[++i]);
    else if (arg === '--min-frequency' && args[i + 1]) options.minFrequency = Number(args[++i]);
    else if (arg === '--max-macro-units' && args[i + 1]) options.maxMacroUnits = Number(args[++i]);
    else if (arg === '--max-length' && args[i + 1]) options.maxLength = Number(args[++i]);
    else if (arg === '--max-subsequence-length' && args[i + 1]) options.maxSubsequenceLength = Number(args[++i]);
    else if (arg === '--max-subsequence-entries' && args[i + 1]) options.maxSubsequenceEntries = Number(args[++i]);
    else if (arg === '--subsequence-sample-rate' && args[i + 1]) options.subsequenceSampleRate = Number(args[++i]);
    else if (arg === '--export-max-orders' && args[i + 1]) options.exportMaxOrders = Number(args[++i]);
    else if (arg === '--export-max-macro-units' && args[i + 1]) options.exportMaxMacroUnits = Number(args[++i]);
    else if (arg === '--workers' && args[i + 1]) options.workers = Number(args[++i]);
    else if (arg === '--batch-size' && args[i + 1]) options.batchSize = Number(args[++i]);
    else if (arg === '--log-every-ms' && args[i + 1]) options.logEveryMs = Number(args[++i]);
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--checkpoint-every' && args[i + 1]) options.checkpointEvery = Number(args[++i]);
    else if (arg === '--checkpoint-max-entries' && args[i + 1]) options.checkpointMaxEntries = Number(args[++i]);
    else if (arg === '--reserve-gb' && args[i + 1]) options.reserveGb = Number(args[++i]);
    else if (arg === '--force') options.force = true;
  }

  return options;
}

const options = parseArgs();
const root = resolve(process.cwd());
const runWithRam = resolve(root, 'eval_tinyLLM/tools/run-with-ram.mjs');
const trainVsavm = resolve(root, 'eval_tinyLLM/tools/train-vsavm.mjs');

const trainArgs = [
  trainVsavm,
  '--max-bytes', String(options.maxBytes),
  '--max-records', String(options.maxRecords),
  '--skip-ingest',
  '--context-window', String(options.contextWindow),
  '--max-ngram-order', String(options.maxNgramOrder),
  '--min-frequency', String(options.minFrequency),
  '--max-macro-units', String(options.maxMacroUnits),
  '--max-length', String(options.maxLength),
  '--max-subsequence-length', String(options.maxSubsequenceLength),
  '--max-subsequence-entries', String(options.maxSubsequenceEntries),
  '--subsequence-sample-rate', String(options.subsequenceSampleRate),
  '--export-max-orders', String(options.exportMaxOrders),
  '--export-max-macro-units', String(options.exportMaxMacroUnits),
  '--workers', String(options.workers),
  '--batch-size', String(options.batchSize),
  '--tag', options.tag
];

if (Number.isFinite(options.logEveryMs)) {
  trainArgs.push('--log-every-ms', String(options.logEveryMs));
}

if (Number.isFinite(options.checkpointEvery)) {
  trainArgs.push('--checkpoint-every', String(options.checkpointEvery));
}

if (Number.isFinite(options.checkpointMaxEntries)) {
  trainArgs.push('--checkpoint-max-entries', String(options.checkpointMaxEntries));
}

if (options.resume) {
  trainArgs.push('--resume');
}

if (options.force) {
  trainArgs.push('--force');
}

console.log('Launching large VSAVM training:');
console.log(`  maxBytes=${options.maxBytes}`);
console.log(`  maxRecords=${options.maxRecords}`);
console.log(`  tag=${options.tag}`);
console.log(`  contextWindow=${options.contextWindow}`);
console.log(`  maxNgramOrder=${options.maxNgramOrder}`);
console.log(`  maxLength=${options.maxLength}`);
console.log(`  workers=${options.workers}`);
console.log(`  batchSize=${options.batchSize}`);
console.log(`  reserveGb=${options.reserveGb}`);

const child = spawn(
  process.execPath,
  [runWithRam, '--reserve-gb', String(options.reserveGb), ...trainArgs],
  { stdio: 'inherit' }
);

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
