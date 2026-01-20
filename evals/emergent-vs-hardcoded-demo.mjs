/**
 * Demo: Emergent vs Hardcoded Scope Discovery
 * Shows the difference between domain-specific hardcoded scopes and structural emergent scopes
 */

import { detectStructuralSeparators, createStructuralScopeId } from '../src/event-stream/separator-detector.mjs';
import { createScopeId } from '../src/core/types/identifiers.mjs';

console.log('🔍 EMERGENT vs HARDCODED SCOPE DISCOVERY\n');

// Example event stream from mixed content
const eventStream = [
  { type: 'text_token', payload: 'function calculateSum(a, b) {', context_path: ['file', 'function_1'] },
  { type: 'text_token', payload: '  return a + b;', context_path: ['file', 'function_1', 'body'] },
  { type: 'text_token', payload: '}', context_path: ['file', 'function_1'] },
  { type: 'separator', payload: { separatorType: 'function_end', strength: 0.8 } },
  { type: 'text_token', payload: 'The mitochondria is the powerhouse', context_path: ['file', 'paragraph_1'] },
  { type: 'text_token', payload: 'of the cell.', context_path: ['file', 'paragraph_1'] },
  { type: 'separator', payload: { separatorType: 'paragraph', strength: 0.7 } },
  { type: 'text_token', payload: 'Patient shows symptoms of fever', context_path: ['file', 'record_1'] },
  { type: 'text_token', payload: 'and elevated white blood cell count.', context_path: ['file', 'record_1'] }
];

console.log('❌ HARDCODED APPROACH (WRONG):');
try {
  console.log('- Programming scope:', JSON.stringify(createScopeId(['domain', 'programming'])));
} catch (e) {
  console.log('- Programming scope: REJECTED -', e.message);
}
try {
  console.log('- Biology scope:', JSON.stringify(createScopeId(['domain', 'biology'])));
} catch (e) {
  console.log('- Biology scope: REJECTED -', e.message);
}
try {
  console.log('- Medical scope:', JSON.stringify(createScopeId(['domain', 'medical'])));
} catch (e) {
  console.log('- Medical scope: REJECTED -', e.message);
}
console.log('❌ Problems: Domain knowledge hardcoded, not modality-agnostic, manual engineering required\n');

console.log('✅ EMERGENT STRUCTURAL APPROACH (CORRECT):');

// Detect separators automatically
const separators = detectStructuralSeparators(eventStream);
console.log('Detected separators:', separators.map(s => `${s.type}@${s.position}(${s.strength})`).join(', '));

// Create scopes from structure
const scopes = [];
for (let i = 0; i < eventStream.length; i++) {
  const scope = createStructuralScopeId(eventStream, i, separators);
  scopes.push({ position: i, scope, content: eventStream[i].payload });
}

console.log('\nEmergent scopes:');
scopes.forEach((item, i) => {
  console.log(`${i}: ${JSON.stringify(item.scope)} - "${item.content}"`);
});

console.log('\n✅ Benefits:');
console.log('- No domain knowledge hardcoded');
console.log('- Works across modalities (text, video, audio, code)');
console.log('- Automatic separator detection');
console.log('- Structural boundaries emerge from data');
console.log('- VSA clustering can refine boundaries');
console.log('- RL optimization shapes effectiveness');

console.log('\n🎯 MODALITY-AGNOSTIC DESIGN:');
console.log('- Text: paragraphs, sentences, sections');
console.log('- Code: functions, classes, modules');
console.log('- Video: scenes, shots, frames');
console.log('- Audio: speakers, segments, pauses');
console.log('- All detected through structural separators, not domain rules');
