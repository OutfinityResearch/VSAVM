import os from 'node:os';
import { spawn } from 'node:child_process';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    reserveGb: 5,
    minHeapMb: 1024,
    maxHeapMb: null
  };

  let scriptIndex = -1;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--reserve-gb' && args[i + 1]) {
      options.reserveGb = Number(args[++i]);
    } else if (arg === '--min-heap-mb' && args[i + 1]) {
      options.minHeapMb = Number(args[++i]);
    } else if (arg === '--max-heap-mb' && args[i + 1]) {
      options.maxHeapMb = Number(args[++i]);
    } else if (arg === '--') {
      scriptIndex = i + 1;
      break;
    } else if (!arg.startsWith('--')) {
      scriptIndex = i;
      break;
    }
  }

  const script = scriptIndex >= 0 ? args[scriptIndex] : null;
  const scriptArgs = scriptIndex >= 0 ? args.slice(scriptIndex + 1) : [];
  return { options, script, scriptArgs };
}

function stripMaxOldSpace(nodeOptions = '') {
  return nodeOptions.replace(/--max-old-space-size=\d+/g, '').trim();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const { options, script, scriptArgs } = parseArgs();

if (!script) {
  console.log('Usage: node eval_tinyLLM/tools/run-with-ram.mjs [options] <script> [args...]');
  console.log('Options: --reserve-gb 5 --min-heap-mb 1024 --max-heap-mb <MB>');
  process.exit(1);
}

const totalMem = os.totalmem();
const freeMem = os.freemem();
const reserveBytes = Math.max(0, options.reserveGb) * 1024 * 1024 * 1024;
const maxByFree = Math.max(0, freeMem - reserveBytes);
const maxByTotal = totalMem * 0.85;
const targetBytes = Math.min(maxByFree, maxByTotal);

let heapMb = Math.floor(targetBytes / (1024 * 1024));
if (!Number.isFinite(heapMb) || heapMb <= 0) {
  heapMb = options.minHeapMb;
}
if (Number.isFinite(options.minHeapMb)) {
  heapMb = Math.max(heapMb, options.minHeapMb);
}
if (Number.isFinite(options.maxHeapMb)) {
  heapMb = Math.min(heapMb, options.maxHeapMb);
}

const existingOptions = stripMaxOldSpace(process.env.NODE_OPTIONS ?? '');
const nodeOptions = `${existingOptions} --max-old-space-size=${heapMb}`.trim();

console.log('RAM guard:');
console.log(`  total: ${formatBytes(totalMem)}`);
console.log(`  free:  ${formatBytes(freeMem)}`);
console.log(`  reserve: ${formatBytes(reserveBytes)}`);
console.log(`  heap target: ${heapMb} MB`);

const child = spawn(process.execPath, [script, ...scriptArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions
  }
});

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
