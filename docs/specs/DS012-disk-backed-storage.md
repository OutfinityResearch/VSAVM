# DS012 Disk-Backed Storage Strategy (FileStore)

## Purpose

This document specifies an optional, disk-backed storage strategy for VSAVM that reduces RAM pressure by persisting facts to local files while maintaining the `StorageStrategy` interface (DS006).

The default behavior of the system remains unchanged: the in-memory store stays the default, and this strategy is enabled only when explicitly selected via configuration.

## Scope

This DS covers:

- File format for persisted facts (binary, DS007-aligned).
- Indexing and retrieval behavior.
- Snapshots and rollback semantics.
- Non-functional constraints relevant to disk-backed operation.

This DS does **not** change:

- VM semantics, closure, or correctness contract (DS004).
- Emergent scope discovery requirements (NFS11 / DS010).
- Query compilation and search behavior (DS003).

## Motivation

The current `MemoryStore` retains all facts and indices in RAM. For large ingestions (e.g., event-per-byte pipelines), this becomes memory-bound.

The disk-backed strategy provides:

- Persistent storage that does not require holding all fact payloads in memory.
- Configurable indexing and caching so users can trade RAM for speed.

## Storage Strategy Name

Strategy identifier: `file`

Selected by:

```js
new VSAVM({ strategies: { storage: 'file' } })
```

## Data Model and File Formats

### Fact Record Encoding (Normative)

Each stored fact is encoded using the DS007 binary format:

- `serializeFactInstanceBinary(fact)` / `deserializeFactInstanceBinary(bytes)`

Records are written to a single append-only log file with an explicit length prefix:

```
u32le recordLength
u8[recordLength] recordBytes  // DS007 "FACT" binary payload including CRC32
```

The length prefix is required to support forward scanning without external delimiters.

### Tombstones (Normative)

Logical retractions (`denyFact`) are represented as tombstones (not as negative-polarity facts).

Tombstones are encoded as a dedicated binary record type within the same append-only log:

```
u32le recordLength
u8[recordLength] recordBytes  // DS012 "TOMB" record including CRC32
```

Tombstones participate in **last-write-wins** ordering exactly like facts.

### Snapshots (Normative)

Snapshots are implemented as a saved byte offset into the append-only log:

- Creating a snapshot records `{ dataOffset }`.
- Restoring a snapshot truncates the log back to that offset.

Snapshot IDs are opaque strings.

## Indexing and Caching (Non-Normative Defaults)

To avoid loading all facts into memory, the store maintains only a minimal in-memory index:

- `factId -> { offset, length }` for last-write-wins access.

An optional LRU cache may keep a bounded number of decoded facts.

These mechanisms are configurable so that:

- Small/medium workloads can enable indexing for speed.
- Larger workloads can reduce RAM by disabling indexing and accepting slower point lookups.

## Semantics

### Last-Write-Wins

Because the log is append-only, multiple records may exist for the same `factId` (including tombstones).

The **current** value of a fact is defined as the record with the greatest offset for that `factId`, excluding tombstoned IDs.

### Query Semantics

`query(pattern)` returns the set of facts that match:

- predicate (exact)
- polarity (exact, if provided)
- scope containment via `scopeContains` when `pattern.scopeId` is provided
- argument equality using `termsEqual` when terms are present

Pattern semantics match `MemoryStore` to preserve behavioral compatibility.

## Non-Functional Requirements

- **No new npm dependencies**: use Node.js built-ins only (NFS tech stack).
- **Deterministic behavior**: data encoding is deterministic; timestamps in tombstones must be deterministic when strict mode is enabled.
- **Crash safety (best-effort)**: append-only writes minimize corruption risk; records include CRC32 (DS007).

## Node.js Constraints and Memory Mapping

Node.js core does not provide a portable, built-in memory-mapped file API.

This DS therefore specifies a buffered file approach (append-only + explicit offsets). If true `mmap` is required, it must be implemented via a native addon, which is out of scope for this repository’s “no new dependencies” constraint.

## Future Work (Out of Scope)

- Compaction/GC: rewriting data files to drop superseded versions and tombstones.
- On-disk secondary indices (predicate/scope) to accelerate queries without RAM.
- Parallel read pipelines and batched ingestion optimizations.
