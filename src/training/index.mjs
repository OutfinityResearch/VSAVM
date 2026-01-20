/**
 * Training Module Index
 * Per DS005: Training, Learning, and Optimization
 * Exports all training components
 */

// Inner loop components
import { PatternMiner, createPatternMiner } from './inner-loop/pattern-miner.mjs';
import { SchemaProposer, createSchemaProposer } from './inner-loop/schema-proposer.mjs';
import { Consolidator, createConsolidator } from './inner-loop/consolidator.mjs';

// Main components
import { RuleLearner, createRuleLearner } from './rule-learner.mjs';
import { TrainingService, createTrainingService } from './training-service.mjs';

// Named exports
export {
  PatternMiner,
  createPatternMiner,
  SchemaProposer,
  createSchemaProposer,
  Consolidator,
  createConsolidator,
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
  RuleLearner,
  createRuleLearner,
  TrainingService,
  createTrainingService
};
