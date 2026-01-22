/**
 * Event Stream Ingestion
 * Convert event streams into canonical facts with structural scopes.
 */

import { parseText } from './parser/text-parser.mjs';
import { detectStructuralSeparators, createStructuralScopeId } from './separator-detector.mjs';
import { createSymbolId, createSourceId } from '../core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../core/types/facts.mjs';
import { stringAtom, numberAtom } from '../core/types/terms.mjs';
import { normalizeEvent } from '../core/types/events.mjs';
import { computeHash } from '../core/hash.mjs';

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

function resolveSourceId(event, fallbackId) {
  if (event?.sourceRef?.sourceId) return event.sourceRef.sourceId;
  if (fallbackId) return createSourceId('document', fallbackId);
  return createSourceId('document', 'event_stream');
}

/**
 * Ingest a list of events into VSAVM as facts.
 * @param {VSAVM} vm
 * @param {Array} events
 * @param {Object} [options]
 * @param {string} [options.sourceId]
 * @returns {Promise<{facts: Object[], separators: Object[]}>}
 */
export async function ingestEvents(vm, events, options = {}) {
  const normalizedEvents = events.map((event) => normalizeEvent(event));
  const separators = await detectStructuralSeparators(normalizedEvents);
  const facts = [];
  const predicate = createSymbolId('vsavm.core', 'event');
  const fallbackSourceId = options.sourceId
    ?? `event_stream_${computeHash(stableStringify(normalizedEvents))}`;
  const provenanceTimestamp = vm?.config?.vm?.strictMode ? 0 : Date.now();

  for (let i = 0; i < normalizedEvents.length; i++) {
    const event = normalizedEvents[i];
    const scopeId = createStructuralScopeId(normalizedEvents, i, separators);
    const sourceId = resolveSourceId(event, fallbackSourceId);

    const fact = createFactInstance(
      predicate,
      {
        event_id: numberAtom(event.eventId ?? i),
        event_type: stringAtom(String(event.type ?? 'unknown')),
        payload: stringAtom(stableStringify(event.payload ?? null))
      },
      {
        scopeId,
        provenance: [
          createProvenanceLink(sourceId, {
            eventSpan: { start: i, end: i },
            timestamp: provenanceTimestamp
          })
        ]
      }
    );

    await vm.assertFact(fact);
    facts.push(fact);
  }

  return { facts, separators };
}

/**
 * Ingest raw text by parsing to events first.
 * @param {VSAVM} vm
 * @param {string} text
 * @param {Object} [options]
 * @param {Object} [options.parserOptions]
 * @param {string} [options.sourceId]
 * @returns {Promise<{stream: EventStream, facts: Object[], separators: Object[]}>}
 */
export async function ingestText(vm, text, options = {}) {
  const parserOptions = {
    emitSeparators: false,
    ...(options.parserOptions ?? {})
  };
  const stream = parseText(text, parserOptions);
  const events = stream.events ?? [];

  const { facts, separators } = await ingestEvents(vm, events, {
    sourceId: options.sourceId ?? stream.sourceId?.id
  });

  return { stream, facts, separators };
}

export default {
  ingestEvents,
  ingestText
};
