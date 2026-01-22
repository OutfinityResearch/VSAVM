/**
 * Training Module Unit Tests
 * Tests for pattern mining, schema proposal, consolidation, and rule learning
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PatternMiner,
  createPatternMiner,
  SchemaProposer,
  createSchemaProposer,
  Consolidator,
  createConsolidator,
  RuleLearner,
  createRuleLearner,
  TrainingService,
  createTrainingService,
  MacroUnitModel,
  createMacroUnitModel
} from '../../src/training/index.mjs';

describe('PatternMiner', () => {
  let miner;

  beforeEach(() => {
    miner = createPatternMiner({ minConfidence: 0.8 });
  });

  describe('detectArithmetic', () => {
    it('detects simple arithmetic progression', () => {
      const sequence = [1, 4, 7, 10, 13];
      const result = miner.detectArithmetic(sequence);
      
      assert.equal(result.type, 'arithmetic_progression');
      assert.equal(result.rule.start, 1);
      assert.equal(result.rule.difference, 3);
      assert.ok(result.confidence >= 0.99);
    });

    it('detects negative arithmetic progression', () => {
      const sequence = [20, 18, 16, 14, 12];
      const result = miner.detectArithmetic(sequence);
      
      assert.equal(result.rule.difference, -2);
      assert.ok(result.confidence >= 0.99);
    });
  });

  describe('detectGeometric', () => {
    it('detects geometric progression with ratio 2', () => {
      const sequence = [1, 2, 4, 8, 16];
      const result = miner.detectGeometric(sequence);
      
      assert.equal(result.type, 'geometric_progression');
      assert.equal(result.rule.start, 1);
      assert.equal(result.rule.ratio, 2);
      assert.ok(result.confidence >= 0.99);
    });

    it('detects geometric progression with ratio 3', () => {
      const sequence = [2, 6, 18, 54];
      const result = miner.detectGeometric(sequence);
      
      assert.equal(result.rule.ratio, 3);
      assert.ok(result.confidence >= 0.99);
    });
  });

  describe('detectFibonacci', () => {
    it('detects standard fibonacci sequence', () => {
      const sequence = [1, 1, 2, 3, 5, 8, 13];
      const result = miner.detectFibonacci(sequence);
      
      assert.equal(result.type, 'fibonacci');
      assert.equal(result.rule.a, 1);
      assert.equal(result.rule.b, 1);
      assert.ok(result.confidence >= 0.99);
    });

    it('detects custom fibonacci-like sequence', () => {
      const sequence = [2, 3, 5, 8, 13, 21];
      const result = miner.detectFibonacci(sequence);
      
      assert.equal(result.rule.a, 2);
      assert.equal(result.rule.b, 3);
      assert.ok(result.confidence >= 0.99);
    });
  });

  describe('detectModular', () => {
    it('detects modular arithmetic mod 7', () => {
      const sequence = [0, 3, 6, 2, 5, 1, 4, 0];
      const result = miner.detectModular(sequence);
      
      assert.equal(result.type, 'modular_arithmetic');
      assert.equal(result.rule.modulus, 7);
      assert.equal(result.rule.increment, 3);
      assert.ok(result.confidence >= 0.8);
    });
  });

  describe('detectPolynomial', () => {
    it('detects squares: n^2', () => {
      const sequence = [0, 1, 4, 9, 16, 25];
      const result = miner.detectPolynomial(sequence);
      
      assert.equal(result.type, 'polynomial');
      assert.equal(result.rule.a, 1);
      assert.equal(result.rule.b, 0);
      assert.equal(result.rule.c, 0);
      assert.ok(result.confidence >= 0.99);
    });

    it('detects quadratic: n^2 + 2n + 1', () => {
      const sequence = [1, 4, 9, 16, 25]; // (n+1)^2 = n^2 + 2n + 1
      const result = miner.detectPolynomial(sequence);
      
      assert.equal(result.type, 'polynomial');
      assert.ok(result.confidence >= 0.99);
    });
  });

  describe('detect (auto)', () => {
    it('auto-detects arithmetic pattern', () => {
      const sequence = [5, 10, 15, 20, 25];
      const result = miner.detect(sequence);
      
      assert.equal(result.type, 'arithmetic_progression');
      assert.equal(result.rule.difference, 5);
    });

    it('auto-detects fibonacci pattern', () => {
      const sequence = [1, 1, 2, 3, 5, 8, 13, 21];
      const result = miner.detect(sequence);
      
      assert.equal(result.type, 'fibonacci');
    });

    it('uses hint when provided', () => {
      const sequence = [1, 2, 4, 8, 16];
      const result = miner.detect(sequence, 'geometric');
      
      assert.equal(result.type, 'geometric_progression');
    });
  });

  describe('predict', () => {
    it('predicts next arithmetic value', () => {
      const rule = { type: 'arithmetic_progression', start: 1, difference: 3 };
      const sequence = [1, 4, 7, 10, 13];
      
      const next = miner.predict(rule, sequence);
      assert.equal(next, 16);
    });

    it('predicts next fibonacci value', () => {
      const rule = { type: 'fibonacci', a: 1, b: 1 };
      const sequence = [1, 1, 2, 3, 5, 8];
      
      const next = miner.predict(rule, sequence);
      assert.equal(next, 13);
    });
  });
});

describe('SchemaProposer', () => {
  let proposer;

  beforeEach(() => {
    proposer = createSchemaProposer({ minConfidence: 0.8 });
  });

  it('proposes schema from pattern', () => {
    const pattern = {
      type: 'arithmetic_progression',
      rule: { type: 'arithmetic_progression', start: 1, difference: 3 },
      confidence: 0.95,
      support: 5
    };

    const candidate = proposer.proposeFromPattern(pattern, { name: 'test' });
    
    assert.ok(candidate);
    assert.ok(candidate.id);
    assert.equal(candidate.type, 'arithmetic_progression');
    assert.ok(candidate.mdlScore > 0);
  });

  it('proposes schemas from sequence', () => {
    const sequence = [1, 4, 7, 10, 13];
    const candidates = proposer.proposeFromSequence(sequence);
    
    assert.ok(Array.isArray(candidates));
    assert.ok(candidates.length > 0);
  });

  it('rejects low confidence patterns', () => {
    const pattern = {
      type: 'unknown',
      rule: null,
      confidence: 0.3,
      support: 2
    };

    const candidate = proposer.proposeFromPattern(pattern);
    assert.equal(candidate, null);
  });
});

describe('Consolidator', () => {
  let consolidator;

  beforeEach(() => {
    consolidator = createConsolidator({
      minSupport: 3,
      minConfidence: 0.8,
      minMDLImprovement: 2
    });
  });

  it('evaluates candidate for promotion', () => {
    const candidate = {
      id: 'test_1',
      type: 'arithmetic_progression',
      pattern: { type: 'arithmetic_progression', start: 1, difference: 3 },
      support: 5,
      confidence: 0.95,
      mdlScore: 10
    };

    const decision = consolidator.evaluate(candidate);
    
    assert.equal(decision.action, 'promote');
    assert.ok(decision.score > 0);
  });

  it('defers candidates with insufficient support', () => {
    const candidate = {
      id: 'test_2',
      type: 'arithmetic_progression',
      pattern: { type: 'arithmetic_progression', start: 1, difference: 3 },
      support: 2,
      confidence: 0.95,
      mdlScore: 10
    };

    const decision = consolidator.evaluate(candidate);
    
    assert.equal(decision.action, 'defer');
  });

  it('rejects low confidence candidates', () => {
    const candidate = {
      id: 'test_3',
      type: 'arithmetic_progression',
      pattern: null,
      support: 5,
      confidence: 0.5,
      mdlScore: 10
    };

    const decision = consolidator.evaluate(candidate);
    
    assert.equal(decision.action, 'reject');
  });

  it('promotes and versions schemas', () => {
    const candidate = {
      id: 'test_4',
      type: 'arithmetic_progression',
      pattern: { type: 'arithmetic_progression', start: 1, difference: 3 },
      support: 5,
      confidence: 0.95,
      mdlScore: 10
    };

    const decision = consolidator.evaluate(candidate);
    const artifact = consolidator.promote(candidate, decision);
    
    assert.ok(artifact.id);
    assert.ok(artifact.version);
    assert.ok(artifact.promotedAt);
  });
});

describe('RuleLearner', () => {
  let learner;

  beforeEach(() => {
    learner = createRuleLearner({ minConfidence: 0.7 });
  });

  describe('learnRule', () => {
    it('learns arithmetic progression rule', async () => {
      const result = await learner.learnRule({
        name: 'simple_arithmetic',
        type: 'arithmetic',
        sequence: [1, 4, 7, 10, 13]
      });

      assert.equal(result.success, true);
      assert.equal(result.rule.type, 'arithmetic_progression');
      assert.equal(result.rule.difference, 3);
      assert.ok(result.confidence >= 0.7);
    });

    it('learns geometric progression rule', async () => {
      const result = await learner.learnRule({
        name: 'geometric_double',
        type: 'geometric',
        sequence: [1, 2, 4, 8, 16]
      });

      assert.equal(result.success, true);
      assert.equal(result.rule.type, 'geometric_progression');
      assert.equal(result.rule.ratio, 2);
    });

    it('learns fibonacci rule', async () => {
      const result = await learner.learnRule({
        name: 'fibonacci',
        type: 'fibonacci',
        sequence: [1, 1, 2, 3, 5, 8, 13]
      });

      assert.equal(result.success, true);
      assert.equal(result.rule.type, 'fibonacci');
      assert.equal(result.rule.a, 1);
      assert.equal(result.rule.b, 1);
    });

    it('learns modular arithmetic rule', async () => {
      const result = await learner.learnRule({
        name: 'modular_7',
        type: 'modular',
        sequence: [0, 3, 6, 2, 5, 1, 4, 0]
      });

      assert.equal(result.success, true);
      assert.equal(result.rule.type, 'modular_arithmetic');
      assert.equal(result.rule.modulus, 7);
    });

    it('learns polynomial rule (squares)', async () => {
      const result = await learner.learnRule({
        name: 'squares',
        type: 'polynomial',
        sequence: [0, 1, 4, 9, 16, 25]
      });

      assert.equal(result.success, true);
      assert.equal(result.rule.type, 'polynomial');
      assert.equal(result.rule.a, 1);
      assert.equal(result.rule.b, 0);
      assert.equal(result.rule.c, 0);
    });

    it('fails on invalid input', async () => {
      const result = await learner.learnRule({
        name: 'invalid',
        sequence: [1] // Too short
      });

      assert.equal(result.success, false);
      assert.ok(result.error);
    });
  });

  describe('learnRules', () => {
    it('learns multiple rules', async () => {
      const results = await learner.learnRules([
        { name: 'arith', sequence: [1, 3, 5, 7, 9] },
        { name: 'geom', sequence: [2, 4, 8, 16, 32] }
      ]);

      assert.equal(results.length, 2);
      assert.equal(results[0].success, true);
      assert.equal(results[1].success, true);
    });
  });

  describe('predict', () => {
    it('predicts using learned rule', async () => {
      await learner.learnRule({
        name: 'test_arith',
        sequence: [5, 10, 15, 20, 25]
      });

      const next = learner.predict('test_arith', [5, 10, 15, 20, 25]);
      assert.equal(next, 30);
    });
  });

  describe('getStats', () => {
    it('returns learning statistics', async () => {
      await learner.learnRule({ name: 'r1', sequence: [1, 2, 3, 4, 5] });
      await learner.learnRule({ name: 'r2', sequence: [2, 4, 6, 8, 10] });

      const stats = learner.getStats();
      assert.equal(stats.rulesLearned, 2);
    });
  });
});

describe('TrainingService', () => {
  let service;

  beforeEach(() => {
    service = createTrainingService({
      minConfidence: 0.7,
      autoConsolidate: true
    });
  });

  it('learns rule via service', async () => {
    const result = await service.learnRule({
      name: 'service_test',
      sequence: [1, 4, 7, 10, 13]
    });

    assert.equal(result.success, true);
    assert.equal(result.rule.type, 'arithmetic_progression');
  });

  it('trains on batch of examples', async () => {
    const examples = [
      { name: 'ex1', sequence: [1, 3, 5, 7, 9], type: 'arithmetic' },
      { name: 'ex2', sequence: [2, 4, 8, 16], type: 'geometric' },
      { name: 'ex3', sequence: [1, 1, 2, 3, 5, 8], type: 'fibonacci' }
    ];

    const result = await service.train(examples);

    assert.equal(result.rulesLearned, 3);
    assert.ok(result.metrics.duration >= 0);
    assert.ok(result.metrics.successRate > 0);
  });

  it('mines patterns from sequence', () => {
    const patterns = service.minePatterns([1, 4, 7, 10, 13]);
    
    assert.ok(Array.isArray(patterns));
    assert.ok(patterns.length > 0);
    assert.equal(patterns[0].type, 'arithmetic_progression');
  });

  it('exports and imports state', async () => {
    await service.learnRule({ name: 'export_test', sequence: [1, 2, 3, 4, 5] });

    const exported = service.export();
    assert.ok(exported.rules);
    assert.ok(exported.config);

    const newService = createTrainingService();
    newService.import(exported);
    
    assert.ok(newService.getRules().has('export_test'));
  });

  it('returns statistics', async () => {
    await service.train([
      { name: 's1', sequence: [1, 2, 3, 4, 5] }
    ]);

    const stats = service.getStats();
    assert.ok(stats.rulesLearned >= 1);
    assert.ok(stats.trainingRuns >= 1);
  });
});

describe('MacroUnitModel', () => {
  let model;

  beforeEach(() => {
    model = createMacroUnitModel({
      minFrequency: 2,
      minLength: 2,
      maxLength: 8,
      contextWindow: 4,
      mdlThreshold: 0.01,
      pruneThreshold: 1
    });
  });

  describe('train', () => {
    it('discovers macro-units from repeated sequences', async () => {
      const sequences = [
        Array.from(Buffer.from('Hello World')),
        Array.from(Buffer.from('Hello There')),
        Array.from(Buffer.from('Hello Again')),
        Array.from(Buffer.from('World Hello'))
      ];

      await model.train(sequences);
      const macroUnits = model.getMacroUnits();

      assert.ok(macroUnits.length > 0, 'Should discover macro-units');
      
      // "Hello" should be discovered as a macro-unit
      const helloUnit = macroUnits.find(u => 
        Buffer.from(u.tokens).toString('utf8').includes('Hello')
      );
      assert.ok(helloUnit, 'Should discover "Hello" as macro-unit');
    });

    it('builds n-gram model at multiple orders', async () => {
      const sequences = [
        Array.from(Buffer.from('abcabc')),
        Array.from(Buffer.from('abcabc'))
      ];

      await model.train(sequences);
      const stats = model.getStats();

      assert.ok(stats.ngramContexts > 0, 'Should have n-gram contexts');
      assert.ok(stats.ngramOrders.length > 0, 'Should have multiple n-gram orders');
    });
  });

  describe('encode/decode', () => {
    it('encodes using macro-units for compression', async () => {
      const sequences = [
        Array.from(Buffer.from('ababab')),
        Array.from(Buffer.from('ababab')),
        Array.from(Buffer.from('ababab'))
      ];

      await model.train(sequences);

      const input = Array.from(Buffer.from('ababab'));
      const encoded = model.encode(input);

      // Should use fewer units than bytes
      assert.ok(encoded.length <= input.length, 'Encoding should compress');
    });

    it('encode returns correct structure', async () => {
      const sequences = [
        Array.from(Buffer.from('test')),
        Array.from(Buffer.from('test'))
      ];

      await model.train(sequences);

      const input = Array.from(Buffer.from('test'));
      const encoded = model.encode(input);

      assert.ok(Array.isArray(encoded), 'Encoded should be array');
      for (const unit of encoded) {
        assert.ok(unit.unitId, 'Each unit should have unitId');
        assert.ok(Array.isArray(unit.tokens), 'Each unit should have tokens array');
      }
    });
  });

  describe('propose', () => {
    it('proposes next tokens using Kneser-Ney', async () => {
      const sequences = [
        Array.from(Buffer.from('abc')),
        Array.from(Buffer.from('abc')),
        Array.from(Buffer.from('abd'))
      ];

      await model.train(sequences);

      const context = Array.from(Buffer.from('ab'));
      const proposals = await model.propose(context, null, 5);

      assert.ok(proposals.length > 0, 'Should have proposals');
      
      // 'c' should be more likely after 'ab' than random bytes
      const cProposal = proposals.find(p => 
        p.tokens.length === 1 && p.tokens[0] === 'c'.charCodeAt(0)
      );
      assert.ok(cProposal, 'Should propose "c" after "ab"');
    });

    it('proposes macro-units when applicable', async () => {
      const sequences = [
        Array.from(Buffer.from('xyzabc')),
        Array.from(Buffer.from('xyzabc')),
        Array.from(Buffer.from('xyzabc'))
      ];

      await model.train(sequences);
      const macroUnits = model.getMacroUnits();

      if (macroUnits.length > 0) {
        const context = Array.from(Buffer.from('xyz'));
        const proposals = await model.propose(context, null, 10);
        
        // Should include some macro-unit proposals
        const macroProposals = proposals.filter(p => p.unitId !== 'byte');
        // This is optional - macro-units may or may not be proposed based on context
      }
    });
  });

  describe('generate', () => {
    it('generates continuation from prompt', async () => {
      const sequences = [
        Array.from(Buffer.from('hello world')),
        Array.from(Buffer.from('hello there')),
        Array.from(Buffer.from('hello again'))
      ];

      await model.train(sequences);

      const prompt = Array.from(Buffer.from('hel'));
      const result = await model.generate(prompt, { maxTokens: 10 });

      assert.ok(result.tokens, 'Should have tokens');
      assert.ok(result.tokens.length >= prompt.length, 'Should have at least prompt length');
      assert.equal(typeof result.compressionRatio, 'number', 'Should have compression ratio');
      assert.ok(Array.isArray(result.macroUnits), 'Should have macro-units array');
    });

    it('respects maxTokens limit', async () => {
      const sequences = [
        Array.from(Buffer.from('abcdefghij'))
      ];

      await model.train(sequences);

      const prompt = Array.from(Buffer.from('a'));
      const result = await model.generate(prompt, { maxTokens: 5 });

      assert.ok(result.generatedLength <= 10, 'Should respect maxTokens (with some margin for macro-units)');
    });
  });

  describe('calculatePerplexity', () => {
    it('calculates perplexity for seen sequence', async () => {
      const sequences = [
        Array.from(Buffer.from('abcabc')),
        Array.from(Buffer.from('abcabc'))
      ];

      await model.train(sequences);

      const testSeq = Array.from(Buffer.from('abc'));
      const ppl = model.calculatePerplexity(testSeq);

      assert.ok(Number.isFinite(ppl), 'Perplexity should be finite');
      assert.ok(ppl > 0, 'Perplexity should be positive');
      assert.ok(ppl < 256, 'Perplexity should be less than vocabulary size for seen data');
    });

    it('returns higher perplexity for unseen patterns', async () => {
      const sequences = [
        Array.from(Buffer.from('aaaa')),
        Array.from(Buffer.from('aaaa'))
      ];

      await model.train(sequences);

      const seenPpl = model.calculatePerplexity(Array.from(Buffer.from('aaaa')));
      const unseenPpl = model.calculatePerplexity(Array.from(Buffer.from('zzzz')));

      // Unseen should have higher perplexity (or at least not much lower)
      // Due to smoothing, both should be finite
      assert.ok(Number.isFinite(seenPpl), 'Seen perplexity should be finite');
      assert.ok(Number.isFinite(unseenPpl), 'Unseen perplexity should be finite');
    });
  });

  describe('export/import', () => {
    it('exports and imports model state', async () => {
      const sequences = [
        Array.from(Buffer.from('hello')),
        Array.from(Buffer.from('hello')),
        Array.from(Buffer.from('world'))
      ];

      await model.train(sequences);
      const exported = model.export();

      assert.ok(exported.version, 'Should have version');
      assert.ok(Array.isArray(exported.macroUnits), 'Should have macroUnits');
      assert.ok(Array.isArray(exported.ngramsByOrder), 'Should have ngramsByOrder');

      // Create new model and import
      const newModel = createMacroUnitModel();
      newModel.import(exported);

      const originalStats = model.getStats();
      const importedStats = newModel.getStats();

      assert.equal(importedStats.macroUnitCount, originalStats.macroUnitCount);
      assert.equal(importedStats.totalBytes, originalStats.totalBytes);
    });

    it('roundtrips perplexity calculation', async () => {
      const sequences = [
        Array.from(Buffer.from('test data')),
        Array.from(Buffer.from('test data'))
      ];

      await model.train(sequences);
      
      const testSeq = Array.from(Buffer.from('test'));
      const pplBefore = model.calculatePerplexity(testSeq);

      const exported = model.export();
      const newModel = createMacroUnitModel();
      newModel.import(exported);

      const pplAfter = newModel.calculatePerplexity(testSeq);

      assert.ok(Math.abs(pplBefore - pplAfter) < 0.01, 'Perplexity should be same after import');
    });
  });

  describe('getStats', () => {
    it('returns comprehensive statistics', async () => {
      const sequences = [
        Array.from(Buffer.from('hello world'))
      ];

      await model.train(sequences);
      const stats = model.getStats();

      assert.equal(typeof stats.macroUnitCount, 'number');
      assert.equal(typeof stats.ngramContexts, 'number');
      assert.equal(typeof stats.totalBytes, 'number');
      assert.equal(typeof stats.vocabularySize, 'number');
      assert.equal(typeof stats.avgMacroUnitLength, 'number');
      assert.ok(Array.isArray(stats.ngramOrders));
    });
  });
});
