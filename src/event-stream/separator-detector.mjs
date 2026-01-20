/**
 * Structural Separator Detection
 * Modality-agnostic detection of scope boundaries from input structure
 */

/**
 * Detect structural separators from event stream
 * @param {Array} events - Event stream
 * @returns {Array} Separator positions and types
 */
export function detectStructuralSeparators(events) {
  const separators = [];
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const nextEvent = events[i + 1];
    
    // Text separators
    if (event.type === 'text_token') {
      if (isEndOfSentence(event.payload)) {
        separators.push({ position: i, type: 'sentence', strength: 0.3 });
      }
      if (nextEvent && isParagraphBreak(event, nextEvent)) {
        separators.push({ position: i, type: 'paragraph', strength: 0.7 });
      }
    }
    
    // Explicit structural events
    if (event.type === 'separator') {
      separators.push({ 
        position: i, 
        type: event.payload.separatorType || 'generic',
        strength: event.payload.strength || 0.5 
      });
    }
    
    // Context path changes (most reliable)
    if (nextEvent && hasContextPathChange(event, nextEvent)) {
      const changeDepth = getContextChangeDepth(event.context_path, nextEvent.context_path);
      separators.push({ 
        position: i, 
        type: 'context_change',
        strength: Math.min(changeDepth * 0.2, 1.0),
        depth: changeDepth
      });
    }
  }
  
  return separators;
}

/**
 * Check if token ends sentence
 */
function isEndOfSentence(payload) {
  if (typeof payload === 'string') {
    return /[.!?]$/.test(payload.trim());
  }
  return false;
}

/**
 * Check if there's a paragraph break between events
 */
function isParagraphBreak(event, nextEvent) {
  // Look for double newlines or significant whitespace
  return nextEvent.type === 'separator' || 
         (nextEvent.payload && /^\s*\n\s*\n/.test(nextEvent.payload));
}

/**
 * Check if context path changes between events
 */
function hasContextPathChange(event, nextEvent) {
  const path1 = event.context_path;
  const path2 = nextEvent.context_path;
  
  if (!path1 || !path2) return false;
  
  return JSON.stringify(path1) !== JSON.stringify(path2);
}

/**
 * Calculate depth of context path change
 */
function getContextChangeDepth(path1, path2) {
  if (!path1 || !path2) return 0;
  
  let commonPrefix = 0;
  const minLength = Math.min(path1.length, path2.length);
  
  for (let i = 0; i < minLength; i++) {
    if (path1[i] === path2[i]) {
      commonPrefix++;
    } else {
      break;
    }
  }
  
  // Depth = how many levels changed
  return Math.max(path1.length, path2.length) - commonPrefix;
}

/**
 * Create scope ID from structural separators
 * @param {Array} events - Event stream
 * @param {number} position - Current position
 * @param {Array} separators - Detected separators
 * @returns {Object} ScopeId based on structural context
 */
export function createStructuralScopeId(events, position, separators) {
  const event = events[position];
  
  // Use context path if available (most reliable)
  if (event.context_path && Array.isArray(event.context_path)) {
    return { path: [...event.context_path] };
  }
  
  // Fallback: build path from separators
  const relevantSeparators = separators
    .filter(s => s.position <= position)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3); // Top 3 strongest separators
  
  const path = ['stream'];
  for (const sep of relevantSeparators) {
    path.push(`${sep.type}_${sep.position}`);
  }
  
  return { path };
}

export default {
  detectStructuralSeparators,
  createStructuralScopeId
};
