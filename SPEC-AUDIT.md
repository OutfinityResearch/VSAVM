# Spec vs Implementation Audit (docs/specs)

This repo implements an early, minimal subset of the VSAVM design specs. The current codebase covers core types, a small VM with an instruction dispatcher, an in-memory storage backend, a basic VSA layer, and a text-to-event-stream parser. Large parts of DS003–DS005 and the full DS007/DS008 normative formats/algorithms are not implemented yet.

## Coverage Summary (by design spec)

- **DS001 (Foundations)**: Partially implemented (event stream + VSA stubs); controlled generation/realization not implemented.
- **DS002 (VM design/execution)**: Partially implemented (basic instruction set, contexts, storage wrapper, budgets); macro-instruction system and many semantics are not implemented.
- **DS003 (Query compilation/search)**: Not implemented (no NL compiler, schema store/retrieval, search strategies, MDL-driven selection).
- **DS004 (Correctness/bounded closure)**: Partially implemented (budgets + basic conflicts), but no bounded-closure service, branch manager, or result-contract enforcement beyond minimal `QueryResult`.
- **DS005 (Training/learning/optimization)**: Not implemented.
- **DS006 (Implementation plan)**: Partially implemented (directory layout matches only the currently-built subset; many planned modules are absent).
- **DS007 (Data formats/constants)**: Partially implemented (JS shapes exist), but key hashing/serialization formats are not compliant.
- **DS008 (Algorithms/error handling)**: Partially implemented (some concepts exist), but most normative algorithms are missing or simplified.

## High-Impact Mismatches to Fix Next

### DS007 FactId hashing + format (mismatch)

- **Spec**: `FactId` is SHA-256 based (predicate/args/qualifiers hashes truncated to 16 bytes each), string representation is **base64url** of the 48 concatenated bytes.
- **Current**: `computeFactId()` uses a short FNV-1a hex hash and returns a dotted string `"pred.args.qual"`.
- **Files**: `src/core/types/facts.mjs`, `src/core/hash.mjs`.

### DS008 canonicalization algorithms (mostly missing)

- **Spec**: deterministic canonicalization for text/number/time/terms, plus stable term hashing.
- **Current**: `CANONICALIZE` is identity unless a canonicalizer is injected; canonicalizer strategies are defined as an interface but not implemented/registered/injected.
- **Files**: `src/core/interfaces/canonicalizer-strategy.mjs`, `src/vm/instructions/term-ops.mjs`, `src/index.mjs`.

### Time overlap policy + precision handling (mismatch)

- **Spec**: conflict-time overlap respects precision and the configured overlap policy; `unknown` time handling is policy-dependent.
- **Current**: `timeOverlaps()` ignores precision and treats `unknown` times as always overlapping.
- **Files**: `src/core/types/terms.mjs`, conflict checks in `src/vm/state/fact-store.mjs` and `src/storage/strategies/memory-store.mjs`.

### DS007 VM built-in ops declared but not implemented

- **Spec**: Program IR includes built-ins (`COUNT`, `FILTER`, `MAP`, `REDUCE`).
- **Current**: Costs exist in `OP_COSTS`, but ops are not implemented, not registered, and are rejected by `validateProgram()`.
- **Files**: `src/vm/budget.mjs`, `src/vm/instructions/index.mjs`, `src/vm/vm-service.mjs`.

### DS008 error structure/recovery model (partial mismatch)

- **Spec**: error objects include `recoverable` and optional `cause`, with structured `ErrorContext`.
- **Current**: `VSAVMError` has `code/category/context/timestamp` but lacks `recoverable` + `cause`, and the code list diverges from DS008’s example table.
- **Files**: `src/core/errors.mjs`.

## Implemented Differently (or Underspecified in Code)

- **Struct term shape**: code uses `{ structType, slots: Map }` while DS007 describes `{ type, slots }` (property naming mismatch).
- **Program IR args**: code uses raw JS values plus `$binding` and `?var` string conventions; DS007 specifies typed `InstructionArg` objects and required metadata.
- **Event stream**: in-memory `EventStream` exists, but the DS007 binary serialization format (EVTS header, per-event encoding, CRC) is not implemented.
- **HyperVector format**: `BinarySparseVSA` uses `Set` of indices (`encoding: 'sparse-binary'`), not DS007’s packed binary/bipolar/float buffer encodings.
- **Storage querying**: argument matching uses `JSON.stringify()` equality, which is not a spec-defined canonical comparison and will break for semantically-equal but differently-shaped terms.

## Not Implemented Yet (Major Gaps)

- **Entity resolution** (DS008): no candidate generation, alias matching, or VSA-guided resolution pipeline.
- **Bounded closure service + branch management** (DS004/DS008): no snapshot-based branching, pruning, or conflict-driven mode handling.
- **Schema/program search + MDL scoring** (DS003/DS008): search strategies/scorers are interfaces only (no beam search/MCTS, no MDL).
- **Controlled generation** (DS001): no faithful realization layer that renders strictly from `QueryResult.claims`.
- **Training loop** (DS005): no pattern mining, consolidation, or RL shaping.

