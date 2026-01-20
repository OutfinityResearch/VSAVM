/**
 * VM unit tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import { Budget } from '../../src/vm/budget.mjs';
import { BindingEnv } from '../../src/vm/state/binding-env.mjs';
import { ContextStack } from '../../src/vm/state/context-stack.mjs';
import { ExecutionLog } from '../../src/vm/state/execution-log.mjs';
import { VMService } from '../../src/vm/vm-service.mjs';
import { MemoryStore } from '../../src/storage/strategies/memory-store.mjs';
import { createSymbolId, createScopeId } from '../../src/core/types/identifiers.mjs';
import { stringAtom } from '../../src/core/types/terms.mjs';

describe('Budget', () => {
  test('tracks step consumption', () => {
    const budget = new Budget({ maxSteps: 100 });
    budget.start();
    
    budget.consumeSteps('MAKE_TERM'); // 1 step
    assert.strictEqual(budget.used.steps, 1);
    
    budget.consumeSteps('ASSERT'); // 3 steps
    assert.strictEqual(budget.used.steps, 4);
  });

  test('throws on step limit exceeded', () => {
    const budget = new Budget({ maxSteps: 5 });
    budget.start();
    
    budget.consumeSteps('ASSERT'); // 3 steps
    
    assert.throws(() => {
      budget.consumeSteps('ASSERT'); // 3 more = 6 > 5
    }, /Step limit exceeded/);
  });

  test('tracks depth', () => {
    const budget = new Budget({ maxDepth: 3 });
    
    budget.pushDepth();
    assert.strictEqual(budget.used.depth, 1);
    
    budget.pushDepth();
    assert.strictEqual(budget.used.depth, 2);
    
    budget.popDepth();
    assert.strictEqual(budget.used.depth, 1);
  });

  test('throws on depth limit exceeded', () => {
    const budget = new Budget({ maxDepth: 2 });
    
    budget.pushDepth();
    budget.pushDepth();
    
    assert.throws(() => {
      budget.pushDepth();
    }, /Depth limit exceeded/);
  });

  test('remaining budget calculation', () => {
    const budget = new Budget({ maxSteps: 100, maxDepth: 10, maxBranches: 5 });
    budget.start();
    
    assert.strictEqual(budget.remaining(), 1);
    
    budget.consumeSteps('QUERY', 45); // 5 + 45 = 50 steps
    assert.ok(budget.remaining() < 1);
    assert.ok(budget.remaining() > 0);
  });
});

describe('BindingEnv', () => {
  test('binds and retrieves variables', () => {
    const env = new BindingEnv();
    
    env.bind('x', 42);
    assert.strictEqual(env.get('x'), 42);
    assert.ok(env.has('x'));
  });

  test('scope isolation', () => {
    const env = new BindingEnv();
    
    env.bind('x', 1);
    env.pushScope();
    env.bind('y', 2);
    
    assert.strictEqual(env.get('x'), 1); // visible from parent
    assert.strictEqual(env.get('y'), 2);
    
    env.popScope();
    
    assert.strictEqual(env.get('x'), 1);
    assert.strictEqual(env.get('y'), undefined); // y was in popped scope
  });

  test('inner scope shadows outer', () => {
    const env = new BindingEnv();
    
    env.bind('x', 1);
    env.pushScope();
    env.bind('x', 2);
    
    assert.strictEqual(env.get('x'), 2);
    
    env.popScope();
    assert.strictEqual(env.get('x'), 1);
  });
});

describe('ContextStack', () => {
  test('push and pop contexts', () => {
    const stack = new ContextStack();
    
    assert.strictEqual(stack.depth, 1); // root
    
    stack.push('branch1');
    assert.strictEqual(stack.depth, 2);
    
    const popped = stack.pop();
    assert.strictEqual(stack.depth, 1);
    assert.ok(popped.id.startsWith('ctx_'));
  });

  test('context fact isolation', () => {
    const stack = new ContextStack();
    
    const fact1 = { factId: 'f1', value: 1 };
    stack.addFact(fact1);
    
    stack.push('child');
    const fact2 = { factId: 'f2', value: 2 };
    stack.addFact(fact2);
    
    // Child sees both
    assert.ok(stack.getFact('f1'));
    assert.ok(stack.getFact('f2'));
    
    stack.pop();
    
    // Parent only sees f1
    assert.ok(stack.getFact('f1'));
    assert.strictEqual(stack.getFact('f2'), undefined);
  });

  test('isolated context blocks parent visibility', () => {
    const stack = new ContextStack();
    
    stack.addFact({ factId: 'f1' });
    stack.pushIsolated('isolated');
    
    assert.strictEqual(stack.getFact('f1'), undefined); // Not visible in isolated
  });
});

describe('ExecutionLog', () => {
  test('logs entries by level', () => {
    const log = new ExecutionLog({ level: 'standard' });
    
    log.logFactAssert({ factId: 'f1', predicate: { namespace: 'test', name: 'p' }, polarity: 'assert' });
    log.logInstruction('MAKE_TERM', {}, null); // verbose - not logged
    
    const entries = log.getEntries();
    assert.strictEqual(entries.length, 1); // Only standard-level entry
  });

  test('verbose level logs everything', () => {
    const log = new ExecutionLog({ level: 'verbose' });
    
    log.logFactAssert({ factId: 'f1', predicate: {}, polarity: 'assert' });
    log.logInstruction('MAKE_TERM', {}, null);
    
    const entries = log.getEntries();
    assert.strictEqual(entries.length, 2);
  });
});

describe('VMService', () => {
  test('validates programs', async () => {
    const store = new MemoryStore();
    await store.initialize();
    
    const vm = new VMService(store);
    
    const validProgram = {
      instructions: [
        { op: 'MAKE_TERM', args: { type: 'string', value: 'test' }, out: 'x' }
      ]
    };
    
    const validation = vm.validateProgram(validProgram);
    assert.ok(validation.valid);
    
    const invalidProgram = {
      instructions: [
        { op: 'UNKNOWN_OP' }
      ]
    };
    
    const invalidation = vm.validateProgram(invalidProgram);
    assert.ok(!invalidation.valid);
    assert.ok(invalidation.errors.some(e => e.includes('unknown op')));
    
    await store.close();
  });

  test('executes simple program', async () => {
    const store = new MemoryStore();
    await store.initialize();
    
    const vm = new VMService(store);
    
    const program = {
      instructions: [
        { op: 'MAKE_TERM', args: { type: 'string', value: 'hello' }, out: 'greeting' }
      ]
    };
    
    const result = await vm.execute(program);
    
    assert.ok(result);
    assert.ok(result.budgetUsed);
    assert.ok(result.budgetUsed.usedSteps > 0);
    
    await store.close();
  });

  test('executes ASSERT and QUERY', async () => {
    const store = new MemoryStore();
    await store.initialize();
    
    const vm = new VMService(store);
    
    const program = {
      instructions: [
        { 
          op: 'ASSERT', 
          args: { 
            predicate: 'test:color',
            arguments: {
              entity: stringAtom('apple'),
              color: stringAtom('red')
            }
          },
          out: 'asserted'
        },
        {
          op: 'QUERY',
          args: {
            predicate: 'test:color'
          },
          out: 'results'
        }
      ]
    };
    
    const result = await vm.execute(program);
    
    assert.strictEqual(result.mode, 'strict');
    
    // Check that fact was stored
    const count = await store.count();
    assert.strictEqual(count, 1);
    
    await store.close();
  });

  test('built-in COUNT/FILTER/MAP/REDUCE', async () => {
    const store = new MemoryStore();
    await store.initialize();

    const vm = new VMService(store);
    const state = vm.createState();

    await vm.executeOne(
      { op: 'MAP', args: { list: [{ a: 1 }, { a: 2 }, { a: 3 }], path: 'a' }, out: 'vals' },
      state
    );
    assert.deepStrictEqual(state.bindings.get('vals'), [1, 2, 3]);

    await vm.executeOne(
      { op: 'FILTER', args: { list: '$vals', condition: '$item > 1' }, out: 'filtered' },
      state
    );
    assert.deepStrictEqual(state.bindings.get('filtered'), [2, 3]);

    await vm.executeOne(
      { op: 'COUNT', args: { list: '$filtered' }, out: 'count' },
      state
    );
    assert.strictEqual(state.bindings.get('count'), 2);

    await vm.executeOne(
      { op: 'REDUCE', args: { list: '$filtered', op: 'sum' }, out: 'sum' },
      state
    );
    assert.strictEqual(state.bindings.get('sum'), 5);

    await store.close();
  });

  test('branch control flow', async () => {
    const store = new MemoryStore();
    await store.initialize();
    
    const vm = new VMService(store);
    
    const program = {
      instructions: [
        { op: 'MAKE_TERM', args: { type: 'number', value: 5 }, out: 'x' },
        { op: 'BRANCH', args: { condition: '$x > 3', then: 'big', else: 'small' } },
        { label: 'small', op: 'MAKE_TERM', args: { type: 'string', value: 'small' }, out: 'size' },
        { op: 'JUMP', args: { label: 'done' } },
        { label: 'big', op: 'MAKE_TERM', args: { type: 'string', value: 'big' }, out: 'size' },
        { label: 'done', op: 'RETURN', args: {} }
      ]
    };
    
    const result = await vm.execute(program);
    assert.ok(result);
    
    await store.close();
  });
});
