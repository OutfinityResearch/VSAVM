/**
 * Scope builder utilities
 * Per DS001/DS006: derive ScopeId from structural context paths only
 */

import { createScopeId } from '../../core/types/identifiers.mjs';
import { normalizeContextPath } from '../../core/types/events.mjs';

/**
 * Create a ScopeId from a context path.
 * @param {string[]|string} contextPath
 * @returns {{path: string[]}}
 */
export function scopeIdFromContextPath(contextPath) {
  const path = normalizeContextPath(contextPath);
  return createScopeId(path.length ? path : ['stream']);
}

/**
 * Extend a context path with a new segment.
 * @param {string[]|string} basePath
 * @param {string} segment
 * @returns {string[]}
 */
export function extendContextPath(basePath, segment) {
  const path = normalizeContextPath(basePath);
  return [...path, String(segment)];
}

/**
 * Create a ScopeId from an event's context path.
 * @param {Object} event
 * @returns {{path: string[]}}
 */
export function scopeIdFromEvent(event) {
  if (!event) return createScopeId(['stream']);
  return scopeIdFromContextPath(event.contextPath ?? event.context_path ?? []);
}

export default {
  scopeIdFromContextPath,
  scopeIdFromEvent,
  extendContextPath
};
