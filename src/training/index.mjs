/**
 * Training Module Index
 * Per DS005: Training, Learning, and Optimization
 * Per DS011: Generative Decoding with Macro-Units
 * Exports all training components
 */

// Inner loop components
import { PatternMiner, createPatternMiner } from './inner-loop/pattern-miner.mjs';
import { SchemaProposer, createSchemaProposer } from './inner-loop/schema-proposer.mjs';
import { Consolidator, createConsolidator } from './inner-loop/consolidator.mjs';
import { PatternCompressor } from './compression/pattern-compressor.mjs';

// Outer loop components (DS011)
import { MacroUnitModel, createMacroUnitModel } from './outer-loop/macro-unit-model.mjs';
import VMConditionedLanguageModel from './outer-loop/phrase-predictor.mjs';

// Main components
import { RuleLearner, createRuleLearner } from './rule-learner.mjs';
import { TrainingService, createTrainingService } from './training-service.mjs';

// Named exports
export {
  // Inner loop
  PatternMiner,
  createPatternMiner,
  SchemaProposer,
  createSchemaProposer,
  Consolidator,
  createConsolidator,
  PatternCompressor,
  // Outer loop (DS011)
  MacroUnitModel,
  createMacroUnitModel,
  VMConditionedLanguageModel,
  // Main
  RuleLearner,
  createRuleLearner,
  TrainingService,
  createTrainingService
};

// Default export
export default {
  PatternMiner,
  createPatternMiner,
  SchemaProposer,
  createSchemaProposer,
  Consolidator,
  createConsolidator,
  PatternCompressor,
  MacroUnitModel,
  createMacroUnitModel,
  VMConditionedLanguageModel,
  RuleLearner,
  createRuleLearner,
  TrainingService,
  createTrainingService
};
