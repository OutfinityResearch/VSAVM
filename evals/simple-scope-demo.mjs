/**
 * Simple demo of why scopes matter
 */

import { createDefaultVSAVM } from '../src/index.mjs';
import { createFactInstance, createProvenanceLink } from '../src/core/types/facts.mjs';
import { createSymbolId, createScopeId, createSourceId } from '../src/core/types/identifiers.mjs';
import { stringAtom } from '../src/core/types/terms.mjs';

const vm = createDefaultVSAVM();
await vm.initialize();

console.log('🧠 Why Scopes Matter for Real Learning\n');

// Add "Python" facts in different domains
const progFact = createFactInstance(
  createSymbolId('def', 'python'),
  { meaning: stringAtom('Programming language') },
  { scopeId: createScopeId(['programming']), provenance: [createProvenanceLink(createSourceId('stackoverflow', '1'))] }
);

const bioFact = createFactInstance(
  createSymbolId('def', 'python'),
  { meaning: stringAtom('Large snake') },
  { scopeId: createScopeId(['biology']), provenance: [createProvenanceLink(createSourceId('wikipedia', '1'))] }
);

await vm.assertFact(progFact);
await vm.assertFact(bioFact);

// Query by scope
const progResults = await vm.storage.query({ predicate: 'def:python', scope: createScopeId(['programming']) });
const bioResults = await vm.storage.query({ predicate: 'def:python', scope: createScopeId(['biology']) });

console.log('🔍 Programming scope:', progResults[0]?.arguments.get('meaning').value);
console.log('🔍 Biology scope:', bioResults[0]?.arguments.get('meaning').value);

console.log('\n💡 Without scopes: Conflicting definitions!');
console.log('💡 With scopes: Each domain keeps its knowledge clean');

await vm.close();
