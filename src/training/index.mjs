/**
 * Training Module Index
 * Per DS005: Training, Learning, and Optimization
 * Exports all training components
 */

// Inner loop components
export { 
  PatternMiner, 
  createPatternMiner 
} from './inner-loop/pattern-miner.mjs';

export { 
  SchemaProposer, 
  createSchemaProposer 
} from './inner-loop/schema-proposer.mjs';

export { 
  Consolidator, 
  createConsolidator 
} from './inner-loop/consolidator.mjs';

// Main components
export { 
  RuleLearner, 
  createRuleLearner 
} from './rule-learner.mjs';

export { 
  TrainingService, 
  createTrainingService 
} from './training-service.mjs';

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
