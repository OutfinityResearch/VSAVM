import util from 'node:util';

if (typeof util.isNullOrUndefined !== 'function') {
  util.isNullOrUndefined = (value) => value === null || value === undefined;
}

export async function loadTf() {
  const mod = await import('@tensorflow/tfjs-node');
  return mod.default ?? mod;
}

export default { loadTf };
