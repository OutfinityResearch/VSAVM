# DS002 Virtual Machine Design and Execution

Note: This document was previously numbered DS017 in earlier drafts. The canonical number is DS002 to match the consolidated spec set in `docs/specs/`.

## VM State and Memory Model

The virtual machine maintains its complete operational state through four interconnected memory structures that together provide the foundation for symbolic reasoning and execution tracing.
This explicit state representation enables deterministic behavior, comprehensive auditing,
and precise control over reasoning processes.

The canonical fact store serves as the primary repository for all knowledge within the system.
Facts are stored using a normalized representation that eliminates surface-level variations while preserving semantic content.
Each fact receives a unique canonical identifier that remains stable regardless of how the fact was originally expressed.
This canonicalization process ensures that logically equivalent statements from different sources are recognized as identical, preventing spurious contradictions and enabling efficient consistency checking.

Facts within the store are organized using a typed slot structure that captures the essential components of each assertion.
A typical fact might include slots for subject, predicate, object, temporal qualifiers, certainty levels,
and source attribution.
The type system ensures that only meaningful combinations of slot values are permitted, reducing the possibility of malformed or nonsensical facts entering the knowledge base.

The indexing system for the fact store supports multiple access patterns required for efficient reasoning.
Primary indices organize facts by their canonical identifiers for direct lookup.
Secondary indices group facts by subject, predicate, or object to support pattern matching and rule application.
Temporal indices enable reasoning about time-dependent relationships and the evolution of facts over time.
Source indices maintain provenance information that proves crucial for handling conflicting information from different sources.

The rule and macro-program memory contains the executable knowledge that drives reasoning processes.
Rules represent conditional relationships that can derive new facts from existing ones.
Macro-programs represent more complex reasoning patterns that have been learned and consolidated during training.
Both rules and macro-programs are stored in a compiled form that enables efficient execution while maintaining readability for debugging and explanation purposes.

Rules follow a standard conditional structure with premises, conclusions,
and optional constraints.
The premises specify the conditions that must be satisfied for the rule to apply.
The conclusions specify the new facts that should be derived when the rule fires.
Constraints provide additional conditions that must be checked during rule application, such as consistency requirements or temporal ordering constraints.

Macro-programs represent learned patterns of reasoning that have been consolidated from frequently occurring sequences of primitive operations.
These programs can accept parameters, maintain local state,
and invoke other programs or rules.
The macro-program representation includes metadata about the learning process that created the program, including the training examples that contributed to its development and the compression benefits it provides.

The binding environment manages temporary variables and intermediate results during program execution.
This environment operates as a stack-based system where each level of program invocation creates a new binding frame.
Variables within a frame can reference facts from the canonical store, intermediate computation results, or parameters passed from calling programs.

Variable scoping follows lexical rules that prevent accidental interference between different levels of computation.
Variables defined within a program are visible only within that program and any programs it calls.
This scoping discipline ensures that complex reasoning processes can be decomposed into manageable components without worrying about variable name conflicts.

The binding environment also maintains type information for all variables,
ensuring that operations are applied only to appropriate data types.
This type checking prevents many categories of runtime errors and provides early detection of logical inconsistencies in reasoning processes.

The execution log provides a complete trace of all operations performed during reasoning.
This log serves multiple purposes: it enables debugging of complex reasoning processes, provides explanations for derived conclusions, supports auditing of system behavior,
and enables rollback of operations when inconsistencies are detected.

Log entries capture the essential information about each operation: the operation type, the input parameters, the results produced, the execution time,
and any side effects on the system state.
For rule applications, the log records which rule was applied,
which facts satisfied the premises,
and which new facts were derived.
For program executions, the log records the program invoked, the parameters provided,
and the sequence of operations performed.

The log structure supports both sequential access for complete trace reconstruction and indexed access for specific types of queries.
Temporal indices enable reconstruction of the system state at any point in time.
Operation type indices support analysis of which types of reasoning were most frequently used.
Fact indices enable tracking of how specific facts were derived and which conclusions depend on them.

## Canonical Fact Model and Type System (Normative)

This section defines the shared internal representation for facts and terms used by the VM, query compiler, and bounded closure.
It is normative: DS003 and DS004 rely on these definitions for canonicalization, contradiction checks, and audit traces.

### Identifiers

VSAVM uses stable internal identifiers to make equality and conflict checks independent of surface form.

- `SymbolId`: canonical identifier for a predicate, role, or enum value (typically an interned string with a stable hash).
- `EntityId`: canonical identifier for an entity (can be learned; must be stable once introduced).
- `FactId`: canonical identifier for an atemporal fact key (stable hash of canonical predicate + arguments + qualifiers excluding provenance).
- `ScopeId`: canonical identifier for structural scope (derived from event stream context paths; see DS001).
- `SourceId`: canonical identifier for provenance sources (document, speaker, sensor stream, dataset, etc.).

### Terms

A term is a typed value that can be used as an argument or qualifier in a fact.
The minimal term forms are:

- **Atom**: a primitive typed value (`EntityId`, `SymbolId`, string, number, boolean, time reference, modality reference).
- **Struct**: a typed record with named slots (used for n-ary relations, complex values, and normalized qualifiers).

The term representation must be deterministic under canonicalization: identical semantic content yields identical term encodings.

### Facts

Facts are stored as **instances** of canonical fact keys.
The canonical key defines equality; instances add polarity, scope, time, confidence, and provenance.

Minimal fact instance fields:

- `fact_id` (`FactId`): canonical key identifier (see above).
- `polarity`: `ASSERT` or `DENY` (explicit negation is stored, not implied by absence).
- `scope_id` (`ScopeId`): the structural scope where the assertion holds.
- `time`: optional time interval or event reference; when present it constrains conflict checks and rule applicability.
- `confidence`: optional scalar or bucketed confidence (used for conditional outputs and conflict resolution policies).
- `provenance`: one or more links to the originating evidence (e.g., `{source_id, event_span, extractor_id}`).
- `qualifiers`: optional normalized key/value map for additional constraints (e.g., modality, quantifiers, units).

### Canonicalization (what is and is not canonicalized)

Canonicalization is the process of mapping diverse surface forms into a single internal normal form suitable for equality, indexing, and conflict detection.
Canonicalization must be deterministic for a given input, schema set, and seed.

Canonicalization **must**:

- normalize obvious surface variance (case, punctuation, stable token normalization, deterministic slot ordering)
- normalize typed values (numbers, units, time formats) into a canonical representation
- enforce type constraints for all slots and qualifiers

Canonicalization **must not**:

- treat approximate similarity as equality (VSA can propose candidates, but equality requires validated mapping)
- collapse genuinely distinct entities/facts without explicit evidence or an auditable equivalence mechanism

When the system cannot decide between multiple plausible canonicalizations, it must keep multiple hypotheses (separate bindings and/or contexts) rather than committing silently.

### Contradictions (direct conflict predicate)

Direct contradictions are defined canonically:

Two fact instances conflict if they have the same `fact_id`, opposing polarity, overlapping time (under the configured time-overlap policy), and are present in the same effective scope/context for the current reasoning mode.
DS004 specifies how this conflict predicate is used under bounded closure and how results are reported in strict/conditional/indeterminate modes.

## Instruction Set Architecture

The virtual machine operates through a carefully designed instruction set that balances expressiveness with simplicity.
The instruction set provides primitive operations for fact manipulation, logical reasoning, control flow,
and system state management.
All instructions operate on typed data to prevent category errors and ensure logical consistency.

Term construction instructions create the basic building blocks for all symbolic operations.
The MAKE_TERM instruction constructs a new term with a specified type and slot values.
The CANONICALIZE instruction converts a term into its canonical form,
ensuring that equivalent terms receive identical representations.
The BIND_SLOTS instruction fills in parameter slots within a term template,
enabling the construction of complex structured terms from simpler components.

These construction operations maintain strict type discipline to prevent the creation of malformed terms.
Each term type specifies the required slots and their acceptable value types.
The instruction execution engine validates all slot assignments before creating new terms, rejecting any attempts to create logically inconsistent structures.

Fact manipulation instructions provide the core operations for managing the knowledge base.
The ASSERT instruction adds a new fact to the canonical store after performing consistency checks.
The DENY instruction records explicit negation within the current reasoning context.
The QUERY instruction searches for facts matching a specified pattern, returning bindings for any variables in the pattern.

The ASSERT instruction performs several validation steps before adding facts to the store.
It first checks whether the fact already exists in canonical form, avoiding duplicate storage.
It then verifies that the new fact does not directly contradict any existing facts within the current context.
Finally, it updates all relevant indices to ensure that the new fact can be efficiently retrieved during future operations.

The DENY instruction handles negation in a context-sensitive manner that prevents global inconsistency.
Rather than simply removing facts from the store, DENY operations are recorded as explicit negations that apply within specific reasoning contexts.
This approach allows the system to maintain different theories that might contradict each other when they apply to different domains or time periods.

Logical reasoning instructions implement the core inference mechanisms that drive the system's reasoning capabilities.
The MATCH instruction performs unification between terms, finding variable bindings that make two terms identical.
The APPLY_RULE instruction invokes a rule against the current fact base, deriving new facts when the rule's premises are satisfied.
The CLOSURE instruction performs transitive closure operations within specified budget limits.

The MATCH instruction implements a sophisticated unification algorithm that handles complex term structures while maintaining efficiency.
The algorithm can match terms with nested structure, handle variable bindings at multiple levels,
and detect impossible matches early to avoid unnecessary computation.
The matching process respects type constraints,
ensuring that variables can only be bound to values of appropriate types.

Rule application through APPLY_RULE follows a systematic process that ensures correctness while maintaining efficiency.
The instruction first checks whether the rule's premises can be satisfied by the current fact base.
If multiple satisfying bindings exist, the instruction can either apply the rule for all bindings or select specific bindings based on priority criteria.
The derived conclusions are then added to the fact base through the standard ASSERT mechanism.

Control flow instructions provide the mechanisms necessary for complex reasoning programs.
The BRANCH instruction implements conditional execution based on the success or failure of logical tests.
The CALL instruction invokes other programs or rules, passing parameters and receiving results.
The RETURN instruction terminates program execution and returns results to the calling context.

The BRANCH instruction supports multiple branching modes to handle the nondeterministic nature of logical reasoning.
In deterministic mode, the instruction follows a single branch based on the first successful test.
In exploratory mode, the instruction can create multiple execution branches that explore different possibilities in parallel.
The choice of branching mode depends on the current execution context and the available computational budget.

Program invocation through CALL creates new binding environments and manages parameter passing between programs.
The instruction handles both synchronous calls that wait for completion and asynchronous calls that can proceed in parallel.
Return values are typed and validated to ensure that calling programs receive data in the expected format.

Context management instructions control the scope of reasoning operations and enable the system to maintain multiple consistent theories simultaneously.
The PUSH_CONTEXT instruction creates a new reasoning context that inherits facts from the parent context but can maintain separate conclusions.
The POP_CONTEXT instruction returns to the parent context, optionally propagating selected conclusions upward.

The MERGE_CONTEXT instruction combines conclusions from multiple parallel reasoning branches, handling conflicts through configurable resolution strategies.
The ISOLATE_CONTEXT instruction creates completely separate reasoning environments that cannot interfere with each other,
enabling the system to explore contradictory hypotheses without global inconsistency.

## Execution Modes and Semantics

The virtual machine operates in two primary modes that serve different phases of the reasoning process.
Interpretation mode handles the conversion of external input into internal symbolic representations.
Reasoning mode performs logical inference and consistency checking using the established symbolic knowledge base.

Interpretation mode activates when the system receives new input that must be integrated into its knowledge base.
This mode coordinates the parsing of event streams, the construction of symbolic terms,
and the initial population of the fact store.
The interpretation process must handle ambiguous input, resolve references,
and establish connections with existing knowledge while maintaining consistency.

The interpretation process begins with structural analysis of the input event stream.
Separator events define the boundaries of logical units that can be processed independently.
Within each unit, the system identifies entities, relationships,
and assertions that can be converted into symbolic form.
This identification process relies on learned schemas that map from surface patterns to symbolic structures.

Entity resolution represents a critical component of interpretation mode.
The system must determine whether newly mentioned entities correspond to existing entities in the knowledge base or represent genuinely new entities.
This resolution process uses both exact matching on canonical identifiers and approximate matching through VSA similarity measures.
When ambiguity exists, the system can maintain multiple hypotheses that are resolved through subsequent reasoning.

Relationship extraction identifies the connections between entities and converts them into symbolic predicates.
The system maintains a library of relationship types that can be expressed in the input language, along with the canonical symbolic forms for each relationship.
Complex relationships that cannot be expressed through simple predicates are converted into structured terms that capture the full semantic content.

Assertion processing converts declarative statements into facts that can be added to the knowledge base.
This process includes determining the certainty level of each assertion, identifying any temporal or conditional qualifiers,
and establishing source attribution.
Assertions that conflict with existing knowledge are flagged for special handling rather than being automatically rejected.

Reasoning mode activates when the system needs to derive new conclusions from existing knowledge or verify the consistency of proposed additions to the knowledge base.
This mode implements the core logical inference mechanisms that distinguish the system from purely statistical approaches.

The reasoning process operates through cycles of rule application and consistency checking.
Each cycle identifies applicable rules, applies them to derive new facts,
and checks whether the new facts introduce any contradictions.
The process continues until no new facts can be derived or until computational budget limits are reached.

Rule selection uses both syntactic matching and semantic similarity to identify potentially applicable rules.
The syntactic matching ensures that rule premises can be satisfied by facts in the knowledge base.
The semantic similarity check uses VSA measures to identify rules that might apply even when exact syntactic matching fails.
This combination enables robust reasoning even when the knowledge base contains incomplete or imprecisely stated information.

Fact derivation follows the logical structure specified in the applicable rules while maintaining careful tracking of dependencies.
Each derived fact records the rule that produced it and the premises that were used in the derivation.
This dependency tracking enables the system to retract conclusions when their supporting premises are later found to be incorrect.

Consistency checking operates continuously during reasoning to detect contradictions as soon as they arise.
The system maintains indices that enable rapid detection of direct contradictions between facts.
More complex contradictions that arise through chains of inference are detected through bounded closure operations that explore the logical consequences of new facts within specified computational limits.

State transition semantics define how the virtual machine state evolves during execution.
Each instruction execution produces a new state that differs from the previous state in well-defined ways.
The state transition function is deterministic for a given instruction and input state,
ensuring that identical execution sequences always produce identical results.

The state transition model supports both forward execution and backward analysis.
Forward execution applies instructions to produce new states and derive new conclusions.
Backward analysis traces the derivation of specific facts to understand how they were produced and what premises they depend on.
This bidirectional capability proves essential for explanation generation and debugging.

Memory management ensures that the virtual machine can operate efficiently even with large knowledge bases and complex reasoning processes.
The system uses reference counting and garbage collection to reclaim memory from facts and terms that are no longer accessible.
Caching mechanisms maintain frequently accessed facts and rules in fast memory while moving less frequently used items to slower storage.

The memory management system respects the logical structure of the knowledge base,
ensuring that related facts and rules are stored together when possible.
This locality of reference improves cache performance and reduces the overhead of complex reasoning operations that must access many related pieces of information.

## Macro-Instruction System

The macro-instruction system provides the mechanism through which the virtual machine learns and consolidates frequently occurring patterns of reasoning.
This system bridges the gap between primitive symbolic operations and the complex reasoning patterns that emerge during training,
enabling the system to operate efficiently while maintaining full traceability of its reasoning processes.

Consolidation occurs when the system identifies patterns of primitive operations that appear frequently across different reasoning episodes.
The consolidation process analyzes execution logs to identify recurring sequences of instructions that produce similar results in similar contexts.
These sequences become candidates for conversion into macro-instructions that can be invoked as single operations.

The consolidation criteria balance several competing objectives.
Frequency of occurrence ensures that only genuinely useful patterns are consolidated.
Compression benefit measures how much the macro-instruction reduces the total description length of the reasoning processes.
Generalizability assesses whether the pattern can be applied to new situations beyond the specific examples where it was observed.

Pattern recognition for consolidation operates through a combination of syntactic analysis and semantic clustering.
Syntactic analysis identifies instruction sequences that follow similar patterns, even when the specific facts and terms involved differ.
Semantic clustering uses VSA similarity measures to group together reasoning episodes that achieve similar goals through potentially different means.

The system maintains statistics about the frequency and effectiveness of different instruction patterns.
Patterns that appear frequently and consistently produce useful results become strong candidates for consolidation.
Patterns that appear infrequently or produce inconsistent results are not consolidated, avoiding the creation of overly specific macro-instructions that provide little benefit.

Macro-instruction representation captures both the operational content of the consolidated pattern and the metadata necessary for effective utilization.
The operational content specifies the sequence of primitive operations that the macro-instruction performs, along with any parameters that can be customized for different invocations.
The metadata includes information about the contexts where the macro-instruction is most effective and any preconditions that must be satisfied for successful execution.

Parameter abstraction enables macro-instructions to be applied to new situations that differ from the original training examples.
The consolidation process identifies which aspects of the original instruction sequences represent essential structure and which aspects represent incidental details that can be parameterized.
This abstraction process creates macro-instructions that can generalize beyond their original training contexts.

The parameter types for macro-instructions follow the same type system used throughout the virtual machine.
This consistency ensures that macro-instructions can be composed with primitive instructions and with each other without type conflicts.
The type system also enables early detection of parameter mismatches that would lead to execution errors.

Execution optimization for macro-instructions provides significant performance benefits compared to executing the equivalent sequences of primitive operations.
The system can precompile macro-instructions into optimized forms that eliminate redundant operations and take advantage of specialized data structures.
These optimizations maintain semantic equivalence with the original instruction sequences while providing substantial speedup.

The optimization process includes dead code elimination, common subexpression elimination,
and instruction reordering to improve cache locality.
More sophisticated optimizations can recognize when multiple macro-instructions can be fused together to eliminate intermediate results that are created by one macro-instruction and immediately consumed by another.

Schema-to-program compilation represents the most sophisticated application of the macro-instruction system.
As the system learns to recognize recurring patterns in natural language queries, it develops schemas that map from linguistic patterns to appropriate reasoning strategies.
These schemas are implemented as macro-instructions that can be invoked when similar linguistic patterns are encountered in new queries.

The compilation process from schemas to macro-instructions involves several stages of abstraction and optimization.
The initial schema captures the surface linguistic pattern and the associated reasoning strategy in a relatively direct form.
Subsequent optimization stages identify opportunities for generalization, parameter abstraction,
and performance improvement.

Schema compilation must handle the inherent ambiguity and variability of natural language input.
A single schema might need to handle multiple linguistic variations that express the same underlying intent.
The compilation process creates macro-instructions that can recognize and handle this variability while maintaining consistent reasoning behavior.

The resulting macro-instructions serve as the primary interface between the natural language processing components and the symbolic reasoning engine.
When the system encounters a query that matches a learned schema, it can immediately invoke the corresponding macro-instruction rather than having to construct a reasoning strategy from primitive operations.
This capability dramatically improves both the speed and reliability of query processing.
