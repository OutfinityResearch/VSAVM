/**
 * FileStore Unit Tests
 * Disk-backed storage strategy (DS012).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileStore } from '../../src/storage/strategies/file-store.mjs';
import { createFactInstance, createProvenanceLink } from '../../src/core/types/facts.mjs';
import { createSymbolId, createSourceId, createScopeId } from '../../src/core/types/identifiers.mjs';
import { stringAtom } from '../../src/core/types/terms.mjs';

function makeFact(scopePath, value) {
  return createFactInstance(
    createSymbolId('test', 'has_value'),
    { value: stringAtom(value) },
    {
      scopeId: createScopeId(scopePath),
      provenance: [
        createProvenanceLink(createSourceId('document', 'unit_test'), {
          deterministicTime: true
        })
      ]
    }
  );
}

describe('FileStore', () => {
  let dir;
  let store;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vsavm-filestore-'));
    store = new FileStore({
      storage: {
        file: {
          path: join(dir, 'facts.bin'),
          indexMode: 'full',
          cacheMaxEntries: 8
        }
      }
    });
    await store.initialize();
  });

  afterEach(async () => {
    if (store) {
      await store.close();
    }
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists and retrieves facts (last-write-wins)', async () => {
    const f1 = makeFact(['doc', 'p1'], 'a');
    await store.assertFact(f1);

    const loaded = await store.getFact(f1.factId);
    assert.ok(loaded);
    assert.equal(loaded.factId, f1.factId);

    // Same FactId (predicate+args), different scope. FactId excludes scope.
    const f2 = makeFact(['other', 'scope'], 'a');
    await store.assertFact(f2);
    const loaded2 = await store.getFact(f1.factId);
    assert.ok(loaded2);
    assert.deepEqual(loaded2.scopeId.path, ['other', 'scope']);
  });

  it('supports query by predicate and arguments', async () => {
    const f1 = makeFact(['doc', 'p1'], 'x');
    const f2 = makeFact(['doc', 'p2'], 'y');
    await store.assertFact(f1);
    await store.assertFact(f2);

    const all = await store.queryByPredicate('test:has_value');
    assert.equal(all.length, 2);

    const onlyX = await store.query({
      predicate: 'test:has_value',
      arguments: { value: stringAtom('x') }
    });
    assert.equal(onlyX.length, 1);
    assert.equal(onlyX[0].factId, f1.factId);
  });

  it('supports denyFact tombstones and re-assert', async () => {
    const f1 = makeFact(['doc', 'p1'], 'x');
    await store.assertFact(f1);
    assert.ok(await store.getFact(f1.factId));

    await store.denyFact(f1.factId, createScopeId(['doc']));
    assert.equal(await store.getFact(f1.factId), null);

    await store.assertFact(f1);
    assert.ok(await store.getFact(f1.factId));
  });

  it('supports snapshots via truncate', async () => {
    const f1 = makeFact(['doc', 'p1'], 'x');
    await store.assertFact(f1);

    const snap = await store.createSnapshot();

    const f2 = makeFact(['doc', 'p2'], 'y');
    await store.assertFact(f2);
    assert.ok(await store.getFact(f2.factId));

    await store.restoreSnapshot(snap);
    assert.equal(await store.getFact(f2.factId), null);
    assert.ok(await store.getFact(f1.factId));
  });

  it('rebuilds index on initialize', async () => {
    const f1 = makeFact(['doc', 'p1'], 'x');
    await store.assertFact(f1);
    await store.close();

    const store2 = new FileStore({
      storage: {
        file: {
          path: join(dir, 'facts.bin'),
          indexMode: 'full',
          cacheMaxEntries: 8
        }
      }
    });
    await store2.initialize();
    const loaded = await store2.getFact(f1.factId);
    assert.ok(loaded);
    await store2.close();
  });
});
