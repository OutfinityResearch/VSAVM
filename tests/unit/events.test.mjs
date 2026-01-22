/**
 * Event serialization tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createEvent,
  serializeEvent,
  deserializeEvent,
  serializeEventStream,
  deserializeEventStream,
  serializeEventStreamBinary,
  deserializeEventStreamBinary,
  EventStream,
  createTextTokenPayload,
  EventType
} from '../../src/core/types/events.mjs';

describe('Event serialization', () => {
  it('roundtrips a single event', () => {
    const event = createEvent(1, 'text_token', { token: 'hello' }, ['doc', 'p0']);
    const json = serializeEvent(event);
    const restored = deserializeEvent(json);

    assert.strictEqual(restored.eventId, 1);
    assert.strictEqual(restored.type, 'text_token');
    assert.deepEqual(restored.contextPath, ['doc', 'p0']);
  });

  it('roundtrips an event stream', () => {
    const events = [
      createEvent(0, 'text_token', { token: 'a' }, ['doc']),
      createEvent(1, 'text_token', { token: 'b' }, ['doc'])
    ];
    const json = serializeEventStream(events);
    const restored = deserializeEventStream(json);

    assert.strictEqual(restored.length, 2);
    assert.strictEqual(restored[1].eventId, 1);
    assert.strictEqual(restored[1].payload.token, 'b');
  });

  it('roundtrips event stream binary format', () => {
    const events = [
      createEvent(0, 'text_token', { token: 'alpha' }, ['doc', 'p0']),
      createEvent(1, 'text_token', { token: 'beta' }, ['doc', 'p0'])
    ];

    const binary = serializeEventStreamBinary(events, { metadata: { source: 'unit' } });
    const restored = deserializeEventStreamBinary(binary);

    assert.strictEqual(restored.events.length, 2);
    assert.strictEqual(restored.events[0].eventId, 0);
    assert.strictEqual(restored.events[1].payload.token, 'beta');
    assert.strictEqual(restored.metadata.source, 'unit');
  });

  it('serializes EventStream to binary', () => {
    const stream = new EventStream({ metadata: { mode: 'unit' } });
    stream.push(EventType.TEXT_TOKEN, createTextTokenPayload('gamma'), ['doc']);
    const binary = stream.serializeBinary();
    const restored = deserializeEventStreamBinary(binary);

    assert.strictEqual(restored.events.length, 1);
    assert.strictEqual(restored.metadata.mode, 'unit');
  });
});
