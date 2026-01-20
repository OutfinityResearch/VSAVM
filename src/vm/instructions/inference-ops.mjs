/**
 * Inference operations for VM
 * Simple forward chaining for modus ponens
 */

import { createFactInstance, createProvenanceLink } from '../../core/types/facts.mjs';
import { createSymbolId, createSourceId } from '../../core/types/identifiers.mjs';
import { stringAtom, termsEqual } from '../../core/types/terms.mjs';

/**
 * INFER: Apply modus ponens rule
 * @param {Object} vmState
 * @param {Object} args
 * @returns {Promise<Object[]>} New facts derived
 */
export async function infer(vmState, args) {
  vmState.budget.consumeSteps('INFER', 10);
  
  const newFacts = [];
  
  // Get all holds facts
  const holdsFacts = await vmState.factStore.query({ predicate: 'logic:holds' });
  
  // Get all implies facts  
  const impliesFacts = await vmState.factStore.query({ predicate: 'logic:implies' });
  
  // Apply modus ponens: if holds(P) and implies(P,Q) then holds(Q)
  for (const holdsFact of holdsFacts) {
    const proposition = holdsFact.arguments.get('proposition');
    if (!proposition) continue;
    
    for (const impliesFact of impliesFacts) {
      const antecedent = impliesFact.arguments.get('antecedent');
      const consequent = impliesFact.arguments.get('consequent');
      
      if (!antecedent || !consequent) continue;
      
      // Check if antecedent matches held proposition
      if (termsEqual(proposition, antecedent)) {
        // Derive holds(consequent)
        const newFact = createFactInstance(
          createSymbolId('logic', 'holds'),
          { proposition: consequent },
          {
            scopeId: vmState.contextStack.current.scopeId,
            provenance: [createProvenanceLink(
              createSourceId('derived', `vm_${vmState.executionId}`),
              { rule: 'modus_ponens', premises: [holdsFact.factId, impliesFact.factId] }
            )]
          }
        );
        
        // Check if we already have this fact
        const existing = await vmState.factStore.query({
          predicate: 'logic:holds',
          arguments: { proposition: consequent }
        });
        
        if (existing.length === 0) {
          await vmState.factStore.assertFact(newFact);
          newFacts.push(newFact);
        }
      }
    }
  }
  
  return newFacts;
}

/**
 * Inference operations registry
 */
export const inferenceOps = {
  INFER: infer
};
