/**
 * Event types for VSAVM
 * Per DS007: Event, EventType, EventPayload
 */

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
}
