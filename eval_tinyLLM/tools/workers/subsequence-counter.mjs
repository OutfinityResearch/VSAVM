import { parentPort } from 'node:worker_threads';

function pruneCounts(counts, config) {
  let threshold = config.pruneThreshold;
  const maxEntries = config.maxSubsequenceEntries;

  while (counts.size > maxEntries && threshold <= config.pruneThreshold + 3) {
    for (const [key, count] of counts) {
      if (count <= threshold) {
        counts.delete(key);
      }
    }
    threshold += 1;
  }
}

function countSubsequences(sequences, config) {
  const counts = new Map();
  const sampleRate = Number.isFinite(config.sampleRate) ? config.sampleRate : 1.0;
  const minLength = config.minLength ?? 2;
  const maxLength = config.maxLength ?? 32;
  const maxSubsequenceLength = config.maxSubsequenceLength ?? maxLength;
  const pruneInterval = config.pruneInterval ?? 100000;
  let totalSubseq = 0;

  for (const tokens of sequences) {
    const effectiveMax = Math.min(tokens.length, maxLength, maxSubsequenceLength);
    for (let len = minLength; len <= effectiveMax; len++) {
      for (let i = 0; i <= tokens.length - len; i++) {
        if (sampleRate < 1.0 && Math.random() > sampleRate) continue;
        const key = Buffer.from(tokens.slice(i, i + len)).toString('base64');
        counts.set(key, (counts.get(key) ?? 0) + 1);
        totalSubseq += 1;

        if (pruneInterval > 0 && totalSubseq % pruneInterval === 0) {
          if (counts.size > config.maxSubsequenceEntries) {
            pruneCounts(counts, config);
          }
        }
      }
    }
  }

  if (counts.size > config.maxSubsequenceEntries) {
    pruneCounts(counts, config);
  }

  return {
    counts: Array.from(counts.entries()),
    totalSubseq
  };
}

parentPort.on('message', (message) => {
  try {
    const result = countSubsequences(message.sequences, message.config);
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error?.message ?? String(error) });
  }
});
