/**
 * API request types
 */

export const RequestType = {
  QUERY: 'query',
  STATS: 'stats',
  RULES: 'rules'
};

/**
 * Create a query request.
 * @param {string} query
 * @param {Object} [options]
 * @returns {Object}
 */
export function createQueryRequest(query, options = {}) {
  return {
    type: RequestType.QUERY,
    query,
    budget: options.budget,
    mode: options.mode,
    context: options.context,
    metadata: options.metadata
  };
}

/**
 * Create an admin stats request.
 * @param {Object} [options]
 * @returns {Object}
 */
export function createStatsRequest(options = {}) {
  return {
    type: RequestType.STATS,
    metadata: options.metadata
  };
}

/**
 * Create an admin rules request.
 * @param {Object} [options]
 * @returns {Object}
 */
export function createRulesRequest(options = {}) {
  return {
    type: RequestType.RULES,
    metadata: options.metadata
  };
}

export default {
  RequestType,
  createQueryRequest,
  createStatsRequest,
  createRulesRequest
};
