import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    maxBytes: 50_000_000,
    maxRecords: 30000,
    tag: 'large',
    reserveGb: 5,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--max-bytes' && args[i + 1]) options.maxBytes = Number(args[++i]);
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--max-records' && args[i + 1]) options.maxRecords = Number(args[++i]);
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--checkpoint-every' && args[i + 1]) options.checkpointEvery = Number(args[++i]);
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
  '--context-window', '24',
  '--max-ngram-order', '8',
  '--min-frequency', '5',
  '--max-macro-units', '12000',
  '--max-subsequence-length', '16',
  '--max-subsequence-entries', '600000',
  '--subsequence-sample-rate', '0.5',
  '--export-max-orders', '8',
  '--export-max-macro-units', '10000',
  '--tag', options.tag
];

if (Number.isFinite(options.checkpointEvery)) {
  trainArgs.push('--checkpoint-every', String(options.checkpointEvery));
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
console.log(`  reserveGb=${options.reserveGb}`);

const child = spawn(
  process.execPath,
  [runWithRam, '--reserve-gb', String(options.reserveGb), ...trainArgs],
  { stdio: 'inherit' }
);

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
