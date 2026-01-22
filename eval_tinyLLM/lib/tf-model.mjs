import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function initWeight(tf, shape, scale = 0.02) {
  return tf.variable(tf.randomNormal(shape, 0, scale));
}

function layerNorm(tf, x, gamma, beta, epsilon = 1e-5) {
  const mean = tf.mean(x, -1, true);
  const variance = tf.mean(tf.square(tf.sub(x, mean)), -1, true);
  const normalized = tf.div(tf.sub(x, mean), tf.sqrt(tf.add(variance, epsilon)));
  return tf.add(tf.mul(normalized, gamma), beta);
}

function createCausalMask(tf, seqLen) {
  const data = [];
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < seqLen; j++) {
      data.push(j > i ? -1e9 : 0);
    }
  }
  return tf.tensor2d(data, [seqLen, seqLen]);
}

export function createTransformer(tf, config) {
  const vocabSize = config.vocabSize ?? 256;
  const seqLen = config.seqLen;
  const dModel = config.dModel;
  const numLayers = config.numLayers;
  const numHeads = config.numHeads ?? 1;
  const ffDim = config.ffDim;
  const headDim = Math.floor(dModel / numHeads);

  if (headDim * numHeads !== dModel) {
    throw new Error(`dModel ${dModel} must be divisible by numHeads ${numHeads}`);
  }

  const tokenEmbedding = initWeight(tf, [vocabSize, dModel]);
  const posEmbedding = initWeight(tf, [seqLen, dModel]);

  const layers = [];
  for (let i = 0; i < numLayers; i++) {
    layers.push({
      Wq: initWeight(tf, [dModel, dModel]),
      Wk: initWeight(tf, [dModel, dModel]),
      Wv: initWeight(tf, [dModel, dModel]),
      Wo: initWeight(tf, [dModel, dModel]),
      W1: initWeight(tf, [dModel, ffDim]),
      b1: tf.variable(tf.zeros([ffDim])),
      W2: initWeight(tf, [ffDim, dModel]),
      b2: tf.variable(tf.zeros([dModel])),
      ln1Gamma: tf.variable(tf.ones([dModel])),
      ln1Beta: tf.variable(tf.zeros([dModel])),
      ln2Gamma: tf.variable(tf.ones([dModel])),
      ln2Beta: tf.variable(tf.zeros([dModel]))
    });
  }

  const outW = initWeight(tf, [dModel, vocabSize]);
  const outB = tf.variable(tf.zeros([vocabSize]));
  const mask = createCausalMask(tf, seqLen);

  function forward(inputIds) {
    const embed = tf.gather(tokenEmbedding, inputIds);
    const x0 = tf.add(embed, posEmbedding);
    let x = x0;

    for (const layer of layers) {
      const flat = tf.reshape(x, [-1, dModel]);
      const q = tf.reshape(tf.matMul(flat, layer.Wq), [-1, seqLen, dModel]);
      const k = tf.reshape(tf.matMul(flat, layer.Wk), [-1, seqLen, dModel]);
      const v = tf.reshape(tf.matMul(flat, layer.Wv), [-1, seqLen, dModel]);

      const qh = tf.transpose(tf.reshape(q, [-1, seqLen, numHeads, headDim]), [0, 2, 1, 3]);
      const kh = tf.transpose(tf.reshape(k, [-1, seqLen, numHeads, headDim]), [0, 2, 1, 3]);
      const vh = tf.transpose(tf.reshape(v, [-1, seqLen, numHeads, headDim]), [0, 2, 1, 3]);

      const scores = tf.div(tf.matMul(qh, kh, false, true), Math.sqrt(headDim));
      const masked = tf.add(scores, tf.reshape(mask, [1, 1, seqLen, seqLen]));
      const weights = tf.softmax(masked);
      const attn = tf.matMul(weights, vh);
      const attnMerged = tf.reshape(tf.transpose(attn, [0, 2, 1, 3]), [-1, seqLen, dModel]);
      const attnFlat = tf.reshape(attnMerged, [-1, dModel]);
      const attnOut = tf.reshape(tf.matMul(attnFlat, layer.Wo), [-1, seqLen, dModel]);

      const norm1 = layerNorm(tf, tf.add(x, attnOut), layer.ln1Gamma, layer.ln1Beta);
      const normFlat = tf.reshape(norm1, [-1, dModel]);
      const ffHidden = tf.reshape(
        tf.relu(tf.add(tf.matMul(normFlat, layer.W1), layer.b1)),
        [-1, seqLen, ffDim]
      );
      const ffFlat = tf.reshape(ffHidden, [-1, ffDim]);
      const ffOut = tf.reshape(
        tf.add(tf.matMul(ffFlat, layer.W2), layer.b2),
        [-1, seqLen, dModel]
      );
      const norm2 = layerNorm(tf, tf.add(norm1, ffOut), layer.ln2Gamma, layer.ln2Beta);
      x = norm2;
    }

    const outFlat = tf.reshape(x, [-1, dModel]);
    const logits = tf.reshape(tf.add(tf.matMul(outFlat, outW), outB), [-1, seqLen, vocabSize]);
    return logits;
  }

  const variables = [tokenEmbedding, posEmbedding, outW, outB];
  for (const layer of layers) {
    variables.push(
      layer.Wq,
      layer.Wk,
      layer.Wv,
      layer.Wo,
      layer.W1,
      layer.b1,
      layer.W2,
      layer.b2,
      layer.ln1Gamma,
      layer.ln1Beta,
      layer.ln2Gamma,
      layer.ln2Beta
    );
  }

  function getState() {
    return {
      vocabSize,
      seqLen,
      dModel,
      numLayers,
      numHeads,
      ffDim
    };
  }

  async function save(path) {
    const weightMap = {};
    const specs = [];

    variables.forEach((variable, index) => {
      const name = `v${index}`;
      weightMap[name] = variable;
    });

    const encoded = await tf.io.encodeWeights(weightMap);
    for (const [name, variable] of Object.entries(weightMap)) {
      specs.push({ name, shape: variable.shape, dtype: variable.dtype });
    }

    const payload = {
      config: getState(),
      specs: encoded.specs ?? specs,
      data: Buffer.from(encoded.data).toString('base64')
    };

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(payload));
  }

  async function load(path) {
    const raw = await readFile(path, 'utf8');
    const payload = JSON.parse(raw);
    const data = Buffer.from(payload.data, 'base64');
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const decoded = await tf.io.decodeWeights(arrayBuffer, payload.specs);

    payload.specs.forEach((spec) => {
      const index = Number(spec.name.slice(1));
      if (!Number.isFinite(index) || !variables[index]) return;
      variables[index].assign(decoded[spec.name]);
    });
  }

  return {
    config: getState(),
    forward,
    variables,
    save,
    load
  };
}

export function sampleFromLogits(tf, logits, temperature = 1.0) {
  const scaled = tf.div(logits, temperature);
  const probs = tf.softmax(scaled);
  const data = probs.dataSync();

  let r = Math.random();
  let acc = 0;
  for (let i = 0; i < data.length; i++) {
    acc += data[i];
    if (r <= acc) return i;
  }
  return data.length - 1;
}

export async function generateText(tf, model, promptBytes, options = {}) {
  const seqLen = model.config.seqLen;
  const maxTokens = options.maxTokens ?? 200;
  const temperature = options.temperature ?? 1.0;

  const context = Array.from(promptBytes);

  for (let i = 0; i < maxTokens; i++) {
    const window = context.slice(Math.max(0, context.length - seqLen));
    const padded = new Array(seqLen).fill(0);
    const start = seqLen - window.length;
    for (let j = 0; j < window.length; j++) {
      padded[start + j] = window[j];
    }

    const input = tf.tensor2d([padded], [1, seqLen], 'int32');
    const logits = model.forward(input);
    const lastLogits = logits.slice([0, seqLen - 1, 0], [1, 1, model.config.vocabSize])
      .reshape([model.config.vocabSize]);
    const nextToken = sampleFromLogits(tf, lastLogits, temperature);

    context.push(nextToken);

    input.dispose();
    logits.dispose();
    lastLogits.dispose();
  }

  return Uint8Array.from(context.slice(promptBytes.length));
}
