/**
 * Query handler
 * Minimal API layer for VSAVM query processing.
 */

import { handleError } from '../core/error-handling.mjs';
import { createSuccessResponse, createErrorResponse } from './protocol/response.mjs';

export async function handleQuery(vm, request) {
  try {
    const queryText = request?.query ?? '';
    const options = {
      budget: request?.budget,
      mode: request?.mode,
      context: request?.context
    };

    const answer = await vm.answerQuery(queryText, options);
    if (!answer.success) {
      const errorResponse = handleError(
        answer.error instanceof Error ? answer.error : new Error(answer.error ?? 'Query failed'),
        { operation: 'handleQuery', module: 'api.query', inputSummary: queryText }
      );
      const response = createErrorResponse(errorResponse.error, {
        retry: errorResponse.retry,
        suggestion: errorResponse.suggestion
      });
      response.details = answer;
      return response;
    }

    const rendered = vm.renderResult(answer.closure);
    return createSuccessResponse({
      result: answer.closure,
      response: rendered.text,
      rendered
    });
  } catch (error) {
    const handled = handleError(error, { operation: 'handleQuery', module: 'api.query' });
    return createErrorResponse(handled.error, {
      retry: handled.retry,
      suggestion: handled.suggestion
    });
  }
}

export default { handleQuery };
