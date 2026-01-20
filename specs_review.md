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

Most cross-document interfaces are now pinned down in normative form (fact model/type system, schema/program representation, budget accounting and result reporting, and a scope→context mapping). This substantially reduces the risk of drift between compilation, execution, and closure.

The remaining gaps are mostly “engineering sharp edges”: concrete canonicalization examples (especially around time and equivalence), explicit VM state snapshot semantics for branching/merge, and a fully explicit interface boundary for “VSA proposes, VM disposes”.

## Cross-Document Consistency Findings

### 1) DS identifiers and legacy specs (resolved)

- `DS002`–`DS005` titles now match filenames and include an explicit note about prior DS017–DS020 numbering.
- Legacy draft specs are separated under `docs/specs/old_duplicates/` to avoid confusion with the consolidated DS001–DS005 set.

### 2) Canonical fact model + type system (addressed; still needs examples)

All five DS docs rely on these concepts:

- canonical fact identifiers and canonicalization rules
- typed slot structures (subject/predicate/object + qualifiers)
- explicit negation (DENY / polarity)
- provenance (source attribution) and scope/context metadata

DS002 now defines a normative “Canonical Fact Model and Type System” section that makes these assumptions implementable and referenceable across DS003/DS004.
Remaining work is mainly example-driven: demonstrate canonicalization outcomes for common edge cases (aliases, units, and time) and specify defaults for time-overlap policy.

### 3) Scope and context: structural separators vs VM contexts (addressed; clarify merge semantics)

- `DS001` emphasizes structural separators and scope boundaries in the event stream.
- `DS002` introduces VM context mechanisms (`PUSH_CONTEXT`, `POP_CONTEXT`, `MERGE_CONTEXT`, `ISOLATE_CONTEXT`) as the isolation boundary for reasoning.

DS001 now includes an explicit “Scope to Context Mapping (Normative)” section describing how structural scope becomes VM contexts and how promotion/merge is gated by closure checks.
Remaining work: specify concrete merge semantics (what is promotable, conflict-handling policy options, and how promotion affects later queries).

### 4) Budget semantics and determinism constraints (addressed at contract level; still needs cost model)

- `DS004` requires reproducibility (fixed seeds, deterministic scheduling) and budget-bounded correctness claims.
- `DS002` describes parallelism (exploratory branching, async CALL) and distributed execution as optimization directions.

DS004 now defines a normative budget model (parameters + composition rules) and a minimum result-reporting schema that includes strict/conditional/indeterminate modes.
Remaining work: define an explicit cost model (how many “steps” common VM operations consume) and provide a small conformance checklist for strict-mode determinism.

### 5) "VSA proposes, VM disposes" is consistent but needs an interface boundary

Across `DS001`, `DS003`, and `DS005`, VSA is consistently described as a similarity accelerator, not a truth mechanism. To keep that boundary enforceable in implementation, the interface needs to be made explicit:

- what VSA returns (candidates + scores + justification),
- what the VM validates (execution + closure + conflict checks), and
- what gets persisted (schemas, macros, learned priors) and under what promotion criteria.

## Completeness / Underspecification (Actionable)

These are the main missing "definition-of-done" items that block implementable consistency.

### A) Canonical fact schema (must be shared across DS002/DS003/DS004)

Now defined in DS002 “Canonical Fact Model and Type System (Normative)”. Remaining details to lock down:

- canonicalization examples and equivalence boundaries (what counts as identity vs conditional similarity)
- default time-overlap policy and its interaction with conflict checks
- minimal predicate/slot taxonomy for the initial MVP (so schemas can be authored/tested)

### B) Bounded closure details (DS004 + interfaces into DS002)

DS004 now specifies the contract-level pieces (budgets, modes, reporting). Remaining:

- exact VM state snapshot model and merge semantics for branching/search
- contradiction taxonomy tied tightly to DS002 fields (direct polarity, temporal overlap, scoped visibility)
- a minimal set of closure test scenarios for regression

### C) Query schema format and program representation (DS003 + DS002)

DS003 now specifies a normative minimal schema/program model. Remaining:

- a stable on-disk wire format and versioning strategy for schema artifacts
- promotion criteria tying schema telemetry to DS005 consolidation rules

### D) Consolidation criteria and rollback (DS002 + DS005)

DS005 now includes an instrumentable MDL score breakdown and a rollback requirement. Remaining:

- explicit thresholds (support, MDL delta, validation pass criteria)
- a minimal health-check suite (consistency, determinism, performance regression)

## Per-Document Review

### DS001 Foundations and Architecture

**Strengths**

- Clear north-star: VM execution + bounded closure define acceptability; VSA accelerates search but does not define truth.
- Strong unifying abstraction for multimodality via an event stream and structural separators.

**Gaps / improvements**

- Event stream and scope mapping are now specified normatively; consider adding a short worked example (a small input span → events → scopes) to make the representation immediately implementable.
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

- Schema/program representation is now specified at a minimum viable level; consider adding versioning rules and a small canonical schema example that exercises slot typing and ambiguity handling.
- MDL scoring is described conceptually but would benefit from a concrete scoring breakdown that can be instrumented and tested.

### DS004 Correctness and Bounded Closure

**Strengths**

- The correctness contract, budget parameters, and strict vs conditional modes are clearly articulated.
- Tracing/auditability and reproducibility are treated as first-class requirements.

**Gaps / improvements**

- The contract now includes a canonical conflict predicate and a minimum result-reporting schema; consider adding a compact example report showing strict vs conditional vs indeterminate outcomes on the same query under different budgets.

### DS005 Training, Learning, and Optimization

**Strengths**

- Two-loop training architecture ties together language modeling, program search, and consolidation.
- Connects compression (MDL) pressure to emergent compilation and macro-programs, consistent with DS002/DS003.

**Gaps / improvements**

- MDL is now expressed in an instrumentable form and consolidation includes rollback requirements; consider pinning down default thresholds for an MVP.
- Scaling/distributed execution now references DS004 reproducibility constraints; consider adding a strict-mode “do not distribute unless deterministic” rule of thumb to the NFS/FS layer if needed.

## Recommended Next Edits (Prioritized)

1. Add worked examples: event stream + scope derivation, canonicalization outcomes, and strict/conditional/indeterminate reports under different budgets.
2. Specify VM state snapshot and branch merge semantics precisely (copy-on-write model, merge policy hooks, and trace requirements).
3. Define an explicit VSA interface boundary (inputs/outputs, persistence, and promotion criteria) to enforce “VSA proposes, VM disposes”.
4. Define a minimal strict-mode conformance checklist (determinism, budget accounting, trace reproducibility) suitable for regression testing.
