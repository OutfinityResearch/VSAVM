/**
 * Hypervector serialization helpers
 * Per DS007: HVEC binary format with CRC32
 */

import { crc32, crc32Bytes } from '../core/hash.mjs';

const ENCODING_CODES = {
  binary: 0x01,
  bipolar: 0x02,
  float: 0x03
};

const ENCODING_FROM_CODE = {
  0x01: 'binary',
  0x02: 'bipolar',
  0x03: 'float'
};

const textEncoder = new TextEncoder();

function encodeString(value) {
  return textEncoder.encode(String(value ?? ''));
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function uint16LE(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32LE(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);
}

function toFloatData(vector, dimensions) {
  if (vector.data instanceof Float32Array) {
    return vector.data;
  }
  const arr = Array.isArray(vector.data) ? vector.data : Array.from(vector.data ?? []);
  const out = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    out[i] = Number(arr[i] ?? 0);
  }
  return out;
}

function toBipolarData(vector, dimensions) {
  const arr = vector.data instanceof Float32Array
    ? vector.data
    : Array.isArray(vector.data)
      ? vector.data
      : Array.from(vector.data ?? []);
  const out = new Uint8Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    const value = Number(arr[i] ?? 0);
    out[i] = value >= 0 ? 0x01 : 0xff;
  }
  return out;
}

function toBinaryData(vector, dimensions) {
  const arr = vector.data instanceof Uint8Array
    ? vector.data
    : Array.isArray(vector.data)
      ? vector.data
      : Array.from(vector.data ?? []);
  const byteLength = Math.ceil(dimensions / 8);
  const out = new Uint8Array(byteLength);
  for (let i = 0; i < dimensions; i++) {
    const bit = Number(arr[i] ?? 0) > 0 ? 1 : 0;
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    if (bit) {
      out[byteIndex] |= 1 << bitIndex;
    }
  }
  return out;
}

/**
 * Serialize a HyperVector to binary format.
 * @param {{dimensions: number, data: ArrayLike<number>|ArrayBuffer, encoding?: string}} vector
 * @param {Object} [options]
 * @param {'binary'|'bipolar'|'float'} [options.encoding]
 * @returns {Uint8Array}
 */
export function serializeHyperVector(vector, options = {}) {
  const dimensions = vector.dimensions ?? 0;
  if (!dimensions) {
    throw new Error('HyperVector dimensions are required for serialization');
  }

  const encoding = options.encoding ?? vector.encoding ?? 'float';
  const encodingCode = ENCODING_CODES[encoding];
  if (!encodingCode) {
    throw new Error(`Unsupported hypervector encoding: ${encoding}`);
  }

  let dataBytes;
  if (encoding === 'float') {
    const floats = toFloatData(vector, dimensions);
    dataBytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  } else if (encoding === 'bipolar') {
    dataBytes = toBipolarData(vector, dimensions);
  } else {
    dataBytes = toBinaryData(vector, dimensions);
  }

  const chunks = [];
  chunks.push(encodeString('HVEC'));
  chunks.push(uint16LE(1));
  chunks.push(uint32LE(dimensions >>> 0));
  chunks.push(Uint8Array.of(encodingCode));
  chunks.push(dataBytes);

  const body = concatBytes(chunks);
  const crc = crc32Bytes(body);
  return concatBytes([body, crc]);
}

/**
 * Deserialize a HyperVector from binary format.
 * @param {Uint8Array} bytes
 * @returns {{dimensions: number, encoding: string, data: Uint8Array|Float32Array}}
 */
export function deserializeHyperVector(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.length < 11) {
    throw new Error('Invalid hypervector binary length');
  }

  const payload = buffer.slice(0, buffer.length - 4);
  const crcExpected = new DataView(buffer.buffer, buffer.byteOffset + buffer.length - 4, 4).getUint32(0, true);
  const crcActual = crc32(payload);
  if (crcExpected !== crcActual) {
    throw new Error('Hypervector CRC32 mismatch');
  }

  let offset = 0;
  const magic = String.fromCharCode(...payload.slice(offset, offset + 4));
  offset += 4;
  if (magic !== 'HVEC') {
    throw new Error('Invalid hypervector magic');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const version = view.getUint16(offset, true);
  offset += 2;
  if (version !== 1) {
    throw new Error(`Unsupported hypervector version ${version}`);
  }

  const dimensions = view.getUint32(offset, true);
  offset += 4;
  const encodingCode = payload[offset];
  offset += 1;
  const encoding = ENCODING_FROM_CODE[encodingCode];
  if (!encoding) {
    throw new Error(`Unsupported hypervector encoding code ${encodingCode}`);
  }

  const dataBytes = payload.slice(offset);
  if (encoding === 'float') {
    const floats = new Float32Array(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength / 4);
    return { dimensions, encoding, data: floats };
  }

  return { dimensions, encoding, data: dataBytes };
}

export default {
  serializeHyperVector,
  deserializeHyperVector
};
