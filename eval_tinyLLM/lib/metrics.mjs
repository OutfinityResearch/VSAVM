export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function measureLatency(fn, iterations = 1) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return mean(times);
}

export function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function bytesPerSecond(bytes, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return (bytes / ms) * 1000;
}

export function distinctNgramRatio(bytes, n) {
  if (!bytes || !Number.isFinite(n) || n <= 0) return 0;
  const arr = Array.from(bytes);
  if (arr.length < n) return 0;
  const total = arr.length - n + 1;
  const seen = new Set();
  for (let i = 0; i < total; i++) {
    seen.add(arr.slice(i, i + n).join(','));
  }
  return total > 0 ? seen.size / total : 0;
}

export function repetitionRate(bytes) {
  if (!bytes || bytes.length === 0) return 0;
  const unique = new Set(Array.from(bytes)).size;
  return 1 - (unique / bytes.length);
}
