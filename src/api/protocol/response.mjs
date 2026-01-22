/**
 * API response types
 */

export const ResponseStatus = {
  OK: 'ok',
  ERROR: 'error'
};

/**
 * Create a success response.
 * @param {Object} payload
 * @returns {Object}
 */
export function createSuccessResponse(payload = {}) {
  return {
    status: ResponseStatus.OK,
    success: true,
    ...payload
  };
}

/**
 * Create an error response.
 * @param {Object} error
 * @param {Object} [options]
 * @returns {Object}
 */
export function createErrorResponse(error, options = {}) {
  return {
    status: ResponseStatus.ERROR,
    success: false,
    error,
    retry: options.retry ?? false,
    suggestion: options.suggestion
  };
}

export default {
  ResponseStatus,
  createSuccessResponse,
  createErrorResponse
};
