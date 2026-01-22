/**
 * Generation service tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createDefaultVSAVM } from '../../src/index.mjs';
import { stringAtom } from '../../src/core/types/terms.mjs';
import { ResponseMode } from '../../src/core/types/results.mjs';

describe('Generation', () => {
  it('renders claims without adding new content', async () => {
    const vm = createDefaultVSAVM();
    await vm.initialize();

    try {
      const result = {
        mode: ResponseMode.STRICT,
        claims: [{ content: stringAtom('example') }],
        traceRefs: []
      };

      const rendered = vm.renderResult(result);
      assert.ok(rendered.text.includes('example'));
    } finally {
      await vm.close();
    }
  });
});
