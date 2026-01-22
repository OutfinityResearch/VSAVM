/**
 * Admin handler
 * Minimal admin operations for VSAVM.
 */

import { handleError } from '../core/error-handling.mjs';
import { createSuccessResponse, createErrorResponse } from './protocol/response.mjs';

export async function handleStats(vm) {
  try {
    const stats = await vm.getStats();
    return createSuccessResponse({ stats });
  } catch (error) {
    const handled = handleError(error, { operation: 'handleStats', module: 'api.admin' });
    return createErrorResponse(handled.error, {
      retry: handled.retry,
      suggestion: handled.suggestion
    });
  }
}

export async function handleRules(vm) {
  try {
    return createSuccessResponse({ rules: vm.getRules() });
  } catch (error) {
    const handled = handleError(error, { operation: 'handleRules', module: 'api.admin' });
    return createErrorResponse(handled.error, {
      retry: handled.retry,
      suggestion: handled.suggestion
    });
  }
}

export default {
  handleStats,
  handleRules
};
