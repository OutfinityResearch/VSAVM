/**
 * Multimodal Adapter
 * Converts structured audio/visual inputs into event streams.
 */

import {
  EventStream,
  EventType,
  createTextTokenPayload,
  createTimestampPayload
} from '../../core/types/events.mjs';
import { createSourceId } from '../../core/types/identifiers.mjs';
import { createInstant, createInterval, TimePrecision } from '../../core/types/terms.mjs';
import { computeHash } from '../../core/hash.mjs';

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

function normalizeSourceId(sourceId, fallback) {
  if (sourceId) return createSourceId('document', sourceId);
  return createSourceId('document', fallback);
}

/**
 * Convert audio transcript segments into an event stream.
 * @param {Array} segments - [{ text, startMs, endMs, speakerId }]
 * @param {Object} [options]
 * @returns {EventStream}
 */
export function fromAudioTranscript(segments, options = {}) {
  const sourceId = normalizeSourceId(
    options.sourceId,
    `audio_${computeHash(stableStringify(segments))}`
  );
  const stream = new EventStream({ sourceId, metadata: options.metadata || {} });

  stream.pushContext('audio');

  segments.forEach((segment, index) => {
    stream.pushContext(`segment_${index}`);
    if (segment.speakerId) {
      stream.pushContext(`speaker_${segment.speakerId}`);
    }

    if (Number.isFinite(segment.startMs)) {
      stream.push(EventType.TIMESTAMP, createTimestampPayload(
        createInstant(segment.startMs, TimePrecision.MS),
        'event_time'
      ));
    }

    if (Number.isFinite(segment.startMs) || Number.isFinite(segment.endMs)) {
      const timeRef = createInterval(
        Number.isFinite(segment.startMs) ? segment.startMs : null,
        Number.isFinite(segment.endMs) ? segment.endMs : null,
        TimePrecision.MS
      );
      stream.push(EventType.TIMESTAMP, createTimestampPayload(timeRef, 'reference_time'));
    }

    const tokens = String(segment.text ?? '')
      .split(/\s+/)
      .filter(Boolean);

    tokens.forEach((token) => {
      stream.push(EventType.AUDIO_TOKEN, createTextTokenPayload(token));
    });

    if (segment.speakerId) {
      stream.popContext();
    }
    stream.popContext();
  });

  stream.popContext();
  return stream;
}

/**
 * Convert visual tokens into an event stream.
 * @param {Array} tokens - [{ token, frame, group }]
 * @param {Object} [options]
 * @returns {EventStream}
 */
export function fromVisualTokens(tokens, options = {}) {
  const sourceId = normalizeSourceId(
    options.sourceId,
    `visual_${computeHash(stableStringify(tokens))}`
  );
  const stream = new EventStream({ sourceId, metadata: options.metadata || {} });

  stream.pushContext('visual');

  tokens.forEach((item, index) => {
    if (item.frame !== undefined) {
      stream.pushContext(`frame_${item.frame}`);
    } else if (item.group !== undefined) {
      stream.pushContext(`group_${item.group}`);
    } else {
      stream.pushContext(`token_${index}`);
    }

    stream.push(EventType.VISUAL_TOKEN, {
      token: String(item.token ?? '')
    });

    stream.popContext();
  });

  stream.popContext();
  return stream;
}

/**
 * Convert video segments into an event stream.
 * @param {Array} segments - [{ tokens, startMs, endMs }]
 * @param {Object} [options]
 * @returns {EventStream}
 */
export function fromVideoSegments(segments, options = {}) {
  const sourceId = normalizeSourceId(
    options.sourceId,
    `video_${computeHash(stableStringify(segments))}`
  );
  const stream = new EventStream({ sourceId, metadata: options.metadata || {} });

  stream.pushContext('video');

  segments.forEach((segment, index) => {
    stream.pushContext(`segment_${index}`);

    const timeRef = createInterval(
      Number.isFinite(segment.startMs) ? segment.startMs : null,
      Number.isFinite(segment.endMs) ? segment.endMs : null,
      TimePrecision.MS
    );
    stream.push(EventType.TIMESTAMP, createTimestampPayload(timeRef, 'event_time'));

    const tokens = Array.isArray(segment.tokens) ? segment.tokens : [];
    tokens.forEach((token) => {
      stream.push(EventType.VISUAL_TOKEN, { token: String(token) });
    });

    stream.popContext();
  });

  stream.popContext();
  return stream;
}

export default {
  fromAudioTranscript,
  fromVisualTokens,
  fromVideoSegments
};
