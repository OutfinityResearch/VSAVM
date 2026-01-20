/**
 * Realistic Cross-Domain Scope Isolation Demo
 * Shows how VSAVM handles the same term across different structural contexts
 */

import { createDefaultVSAVM } from '../src/index.mjs';
import { stringAtom } from '../src/core/types/terms.mjs';
import { createSymbolId, createScopeId, createSourceId } from '../src/core/types/identifiers.mjs';
import { createFactInstance, createProvenanceLink } from '../src/core/types/facts.mjs';

async function demonstrateRealisticScopes() {
  console.log('🐍 REALISTIC CROSS-DOMAIN SCOPE ISOLATION DEMO\n');
  
  const vm = createDefaultVSAVM();
  await vm.initialize();
  
  try {
    // 1. Programming context - structural scope from document
    const progFact = createFactInstance(
      createSymbolId('knowledge', 'definition'),
      { 
        term: stringAtom('Python'),
        definition: stringAtom('Programming language created by Guido van Rossum'),
        domain: stringAtom('programming')
      },
      { 
        scopeId: createScopeId(['document', 'programming_guide', 'languages']),
        provenance: [createProvenanceLink(createSourceId('source', 'stackoverflow'))]
      }
    );
    
    // 2. Biology context - structural scope from textbook
    const bioFact = createFactInstance(
      createSymbolId('knowledge', 'definition'),
      {
        term: stringAtom('Python'),
        definition: stringAtom('Large non-venomous snake that kills by constriction'),
        domain: stringAtom('biology')
      },
      {
        scopeId: createScopeId(['document', 'biology_textbook', 'reptiles']),
        provenance: [createProvenanceLink(createSourceId('source', 'wikipedia_animals'))]
      }
    );
    
    // 3. Mythology context - structural scope from encyclopedia
    const mythFact = createFactInstance(
      createSymbolId('knowledge', 'definition'),
      {
        term: stringAtom('Python'),
        definition: stringAtom('Dragon killed by Apollo at Delphi in Greek mythology'),
        domain: stringAtom('mythology')
      },
      {
        scopeId: createScopeId(['document', 'mythology_encyclopedia', 'greek_myths']),
        provenance: [createProvenanceLink(createSourceId('source', 'britannica'))]
      }
    );
    
    // Assert all facts
    await vm.assertFact(progFact);
    await vm.assertFact(bioFact);
    await vm.assertFact(mythFact);
    
    console.log('✅ Added 3 different "Python" definitions to different structural scopes\n');
    
    // Query each scope separately
    const domains = ['programming_guide', 'biology_textbook', 'mythology_encyclopedia'];
    
    for (const domain of domains) {
      const results = await vm.storage.query({
        predicate: 'knowledge:definition',
        scope: createScopeId(['document', domain + '_guide', 'section_1'])
      });
      
      if (results.length > 0) {
        const definition = results[0].arguments.get('definition').value;
        console.log(`🔍 [${domain.toUpperCase()}]: ${definition}`);
      }
    }
    
    console.log('\n💡 Without scopes: All 3 definitions would conflict!');
    console.log('💡 With structural scopes: Each document section has its correct knowledge');
    
  } finally {
    await vm.close();
  }
}

// Run demo
demonstrateRealisticScopes();
