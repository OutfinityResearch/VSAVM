# VSAVM Specs Review (2026-01-20)

## Scope

This review covers every Markdown file under `docs/specs/`, with emphasis on the DS design specifications.

Document sets:
- **Primary requirements:** `URS.md`, `FS.md`, `NFS.md`
- **Original (concise) design specs:** `DS001`–`DS014`
- **Comprehensive (implementation) design specs:** `DS016`–`DS029`

## Summary of Fixes Applied During This Review

The following issues were unambiguous and were fixed directly:

1) **DS numbering mismatch in headings (fixed)**
- `DS016`–`DS029` filenames were unique, but the internal `# DSxxx ...` titles still used the old numbers (`DS001`–`DS015`).
- Fix: aligned each document title to its filename (e.g., `DS016-system-architecture.md` now begins with `# DS016 ...`).

2) **Internal contradiction: “budget monotonicity” vs “discovering contradictions at higher budget” (fixed)**
- `DS019` and `DS025` stated that raising the verification budget can surface new issues, while also claiming that conclusions verified at lower budgets remain valid at higher budgets.
- Fix: clarified monotonicity as applying to **bounded verification claims** (“verified up to budget B remains true for that same horizon”), while allowing larger budgets to discover issues beyond the previous frontier.
- Related clarification applied to `DS011`.

3) **Local inconsistency in DENY semantics (fixed)**
- `DS017` described `DENY` as “removing facts” in one sentence and as “recording explicit negation” later.
- Fix: aligned the earlier sentence with the explicit-negation semantics.

4) **Specs navigation refactor (fixed)**
- Removed the obsolete Markdown index (`docs/specs/INDEX.md`).
- Added a Specs index page at `docs/specs/index.html` with two sections: HTML viewer links and direct Markdown links.

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

## Per-Document Notes (One-by-One)

### Primary Requirements

- `URS.md`: Clear high-level requirements; no internal contradictions. Needs traceability mapping to `DS016`–`DS029` sections.
- `FS.md`: Coherent functional decomposition. A future improvement is a cross-reference table to the comprehensive DS docs.
- `NFS.md`: Key constraints are sensible; strict-mode determinism needs an explicit operational definition shared across runtime, search, and generation.

### Original Design Specs (DS001–DS014)

- `DS001-high-level-vision.md`: Coherent conceptual overview; intentionally leaves algorithms unspecified.
- `DS002-input-representation.md`: Strong constraints (discrete, reversible, phrase/tokens) but lacks concrete event-type taxonomy and canonicalization rules.
- `DS003-structural-separators.md`: Correctness reliance on scoping is clear; deterministic parser details remain open.
- `DS004-training-method.md`: Clear statement of the two-loop idea; does not specify scoring/selection mechanics.
- `DS005-rl-shaping.md`: Consistent with the “RL as selection/shaping” philosophy; reward definitions remain open.
- `DS006-question-encoding.md`: Reasonable pipeline outline; needs concrete slot typing and coreference policy.
- `DS007-next-phrase-closure.md`: Good runtime contract: simulate candidate, run local closure, reject conflicts in strict mode.
- `DS008-output-decoding.md`: Clean fidelity principle; needs operational definition of “no new facts”.
- `DS009-correctness-bounded-closure.md`: Core correctness framing is consistent; needs algorithmic details (beam/state/budget).
- `DS010-vm-design-vsa.md`: Good minimal VM state sketch; instruction set remains illustrative rather than enumerated.
- `DS011-correctness-contract.md`: Contract framing is useful; monotonicity definition was clarified during this review.
- `DS012-geometric-interpretation.md`: Conceptual; not implementation-binding.
- `DS013-federated-learning.md`: Conceptual; defers to the comprehensive federated spec for concrete mechanics.
- `DS014-trustworthy-ai.md`: Strong “execution-first” trust contract; should cross-link to the comprehensive explainability spec.

### Comprehensive Specs (DS016–DS029)

- `DS016-system-architecture.md`: Solid narrative; still needs explicit interface contracts between subsystems (event stream ↔ VM, VM ↔ generator).
- `DS017-vm-design-execution.md`: Good coverage of components; instruction set is described but not enumerated as a strict opcode catalog; DENY semantics wording was corrected.
- `DS018-query-compilation-search.md`: Covers schema retrieval, search, consolidation; still missing a precise MDL scoring definition.
- `DS019-correctness-bounded-closure.md`: Clear decomposition; monotonicity wording was corrected to avoid internal contradiction.
- `DS020-training-learning-optimization.md`: Coherent training story; still lacks concrete training data segmentation spec and measurable consolidation criteria.
- `DS021-next-phrase-generation.md`: Strong separation of pre/incremental/post validation; needs explicit handling of determinism vs sampling policies.
- `DS022-output-decoding-realization.md`: Strong fidelity framing (including back-translation); needs explicit “fidelity failure” handling policy.
- `DS023-geometric-interpretation.md`: Useful conceptual framing; should remain explicitly non-normative (optimization ideas, not requirements).
- `DS024-federated-learning.md`: Good structure; artifact formats and validation gates need precise definitions.
- `DS025-trustworthy-ai-explainability.md`: Good trust story; monotonicity wording was corrected to avoid conflict with “deeper budgets find issues”.
- `DS026-performance-optimization.md`: Mostly architectural; needs explicit complexity targets tied to budgets and data size.
- `DS027-integration-deployment.md`: Good operational topics; could benefit from explicit environment/CLI contracts once implementation exists.
- `DS028-domain-adaptation.md`: Reasonable strategies; needs concrete evaluation protocol per domain.
- `DS029-future-extensions.md`: Appropriate as forward-looking; should remain separated from “must implement” requirements.

## Recommended Task List (Prioritized)

1) **Define canonical fact schema + type system** (shared across VM, compiler, closure, logs, realization).
2) **Specify VM machine model and opcode catalog** (stack/register model, instruction formats, effect on state, determinism requirements).
3) **Formalize bounded closure** (state representation, beam semantics, budget accounting, robust/conditional definitions, reporting format).
4) **Specify deterministic structural parsing and separator hierarchy** (including modality-specific segmentation contracts).
5) **Define MDL scoring and consolidation criteria** (math + operational “promotion” gates + health checks).
6) **Define execution log / closure journal schemas** (minimum fields for audit, replay, explainability).
7) **Define VSA operations and encoding recipes** (binding/bundling roles, position encoding, span composition, similarity search constraints).
8) **Define “no new facts” at realization time** (symbolic equivalence classes, acceptable paraphrase rules, back-translation tolerances).
9) **Define strict vs exploratory mode operationally** (allowed nondeterminism, sampling policies, concurrency constraints).
10) **Define federated artifact formats + admission pipeline** (compatibility checks, privacy filters, conflict handling).
