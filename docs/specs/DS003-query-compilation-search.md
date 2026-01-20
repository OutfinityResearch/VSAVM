# DS003 Query Compilation and Program Search

Note: This document was previously numbered DS018 in earlier drafts. The canonical number is DS003 to match the consolidated spec set in `docs/specs/`.

## Natural Language to Query Compilation

The transformation of natural language queries into executable programs represents one of the most sophisticated capabilities of the VSAVM system.
This process operates through a learned compilation pipeline that maps from surface linguistic patterns to symbolic reasoning strategies without relying on hand-coded rules or fixed templates.

The compilation process begins with query normalization, where the input text is converted into the standard event stream representation and analyzed for structural patterns.
The normalization phase identifies interrogative markers, entity references, relationship indicators,
and logical connectives that provide clues about the intended reasoning strategy.
This structural analysis creates a preliminary representation that captures the essential components of the query while abstracting away surface-level variations in phrasing.

Entity identification within queries requires sophisticated disambiguation techniques that go beyond simple string matching.
The system must determine whether entity mentions refer to specific individuals, general categories, or abstract concepts.
This disambiguation process uses both local context within the query and global context from the knowledge base to resolve ambiguous references.
When multiple interpretations remain plausible, the system maintains parallel hypotheses that are resolved through subsequent reasoning steps.

The entity identification process maintains careful tracking of coreference relationships within complex queries.
Pronouns, definite descriptions,
and other referring expressions must be linked to their appropriate antecedents to ensure accurate query interpretation.
This coreference resolution operates through a combination of syntactic analysis, semantic compatibility checking,
and pragmatic reasoning about the most likely intended referents.

Schema retrieval represents the core mechanism that enables learned compilation rather than rule-based translation.
The system maintains a library of query schemas that capture recurring patterns in the relationship between linguistic expressions and reasoning strategies.
Each schema specifies a linguistic pattern, a corresponding reasoning strategy,
and the conditions under which the schema should be applied.

The retrieval process uses VSA similarity measures to identify schemas that might be relevant to the current query.
The query's hypervector representation is compared against the hypervectors of all stored schemas, producing a ranked list of potential matches.
This similarity-based retrieval enables the system to handle linguistic variations and novel phrasings that might not match any schema exactly but are similar to previously encountered patterns.

Schema matching goes beyond simple similarity to evaluate the structural compatibility between the query and potential schemas.
A schema that is similar in overall content might not be applicable if the query has a different logical structure or requires different types of reasoning.
The matching process evaluates both surface similarity and structural compatibility to identify the most appropriate schemas for detailed consideration.

The system maintains multiple candidate schemas throughout the compilation process rather than committing to a single interpretation immediately.
This approach enables the system to explore different reasoning strategies and select the most promising approach based on the results of preliminary reasoning steps.
The maintenance of multiple hypotheses proves particularly important for ambiguous queries that could be interpreted in several different ways.

Slot filling represents the process of instantiating the selected schemas with specific entities, relationships,
and constraints extracted from the query.
Each schema defines a set of typed slots that must be filled with appropriate values from the query.
The slot filling process must handle both explicit mentions in the query and implicit information that must be inferred from context.

The slot filling algorithm operates through a combination of direct matching, type-based inference,
and semantic association.
Direct matching identifies query elements that correspond exactly to schema slots.
Type-based inference uses the type constraints of schema slots to identify appropriate query elements even when the surface forms differ.
Semantic association uses VSA similarity measures to identify query elements that are semantically related to schema slots even when direct matching fails.

Complex queries often require multiple schemas to be combined or nested to capture the full reasoning requirements.
The compilation system can construct composite programs that invoke multiple schemas in sequence or in parallel.
This composition capability enables the system to handle queries that require multiple types of reasoning or that operate on multiple domains simultaneously.

The composition process must carefully manage the flow of information between different schema instantiations.
Output from one schema might serve as input to another schema, requiring careful type checking and format conversion.
The composition system maintains explicit data flow graphs that track how information moves through the composite reasoning process.

Program instantiation converts the filled schemas into executable programs that can be run on the virtual machine.
This process involves translating the abstract reasoning strategies specified in the schemas into concrete sequences of VM instructions.
The translation process must handle the mapping from high-level reasoning concepts to low-level symbolic operations while maintaining the semantic intent of the original query.

The instantiation process includes optimization steps that improve the efficiency of the generated programs.
Common subexpressions can be identified and computed once rather than repeatedly.
Redundant operations can be eliminated when their results are not used in the final computation.
The order of operations can be rearranged to improve cache locality and reduce memory access overhead.

## Schema and Program Representation (Normative)

This section defines the minimal internal data models that make compilation auditable and interoperable with the VM and bounded closure.
It is normative for DS003 and referenced by DS002/DS004.

### Query schema model

A query schema is a learned mapping from a structured query span to an executable strategy.
Schemas must be storable, retrievable (via VSA), and replayable for audit.

Minimal schema fields:

- `schema_id`: stable identifier.
- `name`: human-readable label (optional).
- `trigger`: retrieval key and structural constraints (e.g., hypervector key + required separators/features).
- `slots`: typed slots with required/optional flags and binding constraints.
- `program_template`: a VM program skeleton with slot references.
- `output_contract`: expected result shape (verdict/object/trace) and emission rules.
- `telemetry`: counters for retrieval frequency, ambiguity rate, and closure failures.

Example (illustrative, not a wire format commitment):

```json
{
  "schema_id": "schema:contradiction_check:v1",
  "trigger": { "vsa_key": "hv:...", "requires": ["QUESTION_MARKER"] },
  "slots": [
    { "name": "claim", "type": "FACT_PATTERN", "required": true }
  ],
  "program_template": [
    { "op": "CANONICALIZE", "in": ["$claim"], "out": ["t0"] },
    { "op": "QUERY", "in": ["t0"], "out": ["matches"] },
    { "op": "CLOSURE", "in": ["budget:current"], "out": ["closure_trace"] }
  ],
  "output_contract": { "kind": "VERDICT", "mode": "STRICT_OR_CONDITIONAL" }
}
```

### Program IR model

Programs are executable artifacts for the VM (DS002).
The compiler must emit a typed, replayable instruction list and attach enough metadata for tracing and budget accounting (DS004).

Minimal program fields:

- `program_id`: stable identifier for caching and audit.
- `instructions`: ordered list of VM instruction objects (`op` + typed operands).
- `resources`: optional budget annotations (estimated steps, expected branchiness).
- `trace_policy`: which intermediate artifacts must be logged for explanation.

### Hypotheses and ambiguity

Compilation is hypothesis-driven.
The system must keep multiple candidate programs when the query is ambiguous, and it must surface that ambiguity into DS004’s strict/conditional/indeterminate modes.

Each candidate program carries:

- `hypothesis_id`
- `bindings` (slot assignments)
- `assumptions` (explicit, referencable handles)
- `score` (MDL-style score + penalties; see below)
- `early_checks` (e.g., type checks, direct conflict checks)

## Program Search and Selection

The program search process explores the space of possible reasoning strategies to identify approaches that are both logically sound and computationally efficient.
This search operates over the space of program structures rather than the space of surface linguistic forms,
enabling the system to discover novel reasoning approaches that might not be apparent from the original query phrasing.

Candidate program generation begins with the schemas identified during the compilation phase but extends beyond these initial suggestions to explore variations and combinations that might prove more effective.
The generation process can modify existing programs by changing parameter values, reordering operations, or substituting alternative sub-programs that achieve similar goals through different means.

The generation process operates under guidance from learned heuristics that identify promising directions for exploration.
These heuristics capture patterns about which types of modifications tend to improve program performance and which types of modifications are likely to lead to dead ends.
The heuristics are learned from previous search episodes and are continuously updated as the system gains more experience.

Program structure exploration considers both the high-level organization of reasoning strategies and the low-level details of instruction sequences.
At the high-level, the system might explore different approaches to decomposing complex queries into simpler sub-problems.
At the low-level, the system might explore different ways of implementing specific reasoning operations or different orders for applying logical rules.

The search process maintains a beam of candidate programs that are evaluated and refined through iterative improvement.
New candidates are generated through typed program rewrites and controlled composition of successful sub-programs.
Rewrite operations make small changes to individual programs, such as modifying parameter values, swapping equivalent instruction sequences, or reordering commutative operations.
Composition operations combine successful components from different candidates to create new hybrid approaches while preserving type correctness and traceability.

Beam management ensures that the search process maintains diversity while focusing computational resources on the most promising candidates.
The system uses score-based selection (MDL-style score plus correctness and budget penalties) while reserving capacity for diverse candidates that may become valuable after additional rewrites.

MDL-based scoring provides the primary evaluation criterion for comparing different candidate programs.
The Minimum Description Length principle favors programs that achieve good performance while remaining relatively simple and general.
This scoring approach helps prevent overfitting to specific examples while encouraging the discovery of broadly applicable reasoning strategies.

The MDL score combines several components that capture different aspects of program quality.
The complexity component measures the length and intricacy of the program structure, penalizing unnecessarily complicated approaches.
The accuracy component measures how well the program satisfies available correctness signals (closure consistency, constraint satisfaction, and—during training—held-out evaluation examples).
The generality component measures how well the program remains applicable under paraphrase variation and nearby contexts rather than overfitting to a single surface form.

Scoring also incorporates computational efficiency considerations that become important when programs must operate under strict time and memory constraints.
Programs that achieve similar logical results but require significantly different computational resources receive different scores that reflect these practical considerations.
This efficiency weighting ensures that the system develops reasoning strategies that can operate effectively in resource-constrained environments.

Consistency checking during search prevents the exploration of program candidates that would lead to logical contradictions or other forms of inconsistency.
Each candidate program is evaluated not only for its direct performance but also for its compatibility with the existing knowledge base and reasoning framework.
Programs that would introduce contradictions or violate established logical principles are eliminated from consideration.

The consistency checking process operates through bounded closure analysis that explores the logical consequences of each candidate program within specified computational limits.
This analysis identifies potential contradictions before they can affect the broader reasoning system.
The bounded nature of this analysis ensures that consistency checking remains computationally feasible even for complex programs.

Beam pruning manages the computational complexity of the search process by maintaining only the most promising candidates at each stage of exploration.
The beam width determines how many candidates are retained for further development.
Wider beams enable more thorough exploration but require more computational resources.
Narrower beams focus resources on the most promising candidates but might miss innovative approaches that require more development to demonstrate their potential.

The pruning process uses sophisticated selection criteria that go beyond simple scores to consider the diversity and potential of the candidate set.
The system maintains candidates that represent different approaches to the reasoning problem, even if some approaches currently perform worse than others.
This diversity maintenance helps prevent premature convergence on suboptimal solutions.

## Schema Learning and Consolidation

The schema learning process discovers recurring patterns in the relationship between natural language queries and effective reasoning strategies.
This learning operates continuously as the system encounters new queries and develops new reasoning approaches, gradually building a library of schemas that capture the most common and effective query-to-program mappings.

Pattern recognition in query-program pairs operates through statistical analysis of the compilation and search processes.
The system maintains detailed logs of which linguistic patterns are associated with which reasoning strategies and how successful different combinations prove to be.
These logs provide the raw material for identifying recurring patterns that deserve consolidation into reusable schemas.

The pattern recognition process must handle the inherent variability in natural language expression while identifying the underlying structural similarities that indicate genuine patterns.
Two queries that use completely different vocabulary might require identical reasoning strategies,
while two queries that use similar vocabulary might require completely different approaches.
The recognition process uses both surface-level linguistic analysis and deep semantic analysis to identify meaningful patterns.

Statistical significance testing ensures that identified patterns represent genuine regularities rather than coincidental associations.
The system applies rigorous statistical tests to determine whether observed correlations between linguistic patterns and reasoning strategies are likely to generalize to new examples.
Only patterns that meet strict significance criteria are considered for consolidation into schemas.

Compression-driven schema emergence follows the same MDL principles that guide program search and selection.
Schemas that enable more compact representation of query-program relationships are preferred over schemas that provide only marginal compression benefits.
This compression criterion ensures that the schema library remains manageable while capturing the most important regularities in the query processing domain.

The compression analysis considers both the direct benefits of individual schemas and the indirect benefits that arise from schema interactions.
A schema that provides modest compression benefits on its own might become highly valuable when combined with other schemas that handle related types of queries.
The analysis process evaluates these interaction effects to identify schemas that contribute to the overall efficiency of the query processing system.

Schema abstraction creates general patterns that can handle multiple variations of similar queries rather than creating separate schemas for each minor variation.
The abstraction process identifies which aspects of query-program relationships represent essential structure and which aspects represent incidental details that can be parameterized or ignored.

The abstraction process operates through hierarchical clustering of similar query-program pairs.
Clusters that contain many similar examples are candidates for abstraction into general schemas.
The abstraction process identifies the common structure within each cluster while parameterizing the aspects that vary across cluster members.

Consolidation triggers determine when accumulated evidence justifies the creation of a new schema or the modification of an existing schema.
The system uses conservative criteria that require substantial evidence before making changes to the schema library.
This conservative approach prevents the creation of spurious schemas based on limited evidence while ensuring that genuinely useful patterns are eventually captured.

The consolidation process includes validation steps that test proposed schemas on held-out examples to ensure that they generalize beyond their training data.
Schemas that perform well on training examples but poorly on validation examples are rejected or modified to improve their generalization capabilities.
This validation process helps prevent overfitting and ensures that the schema library remains useful for processing novel queries.

Schema generalization mechanisms enable existing schemas to be extended to handle new types of queries that are similar to but not identical to previously encountered patterns.
Rather than creating entirely new schemas for minor variations, the generalization process can modify existing schemas to broaden their applicability while maintaining their core functionality.

The generalization process operates through careful analysis of the differences between new queries and existing schema patterns.
When the differences are minor and systematic, the existing schema can be modified to accommodate the new pattern.
When the differences are major or unsystematic, a new schema is created to handle the novel pattern.

## Multimodal Query Processing

The processing of queries that span multiple input modalities requires sophisticated coordination between the different representational systems while maintaining the unified symbolic reasoning framework.
Multimodal queries present unique challenges in entity resolution, temporal alignment,
and cross-modal consistency that go beyond the challenges of purely textual query processing.

Cross-modal reference resolution addresses the fundamental challenge of determining when entities mentioned in different modalities refer to the same real-world objects or concepts.
A query might mention an entity in text while simultaneously showing an image of that entity or playing audio that refers to it.
The resolution process must establish these cross-modal correspondences to enable coherent reasoning about the query.

The resolution process operates through a combination of explicit linking mechanisms and implicit similarity-based association.
Explicit linking occurs when the query provides clear indicators that different modal elements refer to the same entity, such as demonstrative pronouns accompanied by pointing gestures or temporal synchronization between speech and visual elements.
Implicit association uses learned patterns to identify likely correspondences based on semantic similarity and contextual appropriateness.

Cross-modal entity resolution maintains uncertainty estimates that reflect the confidence level of different correspondence hypotheses.
When multiple correspondences are plausible, the system can maintain parallel hypotheses that are resolved through subsequent reasoning steps.
This uncertainty management prevents premature commitment to incorrect correspondences while enabling the reasoning process to proceed with the most likely interpretations.

Temporal and spatial slot filling handles the unique challenges that arise when queries involve time-dependent or location-dependent information.
Multimodal queries often include temporal references that must be resolved against timestamps in audio or video streams.
Similarly, spatial references must be resolved against coordinate systems or object locations in visual inputs.

The slot filling process for temporal information must handle both absolute temporal references and relative temporal references.
Absolute references specify particular times or time ranges that can be matched against timestamps in the input streams.
Relative references specify temporal relationships between events that must be resolved through analysis of the temporal structure of the input.

Spatial slot filling requires coordinate system alignment and object recognition capabilities that can map from linguistic spatial descriptions to specific locations or objects in visual inputs.
The system must handle both precise spatial references that specify exact locations and approximate spatial references that specify general regions or relative positions.

Unified execution despite diverse inputs requires the virtual machine to operate seamlessly across different types of symbolic representations while maintaining consistent reasoning semantics.
The VM must be able to apply the same logical rules and reasoning strategies regardless of whether the input facts were derived from text, audio, visual, or other modalities.

The unification process operates through the canonical fact representation that abstracts away the surface-level differences between different input modalities.
Facts derived from different modalities are converted into the same symbolic format,
enabling the VM to reason about them using the same logical operations.
This abstraction ensures that the reasoning process remains modality-agnostic while preserving the essential semantic content from each input source.

Cross-modal consistency checking ensures that facts derived from different modalities do not contradict each other in ways that would indicate errors in the input processing or interpretation phases.
The consistency checking process must account for the different reliability levels and error characteristics of different input modalities while maintaining overall logical coherence.

The consistency checking process operates through specialized rules that understand the typical error patterns and uncertainty characteristics of different input modalities.
Visual processing might be subject to occlusion or lighting effects that create uncertainty about object properties.
Audio processing might be subject to noise or speaker variation that creates uncertainty about linguistic content.
The consistency checking process weighs these different sources of uncertainty appropriately when detecting and resolving conflicts.

Modality-specific program adaptations enable the reasoning system to take advantage of the unique capabilities and characteristics of different input modalities while maintaining the unified symbolic reasoning framework.
Some types of reasoning might be more naturally suited to particular modalities,
and the program adaptation process can optimize reasoning strategies to take advantage of these natural affinities.

The adaptation process operates through learned associations between reasoning strategies and input modality characteristics.
Reasoning strategies that consistently perform better when applied to facts derived from particular modalities are preferentially selected when those modalities are present in the input.
This adaptive selection improves both the accuracy and efficiency of the reasoning process.

Program adaptation also handles the integration of modality-specific processing capabilities that might not be available for all input types.
Visual processing might enable spatial reasoning capabilities that are not relevant for purely textual inputs.
Audio processing might enable temporal pattern recognition capabilities that are not applicable to static visual inputs.
The adaptation process ensures that these specialized capabilities are utilized when appropriate while maintaining compatibility with the unified reasoning framework.
