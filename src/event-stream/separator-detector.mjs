/**
 * Structural Separator Detection
 * VSA-based modality-agnostic detection of scope boundaries
 */

import { VSASeparatorDetector } from './vsa-separator-detector.mjs';
import { createScopeId } from '../core/types/identifiers.mjs';

// Global VSA detector instance
const vsaDetector = new VSASeparatorDetector();

/**
 * Detect structural separators using VSA similarity gradients
 * @param {Array} events - Event stream
 * @returns {Array} Separator positions and types
 */
export async function detectStructuralSeparators(events) {
  return await vsaDetector.detectSeparators(events);
}

export function updateSeparatorThreshold(reasoningSuccess) {
  return vsaDetector.updateThreshold(reasoningSuccess);
}

function getEventContextPath(event) {
  if (!event) return null;
  if (Array.isArray(event.contextPath)) return event.contextPath;
  if (Array.isArray(event.context_path)) return event.context_path;
  return null;
}

/**
 * Create scope ID from structural separators using VSA detection
 * @param {Array} events - Event stream
 * @param {number} position - Current position
 * @param {Array} separators - VSA-detected separators
 * @returns {Object} ScopeId based on structural context
 */
export function createStructuralScopeId(events, position, separators) {
  const event = events[position];
  
  // Use context path if available (most reliable)
  const contextPath = getEventContextPath(event);
  if (contextPath) {
    return createScopeId([...contextPath]);
  }
  
  // Fallback: build path from VSA-detected separators
  const relevantSeparators = separators
    .filter(s => s.position <= position)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3); // Top 3 strongest separators
  
  const path = ['stream'];
  for (const sep of relevantSeparators) {
    path.push(`${sep.type}_${sep.position}`);
  }
  
  return createScopeId(path);
}

export default {
  detectStructuralSeparators,
  createStructuralScopeId,
  updateSeparatorThreshold
};
