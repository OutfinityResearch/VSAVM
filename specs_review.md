

## Remaining Cross-Document Consistency Risks

These are not hard contradictions, but they are areas where different documents imply different implementation choices unless clarified:

1) **Strict-mode determinism vs parallelism / async execution**
- `NFS.md` requires deterministic behavior in strict mode (“same input and budget produce the same result”).
- Comprehensive specs discuss parallelism and async execution (e.g., program calls, distributed execution, and deterministic scheduling constraints).
- Risk: “deterministic scheduling” needs to be defined precisely (what is allowed in strict mode vs exploratory mode, and what nondeterminism sources must be prohibited).

2) **Context scoping: structural separators vs VM contexts**
- `DS003` emphasizes separators as the basis for local theories and scoping.
- `DS017` introduces VM contexts (`PUSH_CONTEXT`, `POP_CONTEXT`, merging/isolation).
- Risk: without a single authoritative mapping (“structural scope → VM context policy”), implementations may diverge (e.g., whether scope is purely provenance, or also a logical isolation boundary).

3) **“Canonical fact identifier” / “typed slots” are referenced everywhere but not standardized**
- Multiple docs assume a canonical internal form with typed slots, explicit negation, provenance, and context.
- Risk: without a shared schema (field list + types + canonicalization rules), each subsystem can drift (compiler, closure, logging, realization).

## Ambiguities / Underspecification (Actionable)

These items are broadly mentioned across specs but still lack implementable detail. They should become concrete “definition-of-done” tasks.

### A) Canonical fact model and type system
Open items:
- Minimal canonical fact schema (required slots, optional slots, provenance fields, context fields).
- Type system rules (type equality/subtyping, slot validation, variable binding typing, unification constraints).
- Explicit negation representation (polarity, scope, and interaction with context isolation).

### B) Bounded closure algorithm details
Open items:
- Exact state representation for beam search (what constitutes a VM state snapshot; what is mutable vs persistent).
- Definition of “robust” vs “conditional” conclusions (branch quantification, hypothesis identifiers, and reporting format).
- Budget accounting semantics (what counts as depth vs steps vs branching vs time; how budgets compose across nested calls).

### C) Structural separators / deterministic parser
Open items:
- Separator hierarchy and precedence rules (document/section/paragraph/sentence/span, plus modality-specific segmentation).
- Deterministic parsing constraints (what inputs/encoders are allowed; how to ensure reproducibility across versions).

### D) MDL scoring and consolidation criteria
Open items:
- Explicit MDL objective definition (what is “description length” for programs/schemas/macros; what is the data likelihood term).
- Consolidation triggers and “health checks” (what must be proven before promotion; what the rollback story is).

### E) Output fidelity / back-translation
Open items:
- What “back-translation” means operationally (which parser, which tolerance, how to handle paraphrase-equivalent outputs).
- Strong prohibition on introducing “new facts” needs an explicit definition of what counts as a new fact vs re-expression.

