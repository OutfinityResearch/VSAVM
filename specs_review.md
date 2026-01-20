# Design Specs Review (DS001–DS005)

## Scope

This review covers only the five consolidated DS documents in `docs/specs/`:

- `docs/specs/DS001-foundations-and-architecture.md`
- `docs/specs/DS002-vm-design-execution.md`
- `docs/specs/DS003-query-compilation-search.md`
- `docs/specs/DS004-correctness-bounded-closure.md`
- `docs/specs/DS005-training-learning-optimization.md`

It does not review any legacy specs in `docs/specs/old_duplicates/`, nor URS/FS/NFS (except where DS docs depend on them implicitly).

## High-Level Summary

The five DS documents form a coherent end-to-end story: a modality-agnostic event stream is parsed into scoped symbolic structures; candidate interpretations and query programs are executed in a VM; retrieval (VSA) accelerates search but does not decide truth; and correctness is enforced operationally via budget-bounded closure, with training designed to make compilation and macro-programs emerge under compression pressure.

The primary gaps are not conceptual but specification-grade: several core interfaces are referenced repeatedly (fact schema, type system, scope/context mapping, budget accounting, determinism constraints) without being pinned down to implementable definitions. This is currently the main risk to logical consistency across components.

## Cross-Document Consistency Findings

### 1) DS identifier mismatch (high severity for comprehensibility)

- `DS002`–`DS005` filenames and site links use `DS002`–`DS005`, but the top-level titles inside these files are `DS017`–`DS020`.
- Recommendation: normalize the first heading in each file to `DS002`–`DS005` (optionally note "formerly DS017–DS020" once), so readers can reconcile the index, file names, and document headers.

### 2) Canonical fact model + type system are assumed everywhere but not specified

All five DS docs rely on these concepts:

- canonical fact identifiers and canonicalization rules
- typed slot structures (subject/predicate/object + qualifiers)
- explicit negation (DENY / polarity)
- provenance (source attribution) and scope/context metadata

But the shared schema is not defined in a single normative place. This creates drift risk between:

- query compilation (what a schema can emit),
- VM execution (what ASSERT/DENY/QUERY accept),
- closure (what counts as a contradiction), and
- tracing (what can be audited and replayed).

### 3) Scope and context: structural separators vs VM contexts

- `DS001` emphasizes structural separators and scope boundaries in the event stream.
- `DS002` introduces VM context mechanisms (`PUSH_CONTEXT`, `POP_CONTEXT`, `MERGE_CONTEXT`, `ISOLATE_CONTEXT`) as the isolation boundary for reasoning.

What is missing is an authoritative mapping: "structural scope → VM context policy" (when to create a context, what inherits, what is isolated, and how/when to merge).

### 4) Budget semantics and determinism constraints need sharper definitions

- `DS004` requires reproducibility (fixed seeds, deterministic scheduling) and budget-bounded correctness claims.
- `DS002` describes parallelism (exploratory branching, async CALL) and distributed execution as optimization directions.

The docs are compatible, but only if the determinism contract is explicit:

- what is allowed in strict mode vs exploratory mode,
- what nondeterminism sources must be prohibited or pinned, and
- how budgets compose across nested calls / parallel branches.

### 5) "VSA proposes, VM disposes" is consistent but needs an interface boundary

Across `DS001`, `DS003`, and `DS005`, VSA is consistently described as a similarity accelerator, not a truth mechanism. To keep that boundary enforceable in implementation, the interface needs to be made explicit:

- what VSA returns (candidates + scores + justification),
- what the VM validates (execution + closure + conflict checks), and
- what gets persisted (schemas, macros, learned priors) and under what promotion criteria.

## Completeness / Underspecification (Actionable)

These are the main missing "definition-of-done" items that block implementable consistency.

### A) Canonical fact schema (must be shared across DS002/DS003/DS004)

Define:

- minimal required slots, optional slots, and typing rules
- canonicalization procedure (including normalization for paraphrases vs true equivalence)
- negation/polarity representation and its interaction with scope
- provenance fields and trust weighting hooks (even if the policy is elsewhere)

### B) Bounded closure details (DS004 + interfaces into DS002)

Define:

- exact VM state snapshot model for branching/search
- what counts as a contradiction (direct, indirect, temporal, scoped)
- how "strict" vs "conditional" outputs are represented and reported
- budget accounting semantics (depth vs steps vs branching vs time) and composition rules

### C) Query schema format and program representation (DS003 + DS002)

Define:

- schema data model (typed slots, preconditions, emitted program template)
- program IR format (instructions, typing, resource annotations)
- how ambiguity is represented (multiple hypotheses) and how it is pruned/merged

### D) Consolidation criteria and rollback (DS002 + DS005)

Define:

- MDL objective components concretely (what is "description length" operationally)
- promotion triggers for schemas/macros
- health checks for stability and regression
- rollback/versioning strategy for bad consolidations

## Per-Document Review

### DS001 Foundations and Architecture

**Strengths**

- Clear north-star: VM execution + bounded closure define acceptability; VSA accelerates search but does not define truth.
- Strong unifying abstraction for multimodality via an event stream and structural separators.

**Gaps / improvements**

- The event stream is described well conceptually but lacks a normative schema (fields, encoding, separator taxonomy).
- The geometric/conceptual-space sections are valuable, but read more like theory notes than a design spec; consider moving heavy geometric exposition to `docs/theory/` and keeping DS001 more interface- and contract-centric.

### DS002 VM Design and Execution

**Strengths**

- Solid decomposition: fact store, rule/macro memory, binding environment, execution log.
- Instruction set categories provide a useful mental model (ASSERT/DENY/QUERY, MATCH, APPLY_RULE, CLOSURE, context ops).

**Gaps / improvements**

- Needs a normative definition of the fact schema/type system to make the ISA meaningfully implementable.
- Concurrency/async is mentioned, but the determinism constraints for "strict mode" execution should be stated explicitly (what is permitted and how it is made reproducible).

### DS003 Query Compilation and Program Search

**Strengths**

- Clean pipeline framing: normalization → schema retrieval → slot filling → program instantiation → search/scoring.
- Multimodal extensions are discussed in a way consistent with DS001’s modality-agnostic goal.

**Gaps / improvements**

- The schema representation and program IR are not specified (inputs/outputs, slot typing, traceability hooks).
- MDL scoring is described conceptually but would benefit from a concrete scoring breakdown that can be instrumented and tested.

### DS004 Correctness and Bounded Closure

**Strengths**

- The correctness contract, budget parameters, and strict vs conditional modes are clearly articulated.
- Tracing/auditability and reproducibility are treated as first-class requirements.

**Gaps / improvements**

- "Contradiction" detection needs a formal definition tied to the canonical fact schema and scope model.
- Budget monotonicity is stated; the reporting format for budget-scoped claims (and how claims are revised under higher budgets) should be made explicit.

### DS005 Training, Learning, and Optimization

**Strengths**

- Two-loop training architecture ties together language modeling, program search, and consolidation.
- Connects compression (MDL) pressure to emergent compilation and macro-programs, consistent with DS002/DS003.

**Gaps / improvements**

- MDL objective and RL reward signals are not concretized into implementable metrics.
- Scaling/distributed execution is described but would benefit from explicit constraints derived from DS004’s reproducibility requirements.

## Recommended Next Edits (Prioritized)

1. Fix DS header numbering inside `DS002`–`DS005` to match filenames and site links.
2. Add a single canonical "Fact Model and Type System" spec (either as a new DS appendix or a shared section) and reference it from DS002/DS003/DS004.
3. Add a "Scope → Context" mapping section: how separators instantiate contexts, and what merge/isolation policies apply.
4. Specify budget accounting and result reporting formats for closure (including strict/conditional claim schemas).
5. Define schema/program IR formats and consolidation health checks (promotion + rollback) to prevent drift and regressions.
