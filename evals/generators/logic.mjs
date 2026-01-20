/**
 * Logical Relation Generators
 * Generates facts and rules for reasoning tests
 */

import { 
  createSymbolId, 
  createScopeId, 
  createSourceId 
} from '../../src/core/types/identifiers.mjs';
import { stringAtom, entityAtom } from '../../src/core/types/terms.mjs';
import { 
  createFactInstance, 
  createProvenanceLink,
  Polarity 
} from '../../src/core/types/facts.mjs';
import { createEntityId } from '../../src/core/types/identifiers.mjs';

/**
 * Generate a family tree dataset
 * @returns {{facts: Object[], rules: Object[], queries: Object[]}}
 */
export function generateFamilyTree() {
  const facts = [];
  const scope = createScopeId(['test', 'family']);
  const source = createSourceId('test', 'family_gen');
  
  // People
  const people = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
  
  // Parent relationships
  const parentRelations = [
    ['Alice', 'Carol'],  // Alice is parent of Carol
    ['Bob', 'Carol'],    // Bob is parent of Carol
    ['Alice', 'Dave'],
    ['Bob', 'Dave'],
    ['Carol', 'Eve'],
    ['Dave', 'Frank']
  ];
  
  for (const [parent, child] of parentRelations) {
    facts.push(createFactInstance(
      createSymbolId('family', 'parent'),
      {
        parent: entityAtom(createEntityId('person', parent)),
        child: entityAtom(createEntityId('person', child))
      },
      {
        scopeId: scope,
        provenance: [createProvenanceLink(source)]
      }
    ));
  }
  
  // Rules for inference
  const rules = [
    {
      name: 'grandparent',
      premises: [
        { predicate: createSymbolId('family', 'parent'), arguments: { parent: '?gp', child: '?p' } },
        { predicate: createSymbolId('family', 'parent'), arguments: { parent: '?p', child: '?gc' } }
      ],
      conclusion: {
        predicate: createSymbolId('family', 'grandparent'),
        arguments: { grandparent: '?gp', grandchild: '?gc' }
      }
    },
    {
      name: 'sibling',
      premises: [
        { predicate: createSymbolId('family', 'parent'), arguments: { parent: '?p', child: '?c1' } },
        { predicate: createSymbolId('family', 'parent'), arguments: { parent: '?p', child: '?c2' } }
      ],
      conclusion: {
        predicate: createSymbolId('family', 'sibling'),
        arguments: { person1: '?c1', person2: '?c2' }
      }
    }
  ];
  
  // Expected inferences for verification
  const queries = [
    {
      query: { predicate: 'family:grandparent' },
      expectedCount: 2,  // Alice/Bob -> Eve, Carol/Dave -> Frank
      description: 'Find all grandparent relations'
    },
    {
      query: { predicate: 'family:sibling' },
      expectedCount: 2,  // Carol-Dave (both ways)
      description: 'Find all sibling relations'
    }
  ];
  
  return { facts, rules, queries };
}

/**
 * Generate a taxonomy dataset (is-a relationships)
 * @returns {{facts: Object[], rules: Object[], queries: Object[]}}
 */
export function generateTaxonomy() {
  const facts = [];
  const scope = createScopeId(['test', 'taxonomy']);
  const source = createSourceId('test', 'taxonomy_gen');
  
  // Taxonomy: Animal -> Mammal -> Dog, Cat
  //                  -> Bird -> Eagle, Sparrow
  const isA = [
    ['Dog', 'Mammal'],
    ['Cat', 'Mammal'],
    ['Mammal', 'Animal'],
    ['Eagle', 'Bird'],
    ['Sparrow', 'Bird'],
    ['Bird', 'Animal']
  ];
  
  for (const [child, parent] of isA) {
    facts.push(createFactInstance(
      createSymbolId('taxonomy', 'is_a'),
      {
        subtype: entityAtom(createEntityId('concept', child)),
        supertype: entityAtom(createEntityId('concept', parent))
      },
      {
        scopeId: scope,
        provenance: [createProvenanceLink(source)]
      }
    ));
  }
  
  // Transitive closure rule
  const rules = [
    {
      name: 'is_a_transitive',
      premises: [
        { predicate: createSymbolId('taxonomy', 'is_a'), arguments: { subtype: '?a', supertype: '?b' } },
        { predicate: createSymbolId('taxonomy', 'is_a'), arguments: { subtype: '?b', supertype: '?c' } }
      ],
      conclusion: {
        predicate: createSymbolId('taxonomy', 'is_a'),
        arguments: { subtype: '?a', supertype: '?c' }
      }
    }
  ];
  
  const queries = [
    {
      query: { 
        predicate: 'taxonomy:is_a',
        arguments: { supertype: entityAtom(createEntityId('concept', 'Animal')) }
      },
      expectedCount: 6,  // All should be Animals (direct + inferred)
      description: 'Find all animals'
    }
  ];
  
  return { facts, rules, queries };
}

/**
 * Generate propositional logic facts
 * @returns {{facts: Object[], expectedInferences: number}}
 */
export function generatePropositionalLogic() {
  const facts = [];
  const scope = createScopeId(['test', 'logic']);
  const source = createSourceId('test', 'logic_gen');
  
  // Simple implications: if A then B, if B then C => if A then C
  const propositions = ['P', 'Q', 'R', 'S', 'T'];
  const implications = [
    ['P', 'Q'],
    ['Q', 'R'],
    ['R', 'S']
  ];
  
  // Assert P is true
  facts.push(createFactInstance(
    createSymbolId('logic', 'holds'),
    { proposition: stringAtom('P') },
    { scopeId: scope, provenance: [createProvenanceLink(source)] }
  ));
  
  // Assert implications
  for (const [antecedent, consequent] of implications) {
    facts.push(createFactInstance(
      createSymbolId('logic', 'implies'),
      { 
        antecedent: stringAtom(antecedent),
        consequent: stringAtom(consequent)
      },
      { scopeId: scope, provenance: [createProvenanceLink(source)] }
    ));
  }
  
  return {
    facts,
    rules: [
      {
        name: 'modus_ponens',
        premises: [
          { predicate: createSymbolId('logic', 'holds'), arguments: { proposition: '?p' } },
          { predicate: createSymbolId('logic', 'implies'), arguments: { antecedent: '?p', consequent: '?q' } }
        ],
        conclusion: {
          predicate: createSymbolId('logic', 'holds'),
          arguments: { proposition: '?q' }
        }
      }
    ],
    expectedInferences: 3  // Q, R, S should all be derived
  };
}

/**
 * Generate contradiction test cases
 * @returns {{facts: Object[], hasContradiction: boolean}}
 */
export function generateContradictionTest() {
  const scope = createScopeId(['test', 'contradiction']);
  const source = createSourceId('test', 'contradiction_gen');
  
  // Create a fact and its negation
  const positiveFact = createFactInstance(
    createSymbolId('test', 'color'),
    { 
      entity: entityAtom(createEntityId('object', 'sky')),
      color: stringAtom('blue')
    },
    {
      polarity: Polarity.ASSERT,
      scopeId: scope,
      provenance: [createProvenanceLink(source)]
    }
  );
  
  // Same fact ID, but DENY polarity
  const negativeFact = createFactInstance(
    createSymbolId('test', 'color'),
    { 
      entity: entityAtom(createEntityId('object', 'sky')),
      color: stringAtom('blue')
    },
    {
      polarity: Polarity.DENY,
      scopeId: scope,
      provenance: [createProvenanceLink(source)]
    }
  );
  
  return {
    facts: [positiveFact, negativeFact],
    hasContradiction: true
  };
}
