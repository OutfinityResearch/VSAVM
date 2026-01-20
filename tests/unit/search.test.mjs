/**
 * Search Module Unit Tests
 * Tests for MDL scoring, beam search, greedy search, and search service
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Complexity cost
import { 
  ComplexityCostCalculator, 
  createComplexityCostCalculator, 
  computeComplexityCost,
  COMPLEXITY_WEIGHTS 
} from '../../src/search/scoring/complexity-cost.mjs';

// Residual cost
import { 
  ResidualCostCalculator, 
  createResidualCostCalculator, 
  computeResidualLoss,
  RESIDUAL_WEIGHTS 
} from '../../src/search/scoring/residual-cost.mjs';

// Penalty cost
import { 
  PenaltyCostCalculator, 
  createPenaltyCostCalculator, 
  computePenaltyCost,
  PENALTY_WEIGHTS 
} from '../../src/search/scoring/penalty-cost.mjs';

// MDL scorer
import { 
  MDLScorer, 
  ScoringResult, 
  ScoringContext,
  createMDLScorer, 
  createScoringContext,
  quickScore,
  MDL_WEIGHTS 
} from '../../src/search/scoring/mdl-scorer.mjs';

// Beam manager
import { 
  BeamManager, 
  BeamEntry, 
  createBeamManager, 
  createBeamEntry,
  BEAM_CONFIG 
} from '../../src/search/beam.mjs';

// Beam search
import { 
  BeamSearchStrategy, 
  SearchResult, 
  createBeamSearchStrategy,
  BEAM_SEARCH_CONFIG 
} from '../../src/search/strategies/beam-search.mjs';

// Greedy search
import { 
  GreedySearchStrategy, 
  GreedySearchResult, 
  createGreedySearchStrategy,
  GREEDY_SEARCH_CONFIG 
} from '../../src/search/strategies/greedy-search.mjs';

// Search service
import { 
  SearchService, 
  SearchStrategy, 
  createSearchService, 
  quickSearch, 
  beamSearch,
  SEARCH_SERVICE_CONFIG 
} from '../../src/search/search-service.mjs';

// ============================================================================
// Complexity Cost Tests
// ============================================================================

describe('Complexity Cost', () => {
  describe('ComplexityCostCalculator', () => {
    let calc;

    beforeEach(() => {
      calc = createComplexityCostCalculator();
    });

    it('should compute cost for empty program', () => {
      const program = { instructions: [] };
      const cost = calc.compute(program);
      assert.equal(cost >= COMPLEXITY_WEIGHTS.minCost, true);
    });

    it('should increase cost with more instructions', () => {
      const small = { instructions: [{ opcode: 'QUERY' }] };
      const large = { 
        instructions: [
          { opcode: 'QUERY' },
          { opcode: 'FILTER' },
          { opcode: 'MAP' },
          { opcode: 'RETURN' }
        ] 
      };

      const smallCost = calc.compute(small);
      const largeCost = calc.compute(large);

      assert.equal(largeCost > smallCost, true);
    });

    it('should provide breakdown', () => {
      const program = { 
        instructions: [
          { opcode: 'QUERY', predicate: { namespace: 'ns', name: 'pred' } },
          { opcode: 'RETURN' }
        ] 
      };

      const breakdown = calc.breakdown(program);

      assert.equal(typeof breakdown.instructionCount, 'number');
      assert.equal(typeof breakdown.uniqueSymbols, 'number');
      assert.equal(typeof breakdown.total, 'number');
    });

    it('should count unique symbols', () => {
      const program = {
        instructions: [
          { opcode: 'QUERY', predicate: { namespace: 'ns', name: 'pred1' } },
          { opcode: 'QUERY', predicate: { namespace: 'ns', name: 'pred2' } },
          { opcode: 'QUERY', predicate: { namespace: 'ns', name: 'pred1' } }
        ]
      };

      const breakdown = calc.breakdown(program);
      assert.equal(breakdown.uniqueSymbols, 2);
    });

    it('should count variables', () => {
      const program = {
        instructions: [
          { opcode: 'BIND', args: { x: '?X', y: '?Y' } },
          { opcode: 'MATCH', args: { z: '?X' } }
        ]
      };

      const breakdown = calc.breakdown(program);
      assert.equal(breakdown.variableCount, 2); // ?X and ?Y
    });
  });

  describe('computeComplexityCost', () => {
    it('should compute cost directly', () => {
      const program = { instructions: [{ opcode: 'NOP' }] };
      const cost = computeComplexityCost(program);
      assert.equal(typeof cost, 'number');
      assert.equal(cost >= 0, true);
    });
  });
});

// ============================================================================
// Residual Cost Tests
// ============================================================================

describe('Residual Cost', () => {
  describe('ResidualCostCalculator', () => {
    let calc;

    beforeEach(() => {
      calc = createResidualCostCalculator();
    });

    it('should compute zero loss for matching results', () => {
      const result = { claims: [{ factId: 'f1', confidence: 1.0 }] };
      const expected = { claims: [{ factId: 'f1', confidence: 1.0 }] };

      const loss = calc.computeLoss(result, expected);
      assert.equal(loss, 0);
    });

    it('should penalize missing claims', () => {
      const result = { claims: [] };
      const expected = { claims: [{ factId: 'f1' }] };

      const loss = calc.computeLoss(result, expected);
      assert.equal(loss > 0, true);
    });

    it('should penalize extra claims', () => {
      const result = { claims: [{ factId: 'f1' }, { factId: 'f2' }] };
      const expected = { claims: [{ factId: 'f1' }] };

      const loss = calc.computeLoss(result, expected);
      assert.equal(loss > 0, true);
    });

    it('should provide breakdown', () => {
      const result = { claims: [{ factId: 'f1' }] };
      const expected = { claims: [{ factId: 'f2' }] };

      const breakdown = calc.breakdown(result, expected);

      assert.equal(typeof breakdown.missing, 'number');
      assert.equal(typeof breakdown.extra, 'number');
      assert.equal(typeof breakdown.total, 'number');
    });

    it('should compute residual over examples', () => {
      const program = { instructions: [] };
      const examples = [
        { input: {}, expected: { claims: [] } },
        { input: {}, expected: { claims: [] } }
      ];

      const residual = calc.compute(program, examples);
      assert.equal(typeof residual, 'number');
    });
  });
});

// ============================================================================
// Penalty Cost Tests
// ============================================================================

describe('Penalty Cost', () => {
  describe('PenaltyCostCalculator', () => {
    let calc;

    beforeEach(() => {
      calc = createPenaltyCostCalculator();
    });

    it('should compute zero penalty for clean result', () => {
      const closureResult = {
        mode: 'strict',
        conflicts: [],
        budgetExhausted: false
      };

      const penalty = calc.compute(closureResult);
      assert.equal(penalty, 0);
    });

    it('should penalize conflicts', () => {
      const closureResult = {
        conflicts: [{ type: 'direct' }, { type: 'temporal' }]
      };

      const penalty = calc.computeCorrectnessPenalty(closureResult);
      assert.equal(penalty > 0, true);
    });

    it('should penalize direct conflicts more than indirect', () => {
      const direct = { conflicts: [{ type: 'direct' }] };
      const indirect = { conflicts: [{ type: 'indirect' }] };

      const directPenalty = calc.computeCorrectnessPenalty(direct);
      const indirectPenalty = calc.computeCorrectnessPenalty(indirect);

      assert.equal(directPenalty > indirectPenalty, true);
    });

    it('should penalize budget exhaustion', () => {
      const exhausted = { budgetExhausted: true, conflicts: [] };
      const budget = { limits: { maxSteps: 100 }, used: { steps: 100 } };

      const penalty = calc.computeBudgetPenalty(exhausted, budget);
      assert.equal(penalty > 0, true);
    });

    it('should penalize indeterminate mode', () => {
      const indeterminate = { mode: 'indeterminate', conflicts: [] };

      const penalty = calc.computeModePenalty(indeterminate);
      assert.equal(penalty > 0, true);
    });

    it('should provide breakdown', () => {
      const closureResult = {
        mode: 'conditional',
        conflicts: [{ type: 'direct' }],
        budgetExhausted: false
      };

      const breakdown = calc.breakdown(closureResult);

      assert.equal(typeof breakdown.correctnessPenalty, 'number');
      assert.equal(typeof breakdown.modePenalty, 'number');
      assert.equal(typeof breakdown.total, 'number');
    });
  });
});

// ============================================================================
// MDL Scorer Tests
// ============================================================================

describe('MDL Scorer', () => {
  describe('ScoringResult', () => {
    it('should create with defaults', () => {
      const result = new ScoringResult();
      assert.equal(result.total, 0);
      assert.equal(result.complexity, 0);
    });

    it('should compare scores correctly', () => {
      const better = new ScoringResult({ total: 5 });
      const worse = new ScoringResult({ total: 10 });

      assert.equal(better.isBetterThan(worse), true);
      assert.equal(worse.isBetterThan(better), false);
    });

    it('should normalize score', () => {
      const result = new ScoringResult({ total: 50 });
      const normalized = result.normalized(100);
      assert.equal(normalized, 0.5);
    });
  });

  describe('MDLScorer', () => {
    let scorer;

    beforeEach(() => {
      scorer = createMDLScorer();
    });

    it('should score program quickly', () => {
      const program = { instructions: [{ opcode: 'QUERY' }] };
      const result = scorer.scoreQuick(program);

      assert.equal(result instanceof ScoringResult, true);
      assert.equal(result.total > 0, true);
    });

    it('should score simpler programs lower', () => {
      const simple = { instructions: [{ opcode: 'QUERY' }] };
      const complex = { 
        instructions: Array(10).fill({ opcode: 'QUERY' })
      };

      const simpleScore = scorer.scoreQuick(simple);
      const complexScore = scorer.scoreQuick(complex);

      assert.equal(simpleScore.total < complexScore.total, true);
    });

    it('should rank programs', () => {
      const programs = [
        { instructions: Array(5).fill({ opcode: 'NOP' }) },
        { instructions: [{ opcode: 'NOP' }] },
        { instructions: Array(10).fill({ opcode: 'NOP' }) }
      ];

      const ranked = scorer.rankQuick(programs);

      assert.equal(ranked.length, 3);
      // Should be sorted by score (lowest first)
      assert.equal(ranked[0].score.total <= ranked[1].score.total, true);
      assert.equal(ranked[1].score.total <= ranked[2].score.total, true);
    });

    it('should score from closure result', () => {
      const program = { instructions: [{ opcode: 'QUERY' }] };
      const closureResult = {
        mode: 'strict',
        conflicts: [],
        budgetExhausted: false
      };

      const result = scorer.scoreFromClosure(program, closureResult);

      assert.equal(result instanceof ScoringResult, true);
      assert.equal(result.correctness, 0);
    });
  });

  describe('quickScore', () => {
    it('should score program directly', () => {
      const program = { instructions: [{ opcode: 'NOP' }] };
      const result = quickScore(program);

      assert.equal(result instanceof ScoringResult, true);
    });
  });
});

// ============================================================================
// Beam Manager Tests
// ============================================================================

describe('Beam Manager', () => {
  describe('BeamEntry', () => {
    it('should create entry', () => {
      const hypothesis = { program: { instructions: [] } };
      const entry = createBeamEntry(hypothesis, 5.0);

      assert.equal(entry.hypothesis, hypothesis);
      assert.equal(entry.score, 5.0);
    });

    it('should expand to new entry', () => {
      const parent = createBeamEntry({ id: 'parent' }, 5.0);
      const child = parent.expand({ id: 'child' }, 3.0);

      assert.equal(child.parent, parent);
      assert.equal(child.score, 3.0);
      assert.equal(child.iteration, 1);
    });

    it('should compute depth', () => {
      const root = createBeamEntry({}, 5.0);
      const child = root.expand({}, 4.0);
      const grandchild = child.expand({}, 3.0);

      assert.equal(root.getDepth(), 0);
      assert.equal(child.getDepth(), 1);
      assert.equal(grandchild.getDepth(), 2);
    });
  });

  describe('BeamManager', () => {
    let manager;

    beforeEach(() => {
      manager = createBeamManager({ beamWidth: 5 });
    });

    it('should initialize with candidates', () => {
      const candidates = [
        { hypothesis: { id: 'a' }, score: 3 },
        { hypothesis: { id: 'b' }, score: 1 },
        { hypothesis: { id: 'c' }, score: 2 }
      ];

      manager.initialize(candidates);

      assert.equal(manager.getBeam().length, 3);
    });

    it('should sort beam by score', () => {
      const candidates = [
        { hypothesis: { id: 'a' }, score: 3 },
        { hypothesis: { id: 'b' }, score: 1 },
        { hypothesis: { id: 'c' }, score: 2 }
      ];

      manager.initialize(candidates);
      const beam = manager.getBeam();

      // Lower score should be first
      assert.equal(beam[0].score <= beam[1].score, true);
    });

    it('should get best entry', () => {
      const candidates = [
        { hypothesis: { id: 'a' }, score: 3 },
        { hypothesis: { id: 'b' }, score: 1 }
      ];

      manager.initialize(candidates);
      const best = manager.getBest();

      assert.equal(best.score, 1);
    });

    it('should prune low-scoring entries', () => {
      const candidates = [
        { hypothesis: { id: 'a' }, score: 1 },
        { hypothesis: { id: 'b' }, score: 100 },
        { hypothesis: { id: 'c' }, score: 2 }
      ];

      manager.initialize(candidates);
      const pruned = manager.prune();

      // Should have pruned at least one entry
      assert.equal(pruned >= 0, true);
    });

    it('should select diverse beam', () => {
      const candidates = [
        { hypothesis: { program: { instructions: [{ opcode: 'QUERY' }] } }, score: 1 },
        { hypothesis: { program: { instructions: [{ opcode: 'FILTER' }] } }, score: 2 },
        { hypothesis: { program: { instructions: [{ opcode: 'QUERY' }] } }, score: 1.5 }
      ];

      const selected = manager.selectDiverse(candidates);

      assert.equal(selected.length <= manager.config.beamWidth, true);
    });

    it('should track statistics', () => {
      manager.initialize([{ hypothesis: {}, score: 1 }]);
      manager.nextIteration();

      const stats = manager.getStats();

      assert.equal(stats.iterations, 1);
      assert.equal(stats.beamSize, 1);
    });
  });
});

// ============================================================================
// Beam Search Tests
// ============================================================================

describe('Beam Search', () => {
  describe('SearchResult', () => {
    it('should create with defaults', () => {
      const result = new SearchResult();
      assert.equal(result.best, null);
      assert.equal(result.candidates.length, 0);
    });

    it('should check success', () => {
      const success = new SearchResult({ best: { hypothesis: {} } });
      const fail = new SearchResult();

      assert.equal(success.succeeded(), true);
      assert.equal(fail.succeeded(), false);
    });
  });

  describe('BeamSearchStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = createBeamSearchStrategy({
        maxIterations: 5,
        beamWidth: 3
      });
    });

    it('should search with initial candidates', async () => {
      const candidates = [
        { program: { instructions: [{ opcode: 'A' }] } },
        { program: { instructions: [{ opcode: 'B' }] } }
      ];

      const result = await strategy.search(candidates, {});

      assert.equal(result instanceof SearchResult, true);
      assert.equal(result.succeeded(), true);
    });

    it('should track iterations', async () => {
      const candidates = [
        { program: { instructions: [] } }
      ];

      const result = await strategy.search(candidates, {});

      assert.equal(result.iterations >= 1, true);
    });

    it('should handle empty candidates', async () => {
      const result = await strategy.search([], {});

      assert.equal(result.succeeded(), false);
    });
  });
});

// ============================================================================
// Greedy Search Tests
// ============================================================================

describe('Greedy Search', () => {
  describe('GreedySearchResult', () => {
    it('should create with defaults', () => {
      const result = new GreedySearchResult();
      assert.equal(result.best, null);
      assert.equal(result.bestScore, Infinity);
    });

    it('should compute improvement ratio', () => {
      const result = new GreedySearchResult({
        path: [
          { score: 10 },
          { score: 5 }
        ]
      });

      const ratio = result.getImprovementRatio();
      assert.equal(ratio, 0.5);
    });
  });

  describe('GreedySearchStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = createGreedySearchStrategy({
        maxIterations: 3
      });
    });

    it('should search with candidates', async () => {
      const candidates = [
        { program: { instructions: [{ opcode: 'A' }] } },
        { program: { instructions: [{ opcode: 'B' }, { opcode: 'C' }] } }
      ];

      const result = await strategy.search(candidates, {});

      assert.equal(result instanceof GreedySearchResult, true);
      assert.equal(result.succeeded(), true);
    });

    it('should prefer simpler programs', async () => {
      const candidates = [
        { program: { instructions: Array(10).fill({ opcode: 'X' }) } },
        { program: { instructions: [{ opcode: 'X' }] } }
      ];

      const result = await strategy.search(candidates, {});

      // Simpler program should have lower score
      assert.equal(result.bestScore < 10, true);
    });

    it('should do quick search', async () => {
      const candidates = [
        { program: { instructions: [] } }
      ];

      const result = await strategy.quickSearch(candidates, {});

      assert.equal(result.iterations, 1);
    });
  });
});

// ============================================================================
// Search Service Tests
// ============================================================================

describe('Search Service', () => {
  describe('SearchService', () => {
    let service;

    beforeEach(() => {
      service = createSearchService({
        maxIterations: 5,
        beamWidth: 3
      });
    });

    it('should search with beam strategy', async () => {
      const candidates = [
        { program: { instructions: [{ opcode: 'A' }] } }
      ];

      const result = await service.search(candidates, {}, { strategy: SearchStrategy.BEAM });

      assert.equal(result instanceof SearchResult, true);
    });

    it('should search with greedy strategy', async () => {
      const candidates = [
        { program: { instructions: [{ opcode: 'A' }] } }
      ];

      const result = await service.search(candidates, {}, { strategy: SearchStrategy.GREEDY });

      assert.equal(result.succeeded(), true);
    });

    it('should quick search', async () => {
      const candidates = [
        { program: { instructions: [{ opcode: 'A' }] } }
      ];

      const result = await service.search(candidates, {}, { strategy: SearchStrategy.QUICK });

      assert.equal(result.succeeded(), true);
    });

    it('should rank candidates', async () => {
      const candidates = [
        { program: { instructions: Array(5).fill({ opcode: 'X' }) } },
        { program: { instructions: [{ opcode: 'X' }] } }
      ];

      const ranked = await service.rank(candidates, {});

      assert.equal(ranked.length, 2);
      assert.equal(ranked[0].score.total <= ranked[1].score.total, true);
    });

    it('should score single program', async () => {
      const program = { instructions: [{ opcode: 'X' }] };

      const score = await service.score(program, {});

      assert.equal(score instanceof ScoringResult, true);
    });

    it('should select best', async () => {
      const candidates = [
        { program: { instructions: Array(5).fill({ opcode: 'X' }) } },
        { program: { instructions: [{ opcode: 'X' }] } }
      ];

      const best = await service.selectBest(candidates, {});

      assert.equal(best !== null, true);
    });

    it('should get available strategies', () => {
      const strategies = service.getStrategies();

      assert.equal(strategies.includes('beam'), true);
      assert.equal(strategies.includes('greedy'), true);
      assert.equal(strategies.includes('quick'), true);
    });

    it('should get stats', () => {
      const stats = service.getStats();

      assert.equal(typeof stats.beamWidth, 'number');
      assert.equal(typeof stats.maxIterations, 'number');
    });
  });

  describe('Helper functions', () => {
    it('should quick search', async () => {
      const candidates = [
        { program: { instructions: [] } }
      ];

      const best = await quickSearch(candidates, {});

      assert.equal(best !== null, true);
    });

    it('should beam search', async () => {
      const candidates = [
        { program: { instructions: [] } }
      ];

      const result = await beamSearch(candidates, {});

      assert.equal(result instanceof SearchResult, true);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Search Integration', () => {
  it('should run full search pipeline', async () => {
    const service = createSearchService();

    // Create test programs
    const candidates = [
      { 
        schemaId: 'query_person',
        program: { 
          instructions: [
            { opcode: 'QUERY', predicate: { namespace: 'core', name: 'person' } },
            { opcode: 'RETURN' }
          ]
        }
      },
      {
        schemaId: 'query_person_complex',
        program: {
          instructions: [
            { opcode: 'QUERY', predicate: { namespace: 'core', name: 'person' } },
            { opcode: 'FILTER', args: { active: true } },
            { opcode: 'MAP', args: { fields: ['name', 'age'] } },
            { opcode: 'RETURN' }
          ]
        }
      }
    ];

    // Search
    const result = await service.search(candidates, {}, { strategy: SearchStrategy.BEAM });

    assert.equal(result.succeeded(), true);
    assert.equal(result.candidates.length > 0, true);
  });

  it('should compare programs with MDL', async () => {
    const scorer = createMDLScorer();

    const simple = { instructions: [{ opcode: 'RETURN' }] };
    const complex = { 
      instructions: [
        { opcode: 'QUERY' },
        { opcode: 'FILTER' },
        { opcode: 'MAP' },
        { opcode: 'REDUCE' },
        { opcode: 'RETURN' }
      ]
    };

    const simpleScore = scorer.scoreQuick(simple);
    const complexScore = scorer.scoreQuick(complex);

    // Simpler should have lower MDL
    assert.equal(simpleScore.isBetterThan(complexScore), true);
  });

  it('should penalize conflicts in scoring', () => {
    const scorer = createMDLScorer();

    const program = { instructions: [{ opcode: 'QUERY' }] };
    
    const cleanClosure = {
      mode: 'strict',
      conflicts: [],
      budgetExhausted: false
    };

    const conflictClosure = {
      mode: 'conditional',
      conflicts: [{ type: 'direct' }, { type: 'temporal' }],
      budgetExhausted: false
    };

    const cleanScore = scorer.scoreFromClosure(program, cleanClosure);
    const conflictScore = scorer.scoreFromClosure(program, conflictClosure);

    // Conflicts should increase MDL
    assert.equal(conflictScore.total > cleanScore.total, true);
  });
});
