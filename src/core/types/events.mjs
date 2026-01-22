/**
 * Event types for VSAVM
 * Per DS007: Event, EventType, EventPayload
 */

import { crc32, crc32Bytes } from '../hash.mjs';

/**
 * Event types enum
 */
export const EventType = {
  TEXT_TOKEN: 'text_token',
  VISUAL_TOKEN: 'visual_token',
  AUDIO_TOKEN: 'audio_token',
  TIMESTAMP: 'timestamp',
  SEPARATOR: 'separator',
  HEADER: 'header',
  LIST_ITEM: 'list_item',
  QUOTE: 'quote',
  TABLE_CELL: 'table_cell',
  FORMULA: 'formula',
  CODE_BLOCK: 'code_block',
  METADATA: 'metadata'
};

/**
 * Separator levels
 */
export const SeparatorLevel = {
  DOCUMENT: 'document',
  SECTION: 'section',
  PARAGRAPH: 'paragraph',
  SENTENCE: 'sentence',
  PHRASE: 'phrase'
};

/**
 * Time roles
 */
export const TimeRole = {
  EVENT_TIME: 'event_time',
  REFERENCE_TIME: 'reference_time',
  SPEECH_TIME: 'speech_time'
};

/**
 * Create an Event
 * @param {number} eventId - Sequential within stream
 * @param {string} type - EventType value
 * @param {Object} payload - Type-specific payload
 * @param {string[]} contextPath - Scope derivation path
 * @param {Object} [sourceRef] - Link to raw input
 * @returns {Object}
 */
export function createEvent(eventId, type, payload, contextPath, sourceRef = undefined) {
  const event = {
    eventId,
    type,
    payload,
    contextPath
  };
  if (sourceRef) event.sourceRef = sourceRef;
  return event;
}

/**
 * Normalize a context path into a string array.
 * @param {string[]|string} path
 * @returns {string[]}
 */
export function normalizeContextPath(path) {
  if (!path) return [];
  if (Array.isArray(path)) return path.map(p => String(p));
  return [String(path)];
}

/**
 * Normalize an event object for serialization.
 * @param {Object} event
 * @returns {Object}
 */
export function normalizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return createEvent(0, EventType.METADATA, { value: null }, []);
  }

  return createEvent(
    event.eventId ?? 0,
    event.type ?? EventType.METADATA,
    event.payload ?? null,
    normalizeContextPath(event.contextPath ?? event.context_path ?? [])
  );
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
 * Serialize an event to deterministic JSON.
 * @param {Object} event
 * @returns {string}
 */
export function serializeEvent(event) {
  const normalized = normalizeEvent(event);
  return stableStringify(normalized);
}

/**
 * Deserialize a serialized event.
 * @param {string} json
 * @returns {Object}
 */
export function deserializeEvent(json) {
  return normalizeEvent(JSON.parse(json));
}

/**
 * Serialize an event stream to deterministic JSON.
 * @param {Object[]|EventStream} events
 * @returns {string}
 */
export function serializeEventStream(events) {
  const list = Array.isArray(events) ? events : (events?.events ?? []);
  return `[${list.map(serializeEvent).join(',')}]`;
}

/**
 * Deserialize an event stream from JSON.
 * @param {string} json
 * @returns {Object[]}
 */
export function deserializeEventStream(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeEvent);
}

/**
 * Create a text token payload
 * @param {string} token - Normalized token text
 * @param {Object} [options]
 * @param {string} [options.originalForm]
 * @param {string} [options.pos] - Part of speech tag
 * @returns {Object}
 */
export function createTextTokenPayload(token, options = {}) {
  const payload = { token };
  if (options.originalForm) payload.originalForm = options.originalForm;
  if (options.pos) payload.pos = options.pos;
  return payload;
}

/**
 * Create a separator payload
 * @param {string} level - SeparatorLevel value
 * @param {string} [label]
 * @returns {Object}
 */
export function createSeparatorPayload(level, label = undefined) {
  const payload = { level };
  if (label) payload.label = label;
  return payload;
}

/**
 * Create a timestamp payload
 * @param {Object} time - TimeRef
 * @param {string} role - TimeRole value
 * @returns {Object}
 */
export function createTimestampPayload(time, role) {
  return { time, role };
}

/**
 * Create a header payload
 * @param {number} level - 1-6
 * @param {string} text
 * @returns {Object}
 */
export function createHeaderPayload(level, text) {
  return { level, text };
}

/**
 * Create a SourceRef
 * @param {{type: string, id: string}} sourceId
 * @param {Object} [options]
 * @returns {Object}
 */
export function createSourceRef(sourceId, options = {}) {
  const ref = { sourceId };
  if (options.byteOffset !== undefined) ref.byteOffset = options.byteOffset;
  if (options.charOffset !== undefined) ref.charOffset = options.charOffset;
  if (options.timestamp !== undefined) ref.timestamp = options.timestamp;
  return ref;
}

/**
 * EventStream class for iterating over events
 */
export class EventStream {
  /**
   * @param {Object} [options]
   * @param {{type: string, id: string}} [options.sourceId]
   * @param {Object} [options.metadata]
   */
  constructor(options = {}) {
    this.events = [];
    this.nextId = 0;
    this.sourceId = options.sourceId;
    this.metadata = options.metadata || {};
    this.currentContextPath = [];
  }

  /**
   * Push an event to the stream
   * @param {string} type
   * @param {Object} payload
   * @param {string[]} [contextPath]
   * @returns {Object} The created event
   */
  push(type, payload, contextPath = undefined) {
    const event = createEvent(
      this.nextId++,
      type,
      payload,
      contextPath ?? [...this.currentContextPath],
      this.sourceId ? createSourceRef(this.sourceId) : undefined
    );
    this.events.push(event);
    return event;
  }

  /**
   * Push a context level
   * @param {string} segment
   */
  pushContext(segment) {
    this.currentContextPath.push(segment);
  }

  /**
   * Pop a context level
   * @returns {string|undefined}
   */
  popContext() {
    return this.currentContextPath.pop();
  }

  /**
   * Get number of events
   * @returns {number}
   */
  get length() {
    return this.events.length;
  }

  /**
   * Iterate over events
   * @returns {Iterator}
   */
  [Symbol.iterator]() {
    return this.events[Symbol.iterator]();
  }

  /**
   * Get event by index
   * @param {number} index
   * @returns {Object|undefined}
   */
  get(index) {
    return this.events[index];
  }

  /**
   * Get events in range
   * @param {number} start
   * @param {number} end
   * @returns {Object[]}
   */
  slice(start, end) {
    return this.events.slice(start, end);
  }

  /**
   * Filter events by type
   * @param {string|string[]} types
   * @returns {Object[]}
   */
  filterByType(types) {
    const typeSet = new Set(Array.isArray(types) ? types : [types]);
    return this.events.filter(e => typeSet.has(e.type));
  }

  /**
   * Get events at or under a context path
   * @param {string[]} path
   * @returns {Object[]}
   */
  filterByContext(path) {
    return this.events.filter(e => {
      if (e.contextPath.length < path.length) return false;
      for (let i = 0; i < path.length; i++) {
        if (e.contextPath[i] !== path[i]) return false;
      }
      return true;
    });
  }

  /**
   * Serialize stream to deterministic JSON string.
   * @returns {string}
   */
  serialize() {
    return serializeEventStream(this.events);
  }

  /**
   * Serialize stream to binary format.
   * @returns {Uint8Array}
   */
  serializeBinary() {
    return serializeEventStreamBinary(this.events, { metadata: this.metadata });
  }
}

const EVENT_TYPE_CODES = {
  [EventType.METADATA]: 0,
  [EventType.TEXT_TOKEN]: 1,
  [EventType.VISUAL_TOKEN]: 2,
  [EventType.AUDIO_TOKEN]: 3,
  [EventType.TIMESTAMP]: 4,
  [EventType.SEPARATOR]: 5,
  [EventType.HEADER]: 6,
  [EventType.LIST_ITEM]: 7,
  [EventType.QUOTE]: 8,
  [EventType.TABLE_CELL]: 9,
  [EventType.FORMULA]: 10,
  [EventType.CODE_BLOCK]: 11
};

const EVENT_TYPE_FROM_CODE = Object.fromEntries(
  Object.entries(EVENT_TYPE_CODES).map(([key, value]) => [value, key])
);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeString(value) {
  return textEncoder.encode(String(value ?? ''));
}

function decodeString(bytes) {
  return textDecoder.decode(bytes);
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

/**
 * Serialize event stream to binary format (DS007).
 * @param {Object[]|EventStream} events
 * @param {Object} [options]
 * @param {Object} [options.metadata]
 * @returns {Uint8Array}
 */
export function serializeEventStreamBinary(events, options = {}) {
  const list = Array.isArray(events) ? events : (events?.events ?? []);
  const metadata = options.metadata ?? events?.metadata ?? {};
  const metadataBytes = encodeString(stableStringify(metadata));

  const chunks = [];
  chunks.push(encodeString('EVTS'));
  chunks.push(uint16LE(1));
  chunks.push(uint32LE(list.length));

  for (const rawEvent of list) {
    const event = normalizeEvent(rawEvent);
    const typeCode = EVENT_TYPE_CODES[event.type] ?? EVENT_TYPE_CODES[EventType.METADATA];
    const context = normalizeContextPath(event.contextPath);

    const payloadBytes = encodeString(stableStringify(event.payload ?? null));
    if (payloadBytes.length > 0xffff) {
      throw new Error('Event payload too large for binary format');
    }

    chunks.push(uint32LE(event.eventId >>> 0));
    chunks.push(Uint8Array.of(typeCode));
    if (context.length > 0xff) {
      throw new Error('Context path depth exceeds 255');
    }
    chunks.push(Uint8Array.of(context.length));

    for (const segment of context) {
      const segmentBytes = encodeString(segment);
      if (segmentBytes.length > 0xff) {
        throw new Error('Context path segment exceeds 255 bytes');
      }
      chunks.push(Uint8Array.of(segmentBytes.length));
      chunks.push(segmentBytes);
    }

    chunks.push(uint16LE(payloadBytes.length));
    chunks.push(payloadBytes);

    if (event.sourceRef) {
      const sourceBytes = encodeString(stableStringify(event.sourceRef));
      if (sourceBytes.length > 0xffff) {
        throw new Error('SourceRef too large for binary format');
      }
      chunks.push(Uint8Array.of(1));
      chunks.push(uint16LE(sourceBytes.length));
      chunks.push(sourceBytes);
    } else {
      chunks.push(Uint8Array.of(0));
    }
  }

  chunks.push(uint32LE(metadataBytes.length));
  chunks.push(metadataBytes);

  const body = concatBytes(chunks);
  const crc = crc32Bytes(body);
  return concatBytes([body, crc]);
}

/**
 * Deserialize event stream from binary format (DS007).
 * @param {Uint8Array} bytes
 * @returns {{events: Object[], metadata: Object}}
 */
export function deserializeEventStreamBinary(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.length < 14) {
    throw new Error('Invalid event stream binary length');
  }

  const payload = buffer.slice(0, buffer.length - 4);
  const crcExpected = new DataView(buffer.buffer, buffer.byteOffset + buffer.length - 4, 4).getUint32(0, true);
  const crcActual = crc32(payload);
  if (crcExpected !== crcActual) {
    throw new Error('Event stream CRC32 mismatch');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;
  const magic = decodeString(payload.slice(offset, offset + 4));
  offset += 4;
  if (magic !== 'EVTS') {
    throw new Error('Invalid event stream magic');
  }

  const version = view.getUint16(offset, true);
  offset += 2;
  if (version !== 1) {
    throw new Error(`Unsupported event stream version ${version}`);
  }

  const count = view.getUint32(offset, true);
  offset += 4;
  const events = [];

  for (let i = 0; i < count; i++) {
    const eventId = view.getUint32(offset, true);
    offset += 4;
    const typeCode = payload[offset];
    offset += 1;
    const contextDepth = payload[offset];
    offset += 1;
    const contextPath = [];

    for (let d = 0; d < contextDepth; d++) {
      const segLen = payload[offset];
      offset += 1;
      const segBytes = payload.slice(offset, offset + segLen);
      offset += segLen;
      contextPath.push(decodeString(segBytes));
    }

    const payloadLen = view.getUint16(offset, true);
    offset += 2;
    const payloadBytes = payload.slice(offset, offset + payloadLen);
    offset += payloadLen;
    const eventPayload = JSON.parse(decodeString(payloadBytes));

    const hasSource = payload[offset] === 1;
    offset += 1;
    let sourceRef = undefined;
    if (hasSource) {
      const sourceLen = view.getUint16(offset, true);
      offset += 2;
      const sourceBytes = payload.slice(offset, offset + sourceLen);
      offset += sourceLen;
      sourceRef = JSON.parse(decodeString(sourceBytes));
    }

    events.push(createEvent(
      eventId,
      EVENT_TYPE_FROM_CODE[typeCode] ?? EventType.METADATA,
      eventPayload,
      contextPath,
      sourceRef
    ));
  }

  const metadataLen = view.getUint32(offset, true);
  offset += 4;
  const metadataBytes = payload.slice(offset, offset + metadataLen);
  const metadata = metadataLen > 0 ? JSON.parse(decodeString(metadataBytes)) : {};

  return { events, metadata };
}
