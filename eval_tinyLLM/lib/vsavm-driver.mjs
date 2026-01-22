import { createWriteStream } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createDefaultVSAVM } from '../../src/index.mjs';
import { EventType, createTextTokenPayload } from '../../src/core/types/events.mjs';
import { createSourceId } from '../../src/core/types/identifiers.mjs';
import { encodeBytes, streamRecords } from './dataset.mjs';
import { createMacroUnitModel } from '../../src/training/index.mjs';

function makeToken(byte) {
  return `b${byte.toString(16).padStart(2, '0')}`;
}

export async function createVSAVMInstance() {
  const vm = createDefaultVSAVM();
  await vm.initialize();
  return vm;
}

export function buildEventsForRecord(text, recordIndex, options = {}) {
  const bytes = encodeBytes(text);
  const events = [];
  const sourceId = createSourceId('document', options.sourceId ?? 'tinyllm');
  const contextRoot = ['dataset', `record_${recordIndex}`];

  for (let i = 0; i < bytes.length; i++) {
    const token = makeToken(bytes[i]);
    events.push({
      eventId: options.eventIdOffset + i,
      type: EventType.TEXT_TOKEN,
      payload: createTextTokenPayload(token, { byte: bytes[i] }),
      contextPath: [...contextRoot, `byte_${i}`],
      sourceRef: {
        sourceId,
        offset: i
      }
    });
  }

  return { events, bytesLength: bytes.length };
}

export async function ingestDataset(vm, inputPath, options = {}) {
  const maxRecords = options.maxRecords ?? Infinity;
  const maxBytesPerRecord = options.maxBytesPerRecord ?? Infinity;
  const sourceId = options.sourceId ?? 'tinyllm';

  let recordIndex = 0;
  let eventIdOffset = 0;
  let totalEvents = 0;

  for await (const record of streamRecords(inputPath, {
    textField: options.textField,
    maxBytes: options.maxBytes,
    maxRecords
  })) {
    const clipped = record.length > maxBytesPerRecord
      ? record.slice(0, maxBytesPerRecord)
      : record;

    const { events, bytesLength } = buildEventsForRecord(clipped, recordIndex, {
      sourceId,
      eventIdOffset
    });

    await vm.ingestEvents(events, { sourceId });

    totalEvents += events.length;
    eventIdOffset += bytesLength;
    recordIndex += 1;
  }

  return { records: recordIndex, events: totalEvents };
}

export async function saveFacts(vm, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  const facts = vm.storage.getAllFacts ? vm.storage.getAllFacts() : [];
  const data = JSON.stringify(facts);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write(data);
    stream.end();
  });
  return facts.length;
}

export async function loadFacts(vm, inputPath) {
  const raw = await readFile(inputPath, 'utf8');
  const facts = JSON.parse(raw);
  for (const fact of facts) {
    if (!fact || !fact.predicate) continue;
    if (!(fact.arguments instanceof Map)) {
      if (Array.isArray(fact.arguments)) {
        fact.arguments = new Map(fact.arguments);
      } else if (fact.arguments && typeof fact.arguments === 'object') {
        fact.arguments = new Map(Object.entries(fact.arguments));
      } else {
        fact.arguments = new Map();
      }
    }
    if (fact.qualifiers && !(fact.qualifiers instanceof Map)) {
      if (Array.isArray(fact.qualifiers)) {
        fact.qualifiers = new Map(fact.qualifiers);
      } else if (typeof fact.qualifiers === 'object') {
        fact.qualifiers = new Map(Object.entries(fact.qualifiers));
      }
    }
    await vm.assertFact(fact);
  }
  return facts.length;
}

export async function answerWithVSAVM(vm, text, options = {}) {
  const result = await vm.answerQuery(text, options);
  if (!result.success) {
    return { text: result.error ?? 'Query failed', raw: result };
  }
  const rendered = vm.renderResult(result.closure);
  return { text: rendered.text, raw: result };
}

/**
 * Load a trained MacroUnitModel from file
 * @param {string} modelPath - Path to model JSON file
 * @returns {Promise<MacroUnitModel>}
 */
export async function loadMacroUnitModel(modelPath) {
  const raw = await readFile(modelPath, 'utf8');
  const state = JSON.parse(raw);
  const model = createMacroUnitModel();
  model.import(state);
  return model;
}

/**
 * Generate text using VSAVM's MacroUnitModel (DS011)
 * @param {MacroUnitModel} model - Trained model
 * @param {string} prompt - Text prompt
 * @param {Object} [options]
 * @param {number} [options.maxTokens=100] - Maximum tokens to generate
 * @param {number} [options.temperature=1.0] - Sampling temperature (not used in deterministic mode)
 * @returns {Promise<Object>}
 */
export async function generateWithVSAVM(model, prompt, options = {}) {
  const maxTokens = options.maxTokens ?? 100;
  const temperature = options.temperature;
  const budgetMs = options.budgetMs;
  const promptBytes = Array.from(encodeBytes(prompt));
  
  const result = await model.generate(promptBytes, {
    maxTokens,
    temperature,
    budgetMs
  });
  
  // Decode generated tokens to text
  const generatedText = Buffer.from(result.tokens).toString('utf8');
  
  return {
    text: generatedText,
    tokens: result.tokens,
    promptLength: promptBytes.length,
    generatedLength: result.generatedLength,
    macroUnits: result.macroUnits,
    compressionRatio: result.compressionRatio,
    totalTokens: result.tokens.length,
    timedOut: result.timedOut ?? false
  };
}

/**
 * Calculate perplexity for a text using the model
 * @param {MacroUnitModel} model
 * @param {string} text
 * @returns {number}
 */
export function calculateVSAVMPerplexity(model, text) {
  const bytes = Array.from(encodeBytes(text));
  return model.calculatePerplexity(bytes);
}

/**
 * Calculate compression ratio for a text
 * @param {MacroUnitModel} model
 * @param {string} text
 * @returns {number}
 */
export function calculateVSAVMCompression(model, text) {
  const bytes = Array.from(encodeBytes(text));
  const encoded = model.encode(bytes);
  return encoded.length / bytes.length;
}
