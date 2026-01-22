/**
 * End-to-end query pipeline tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createDefaultVSAVM } from '../../src/index.mjs';
import { createSymbolId, createScopeId, createSourceId } from '../../src/core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../../src/core/types/facts.mjs';
import { stringAtom } from '../../src/core/types/terms.mjs';

describe('Query pipeline', () => {
  it('answers a list query through compiler/search/VM/closure', async () => {
    const vm = createDefaultVSAVM();
    await vm.initialize();

    try {
      const pred = createSymbolId('test', 'person');
      const fact = createFactInstance(pred, { name: stringAtom('Ada') }, {
        scopeId: createScopeId(['doc']),
        provenance: [createProvenanceLink(createSourceId('test', 'unit'))]
      });
      await vm.assertFact(fact);

      const answer = await vm.answerQuery('list test:person');
      assert.ok(answer.success);
      assert.ok(Array.isArray(answer.execution?.bindings?.results));
    } finally {
      await vm.close();
    }
  });
});
