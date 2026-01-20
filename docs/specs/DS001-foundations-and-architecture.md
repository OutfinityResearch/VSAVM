# DS001 Foundations and Architecture

This document consolidates the core theoretical foundations of VSAVM into a single architectural specification: an LLM-like interface grounded in an executable virtual machine, a modality-agnostic event stream, structural scoping, and VSA as a similarity accelerator (not a truth mechanism).

## High-Level Vision

VSAVM is an Axiologic Research experiment within the Achilles project.
The system exposes an LLM-like interface, yet its core is an executable virtual machine.
Next-phrase prediction remains the primary training objective,
but it is conditioned on VM state obtained through execution.
Correctness is defined operationally as avoiding contradictions both immediately and within a bounded transitive closure.

Multimodality is handled through a unified event stream in which any input becomes symbolic events with structural separators.
Text enters directly as events.
Audio enters as transcription events plus temporal metadata such as timestamps.
Images and video enter as symbolic descriptions or as discrete visual tokens produced by an external encoder,
but the design does not depend on the exact token type; the key requirement is discreteness and structural segmentability.

The NL to query compiler is not hardcoded; it is learned as an emergent capability under compression and prediction pressure, turning recurring intents into compact executable query programs.
VSA accelerates this process by clustering paraphrases and retrieving similar schemas quickly, but
VSA does not decide truth.
VSA decides what is worth exploring,
while the VM decides acceptability through execution and bounded closure.

At runtime the input is segmented into events, candidate interpretations are executed in the VM, the question is compiled into query programs through retrieval and program search,
and the system produces a response through next-phrase completion guided by VM state.
When a user asks the system to think more, the closure and exploration budget increases.
The system preserves the consistency contract by strengthening conclusions when possible or falling back to conditional results or indeterminacy when contradictions cannot be ruled out within the configured budget.

## LLM-like Interface with Virtual Machine Core

The VSAVM system presents a conversational interface that mirrors large language models while operating on fundamentally different principles.
Where traditional LLMs maintain understanding as latent numerical states distributed across parameters, VSAVM constructs and executes explicit programs within a virtual machine.
This architectural choice enables operational correctness guarantees that are impossible with purely statistical approaches.

The interface accepts natural language queries and produces responses that appear fluent and contextually appropriate.
However, beneath this familiar surface lies a symbolic execution engine that builds internal representations of facts, rules,
and logical relationships.
When a user asks a question, the system does not merely predict the most likely continuation based on training patterns.
Instead, it compiles the question into an executable program, runs this program against its knowledge base,
and generates responses based on the computed results.

This dual nature creates a system that combines the accessibility of conversational AI with the reliability of symbolic reasoning.
Users interact through natural language without needing to learn formal query languages or logical notation.
The system handles the translation from natural language to executable programs automatically, using learned patterns and schemas rather than hand-coded rules.

The virtual machine serves as the semantic foundation for all operations.
Every piece of information, whether derived from training data or user input, must be representable as facts and rules within the VM's formal framework.
This requirement ensures that the system's knowledge remains internally consistent and that its reasoning processes can be traced and verified.

State-conditioned prediction represents the core innovation that bridges statistical language modeling with symbolic execution.
Traditional next-token prediction operates solely on surface patterns in text.
VSAVM's next-phrase prediction incorporates the current state of the virtual machine, including active facts, applicable rules,
and ongoing computations.
This conditioning mechanism ensures that generated responses reflect not just linguistic plausibility but also logical consistency with established knowledge.

The trade-off between correctness and fluency becomes explicit and configurable.
In strict mode, the system prioritizes logical consistency over natural-sounding responses, potentially producing more formal or qualified statements.
In exploratory mode, the system can generate more natural responses while clearly marking areas of uncertainty or logical gaps.
This transparency allows users to understand the confidence level of different parts of the response.

## Unified Event Stream Representation

All input modalities converge into a canonical event stream that serves as the universal interface between external data and internal processing.
This design choice eliminates the need for modality-specific processing pipelines while maintaining the rich structural information necessary for accurate interpretation.

Each event within the stream carries three essential components: a type identifier, a discrete payload,
and a structural context path.
The type identifier specifies the nature of the information, such as text token, visual element, temporal marker, or structural separator.
The discrete payload contains the actual data in a standardized format that the virtual machine can process directly.
The structural context path provides hierarchical positioning information that preserves the original organization of the input.

### Event schema (normative)

The event stream must be serializable and replayable for audit.
At minimum, each event carries:

- `event_id`: stable identifier within the stream.
- `type`: event type identifier (e.g., `text_token`, `visual_token`, `timestamp`, `separator`, `header`, `list_item`, `quote`, `table_cell`).
- `payload`: discrete payload (token id, symbol id, small typed record, or encoder-provided discrete code).
- `context_path`: structural path identifying scope (e.g., document → section → paragraph → sentence → span).
- `source_ref`: optional provenance pointer (source id, offsets, timestamps) linking back to raw input.

Separators are not metadata; they are first-class events.
They define scope boundaries used by context creation, indexing, and correctness checks.

Text processing demonstrates the most straightforward application of this framework.
Individual words or subword tokens become events with type "text_token" and payloads containing the token identifier.
Sentence boundaries generate separator events that mark syntactic units.
Paragraph breaks, section headers,
and document structure all produce corresponding separator events that maintain the hierarchical organization of the original text.

Audio input undergoes a more complex transformation that preserves both content and temporal structure.
Speech recognition systems convert audio to text tokens,
but the event stream also includes temporal metadata events that maintain alignment between text and original timing.
Speaker change markers, pause indicators,
and prosodic features can all be represented as specialized event types.
This approach allows the system to reason about not just what was said,
but when and how it was said.

Visual input presents the greatest challenge for event stream conversion,
but the framework accommodates multiple approaches.
Simple visual content might be converted to textual descriptions that become standard text token events.
More sophisticated processing might involve visual encoders that produce discrete visual tokens, each representing specific visual patterns or objects.
The key requirement is discreteness rather than any particular encoding scheme.
Whether visual information arrives as symbolic descriptions, object detection results, or learned visual tokens, the event stream can accommodate it as long as the representation remains discrete and structurally segmented.

Video processing combines the challenges of both visual and temporal processing.
Individual frames might generate visual token events,
while scene changes produce temporal separator events.
Motion patterns, object trajectories,
and other temporal visual features can all be represented through appropriate event types and structural separators.

The structural context path provides crucial organizational information that enables sophisticated reasoning about relationships between different parts of the input.
A typical path might specify document, chapter, section, paragraph, sentence,
and span levels.
This hierarchical structure allows the system to understand that two statements appearing in the same paragraph are more closely related than statements from different chapters,
which proves essential for maintaining logical consistency across large documents.

Reversibility represents a fundamental requirement that ensures the system can always trace its reasoning back to original sources.
Every event in the stream must be expandable back to its constituent elements in a deterministic manner.
This property enables the system to verify its conclusions, explain its reasoning,
and maintain consistency between different levels of abstraction.

## Structural Separators and Scope

Structural separators delimit executable units and units of meaning.
A deterministic structural parser detects sentences, blocks, lists, titles, definitions, procedural steps, assertions,
and questions.
In multimodal inputs, separators include temporal segments, scene changes,
and object groupings from pre-processing.

Separators are not only for training; they are required for correctness.
Transitive closure and contradiction detection are infeasible without context and scope.
Separators define what belongs to the same paragraph or section and what belongs to a different chapter,
enabling the system to maintain local theories without collapsing all knowledge into a single inconsistent base.

This structural scoping is the minimal requirement for a practical non-contradiction promise when the corpus is imperfect or contains conflicting sources.

## Scope to Context Mapping (Normative)

Structural scope must be carried into VM execution to make contradiction checks meaningful and to prevent incompatible sources from collapsing into a single inconsistent base.
This section defines the contract between DS001 separators and DS002 context operations.

- Each structural unit that can contain assertions (paragraph, list item, block quote, table row, etc.) defines a `ScopeId` derived deterministically from the `context_path`.
- Entering a unit creates a VM reasoning context via `PUSH_CONTEXT(scope_id, policy=INHERIT_PARENT_READONLY)` or an equivalent mechanism.
- Facts asserted inside a child context remain local by default; promotion to a parent context requires an explicit merge/commit that runs conflict checks under bounded closure (DS004).
- Hypotheses and ambiguous parses use isolated contexts (`ISOLATE_CONTEXT`) so mutually incompatible interpretations do not corrupt each other.

Query compilation (DS003) selects which scopes/contexts to read from and which temporary contexts to create for hypothesis evaluation.
Strict-mode conclusions must be robust across the explored hypothesis contexts; conditional-mode conclusions must reference the specific assumptions/contexts that support them (DS004).

## Modality-Agnostic Input Representation Notes

The implementation begins with a canonical event stream.
Each event has a type, a discrete payload,
and a structural context, where context is a path such as document to section to paragraph to sentence to span.
Event types include text tokens, visual tokens, timestamps, sentence separators, headers, lists, quotes, formula spans,
and table cells.

For multimodal input, the event stream is the unification layer rather than a modality-specific embedding.
Text becomes token events directly.
Audio becomes transcription events plus temporal metadata events that preserve alignment.
Images and video become symbolic descriptions or discrete visual tokens if an external encoder is available,
but the design only assumes that these tokens are discrete and that separators can represent structural or temporal segmentation.

The system operates on two granularities.
A lexical layer holds stable, reversible tokens,
while a phrase layer holds macro units discovered by compression.
Reversibility is essential, because every macro unit must expand deterministically into elementary units for scoring, evaluation,
and coherent generation.

VSA attaches in parallel to each unit.
Tokens and macro tokens have deterministic hypervectors derived from stable hashes,
and spans combine these through bundling with role and position signals.
This hypervector is an associative index for fast retrieval and paraphrase clustering, not a direct representation of truth.

## VSA Integration and Acceleration

Vector Symbolic Architecture provides a parallel computational substrate that accelerates pattern recognition and schema retrieval without replacing the discrete symbolic processing of the virtual machine.
This integration creates a hybrid system that combines the speed of associative memory with the precision of symbolic reasoning.

Each discrete element in the event stream receives a corresponding hypervector computed through deterministic hashing functions.
These hypervectors exist in a high-dimensional space where similar concepts cluster together and related concepts can be combined through simple mathematical operations.
The hypervector serves as an associative index that enables rapid retrieval of similar patterns and related schemas without exhaustive search through the symbolic knowledge base.

Hypervector computation follows consistent principles across all input types.
Individual tokens receive base hypervectors derived from stable hash functions that ensure identical tokens always produce identical vectors.
Compound structures like phrases or sentences combine their constituent hypervectors through bundling operations that preserve similarity relationships while creating unique representations for different combinations.

Bundling operations implement a form of lossy compression that maintains approximate similarity while enabling efficient storage and retrieval.
When multiple hypervectors are bundled together, the result approximates the sum of the individual vectors but with controlled noise that prevents exact reconstruction.
This property allows the system to recognize that two phrases are similar even if they use different words,
while still distinguishing between genuinely different concepts.

Binding operations create structured representations that preserve relational information within the hypervector space.
When the system needs to represent that a particular entity has a specific property, it can bind the entity hypervector with the property hypervector to create a new vector that represents this relationship.
Multiple bindings can be combined to represent complex structured information while maintaining the ability to query for specific relationships.

The retrieval acceleration mechanism operates through approximate nearest neighbor search in the hypervector space.
When the system encounters a new query or input pattern, it computes the corresponding hypervector and searches for similar vectors in its memory.
This search returns a small set of candidate schemas, rules, or patterns that might be relevant to the current situation.
The virtual machine then evaluates these candidates through precise symbolic matching to determine which ones actually apply.

This two-stage process dramatically reduces computational complexity compared to exhaustive symbolic search while maintaining perfect precision in the final results.
The VSA component acts as a filter that eliminates obviously irrelevant possibilities,
while the VM component ensures that only logically valid matches are accepted.

The relationship between VSA and discrete VM operations remains carefully controlled to prevent the introduction of spurious associations.
VSA proposes candidates based on similarity,
but the VM validates these candidates through explicit symbolic operations.
A hypervector similarity does not constitute evidence for logical relationship; it merely suggests that a relationship might exist and deserves investigation.

Schema clustering represents one of the most important applications of VSA within the system.
As the system encounters recurring patterns in queries and responses, it can group similar patterns together in the hypervector space even before it has enough examples to learn precise symbolic rules.
This clustering accelerates the discovery of new schemas and helps the system generalize from limited examples.

## Controlled Generation and Faithful Realization

VSAVM treats generation as proposal plus verification.
Next-phrase candidates may be proposed by learned distributions and schema constraints, but acceptance is gated by VM execution and closure checks (DS004) to prevent unsupported claims.

Output is a surface realization of internal result objects rather than free-form continuation.
The surface realizer may choose wording and structure, but it must not introduce factual claims that are absent from the VM-derived `claims` produced under the correctness contract.

## Geometric Interpretation and Conceptual Spaces

The geometric interpretation treats VM execution as a trajectory in the state space.
Concepts are regions defined by canonical facts and stabilizing rules, not points in an embedding space.
Reasoning is a constrained traversal of the VM transition graph.

VSA provides an auxiliary similarity geometry for surface forms, offering a rapid projection toward candidate discrete programs.
The VM validates those candidates through execution and conflict checks, separating similarity from semantics.

Bounded closure approximates local transitive closure in the state graph,
and a larger budget means deeper and wider exploration.
Macro programs become consolidated paths that reduce search cost while preserving consistency.

### VM State Space Geometry

The virtual machine's operation can be understood geometrically as navigation through a high-dimensional state space where each point represents a complete configuration of facts, rules,
and reasoning context.
This geometric perspective provides insights into the structure of reasoning processes and enables optimization strategies that take advantage of the topological properties of the state space.

State space dimensionality emerges from the combinatorial structure of possible fact assignments, rule activations,
and context configurations.
Each fact in the knowledge base contributes dimensions corresponding to its truth value, certainty level,
and contextual scope.
Each rule contributes dimensions corresponding to its activation status and parameter bindings.
The resulting space has dimensionality that scales with the size and complexity of the knowledge base.

The high dimensionality of the state space creates both opportunities and challenges for reasoning optimization.
The large number of dimensions provides rich structure that can be exploited for efficient navigation and search.
However, the curse of dimensionality can make exhaustive exploration computationally intractable, requiring sophisticated search strategies and approximation techniques.

State space structure exhibits clustering properties where similar reasoning contexts create nearby points in the space.
These clusters correspond to coherent sets of beliefs and reasoning patterns that tend to co-occur in successful reasoning episodes.
The clustering structure can be exploited for efficient retrieval and analogical reasoning.

The geometric structure also exhibits manifold properties where the space of valid reasoning states forms lower-dimensional manifolds embedded in the high-dimensional space.
These manifolds correspond to consistent belief systems and reasoning patterns that satisfy logical constraints.
Navigation along these manifolds corresponds to coherent reasoning processes.

Reasoning trajectories through the state space correspond to sequences of inference steps that transform one reasoning state into another.
These trajectories exhibit geometric properties such as smoothness, curvature,
and convergence that reflect the logical structure of the reasoning process.

Trajectory analysis can reveal patterns in reasoning processes that are not apparent from examining individual inference steps.
Successful reasoning episodes tend to follow trajectories that exhibit certain geometric properties, such as consistent direction toward goal states and avoidance of regions associated with contradictions or inconsistencies.

The geometric properties of reasoning trajectories can be used to guide search processes and optimize reasoning strategies.
Trajectories that exhibit favorable geometric properties can be preferred over trajectories that exhibit unfavorable properties, even when the immediate logical consequences are similar.

Trajectory clustering can identify families of reasoning strategies that follow similar geometric patterns through the state space.
These clusters correspond to different approaches to solving similar types of reasoning problems and can be used to develop specialized reasoning strategies for different problem domains.

Distance metrics in the state space provide measures of similarity between different reasoning states and enable efficient search and retrieval operations.
These metrics must capture both the logical relationships between states and the computational cost of transitioning between states.

Logical distance measures capture the degree of logical similarity between different reasoning states, considering factors such as shared facts, compatible rules,
and consistent conclusions.
States that share many facts and reach similar conclusions are considered logically close,
while states with contradictory facts or incompatible conclusions are considered logically distant.

Computational distance measures capture the effort required to transform one reasoning state into another, considering factors such as the number of inference steps required, the computational complexity of the required operations,
and the memory resources needed for the transformation.

Combined distance metrics integrate logical and computational considerations to provide comprehensive measures of state similarity that can guide both search processes and reasoning optimization.
These combined metrics enable the system to balance logical coherence against computational efficiency in its reasoning strategies.

### Conceptual Region Definition

The state space contains regions that correspond to coherent conceptual frameworks or belief systems that exhibit internal consistency and logical coherence.
These regions provide natural boundaries for reasoning processes and enable the system to maintain multiple consistent perspectives simultaneously.

Conceptual boundaries emerge from the logical constraints that define consistent belief systems.
These boundaries separate regions of the state space that contain mutually consistent facts and rules from regions that would create contradictions if combined.
The boundaries correspond to fundamental logical incompatibilities that cannot be resolved through additional reasoning.

Boundary detection algorithms identify the logical constraints that define conceptual regions and the transitions between regions that would violate these constraints.
These algorithms enable the system to navigate within conceptual regions while avoiding transitions that would create logical inconsistencies.

The sharpness of conceptual boundaries varies depending on the strength of the logical constraints that define them.
Some boundaries correspond to strict logical contradictions that create sharp discontinuities in the state space.
Other boundaries correspond to weaker incompatibilities that create gradual transitions between regions.

Boundary permeability determines the ease with which reasoning processes can cross between different conceptual regions.
Some boundaries are highly permeable and can be crossed through simple context switches or assumption changes.
Other boundaries are impermeable and require fundamental changes in reasoning approach or knowledge base structure.

Region stability measures the tendency of reasoning processes to remain within conceptual regions once they enter them.
Stable regions correspond to coherent belief systems that tend to reinforce themselves through continued reasoning.
Unstable regions correspond to transitional states that tend to evolve toward more stable configurations.

Stability analysis can identify conceptual regions that are likely to provide reliable foundations for extended reasoning processes.
Reasoning that begins in stable regions is more likely to produce consistent and reliable conclusions than reasoning that begins in unstable regions.

The stability of conceptual regions can change over time as new information is added to the knowledge base or as reasoning strategies evolve.
Regions that were previously stable might become unstable due to new contradictions or incompatibilities,
while previously unstable regions might become stable due to new supporting evidence.

Region connectivity describes the pathways through which reasoning processes can move between different conceptual regions.
These pathways correspond to logical transitions that preserve consistency while enabling exploration of alternative perspectives or belief systems.

Connectivity analysis can identify the most efficient pathways for transitioning between different conceptual frameworks when such transitions are necessary or desirable.
These pathways can be used to guide reasoning processes that need to explore multiple perspectives or resolve conflicts between different belief systems.

The connectivity structure of the conceptual space exhibits network properties where some regions serve as hubs that are connected to many other regions,
while other regions are more isolated and have fewer connections.
Hub regions often correspond to fundamental or widely applicable conceptual frameworks.

### VSA Similarity Geometry

The Vector Symbolic Architecture provides a complementary geometric framework that operates in parallel with the VM state space to enable rapid similarity-based retrieval and pattern recognition.
The VSA geometry exhibits different properties from the VM state space but provides essential acceleration for reasoning processes.

Hypervector space structure exhibits the unique properties of high-dimensional vector spaces that enable efficient representation and manipulation of symbolic information.
The high dimensionality of hypervectors creates nearly orthogonal representations for different concepts while enabling meaningful similarity measures through dot products and other vector operations.

The hypervector space exhibits approximate orthogonality where randomly generated hypervectors are nearly orthogonal to each other with high probability.
This property enables the representation of large numbers of distinct concepts without interference,
while still allowing for meaningful similarity relationships between related concepts.

Hypervector operations such as bundling and binding create structured representations that preserve similarity relationships while enabling the representation of complex relational information.
These operations exhibit algebraic properties that enable systematic manipulation of symbolic structures within the vector space.

The distributive properties of hypervector operations enable the representation of structured information in ways that preserve both individual component information and relational structure.
This preservation enables efficient retrieval of both specific components and complete structures from compressed representations.

Similarity clustering in the hypervector space enables rapid identification of related concepts and patterns without requiring exhaustive comparison operations.
The clustering structure emerges naturally from the similarity relationships between hypervectors and can be exploited for efficient search and retrieval.

Clustering algorithms can identify groups of related hypervectors that correspond to similar concepts or patterns in the symbolic domain.
These clusters can be used to organize knowledge for efficient retrieval and to identify opportunities for generalization and abstraction.

The clustering structure exhibits hierarchical properties where clusters at different scales correspond to different levels of conceptual similarity.
Fine-grained clusters correspond to very similar concepts,
while coarse-grained clusters correspond to broader conceptual categories.

Dynamic clustering enables the similarity structure to evolve as new concepts are added to the system or as existing concepts are modified through learning and experience.
The clustering structure can adapt to changing patterns of similarity without requiring complete reconstruction of the representation.

Projection mechanisms enable the mapping between the discrete symbolic representations used by the virtual machine and the continuous vector representations used by the VSA system.
These projections must preserve essential similarity relationships while enabling efficient computation in both domains.

Forward projection converts symbolic structures into hypervector representations that can be used for similarity-based retrieval and pattern matching.
The projection process must preserve the essential structural and semantic properties of the symbolic representations while creating vectors that exhibit appropriate similarity relationships.

Backward projection converts hypervector similarity relationships back into symbolic form for use by the virtual machine's reasoning processes.
This projection must identify the symbolic structures that correspond to similar hypervectors while maintaining the precision required for logical reasoning.

Bidirectional consistency ensures that the forward and backward projections maintain coherent relationships between the symbolic and vector domains.
Symbolic structures that are logically related should produce hypervectors that are geometrically similar,
and geometrically similar hypervectors should correspond to logically related symbolic structures.

### Reasoning as Constrained Traversal

The geometric perspective enables understanding of reasoning processes as constrained navigation through the state space, where logical constraints define permissible paths and optimization objectives guide the selection among alternative paths.
This view provides insights into reasoning efficiency and enables the development of improved reasoning strategies.

Constraint manifolds define the subspaces of the state space that satisfy logical consistency requirements.
Reasoning processes must remain on these manifolds to maintain logical coherence,
while optimization objectives guide movement along the manifolds toward desired goal states.

Manifold structure exhibits geometric properties such as curvature and connectivity that affect the efficiency of reasoning processes.
Regions of high curvature correspond to areas where small changes in reasoning state can lead to large changes in logical consequences.
Regions of low curvature correspond to areas where reasoning can proceed smoothly without dramatic changes in logical structure.

The connectivity of constraint manifolds determines the reachability of different reasoning goals from different starting states.
Some goals might be reachable from many different starting states through multiple alternative paths,
while other goals might be reachable only from specific starting states through unique paths.

Manifold boundaries correspond to logical constraints that cannot be violated without creating inconsistencies.
These boundaries define the limits of coherent reasoning within particular conceptual frameworks and indicate where transitions to alternative frameworks might be necessary.

Path optimization seeks to identify reasoning trajectories that efficiently reach desired goal states while remaining on the constraint manifolds.
The optimization process must balance multiple objectives including logical soundness, computational efficiency,
and robustness to uncertainty.

Optimization algorithms can exploit the geometric structure of the constraint manifolds to identify efficient reasoning paths.
Gradient-based methods can follow directions of steepest improvement toward goal states,
while avoiding directions that would violate logical constraints.

Multi-objective optimization enables the balancing of competing objectives such as speed versus accuracy or generality versus specificity.
The geometric framework provides natural ways to represent these trade-offs and identify Pareto-optimal solutions that achieve good performance across multiple objectives.

Adaptive path planning enables reasoning strategies to adjust their approach based on the local geometric properties of the state space.
Regions that exhibit favorable geometric properties might support aggressive optimization strategies,
while regions with unfavorable properties might require more conservative approaches.

Search space pruning uses geometric properties to eliminate regions of the state space that are unlikely to contain optimal reasoning paths.
Regions that are geometrically distant from goal states or that exhibit unfavorable geometric properties can be excluded from detailed exploration.

Geometric pruning can provide significant computational savings by focusing search efforts on the most promising regions of the state space.
The pruning process must balance computational savings against the risk of eliminating potentially valuable reasoning paths.

Hierarchical search strategies exploit the multi-scale structure of the geometric space to perform coarse-grained exploration at large scales followed by fine-grained optimization at smaller scales.
This approach can provide efficient exploration of large state spaces while maintaining precision in the final reasoning results.

The hierarchical approach enables reasoning processes to quickly identify promising general directions for exploration while deferring detailed analysis until the most promising regions have been identified.
This strategy can provide significant efficiency improvements for complex reasoning problems.
