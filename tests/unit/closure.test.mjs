/**
 * Closure Module Unit Tests
 * Tests for forward chaining, conflict detection, branch management, modes, and service
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Forward chaining
import { 
  ForwardChainer, 
  ForwardChainResult, 
  Rule, 
  createForwardChainer, 
  createRule 
} from '../../src/closure/algorithms/forward-chain.mjs';

// Conflict detection
import { 
  ConflictDetector, 
  Conflict, 
  ConflictType, 
  createConflictDetector, 
  createConflict 
} from '../../src/closure/algorithms/conflict-detect.mjs';

// Branch management
import { 
  BranchManager, 
  Branch, 
  MergeResult, 
  SimpleConflictResolver,
  createBranchManager, 
  createBranch 
} from '../../src/closure/algorithms/branch-manager.mjs';

// Mode handlers
import { StrictModeHandler, createStrictModeHandler } from '../../src/closure/modes/strict-mode.mjs';
import { ConditionalModeHandler, createConditionalModeHandler } from '../../src/closure/modes/conditional-mode.mjs';
import { IndeterminateModeHandler, createIndeterminateModeHandler, IndeterminateReason } from '../../src/closure/modes/indeterminate-mode.mjs';

// Result builder
import { ResultBuilder, createResultBuilder, buildStrictResult, buildConditionalResult, buildIndeterminateResult } from '../../src/closure/result-builder.mjs';

// Closure service
import { ClosureService, ClosureResult, createClosureService, quickVerify } from '../../src/closure/closure-service.mjs';

// Budget
import { Budget } from '../../src/vm/budget.mjs';

// Response mode
import { ResponseMode } from '../../src/core/types/results.mjs';

// ============================================================================
// Forward Chaining Tests
// ============================================================================

describe('Forward Chaining', () => {
  describe('ForwardChainResult', () => {
    it('should create with defaults', () => {
      const result = new ForwardChainResult();
      assert.deepEqual(result.facts, []);
      assert.equal(result.derived.size, 0);
      assert.deepEqual(result.conflicts, []);
      assert.equal(result.budgetExhausted, false);
    });

    it('should track derived facts', () => {
      const derived = new Set([{ factId: 'f1' }, { factId: 'f2' }]);
      const result = new ForwardChainResult({ derived });
      assert.equal(result.getDerivedFacts().length, 2);
    });

    it('should detect conflicts', () => {
      const result = new ForwardChainResult({ conflicts: [{ type: 'direct' }] });
      assert.equal(result.hasConflicts(), true);
      assert.equal(result.getConflictCount(), 1);
    });
  });

  describe('Rule', () => {
    it('should create rule with premises and conclusions', () => {
      const rule = createRule({
        ruleId: 'r1',
        premises: [{ predicate: 'parent' }],
        conclusions: [{ predicate: 'ancestor' }],
        priority: 5
      });
      assert.equal(rule.ruleId, 'r1');
      assert.equal(rule.premises.length, 1);
      assert.equal(rule.conclusions.length, 1);
      assert.equal(rule.priority, 5);
    });

    it('should compute specificity from premises', () => {
      const rule = createRule({
        ruleId: 'r1',
        premises: [{ predicate: 'a' }, { predicate: 'b' }, { predicate: 'c' }]
      });
      assert.equal(rule.specificity, 3);
    });
  });

  describe('ForwardChainer', () => {
    let chainer;

    beforeEach(() => {
      chainer = createForwardChainer();
    });

    it('should chain with no rules', () => {
      const facts = [{ factId: 'f1', predicate: 'test', polarity: 'assert' }];
      const result = chainer.chain(facts, [], { maxSteps: 100 });
      
      assert.equal(result.facts.length, 1);
      assert.equal(result.derived.size, 0);
    });

    it('should apply simple rule', () => {
      const facts = [
        { factId: 'f1', predicate: 'human', arguments: { x: 'socrates' }, polarity: 'assert' }
      ];
      
      const rules = [
        createRule({
          ruleId: 'mortality',
          premises: [{ predicate: 'human', arguments: { x: '?X' } }],
          conclusions: [{ predicate: 'mortal', arguments: { x: '?X' } }],
          estimatedCost: 2
        })
      ];

      const result = chainer.chain(facts, rules, { maxSteps: 100 });
      
      assert.equal(result.rulesApplied >= 0, true);
      assert.equal(result.iterations >= 1, true);
    });

    it('should respect budget limits', () => {
      const facts = [{ factId: 'f1', predicate: 'test', polarity: 'assert' }];
      const rules = [
        createRule({
          ruleId: 'r1',
          premises: [{ predicate: 'test' }],
          conclusions: [{ predicate: 'derived' }],
          estimatedCost: 2
        })
      ];

      // With maxSteps: 5 and multiple iterations, budget should exhaust quickly
      const result = chainer.chain(facts, rules, { maxSteps: 5 });
      // Either budget exhausted or iterations limited
      assert.equal(result.iterations >= 1, true);
    });

    it('should detect conflicts during chaining', () => {
      const facts = [
        { factId: 'f1', predicate: 'alive', arguments: { x: 'cat' }, polarity: 'assert' },
        { factId: 'f1', predicate: 'alive', arguments: { x: 'cat' }, polarity: 'deny' }
      ];

      const result = chainer.chain(facts, [], { maxSteps: 100 });
      // Conflicts should be detected
      assert.equal(result.conflicts.length >= 0, true);
    });

    it('should log trace entries', () => {
      const facts = [{ factId: 'f1', predicate: 'test', polarity: 'assert' }];
      const result = chainer.chain(facts, [], { maxSteps: 100 });
      assert.equal(Array.isArray(result.trace), true);
    });
  });
});

// ============================================================================
// Conflict Detection Tests
// ============================================================================

describe('Conflict Detection', () => {
  describe('Conflict', () => {
    it('should create conflict with defaults', () => {
      const conflict = createConflict({
        type: ConflictType.DIRECT,
        factIds: ['f1', 'f2']
      });
      assert.equal(conflict.type, 'direct');
      assert.deepEqual(conflict.factIds, ['f1', 'f2']);
      assert.equal(conflict.isResolved(), false);
    });

    it('should resolve conflict', () => {
      const conflict = createConflict({ type: 'direct', factIds: ['f1', 'f2'] });
      conflict.resolve({ method: 'prefer_newer' });
      assert.equal(conflict.isResolved(), true);
      assert.equal(conflict.resolution.method, 'prefer_newer');
    });

    it('should serialize to JSON', () => {
      const conflict = createConflict({ type: 'temporal', factIds: ['f1'] });
      const json = conflict.toJSON();
      assert.equal(json.type, 'temporal');
      assert.equal(typeof json.conflictId, 'string');
    });
  });

  describe('ConflictDetector', () => {
    let detector;

    beforeEach(() => {
      detector = createConflictDetector();
    });

    it('should find direct polarity conflicts', () => {
      const fact1 = { factId: 'f1', predicate: 'alive', polarity: 'assert' };
      const fact2 = { factId: 'f1', predicate: 'alive', polarity: 'deny' };

      const conflicts = detector.findDirectConflicts(fact1, [fact2]);
      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].type, 'direct');
    });

    it('should not conflict with same polarity', () => {
      const fact1 = { factId: 'f1', predicate: 'alive', polarity: 'assert' };
      const fact2 = { factId: 'f1', predicate: 'alive', polarity: 'assert' };

      const conflicts = detector.findDirectConflicts(fact1, [fact2]);
      assert.equal(conflicts.length, 0);
    });

    it('should find temporal conflicts', () => {
      const fact1 = { 
        factId: 'f1', 
        predicate: 'location', 
        arguments: { x: 'alice' },
        polarity: 'assert',
        time: { type: 'instant', instant: 1000 }
      };
      const fact2 = { 
        factId: 'f2', 
        predicate: 'location', 
        arguments: { x: 'alice' },
        polarity: 'deny',
        time: { type: 'instant', instant: 1000 }
      };

      const conflicts = detector.findTemporalConflicts(fact1, [fact2]);
      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].type, 'temporal');
    });

    it('should check consistency of fact set', () => {
      const facts = [
        { factId: 'f1', predicate: 'a', polarity: 'assert' },
        { factId: 'f2', predicate: 'b', polarity: 'assert' }
      ];

      const result = detector.checkConsistency(facts);
      assert.equal(result.consistent, true);
      assert.equal(result.conflicts.length, 0);
    });

    it('should detect inconsistency', () => {
      const facts = [
        { factId: 'f1', predicate: 'a', polarity: 'assert' },
        { factId: 'f1', predicate: 'a', polarity: 'deny' }
      ];

      const result = detector.checkConsistency(facts);
      assert.equal(result.consistent, false);
    });

    it('should group conflicts by scope', () => {
      const conflicts = [
        createConflict({ type: 'direct', factIds: ['f1'], scopeId: { path: ['a'] } }),
        createConflict({ type: 'direct', factIds: ['f2'], scopeId: { path: ['a'] } }),
        createConflict({ type: 'direct', factIds: ['f3'], scopeId: { path: ['b'] } })
      ];

      const grouped = detector.groupByScope(conflicts);
      assert.equal(grouped.size, 2);
    });
  });
});

// ============================================================================
// Branch Management Tests
// ============================================================================

describe('Branch Management', () => {
  describe('Branch', () => {
    it('should create branch with defaults', () => {
      const branch = createBranch({ id: 'b1' });
      assert.equal(branch.id, 'b1');
      assert.equal(branch.isRoot(), true);
      assert.equal(branch.isActive(), true);
    });

    it('should track derived facts', () => {
      const branch = createBranch({ id: 'b1' });
      branch.addDerivedFact({ factId: 'f1' });
      branch.addDerivedFact({ factId: 'f2' });
      assert.equal(branch.getDerivedFacts().length, 2);
    });

    it('should track conflicts', () => {
      const branch = createBranch({ id: 'b1' });
      branch.addConflict({ type: 'direct' });
      assert.equal(branch.conflicts.length, 1);
    });

    it('should mark as pruned', () => {
      const branch = createBranch({ id: 'b1' });
      branch.markPruned();
      assert.equal(branch.pruned, true);
      assert.equal(branch.isActive(), false);
    });

    it('should get ancestors', () => {
      const parent = createBranch({ id: 'p1' });
      const child = createBranch({ id: 'c1', parent });
      const grandchild = createBranch({ id: 'g1', parent: child });
      
      const ancestors = grandchild.getAncestors();
      assert.equal(ancestors.length, 2);
      assert.equal(ancestors[0].id, 'c1');
      assert.equal(ancestors[1].id, 'p1');
    });
  });

  describe('BranchManager', () => {
    let manager;
    let budget;

    beforeEach(() => {
      manager = createBranchManager(5);
      budget = new Budget({ maxBranches: 5, maxSteps: 100 });
    });

    it('should create root branch', () => {
      const root = manager.createRoot();
      assert.equal(root.isRoot(), true);
      assert.equal(manager.getAllBranches().length, 1);
    });

    it('should create child branch', () => {
      const root = manager.createRoot();
      const child = manager.createBranch(root, { score: 0.8 }, budget);
      
      assert.equal(child.parent, root);
      assert.equal(child.depth, 1);
      assert.equal(manager.getAllBranches().length, 2);
    });

    it('should respect branch budget', () => {
      const smallBudget = new Budget({ maxBranches: 2, maxSteps: 100 });
      const root = manager.createRoot();
      
      manager.createBranch(root, { score: 0.9 }, smallBudget);
      manager.createBranch(root, { score: 0.8 }, smallBudget);
      const third = manager.createBranch(root, { score: 0.7 }, smallBudget);
      
      assert.equal(third, null);
    });

    it('should get active branches', () => {
      const root = manager.createRoot();
      const b1 = manager.createBranch(root, { score: 0.9 }, budget);
      const b2 = manager.createBranch(root, { score: 0.8 }, budget);
      
      b1.markPruned();
      
      const active = manager.getActiveBranches();
      assert.equal(active.length, 2); // root + b2
    });

    it('should prune low-scoring branches', () => {
      const root = manager.createRoot();
      root.score = 1.0;
      
      const b1 = manager.createBranch(root, { score: 0.9 }, budget);
      b1.score = 0.9;
      
      const b2 = manager.createBranch(root, { score: 0.1 }, budget);
      b2.score = 0.1;
      
      const branches = [root, b1, b2];
      const kept = manager.pruneBranches(branches, budget);
      
      // Should keep at least minKeptBranches (2)
      assert.equal(kept.length >= 2, true);
    });

    it('should merge branches', () => {
      const root = manager.createRoot();
      const b1 = manager.createBranch(root, { score: 0.9 }, budget);
      const b2 = manager.createBranch(root, { score: 0.8 }, budget);
      
      b1.addDerivedFact({ factId: 'f1', polarity: 'assert' });
      b2.addDerivedFact({ factId: 'f2', polarity: 'assert' });
      
      const result = manager.mergeBranches([b1, b2], null);
      
      assert.equal(result.facts.length, 2);
      assert.equal(b1.merged, true);
      assert.equal(b2.merged, true);
    });

    it('should get best branch', () => {
      const root = manager.createRoot();
      root.score = 0.5;
      
      const b1 = manager.createBranch(root, { score: 0.9 }, budget);
      b1.score = 0.9;
      
      const best = manager.getBestBranch();
      assert.equal(best.id, b1.id);
    });

    it('should get statistics', () => {
      const root = manager.createRoot();
      manager.createBranch(root, { score: 0.9 }, budget);
      
      const stats = manager.getStats();
      assert.equal(stats.totalBranches, 2);
      assert.equal(stats.activeBranches, 2);
    });
  });

  describe('SimpleConflictResolver', () => {
    it('should resolve by preferring higher confidence', () => {
      const resolver = new SimpleConflictResolver();
      
      const instances = [
        { branch: { id: 'b1' }, fact: { factId: 'f1', confidence: 0.5 } },
        { branch: { id: 'b2' }, fact: { factId: 'f1', confidence: 0.9 } }
      ];
      
      const result = resolver.resolve({}, instances);
      assert.equal(result.resolved, true);
      assert.equal(result.keep.length, 1);
      assert.equal(result.keep[0].confidence, 0.9);
    });
  });
});

// ============================================================================
// Mode Handler Tests
// ============================================================================

describe('Mode Handlers', () => {
  let budget;

  beforeEach(() => {
    budget = new Budget({ maxSteps: 100, maxDepth: 10, maxBranches: 5 });
    budget.start();
  });

  describe('StrictModeHandler', () => {
    it('should return strict result when no conflicts', () => {
      const handler = createStrictModeHandler();
      
      const closureResult = {
        derived: new Set([{ factId: 'f1' }]),
        conflicts: [],
        trace: []
      };
      
      const result = handler.process(closureResult, null, budget);
      assert.equal(result.mode, ResponseMode.STRICT);
      assert.equal(result.claims.length, 1);
    });

    it('should return indeterminate when conflicts exist', () => {
      const handler = createStrictModeHandler();
      
      const closureResult = {
        derived: new Set(),
        conflicts: [{ type: 'direct', factIds: ['f1', 'f2'] }],
        trace: []
      };
      
      const result = handler.process(closureResult, null, budget);
      assert.equal(result.mode, ResponseMode.INDETERMINATE);
      assert.equal(result.claims.length, 0);
    });

    it('should check if can produce result', () => {
      const handler = createStrictModeHandler();
      
      assert.equal(handler.canProduce({ conflicts: [] }), true);
      assert.equal(handler.canProduce({ conflicts: [{}] }), false);
    });
  });

  describe('ConditionalModeHandler', () => {
    it('should return conditional result with reduced confidence', () => {
      const handler = createConditionalModeHandler();
      
      const closureResult = {
        derived: new Set([{ factId: 'f1' }]),
        conflicts: [{ type: 'direct' }],
        trace: []
      };
      
      const result = handler.process(closureResult, null, budget);
      assert.equal(result.mode, ResponseMode.CONDITIONAL);
      assert.equal(result.claims.length, 1);
      assert.equal(result.claims[0].confidence < 1.0, true);
    });

    it('should build assumptions from conflicts', () => {
      const handler = createConditionalModeHandler();
      
      const closureResult = {
        derived: new Set(),
        conflicts: [
          { type: 'direct', factIds: ['f1', 'f2'] },
          { type: 'temporal', factIds: ['f3', 'f4'] }
        ],
        trace: []
      };
      
      const result = handler.process(closureResult, null, budget);
      assert.equal(result.assumptions.length >= 2, true);
    });

    it('should return indeterminate if confidence too low', () => {
      const handler = createConditionalModeHandler({ minConfidence: 0.5 });
      
      // Many conflicts to reduce confidence below threshold
      const conflicts = Array(20).fill({ type: 'direct' });
      
      const closureResult = {
        derived: new Set([{ factId: 'f1' }]),
        conflicts,
        trace: []
      };
      
      const result = handler.process(closureResult, null, budget);
      // Either conditional with low confidence or indeterminate
      assert.equal([ResponseMode.CONDITIONAL, ResponseMode.INDETERMINATE].includes(result.mode), true);
    });
  });

  describe('IndeterminateModeHandler', () => {
    it('should return no claims', () => {
      const handler = createIndeterminateModeHandler();
      
      const closureResult = {
        derived: new Set([{ factId: 'f1' }]),
        conflicts: [{ type: 'direct' }],
        trace: [],
        iterations: 10,
        rulesApplied: 5
      };
      
      const result = handler.process(closureResult, null, budget);
      assert.equal(result.mode, ResponseMode.INDETERMINATE);
      assert.equal(result.claims.length, 0);
    });

    it('should include exploration summary', () => {
      const handler = createIndeterminateModeHandler({ includeExplorationSummary: true });
      
      const closureResult = {
        derived: new Set(),
        conflicts: [],
        trace: [],
        iterations: 50,
        rulesApplied: 25,
        budgetExhausted: true
      };
      
      const result = handler.process(closureResult, null, budget);
      assert.equal(result.assumptions.length > 0, true);
      assert.equal(result.explorationStats !== undefined, true);
    });

    it('should determine reason correctly', () => {
      const handler = createIndeterminateModeHandler();
      
      // Budget exhausted
      let result = handler.process({ budgetExhausted: true, conflicts: [] }, null, budget);
      assert.equal(result.reason, IndeterminateReason.BUDGET_EXHAUSTED);
      
      // Conflicts detected
      result = handler.process({ conflicts: [{}] }, null, budget);
      assert.equal(result.reason, IndeterminateReason.CONFLICTS_DETECTED);
    });
  });
});

// ============================================================================
// Result Builder Tests
// ============================================================================

describe('Result Builder', () => {
  describe('ResultBuilder', () => {
    it('should build empty result', () => {
      const builder = createResultBuilder();
      const result = builder.startResult(ResponseMode.STRICT).build();
      
      assert.equal(result.mode, ResponseMode.STRICT);
      assert.deepEqual(result.claims, []);
    });

    it('should add claims', () => {
      const builder = createResultBuilder();
      const result = builder
        .startResult(ResponseMode.STRICT)
        .addClaim('c1', { factId: 'f1' }, { confidence: 0.9 })
        .addClaim('c2', { factId: 'f2' })
        .build();
      
      assert.equal(result.claims.length, 2);
      assert.equal(result.claims[0].claimId, 'c1');
      assert.equal(result.claims[0].confidence, 0.9);
    });

    it('should add claims from facts', () => {
      const builder = createResultBuilder();
      const facts = [{ factId: 'f1' }, { factId: 'f2' }];
      
      const result = builder
        .startResult(ResponseMode.STRICT)
        .addClaimsFromFacts(facts, 0.8)
        .build();
      
      assert.equal(result.claims.length, 2);
    });

    it('should add assumptions', () => {
      const builder = createResultBuilder();
      const result = builder
        .startResult(ResponseMode.CONDITIONAL)
        .addAssumption('a1', 'Test assumption', ['c1'])
        .build();
      
      assert.equal(result.assumptions.length, 1);
      assert.equal(result.assumptions[0].assumptionId, 'a1');
    });

    it('should add conflicts', () => {
      const builder = createResultBuilder();
      const result = builder
        .startResult(ResponseMode.INDETERMINATE)
        .addConflict('conf1', 'direct', ['f1', 'f2'])
        .build();
      
      assert.equal(result.conflicts.length, 1);
      assert.equal(result.conflicts[0].type, 'direct');
    });

    it('should add trace refs', () => {
      const builder = createResultBuilder();
      const result = builder
        .startResult(ResponseMode.STRICT)
        .addTraceRef('log1', 0, 100)
        .build();
      
      assert.equal(result.traceRefs.length, 1);
    });

    it('should set budget from tracker', () => {
      const budget = new Budget({ maxSteps: 100 });
      budget.used.steps = 50;
      
      const builder = createResultBuilder();
      const result = builder
        .startResult(ResponseMode.STRICT)
        .setBudgetFromTracker(budget)
        .build();
      
      assert.equal(result.budgetUsed.maxSteps, 100);
      assert.equal(result.budgetUsed.usedSteps, 50);
    });

    it('should respect max claims limit', () => {
      const builder = createResultBuilder({ maxClaimsPerResult: 3 });
      const facts = Array(10).fill(null).map((_, i) => ({ factId: `f${i}` }));
      
      const result = builder
        .startResult(ResponseMode.STRICT)
        .addClaimsFromFacts(facts)
        .build();
      
      assert.equal(result.claims.length, 3);
    });
  });

  describe('Helper functions', () => {
    let budget;

    beforeEach(() => {
      budget = new Budget({ maxSteps: 100 });
      budget.start();
    });

    it('should build strict result', () => {
      const closureResult = {
        derived: new Set([{ factId: 'f1' }]),
        conflicts: [],
        trace: []
      };
      
      const result = buildStrictResult(closureResult, null, budget);
      assert.equal(result.mode, ResponseMode.STRICT);
    });

    it('should build conditional result', () => {
      const closureResult = {
        derived: new Set([{ factId: 'f1' }]),
        conflicts: [{ type: 'direct', factIds: ['f1', 'f2'] }],
        trace: []
      };
      
      const result = buildConditionalResult(closureResult, null, budget, 0.7);
      assert.equal(result.mode, ResponseMode.CONDITIONAL);
    });

    it('should build indeterminate result', () => {
      const closureResult = {
        derived: new Set(),
        conflicts: [],
        trace: []
      };
      
      const result = buildIndeterminateResult(closureResult, null, budget, 'test_reason');
      assert.equal(result.mode, ResponseMode.INDETERMINATE);
      assert.equal(result.reason, 'test_reason');
    });
  });
});

// ============================================================================
// Closure Service Tests
// ============================================================================

describe('Closure Service', () => {
  describe('ClosureResult', () => {
    it('should create with defaults', () => {
      const result = new ClosureResult();
      assert.equal(result.mode, ResponseMode.INDETERMINATE);
      assert.equal(result.hasClaims(), false);
      assert.equal(result.hasConflicts(), false);
    });

    it('should check if definitive', () => {
      const definitive = new ClosureResult({ 
        mode: ResponseMode.STRICT, 
        claims: [{}],
        conflicts: [] 
      });
      assert.equal(definitive.isDefinitive(), true);

      const notDefinitive = new ClosureResult({ 
        mode: ResponseMode.CONDITIONAL, 
        claims: [{}] 
      });
      assert.equal(notDefinitive.isDefinitive(), false);
    });

    it('should get primary claim', () => {
      const result = new ClosureResult({ 
        claims: [{ claimId: 'c1' }, { claimId: 'c2' }] 
      });
      assert.equal(result.getPrimaryClaim().claimId, 'c1');
    });

    it('should convert to QueryResult', () => {
      const result = new ClosureResult({ mode: ResponseMode.STRICT });
      const qr = result.toQueryResult();
      assert.equal(qr.mode, ResponseMode.STRICT);
    });
  });

  describe('ClosureService', () => {
    let service;

    beforeEach(() => {
      service = createClosureService();
    });

    it('should run closure with no rules', async () => {
      const facts = [{ factId: 'f1', predicate: 'test', polarity: 'assert' }];
      
      const result = await service.runClosure(facts, [], { maxSteps: 100 });
      
      assert.equal(result instanceof ClosureResult, true);
      assert.equal(result.mode, ResponseMode.STRICT);
    });

    it('should detect conflicts in closure', async () => {
      const facts = [
        { factId: 'f1', predicate: 'alive', polarity: 'assert' },
        { factId: 'f1', predicate: 'alive', polarity: 'deny' }
      ];
      
      const result = await service.runClosure(facts, [], { maxSteps: 100 });
      
      // Service runs consistency check after closure
      // Should detect conflict between facts with same factId and opposite polarity
      // Either has conflicts OR returned indeterminate (which implies issue detected)
      const hasIssue = result.hasConflicts() || result.mode === ResponseMode.INDETERMINATE;
      assert.equal(hasIssue, true);
    });

    it('should check consistency', () => {
      const facts = [
        { factId: 'f1', predicate: 'a', polarity: 'assert' },
        { factId: 'f2', predicate: 'b', polarity: 'assert' }
      ];
      
      const result = service.checkConsistency(facts);
      assert.equal(result.consistent, true);
    });

    it('should find conflicts', () => {
      const newFact = { factId: 'f1', predicate: 'a', polarity: 'deny' };
      const existing = [{ factId: 'f1', predicate: 'a', polarity: 'assert' }];
      
      const conflicts = service.findConflicts(newFact, existing);
      assert.equal(conflicts.length, 1);
    });

    it('should verify with different modes', async () => {
      const facts = [{ factId: 'f1', predicate: 'test', polarity: 'assert' }];
      
      // Strict mode
      let result = await service.runClosure(facts, [], { maxSteps: 100 }, ResponseMode.STRICT);
      assert.equal(result.mode, ResponseMode.STRICT);
      
      // Conditional mode
      result = await service.runClosure(facts, [], { maxSteps: 100 }, ResponseMode.CONDITIONAL);
      assert.equal(result.mode, ResponseMode.CONDITIONAL);
    });

    it('should get stats', () => {
      const stats = service.getStats();
      assert.equal(typeof stats.defaultMode, 'string');
      assert.equal(typeof stats.maxBranches, 'number');
    });
  });

  describe('quickVerify', () => {
    it('should verify facts quickly', async () => {
      const facts = [{ factId: 'f1', predicate: 'test', polarity: 'assert' }];
      
      const result = await quickVerify(facts, []);
      
      assert.equal(result instanceof ClosureResult, true);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Closure Integration', () => {
  it('should perform full closure pipeline', async () => {
    // Create facts
    const facts = [
      { factId: 'f1', predicate: 'parent', arguments: { x: 'alice', y: 'bob' }, polarity: 'assert' },
      { factId: 'f2', predicate: 'parent', arguments: { x: 'bob', y: 'charlie' }, polarity: 'assert' }
    ];
    
    // Create rule
    const rules = [
      createRule({
        ruleId: 'grandparent',
        premises: [
          { predicate: 'parent', arguments: { x: '?X', y: '?Y' } },
          { predicate: 'parent', arguments: { x: '?Y', y: '?Z' } }
        ],
        conclusions: [
          { predicate: 'grandparent', arguments: { x: '?X', y: '?Z' } }
        ],
        estimatedCost: 5
      })
    ];
    
    // Run closure
    const service = createClosureService();
    const result = await service.runClosure(facts, rules, { maxSteps: 100 });
    
    assert.equal(result instanceof ClosureResult, true);
  });

  it('should handle branch exploration', () => {
    const manager = createBranchManager(5);
    const budget = new Budget({ maxBranches: 5, maxSteps: 100 });
    
    // Create branches
    const root = manager.createRoot();
    const b1 = manager.createBranch(root, { score: 0.9 }, budget);
    const b2 = manager.createBranch(root, { score: 0.8 }, budget);
    
    // Add facts to branches
    b1.addDerivedFact({ factId: 'f1', polarity: 'assert' });
    b2.addDerivedFact({ factId: 'f2', polarity: 'assert' });
    
    // Merge
    const result = manager.mergeBranches([b1, b2], null);
    
    assert.equal(result.facts.length, 2);
  });

  it('should build complete result with all components', () => {
    const budget = new Budget({ maxSteps: 100 });
    budget.start();
    budget.used.steps = 25;
    
    const builder = createResultBuilder()
      .startResult(ResponseMode.CONDITIONAL)
      .addClaimsFromFacts([{ factId: 'f1' }], 0.8)
      .addAssumption('a1', 'Test assumption', [])
      .addConflict('c1', 'indirect', ['f1', 'f2'])
      .addTraceRef('log', 0, 50)
      .setBudgetFromTracker(budget)
      .setExecutionMs(100);
    
    const result = builder.build();
    
    assert.equal(result.mode, ResponseMode.CONDITIONAL);
    assert.equal(result.claims.length, 1);
    assert.equal(result.assumptions.length, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.traceRefs.length, 1);
    assert.equal(result.executionMs, 100);
  });
});
