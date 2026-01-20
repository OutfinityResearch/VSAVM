/**
 * Configuration loader for VSAVM
 * Loads config from file or environment
 */

import { readFile } from 'node:fs/promises';
import { createConfig, validateConfig } from './config-schema.mjs';

/**
 * Load configuration from JSON file
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
export async function loadConfigFromFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const overrides = JSON.parse(content);
    const config = createConfig(overrides);
    
    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File not found, return defaults
      return createConfig();
    }
    throw error;
  }
}

/**
 * Load configuration from environment variables
 * Environment variable format: VSAVM_SECTION_KEY (e.g., VSAVM_VSA_DIMENSIONS)
 * @returns {Object}
 */
export function loadConfigFromEnv() {
  const overrides = {};
  
  const envMappings = {
    'VSAVM_VSA_DIMENSIONS': (v) => setPath(overrides, 'vsa.dimensions', parseInt(v)),
    'VSAVM_VSA_THRESHOLD': (v) => setPath(overrides, 'vsa.similarityThreshold', parseFloat(v)),
    'VSAVM_VM_MAX_DEPTH': (v) => setPath(overrides, 'vm.defaultBudget.maxDepth', parseInt(v)),
    'VSAVM_VM_MAX_STEPS': (v) => setPath(overrides, 'vm.defaultBudget.maxSteps', parseInt(v)),
    'VSAVM_VM_MAX_BRANCHES': (v) => setPath(overrides, 'vm.defaultBudget.maxBranches', parseInt(v)),
    'VSAVM_VM_MAX_TIME_MS': (v) => setPath(overrides, 'vm.defaultBudget.maxTimeMs', parseInt(v)),
    'VSAVM_VM_STRICT_MODE': (v) => setPath(overrides, 'vm.strictMode', v === 'true'),
    'VSAVM_VM_TRACE_LEVEL': (v) => setPath(overrides, 'vm.traceLevel', v),
    'VSAVM_SEARCH_BEAM_WIDTH': (v) => setPath(overrides, 'search.beamWidth', parseInt(v)),
    'VSAVM_SEARCH_MAX_ITERATIONS': (v) => setPath(overrides, 'search.maxIterations', parseInt(v)),
    'VSAVM_STRATEGY_VSA': (v) => setPath(overrides, 'strategies.vsa', v),
    'VSAVM_STRATEGY_STORAGE': (v) => setPath(overrides, 'strategies.storage', v),
    'VSAVM_STRATEGY_SEARCH': (v) => setPath(overrides, 'strategies.search', v)
  };
  
  for (const [envKey, setter] of Object.entries(envMappings)) {
    if (process.env[envKey]) {
      setter(process.env[envKey]);
    }
  }
  
  return createConfig(overrides);
}

/**
 * Load configuration with priority: file > env > defaults
 * @param {string} [filePath]
 * @returns {Promise<Object>}
 */
export async function loadConfig(filePath) {
  // Start with env overrides
  const envConfig = loadConfigFromEnv();
  
  // If file path provided, load and merge
  if (filePath) {
    try {
      const fileConfig = await loadConfigFromFile(filePath);
      return createConfig({ ...fileConfig, ...envConfig });
    } catch (error) {
      console.warn(`Failed to load config file: ${error.message}`);
    }
  }
  
  return envConfig;
}

/**
 * Set a nested path in an object
 * @param {Object} obj
 * @param {string} path - Dot-separated path
 * @param {*} value
 */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  
  current[parts[parts.length - 1]] = value;
}
