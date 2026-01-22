/**
 * Event ingestion tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createDefaultVSAVM, fromAudioTranscript } from '../../src/index.mjs';

describe('Ingest pipeline', () => {
  it('ingests text into scoped facts', async () => {
    const vm = createDefaultVSAVM();
    await vm.initialize();

    try {
      const result = await vm.ingestText('Hello world.\n\nSecond paragraph.');
      assert.ok(result.facts.length > 0);

      const first = result.facts[0];
      assert.ok(first.scopeId);
      assert.ok(Array.isArray(first.scopeId.path));
      assert.ok(!JSON.stringify(first.scopeId.path).includes('domain'));
    } finally {
      await vm.close();
    }
  });

  it('ingests audio transcript events', async () => {
    const vm = createDefaultVSAVM();
    await vm.initialize();

    try {
      const stream = fromAudioTranscript([
        { text: 'Hello world', startMs: 0, endMs: 500, speakerId: 'A' }
      ]);

      const result = await vm.ingestEvents(stream.events, { sourceId: 'audio_test' });
      assert.ok(result.facts.length > 0);
      assert.ok(result.separators.length >= 0);
    } finally {
      await vm.close();
    }
  });
});
