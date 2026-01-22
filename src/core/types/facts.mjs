/**
 * Fact types for VSAVM
 * Per DS007: FactId, FactInstance, Polarity, ProvenanceLink
 */

import { 
  symbolIdToString,
  entityIdToString,
  scopeIdToString,
  parseSymbolId,
  parseEntityId,
  parseScopeId,
  parseSourceId
} from './identifiers.mjs';
import { termToString } from './terms.mjs';
import { sha256Truncate, base64urlEncode, base64urlDecode, crc32, crc32Bytes } from '../hash.mjs';
import { 
  resolveCanonicalizationOptions,
  canonicalizeText,
  canonicalizeTerm,
  canonicalizeTimeRef,
  canonicalizeSymbolId,
  serializeCanonicalTerm
} from '../canonicalization/canonicalize.mjs';

/**
 * Polarity enum
 */
export const Polarity = {
  ASSERT: 'assert',
  DENY: 'deny'
};

/**
 * Create a ProvenanceLink
 * @param {{type: string, id: string}} sourceId
 * @param {Object} [options]
 * @param {{start: number, end: number}} [options.eventSpan]
 * @param {string} [options.extractorId]
 * @param {number} [options.timestamp]
 * @returns {Object}
 */
export function createProvenanceLink(sourceId, options = {}) {
  const link = {
    sourceId,
    timestamp: options.timestamp ?? (options.deterministicTime ? 0 : Date.now())
  };
  if (options.eventSpan) link.eventSpan = options.eventSpan;
  if (options.extractorId) link.extractorId = options.extractorId;
  return link;
}

/**
 * Compute FactId from fact components (per DS007)
 * @param {{namespace: string, name: string}} predicate
 * @param {Map<string, Object>} args - slot name → Term
 * @param {Map<string, Object>} [qualifiers] - excluding time, scope, provenance
 * @param {Object} [canonicalization] - Canonicalization options (DS007)
 * @returns {string} Base64url encoded FactId
 */
export function computeFactId(predicate, args, qualifiers = new Map(), canonicalization = undefined) {
  const opts = resolveCanonicalizationOptions(canonicalization);

  // Step 1: Canonicalize + hash predicate (truncate SHA-256 to 16 bytes)
  const canonicalPredicate = canonicalizeSymbolId(predicate, opts);
  const predSerialized = symbolIdToString(canonicalPredicate);
  const predHash = sha256Truncate(predSerialized, 16);

  // Step 2: Canonicalize + sort arguments, then hash
  const argPairs = [...args.entries()].map(([slotName, slotValue]) => ([
    canonicalizeText(slotName, opts),
    canonicalizeTerm(slotValue, opts)
  ]));
  argPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const argsSerialized = JSON.stringify(argPairs.map(([k, v]) => [k, serializeCanonicalTerm(v, opts)]));
  const argsHash = sha256Truncate(argsSerialized, 16);

  // Step 3: Canonicalize qualifiers (exclude provenance, time, scope, confidence), then hash
  const excluded = new Set(['time', 'scope', 'provenance', 'confidence']);
  const qualPairs = [...qualifiers.entries()]
    .map(([k, v]) => [canonicalizeText(k, opts), v])
    .filter(([k]) => !excluded.has(k))
    .map(([k, v]) => [k, canonicalizeTerm(v, opts)]);
  qualPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const qualsSerialized = JSON.stringify(qualPairs.map(([k, v]) => [k, serializeCanonicalTerm(v, opts)]));
  const qualsHash = sha256Truncate(qualsSerialized, 16);

  // Step 4: Concatenate and base64url encode (48 bytes total)
  const factIdBytes = new Uint8Array(48);
  factIdBytes.set(predHash, 0);
  factIdBytes.set(argsHash, 16);
  factIdBytes.set(qualsHash, 32);

  return base64urlEncode(factIdBytes);
}

/**
 * Decode a FactId (base64url) to raw bytes
 * @param {string} factId
 * @returns {Uint8Array}
 */
export function factIdToBytes(factId) {
  return base64urlDecode(factId);
}

/**
 * Create a FactInstance
 * @param {{namespace: string, name: string}} predicate
 * @param {Object<string, Object>} args - slot name → Term
 * @param {Object} options
 * @param {string} [options.polarity='assert']
 * @param {{path: string[]}} options.scopeId
 * @param {Object} [options.time]
 * @param {number} [options.confidence]
 * @param {Array} options.provenance
 * @param {Object<string, Object>} [options.qualifiers]
 * @returns {Object}
 */
export function createFactInstance(predicate, args, options) {
  const argsMap = args instanceof Map ? args : new Map(Object.entries(args));
  const qualifiersMap = options.qualifiers 
    ? (options.qualifiers instanceof Map ? options.qualifiers : new Map(Object.entries(options.qualifiers)))
    : new Map();
  
  const canonicalization = options.canonicalization ?? options.canonicalizer?.options;
  const canonOpts = resolveCanonicalizationOptions(canonicalization);

  // Canonicalize predicate/args/qualifiers before hashing and storage (DS007/DS008).
  const canonicalPredicate = canonicalizeSymbolId(predicate, canonOpts);

  const canonicalArgPairs = [...argsMap.entries()].map(([k, v]) => ([
    canonicalizeText(k, canonOpts),
    canonicalizeTerm(v, canonOpts)
  ]));
  canonicalArgPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalArgsMap = new Map(canonicalArgPairs);

  const canonicalQualPairs = [...qualifiersMap.entries()].map(([k, v]) => ([
    canonicalizeText(k, canonOpts),
    canonicalizeTerm(v, canonOpts)
  ]));
  canonicalQualPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalQualifiersMap = new Map(canonicalQualPairs);

  const factId = computeFactId(canonicalPredicate, canonicalArgsMap, canonicalQualifiersMap, canonOpts);
  
  const fact = {
    factId,
    predicate: canonicalPredicate,
    arguments: canonicalArgsMap,
    polarity: options.polarity ?? Polarity.ASSERT,
    scopeId: options.scopeId,
    provenance: options.provenance
  };
  
  if (options.time !== undefined) fact.time = canonicalizeTimeRef(options.time, canonOpts);
  if (options.confidence !== undefined) fact.confidence = options.confidence;
  if (canonicalQualifiersMap.size > 0) fact.qualifiers = canonicalQualifiersMap;
  
  return fact;
}

/**
 * Get string representation of a fact
 * @param {Object} fact
 * @returns {string}
 */
export function factToString(fact) {
  const polaritySign = fact.polarity === Polarity.DENY ? '~' : '';
  const predStr = symbolIdToString(fact.predicate);
  
  const argStrs = [];
  for (const [name, term] of fact.arguments) {
    argStrs.push(`${name}: ${termToString(term)}`);
  }
  argStrs.sort();
  
  return `${polaritySign}${predStr}(${argStrs.join(', ')})`;
}

/**
 * Check if two facts have the same identity (same factId)
 * @param {Object} factA
 * @param {Object} factB
 * @returns {boolean}
 */
export function factsHaveSameId(factA, factB) {
  return factA.factId === factB.factId;
}

/**
 * Check if two facts are in direct conflict (same id, opposite polarity)
 * @param {Object} factA
 * @param {Object} factB
 * @returns {boolean}
 */
export function factsConflict(factA, factB) {
  return factsHaveSameId(factA, factB) && factA.polarity !== factB.polarity;
}

/**
 * Clone a fact with optional modifications
 * @param {Object} fact
 * @param {Object} [modifications]
 * @returns {Object}
 */
export function cloneFact(fact, modifications = {}) {
  return {
    ...fact,
    arguments: new Map(fact.arguments),
    qualifiers: fact.qualifiers ? new Map(fact.qualifiers) : undefined,
    provenance: [...fact.provenance],
    ...modifications
  };
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Serialize a FactInstance to deterministic JSON.
 * @param {Object} fact
 * @returns {string}
 */
export function serializeFactInstance(fact) {
  const args = [...fact.arguments.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => [k, serializeCanonicalTerm(v)]);

  const qualifiers = fact.qualifiers
    ? [...fact.qualifiers.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => [k, serializeCanonicalTerm(v)])
    : [];

  const payload = {
    factId: fact.factId,
    predicate: symbolIdToString(fact.predicate),
    polarity: fact.polarity,
    scopeId: fact.scopeId,
    time: fact.time ?? null,
    confidence: fact.confidence ?? null,
    arguments: args,
    qualifiers,
    provenance: fact.provenance ?? []
  };

  return stableStringify(payload);
}

/**
 * Serialize a list of FactInstances to deterministic JSON.
 * @param {Object[]} facts
 * @returns {string}
 */
export function serializeFactInstances(facts) {
  return `[${(facts ?? []).map(serializeFactInstance).join(',')}]`;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const ATOM_TYPE_CODES = {
  string: 0x01,
  number: 0x02,
  integer: 0x03,
  boolean: 0x04,
  time: 0x05,
  entity: 0x06,
  symbol: 0x07,
  null: 0x08
};

const ATOM_TYPE_FROM_CODE = Object.fromEntries(
  Object.entries(ATOM_TYPE_CODES).map(([key, value]) => [value, key])
);

const TIME_TYPE_CODES = {
  instant: 0x01,
  interval: 0x02,
  relative: 0x03,
  unknown: 0x04
};

const TIME_TYPE_FROM_CODE = Object.fromEntries(
  Object.entries(TIME_TYPE_CODES).map(([key, value]) => [value, key])
);

const PRECISION_CODES = {
  ms: 0x01,
  second: 0x02,
  minute: 0x03,
  hour: 0x04,
  day: 0x05,
  month: 0x06,
  year: 0x07
};

const PRECISION_FROM_CODE = Object.fromEntries(
  Object.entries(PRECISION_CODES).map(([key, value]) => [value, key])
);

class ByteWriter {
  constructor() {
    this.chunks = [];
  }

  pushBytes(bytes) {
    this.chunks.push(bytes);
  }

  pushU8(value) {
    this.chunks.push(Uint8Array.of(value & 0xff));
  }

  pushU16(value) {
    this.chunks.push(Uint8Array.of(value & 0xff, (value >>> 8) & 0xff));
  }

  pushU32(value) {
    this.chunks.push(Uint8Array.of(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    ));
  }

  pushI64(value) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigInt64(0, BigInt(value ?? 0), true);
    this.chunks.push(new Uint8Array(buffer));
  }

  pushF64(value) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, Number(value ?? 0), true);
    this.chunks.push(new Uint8Array(buffer));
  }

  pushString(value) {
    const bytes = textEncoder.encode(String(value ?? ''));
    if (bytes.length > 0xffff) {
      throw new Error('String too long for binary serialization');
    }
    this.pushU16(bytes.length);
    this.chunks.push(bytes);
  }

  concat() {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

class ByteReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }

  readU8() {
    const value = this.bytes[this.offset];
    this.offset += 1;
    return value;
  }

  readU16() {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readU32() {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readI64() {
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readF64() {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readBytes(length) {
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readString() {
    const length = this.readU16();
    const bytes = this.readBytes(length);
    return textDecoder.decode(bytes);
  }
}

function encodeTimeRef(writer, timeRef) {
  const type = timeRef?.type ?? 'unknown';
  const typeCode = TIME_TYPE_CODES[type] ?? TIME_TYPE_CODES.unknown;
  writer.pushU8(typeCode);
  const precision = timeRef?.precision ?? 'second';
  writer.pushU8(PRECISION_CODES[precision] ?? PRECISION_CODES.second);

  if (type === 'instant') {
    writer.pushI64(timeRef.instant ?? 0);
    return;
  }
  if (type === 'interval') {
    const hasStart = timeRef.start !== undefined && timeRef.start !== null;
    const hasEnd = timeRef.end !== undefined && timeRef.end !== null;
    writer.pushU8(hasStart ? 1 : 0);
    if (hasStart) writer.pushI64(timeRef.start);
    writer.pushU8(hasEnd ? 1 : 0);
    if (hasEnd) writer.pushI64(timeRef.end);
    return;
  }
  if (type === 'relative') {
    const hasAnchor = timeRef.anchor !== undefined && timeRef.anchor !== null;
    const hasOffset = timeRef.offset !== undefined && timeRef.offset !== null;
    writer.pushU8(hasAnchor ? 1 : 0);
    if (hasAnchor) writer.pushString(timeRef.anchor);
    writer.pushU8(hasOffset ? 1 : 0);
    if (hasOffset) writer.pushI64(timeRef.offset);
  }
}

function decodeTimeRef(reader) {
  const typeCode = reader.readU8();
  const precisionCode = reader.readU8();
  const type = TIME_TYPE_FROM_CODE[typeCode] ?? 'unknown';
  const precision = PRECISION_FROM_CODE[precisionCode] ?? 'second';

  if (type === 'instant') {
    return { type, instant: Number(reader.readI64()), precision };
  }
  if (type === 'interval') {
    const hasStart = reader.readU8() === 1;
    const start = hasStart ? Number(reader.readI64()) : null;
    const hasEnd = reader.readU8() === 1;
    const end = hasEnd ? Number(reader.readI64()) : null;
    const timeRef = { type, precision };
    if (hasStart) timeRef.start = start;
    if (hasEnd) timeRef.end = end;
    return timeRef;
  }
  if (type === 'relative') {
    const hasAnchor = reader.readU8() === 1;
    const anchor = hasAnchor ? reader.readString() : undefined;
    const hasOffset = reader.readU8() === 1;
    const offset = hasOffset ? Number(reader.readI64()) : undefined;
    const timeRef = { type, precision };
    if (hasAnchor) timeRef.anchor = anchor;
    if (hasOffset) timeRef.offset = offset;
    return timeRef;
  }
  return { type, precision };
}

function encodeTermBinary(writer, term) {
  if (!term || typeof term !== 'object') {
    writer.pushU8(0x01);
    writer.pushU8(ATOM_TYPE_CODES.null);
    return;
  }

  if (term.type) {
    writer.pushU8(0x01);
    const typeCode = ATOM_TYPE_CODES[term.type] ?? ATOM_TYPE_CODES.string;
    writer.pushU8(typeCode);

    switch (term.type) {
      case 'string':
        writer.pushString(term.value ?? '');
        return;
      case 'number':
        writer.pushF64(term.value ?? 0);
        return;
      case 'integer':
        writer.pushI64(term.value ?? 0);
        return;
      case 'boolean':
        writer.pushU8(term.value ? 1 : 0);
        return;
      case 'time':
        encodeTimeRef(writer, term.value ?? { type: 'unknown' });
        return;
      case 'entity':
        if (!term.value) {
          writer.pushString('');
        } else if (typeof term.value === 'string') {
          writer.pushString(term.value);
        } else {
          writer.pushString(entityIdToString(term.value));
        }
        return;
      case 'symbol':
        if (!term.value) {
          writer.pushString('');
        } else if (typeof term.value === 'string') {
          writer.pushString(term.value);
        } else {
          writer.pushString(symbolIdToString(term.value));
        }
        return;
      case 'null':
        return;
      default:
        writer.pushString(String(term.value ?? ''));
        return;
    }
  }

  if (term.structType && term.slots instanceof Map) {
    writer.pushU8(0x02);
    writer.pushString(symbolIdToString(term.structType));
    const entries = [...term.slots.entries()];
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    writer.pushU16(entries.length);
    for (const [name, value] of entries) {
      writer.pushString(name);
      encodeTermBinary(writer, value);
    }
    return;
  }

  writer.pushU8(0x01);
  writer.pushU8(ATOM_TYPE_CODES.string);
  writer.pushString(JSON.stringify(term));
}

function decodeTermBinary(reader) {
  const discriminator = reader.readU8();
  if (discriminator === 0x02) {
    const structType = parseSymbolId(reader.readString());
    const slotCount = reader.readU16();
    const slots = new Map();
    for (let i = 0; i < slotCount; i++) {
      const name = reader.readString();
      const value = decodeTermBinary(reader);
      slots.set(name, value);
    }
    return { structType, slots };
  }

  const atomTypeCode = reader.readU8();
  const atomType = ATOM_TYPE_FROM_CODE[atomTypeCode] ?? 'string';
  switch (atomType) {
    case 'string':
      return { type: 'string', value: reader.readString() };
    case 'number':
      return { type: 'number', value: reader.readF64() };
    case 'integer':
      return { type: 'integer', value: Number(reader.readI64()) };
    case 'boolean':
      return { type: 'boolean', value: reader.readU8() === 1 };
    case 'time':
      return { type: 'time', value: decodeTimeRef(reader) };
    case 'entity':
      return { type: 'entity', value: parseEntityId(reader.readString()) };
    case 'symbol':
      return { type: 'symbol', value: parseSymbolId(reader.readString()) };
    case 'null':
      return { type: 'null', value: null };
    default:
      return { type: 'string', value: reader.readString() };
  }
}

/**
 * Serialize a FactInstance to binary format (DS007).
 * @param {Object} fact
 * @returns {Uint8Array}
 */
export function serializeFactInstanceBinary(fact) {
  const writer = new ByteWriter();
  writer.pushBytes(textEncoder.encode('FACT'));
  writer.pushU16(1);

  const flags = {
    hasTime: fact.time !== undefined,
    hasConfidence: fact.confidence !== undefined,
    hasQualifiers: fact.qualifiers && fact.qualifiers.size > 0
  };
  const flagBits = (flags.hasTime ? 1 : 0) |
    (flags.hasConfidence ? 2 : 0) |
    (flags.hasQualifiers ? 4 : 0);
  writer.pushU16(flagBits);

  const factIdBytes = factIdToBytes(fact.factId);
  if (factIdBytes.length !== 48) {
    throw new Error('FactId must be 48 bytes');
  }
  writer.pushBytes(factIdBytes);

  writer.pushString(symbolIdToString(fact.predicate));

  const argEntries = [...fact.arguments.entries()];
  argEntries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  writer.pushU16(argEntries.length);
  for (const [name, value] of argEntries) {
    writer.pushString(name);
    encodeTermBinary(writer, value);
  }

  const polarityByte = fact.polarity === Polarity.DENY ? 0x02 : 0x01;
  writer.pushU8(polarityByte);
  writer.pushString(scopeIdToString(fact.scopeId));

  if (flags.hasTime) {
    encodeTimeRef(writer, fact.time);
  }
  if (flags.hasConfidence) {
    writer.pushF64(fact.confidence);
  }

  const provenance = fact.provenance ?? [];
  writer.pushU16(provenance.length);
  for (const link of provenance) {
    writer.pushString(link.sourceId ? `${link.sourceId.type}:${link.sourceId.id}` : '');
    const hasSpan = link.eventSpan?.start !== undefined && link.eventSpan?.end !== undefined;
    writer.pushU8(hasSpan ? 1 : 0);
    if (hasSpan) {
      writer.pushU32(link.eventSpan.start >>> 0);
      writer.pushU32(link.eventSpan.end >>> 0);
    }
    const hasExtractor = link.extractorId !== undefined && link.extractorId !== null;
    writer.pushU8(hasExtractor ? 1 : 0);
    if (hasExtractor) {
      writer.pushString(link.extractorId);
    }
    writer.pushI64(link.timestamp ?? 0);
  }

  if (flags.hasQualifiers) {
    const qualEntries = [...fact.qualifiers.entries()];
    qualEntries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    writer.pushU16(qualEntries.length);
    for (const [name, value] of qualEntries) {
      writer.pushString(name);
      encodeTermBinary(writer, value);
    }
  } else {
    writer.pushU16(0);
  }

  const payload = writer.concat();
  const crc = crc32Bytes(payload);
  return new Uint8Array([...payload, ...crc]);
}

/**
 * Deserialize a FactInstance from binary format (DS007).
 * @param {Uint8Array} bytes
 * @returns {Object}
 */
export function deserializeFactInstanceBinary(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.length < 56) {
    throw new Error('Invalid fact binary length');
  }

  const payload = buffer.slice(0, buffer.length - 4);
  const crcExpected = new DataView(buffer.buffer, buffer.byteOffset + buffer.length - 4, 4).getUint32(0, true);
  const crcActual = crc32(payload);
  if (crcExpected !== crcActual) {
    throw new Error('Fact CRC32 mismatch');
  }

  const reader = new ByteReader(payload);
  const magic = textDecoder.decode(reader.readBytes(4));
  if (magic !== 'FACT') {
    throw new Error('Invalid fact magic');
  }

  const version = reader.readU16();
  if (version !== 1) {
    throw new Error(`Unsupported fact version ${version}`);
  }

  const flags = reader.readU16();
  const hasTime = (flags & 1) !== 0;
  const hasConfidence = (flags & 2) !== 0;
  const hasQualifiers = (flags & 4) !== 0;

  const factIdBytes = reader.readBytes(48);
  const factId = base64urlEncode(factIdBytes);
  const predicate = parseSymbolId(reader.readString());

  const argCount = reader.readU16();
  const args = new Map();
  for (let i = 0; i < argCount; i++) {
    const name = reader.readString();
    const value = decodeTermBinary(reader);
    args.set(name, value);
  }

  const polarity = reader.readU8() === 0x02 ? Polarity.DENY : Polarity.ASSERT;
  const scopeId = parseScopeId(reader.readString());

  let time;
  if (hasTime) {
    time = decodeTimeRef(reader);
  }

  let confidence;
  if (hasConfidence) {
    confidence = reader.readF64();
  }

  const provenanceCount = reader.readU16();
  const provenance = [];
  for (let i = 0; i < provenanceCount; i++) {
    const sourceId = parseSourceId(reader.readString());
    const hasSpan = reader.readU8() === 1;
    let eventSpan;
    if (hasSpan) {
      eventSpan = { start: reader.readU32(), end: reader.readU32() };
    }
    const hasExtractor = reader.readU8() === 1;
    let extractorId;
    if (hasExtractor) {
      extractorId = reader.readString();
    }
    const timestamp = Number(reader.readI64());
    const link = { sourceId, timestamp };
    if (eventSpan) link.eventSpan = eventSpan;
    if (extractorId) link.extractorId = extractorId;
    provenance.push(link);
  }

  let qualifiers;
  const qualCount = reader.readU16();
  if (hasQualifiers && qualCount > 0) {
    qualifiers = new Map();
    for (let i = 0; i < qualCount; i++) {
      const name = reader.readString();
      const value = decodeTermBinary(reader);
      qualifiers.set(name, value);
    }
  }

  const fact = {
    factId,
    predicate,
    arguments: args,
    polarity,
    scopeId,
    provenance
  };
  if (time !== undefined) fact.time = time;
  if (confidence !== undefined) fact.confidence = confidence;
  if (qualifiers) fact.qualifiers = qualifiers;

  return fact;
}
