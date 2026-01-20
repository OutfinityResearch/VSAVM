/**
 * Strategy Registry for VSAVM
 * Maps strategy names to factory functions
 */

/**
 * Registry for all strategy types
 */
const registries = {
  vsa: new Map(),
  canonicalizer: new Map(),
  storage: new Map(),
  search: new Map(),
  scoring: new Map(),
  conflictResolver: new Map()
};

/**
 * Register a VSA strategy
 * @param {string} name
 * @param {function(Object): Object} factory
 */
export function registerVSAStrategy(name, factory) {
  registries.vsa.set(name, factory);
}

/**
 * Register a canonicalizer strategy
 * @param {string} name
 * @param {function(Object): Object} factory
 */
export function registerCanonicalizerStrategy(name, factory) {
  registries.canonicalizer.set(name, factory);
}

/**
 * Register a storage strategy
 * @param {string} name
 * @param {function(Object): Object} factory
 */
export function registerStorageStrategy(name, factory) {
  registries.storage.set(name, factory);
}

/**
 * Register a search strategy
 * @param {string} name
 * @param {function(Object): Object} factory
 */
export function registerSearchStrategy(name, factory) {
  registries.search.set(name, factory);
}

/**
 * Register a scoring strategy
 * @param {string} name
 * @param {function(Object): Object} factory
 */
export function registerScoringStrategy(name, factory) {
  registries.scoring.set(name, factory);
}

/**
 * Register a conflict resolver strategy
 * @param {string} name
 * @param {function(Object): Object} factory
 */
export function registerConflictResolverStrategy(name, factory) {
  registries.conflictResolver.set(name, factory);
}

/**
 * Get a VSA strategy by name
 * @param {string} name
 * @param {Object} config
 * @returns {Object}
 */
export function getVSAStrategy(name, config) {
  const factory = registries.vsa.get(name);
  if (!factory) {
    throw new Error(`Unknown VSA strategy: ${name}. Available: ${[...registries.vsa.keys()].join(', ')}`);
  }
  return factory(config);
}

/**
 * Get a canonicalizer strategy by name
 * @param {string} name
 * @param {Object} config
 * @returns {Object}
 */
export function getCanonicalizerStrategy(name, config) {
  const factory = registries.canonicalizer.get(name);
  if (!factory) {
    throw new Error(`Unknown canonicalizer strategy: ${name}. Available: ${[...registries.canonicalizer.keys()].join(', ')}`);
  }
  return factory(config);
}

/**
 * Get a storage strategy by name
 * @param {string} name
 * @param {Object} config
 * @returns {Object}
 */
export function getStorageStrategy(name, config) {
  const factory = registries.storage.get(name);
  if (!factory) {
    throw new Error(`Unknown storage strategy: ${name}. Available: ${[...registries.storage.keys()].join(', ')}`);
  }
  return factory(config);
}

/**
 * Get a search strategy by name
 * @param {string} name
 * @param {Object} config
 * @returns {Object}
 */
export function getSearchStrategy(name, config) {
  const factory = registries.search.get(name);
  if (!factory) {
    throw new Error(`Unknown search strategy: ${name}. Available: ${[...registries.search.keys()].join(', ')}`);
  }
  return factory(config);
}

/**
 * Get a scoring strategy by name
 * @param {string} name
 * @param {Object} config
 * @returns {Object}
 */
export function getScoringStrategy(name, config) {
  const factory = registries.scoring.get(name);
  if (!factory) {
    throw new Error(`Unknown scoring strategy: ${name}. Available: ${[...registries.scoring.keys()].join(', ')}`);
  }
  return factory(config);
}

/**
 * Get a conflict resolver strategy by name
 * @param {string} name
 * @param {Object} config
 * @returns {Object}
 */
export function getConflictResolverStrategy(name, config) {
  const factory = registries.conflictResolver.get(name);
  if (!factory) {
    throw new Error(`Unknown conflict resolver strategy: ${name}. Available: ${[...registries.conflictResolver.keys()].join(', ')}`);
  }
  return factory(config);
}

/**
 * List all registered strategies
 * @returns {Object}
 */
export function listStrategies() {
  return {
    vsa: [...registries.vsa.keys()],
    canonicalizer: [...registries.canonicalizer.keys()],
    storage: [...registries.storage.keys()],
    search: [...registries.search.keys()],
    scoring: [...registries.scoring.keys()],
    conflictResolver: [...registries.conflictResolver.keys()]
  };
}

/**
 * Clear all registries (for testing)
 */
export function clearRegistries() {
  for (const registry of Object.values(registries)) {
    registry.clear();
  }
}
