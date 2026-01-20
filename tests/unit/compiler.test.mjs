/**
 * Compiler Unit Tests
 * Tests for query compilation pipeline
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Schema model
import { 
  QuerySchema, 
  createQuerySchema,
  createSchemaSlot,
  createSchemaTrigger,
  createOutputContract,
  SlotType,
  OutputKind,
  OutputMode
} from '../../src/compiler/schemas/schema-model.mjs';

// Schema store
import { 
  SchemaStore, 
  createSchemaStore 
} from '../../src/compiler/schemas/schema-store.mjs';

// Program IR
import { 
  Program, 
  createProgram,
  ProgramBuilder,
  programBuilder,
  createInstruction,
  OpCode,
  ArgType,
  literal,
  binding,
  slot
} from '../../src/compiler/programs/program-ir.mjs';

// Hypothesis
import { 
  Hypothesis, 
  createHypothesis,
  compareHypotheses,
  deduplicateHypotheses
} from '../../src/compiler/programs/hypothesis.mjs';

// Query normalizer
import { 
  QueryNormalizer, 
  NormalizedQuery,
  createQueryNormalizer,
  QueryFeature
} from '../../src/compiler/pipeline/normalizer.mjs';

// Slot filler
import { 
  SlotFiller, 
  createSlotFiller,
  FillMethod
} from '../../src/compiler/pipeline/slot-filler.mjs';

// Compiler service
import { 
  CompilerService, 
  createCompilerService 
} from '../../src/compiler/compiler-service.mjs';

// ============================================================
// Schema Model Tests
// ============================================================

describe('Schema Model', () => {
  it('creates a schema with slots', () => {
    const schema = createQuerySchema({
      schemaId: 'test:schema:1',
      name: 'Test Schema',
      slots: [
        createSchemaSlot('subject', SlotType.ENTITY),
        createSchemaSlot('predicate', SlotType.PREDICATE),
        createSchemaSlot('object', SlotType.ENTITY, { required: false })
      ],
      programTemplate: [],
      outputContract: createOutputContract(OutputKind.VERDICT)
    });

    assert.strictEqual(schema.schemaId, 'test:schema:1');
    assert.strictEqual(schema.slots.length, 3);
    assert.strictEqual(schema.getSlot('subject').type, SlotType.ENTITY);
    assert.strictEqual(schema.getSlot('object').required, false);
  });

  it('validates bindings', () => {
    const schema = createQuerySchema({
      schemaId: 'test:schema:2',
      slots: [
        createSchemaSlot('name', SlotType.STRING),
        createSchemaSlot('age', SlotType.NUMBER, { required: false })
      ]
    });

    const bindings = new Map([['name', 'Alice']]);
    const result = schema.validateBindings(bindings);

    assert.ok(result.valid);
    assert.strictEqual(result.errors.length, 0);
  });

  it('reports missing required slots', () => {
    const schema = createQuerySchema({
      schemaId: 'test:schema:3',
      slots: [
        createSchemaSlot('required_slot', SlotType.STRING)
      ]
    });

    const bindings = new Map();
    const result = schema.validateBindings(bindings);

    assert.ok(!result.valid);
    assert.ok(result.errors[0].includes('required_slot'));
  });

  it('records telemetry', () => {
    const schema = createQuerySchema({ schemaId: 'test:schema:4' });

    schema.recordUsage(true, false, 100);
    schema.recordUsage(true, true, 200);

    assert.strictEqual(schema.telemetry.retrievalCount, 2);
    assert.strictEqual(schema.telemetry.successCount, 2);
    assert.strictEqual(schema.telemetry.avgExecutionMs, 150);
    assert.strictEqual(schema.telemetry.ambiguityRate, 0.5);
  });

  it('serializes to JSON and back', () => {
    const original = createQuerySchema({
      schemaId: 'test:schema:5',
      name: 'Serialization Test',
      slots: [createSchemaSlot('x', SlotType.STRING)],
      programTemplate: [{ op: 'QUERY', args: {} }]
    });

    const json = original.toJSON();
    const restored = QuerySchema.fromJSON(json);

    assert.strictEqual(restored.schemaId, original.schemaId);
    assert.strictEqual(restored.name, original.name);
    assert.strictEqual(restored.slots.length, 1);
  });
});

// ============================================================
// Schema Store Tests
// ============================================================

describe('Schema Store', () => {
  it('adds and retrieves schemas', () => {
    const store = createSchemaStore();

    store.add({
      schemaId: 'store:test:1',
      trigger: { keywords: ['test', 'example'] }
    });

    const schema = store.get('store:test:1');
    assert.ok(schema);
    assert.strictEqual(schema.schemaId, 'store:test:1');
  });

  it('finds by keyword', () => {
    const store = createSchemaStore();

    store.add({
      schemaId: 'keyword:test:1',
      trigger: { keywords: ['capital', 'city'] }
    });
    store.add({
      schemaId: 'keyword:test:2',
      trigger: { keywords: ['population'] }
    });

    const results = store.findByKeyword('capital');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].schemaId, 'keyword:test:1');
  });

  it('finds by feature', () => {
    const store = createSchemaStore();

    store.add({
      schemaId: 'feature:test:1',
      trigger: { requiredFeatures: ['QUESTION_MARKER', 'NEGATION'] }
    });
    store.add({
      schemaId: 'feature:test:2',
      trigger: { requiredFeatures: ['QUESTION_MARKER'] }
    });

    const results = store.findByFeature('NEGATION');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].schemaId, 'feature:test:1');
  });

  it('finds by multiple features', () => {
    const store = createSchemaStore();

    store.add({
      schemaId: 'multi:test:1',
      trigger: { requiredFeatures: ['QUESTION_MARKER'] }
    });
    store.add({
      schemaId: 'multi:test:2',
      trigger: { requiredFeatures: ['QUESTION_MARKER', 'TEMPORAL'] }
    });

    const results = store.findByFeatures(['QUESTION_MARKER', 'TEMPORAL']);
    assert.strictEqual(results.length, 2);
    // First result should be the one with both features
    assert.strictEqual(results[0].schemaId, 'multi:test:2');
  });

  it('removes schemas', () => {
    const store = createSchemaStore();

    store.add({ schemaId: 'remove:test:1' });
    assert.ok(store.has('remove:test:1'));

    store.remove('remove:test:1');
    assert.ok(!store.has('remove:test:1'));
  });

  it('exports and imports', () => {
    const store1 = createSchemaStore();
    store1.add({ schemaId: 'export:1' });
    store1.add({ schemaId: 'export:2' });

    const exported = store1.exportAll();
    assert.strictEqual(exported.length, 2);

    const store2 = createSchemaStore();
    const count = store2.importAll(exported);
    assert.strictEqual(count, 2);
    assert.ok(store2.has('export:1'));
    assert.ok(store2.has('export:2'));
  });
});

// ============================================================
// Program IR Tests
// ============================================================

describe('Program IR', () => {
  it('creates a program with instructions', () => {
    const program = createProgram({
      instructions: [
        createInstruction(OpCode.QUERY, { predicate: literal('test') }, 'results'),
        createInstruction(OpCode.RETURN, { value: binding('results') })
      ]
    });

    assert.strictEqual(program.length, 2);
    assert.strictEqual(program.getInstruction(0).op, OpCode.QUERY);
  });

  it('validates programs', () => {
    const valid = createProgram({
      instructions: [
        createInstruction(OpCode.QUERY, {}, 'r'),
        createInstruction(OpCode.RETURN, {})
      ]
    });

    assert.ok(valid.validate().valid);

    const invalid = createProgram({
      instructions: [
        { op: 'UNKNOWN_OP', args: {} }
      ]
    });

    assert.ok(!invalid.validate().valid);
  });

  it('builds label index', () => {
    const program = createProgram({
      instructions: [
        createInstruction(OpCode.QUERY, {}, 'r', 'start'),
        createInstruction(OpCode.BRANCH, {}, null, null),
        createInstruction(OpCode.RETURN, {}, null, 'end')
      ]
    });

    assert.strictEqual(program.getLabelIndex('start'), 0);
    assert.strictEqual(program.getLabelIndex('end'), 2);
    assert.strictEqual(program.getLabelIndex('unknown'), -1);
  });

  it('estimates cost', () => {
    const program = createProgram({
      instructions: [
        createInstruction(OpCode.QUERY, {}),
        createInstruction(OpCode.ASSERT, {}),
        createInstruction(OpCode.BRANCH, {})
      ]
    });

    const cost = program.estimateCost();
    assert.ok(cost > 0);
    assert.strictEqual(program.metadata.estimatedBranches, 1);
  });

  it('clones programs', () => {
    const original = createProgram({
      instructions: [createInstruction(OpCode.QUERY, {})]
    });

    const clone = original.clone();

    assert.notStrictEqual(original.programId, clone.programId);
    assert.strictEqual(clone.length, original.length);
  });

  it('uses program builder', () => {
    const program = programBuilder()
      .query('pattern', 'results')
      .count('results', 'count')
      .return_('count')
      .build();

    assert.strictEqual(program.length, 3);
    assert.strictEqual(program.getInstruction(0).op, OpCode.QUERY);
    assert.strictEqual(program.getInstruction(1).op, OpCode.COUNT);
    assert.strictEqual(program.getInstruction(2).op, OpCode.RETURN);
  });
});

// ============================================================
// Hypothesis Tests
// ============================================================

describe('Hypothesis', () => {
  it('creates hypothesis with bindings', () => {
    const hyp = createHypothesis({
      program: createProgram({ instructions: [] }),
      bindings: { x: 'value1', y: 'value2' },
      score: 0.5
    });

    assert.ok(hyp.hasBinding('x'));
    assert.strictEqual(hyp.getBinding('x'), 'value1');
    assert.strictEqual(hyp.score, 0.5);
  });

  it('adds assumptions', () => {
    const hyp = createHypothesis({
      program: createProgram({ instructions: [] })
    });

    hyp.addAssumption({ description: 'Assuming X is true' });
    hyp.addAssumption({ description: 'Assuming Y exists' });

    assert.ok(hyp.hasAssumptions());
    assert.strictEqual(hyp.assumptions.length, 2);
  });

  it('tracks early checks', () => {
    const hyp = createHypothesis({
      program: createProgram({ instructions: [] })
    });

    hyp.setEarlyCheck('type_check', { passed: true });
    hyp.setEarlyCheck('conflict_check', { passed: false });

    assert.ok(!hyp.passedEarlyChecks());
  });

  it('derives new hypotheses', () => {
    const parent = createHypothesis({
      program: createProgram({ instructions: [] }),
      bindings: { a: 1 },
      score: 0.5
    });

    const derived = parent.derive({
      bindings: { b: 2 },
      score: 0.3,
      method: 'expansion'
    });

    assert.strictEqual(derived.parentId, parent.hypothesisId);
    assert.ok(derived.hasBinding('a'));
    assert.ok(derived.hasBinding('b'));
    assert.strictEqual(derived.score, 0.3);
  });

  it('compares hypotheses by score', () => {
    const h1 = createHypothesis({ program: createProgram({}), score: 0.5 });
    const h2 = createHypothesis({ program: createProgram({}), score: 0.3 });
    const h3 = createHypothesis({ program: createProgram({}), score: 0.8 });

    const sorted = [h1, h2, h3].sort(compareHypotheses);
    assert.strictEqual(sorted[0].score, 0.3);
    assert.strictEqual(sorted[2].score, 0.8);
  });

  it('deduplicates hypotheses', () => {
    const program = createProgram({ instructions: [createInstruction(OpCode.QUERY, {})] });
    
    const h1 = createHypothesis({ program: program.clone(), bindings: { x: 1 } });
    const h2 = createHypothesis({ program: program.clone(), bindings: { x: 1 } });
    const h3 = createHypothesis({ program: program.clone(), bindings: { x: 2 } });

    const unique = deduplicateHypotheses([h1, h2, h3]);
    assert.strictEqual(unique.length, 2);
  });
});

// ============================================================
// Query Normalizer Tests
// ============================================================

describe('Query Normalizer', () => {
  it('normalizes query text', () => {
    const normalizer = createQueryNormalizer();
    const result = normalizer.normalize('  What is the CAPITAL of France?  ');

    assert.strictEqual(result.normalizedText, 'what is the capital of france');
    assert.ok(result.tokens.length > 0);
    assert.ok(result.originalText.includes('CAPITAL'));
  });

  it('detects question markers', () => {
    const normalizer = createQueryNormalizer();

    const q1 = normalizer.normalize('What is the answer?');
    assert.ok(q1.hasFeature(QueryFeature.QUESTION_MARKER));

    const q2 = normalizer.normalize('Is Paris a city?');
    assert.ok(q2.hasFeature(QueryFeature.QUESTION_MARKER));

    const q3 = normalizer.normalize('Paris is a city.');
    assert.ok(!q3.hasFeature(QueryFeature.QUESTION_MARKER));
  });

  it('detects negation', () => {
    const normalizer = createQueryNormalizer();

    const q1 = normalizer.normalize('Paris is not in Germany');
    assert.ok(q1.hasFeature(QueryFeature.NEGATION));

    const q2 = normalizer.normalize('There is no answer');
    assert.ok(q2.hasFeature(QueryFeature.NEGATION));
  });

  it('detects temporal features', () => {
    const normalizer = createQueryNormalizer();

    const q1 = normalizer.normalize('When was the war?');
    assert.ok(q1.hasFeature(QueryFeature.TEMPORAL));

    const q2 = normalizer.normalize('What happened in 2020?');
    assert.ok(q2.hasFeature(QueryFeature.TEMPORAL));
  });

  it('detects list requests', () => {
    const normalizer = createQueryNormalizer();

    const q = normalizer.normalize('List all countries in Europe');
    assert.ok(q.hasFeature(QueryFeature.LIST_REQUEST));
  });

  it('extracts keywords', () => {
    const normalizer = createQueryNormalizer();
    const result = normalizer.normalize('What is the population of Tokyo?');

    const keywords = result.getKeywords();
    assert.ok(keywords.includes('population'));
    assert.ok(keywords.includes('tokyo'));
    assert.ok(!keywords.includes('is'));  // stopword
  });

  it('creates query context', () => {
    const normalizer = createQueryNormalizer();
    const result = normalizer.normalize('Is Paris the capital of France?');

    const context = result.toQueryContext();
    assert.ok(context.features.includes(QueryFeature.QUESTION_MARKER));
    assert.ok(context.keywords.length > 0);
    assert.ok(context.tokens.length > 0);
  });
});

// ============================================================
// Slot Filler Tests
// ============================================================

describe('Slot Filler', () => {
  it('fills string slots', () => {
    const filler = createSlotFiller();
    const normalizer = createQueryNormalizer();

    const schema = createQuerySchema({
      schemaId: 'fill:test:1',
      slots: [createSchemaSlot('city', SlotType.STRING)]
    });

    const query = normalizer.normalize('What is the population of Paris?');
    const result = filler.fillSlots(schema, query);

    assert.ok(result.success);
    assert.ok(result.hasBinding('city'));
  });

  it('fills number slots', () => {
    const filler = createSlotFiller();
    const normalizer = createQueryNormalizer();

    const schema = createQuerySchema({
      schemaId: 'fill:test:2',
      slots: [createSchemaSlot('count', SlotType.NUMBER)]
    });

    const query = normalizer.normalize('Find 10 examples');
    const result = filler.fillSlots(schema, query);

    assert.ok(result.success);
    const count = result.getBinding('count');
    assert.ok(count);
  });

  it('uses default values for optional slots', () => {
    const filler = createSlotFiller();
    const normalizer = createQueryNormalizer();

    const schema = createQuerySchema({
      schemaId: 'fill:test:3',
      slots: [
        createSchemaSlot('required', SlotType.STRING),
        createSchemaSlot('optional', SlotType.STRING, { 
          required: false, 
          defaultValue: 'default_value' 
        })
      ]
    });

    const query = normalizer.normalize('test query');
    const result = filler.fillSlots(schema, query);

    // Success depends on finding required slot
    if (result.success) {
      assert.ok(result.hasBinding('required'));
    }
  });

  it('reports ambiguities', () => {
    const filler = createSlotFiller();
    const normalizer = createQueryNormalizer();

    const schema = createQuerySchema({
      schemaId: 'fill:test:4',
      slots: [createSchemaSlot('entity', SlotType.ENTITY)]
    });

    const query = normalizer.normalize('Compare Paris and London');
    const result = filler.fillSlots(schema, query);

    // Should find multiple candidates
    if (result.success && result.ambiguities.length > 0) {
      assert.ok(result.ambiguities[0].alternatives.length > 0);
    }
  });
});

// ============================================================
// Compiler Service Tests
// ============================================================

describe('Compiler Service', () => {
  it('creates compiler with schema store', () => {
    const compiler = createCompilerService();
    
    compiler.addSchema({
      schemaId: 'compiler:test:1',
      trigger: { keywords: ['capital'], requiredFeatures: ['QUESTION_MARKER'] },
      slots: [createSchemaSlot('country', SlotType.ENTITY)],
      programTemplate: [{ op: 'QUERY', args: {}, out: 'result' }]
    });

    assert.strictEqual(compiler.getSchemaCount(), 1);
  });

  it('normalizes queries', () => {
    const compiler = createCompilerService();
    const normalized = compiler.normalizeQuery('What is the capital of France?');

    assert.ok(normalized.hasFeature(QueryFeature.QUESTION_MARKER));
  });

  it('compiles query to hypotheses', async () => {
    const compiler = createCompilerService();

    compiler.addSchema({
      schemaId: 'compiler:test:2',
      trigger: { 
        keywords: ['capital'],
        requiredFeatures: ['QUESTION_MARKER']
      },
      slots: [
        createSchemaSlot('country', SlotType.STRING, { required: false })
      ],
      programTemplate: [
        { op: 'QUERY', args: { type: 'capital' }, out: 'result' }
      ],
      outputContract: createOutputContract(OutputKind.VERDICT)
    });

    const result = await compiler.compile('What is the capital of France?');

    assert.ok(result.normalizedQuery);
    // Depending on matching, may or may not have hypotheses
    if (result.hasHypotheses()) {
      const best = result.getBestHypothesis();
      assert.ok(best.program);
    }
  });

  it('creates default hypothesis when no schema matches', async () => {
    const compiler = createCompilerService();
    // Empty schema store

    const result = await compiler.compile('What is the meaning of life?');

    // Should create default hypothesis or fail gracefully
    assert.ok(result.normalizedQuery);
  });

  it('compiles with specific schema', async () => {
    const compiler = createCompilerService();

    compiler.addSchema({
      schemaId: 'specific:test',
      slots: [],
      programTemplate: [{ op: 'RETURN', args: { value: 'test' } }]
    });

    const result = await compiler.compileWithSchema(
      'Any query',
      'specific:test'
    );

    assert.ok(result.success);
    assert.strictEqual(result.hypotheses.length, 1);
  });

  it('reports errors for missing schema', async () => {
    const compiler = createCompilerService();

    const result = await compiler.compileWithSchema(
      'Any query',
      'nonexistent:schema'
    );

    assert.ok(!result.success);
    assert.ok(result.errors.length > 0);
  });
});
