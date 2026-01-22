/**
 * API module index
 */

export { handleQuery } from './query-handler.mjs';
export { handleStats, handleRules } from './admin-handler.mjs';
export { 
  RequestType, 
  createQueryRequest, 
  createStatsRequest, 
  createRulesRequest 
} from './protocol/request.mjs';
export { 
  ResponseStatus, 
  createSuccessResponse, 
  createErrorResponse 
} from './protocol/response.mjs';

import { handleQuery } from './query-handler.mjs';
import { handleStats, handleRules } from './admin-handler.mjs';
import { RequestType } from './protocol/request.mjs';
import { createErrorResponse } from './protocol/response.mjs';

/**
 * Handle a protocol request object and dispatch to handlers.
 * @param {Object} vm
 * @param {Object} request
 * @returns {Promise<Object>}
 */
export async function handleRequest(vm, request) {
  const type = request?.type ?? (request?.query ? RequestType.QUERY : null);
  switch (type) {
    case RequestType.QUERY:
      return handleQuery(vm, request);
    case RequestType.STATS:
      return handleStats(vm, request);
    case RequestType.RULES:
      return handleRules(vm, request);
    default:
      return createErrorResponse(
        new Error(`Unsupported request type: ${type ?? 'unknown'}`),
        { retry: false }
      );
  }
}
