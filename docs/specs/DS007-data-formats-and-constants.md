# DS007 Data Formats and Constants

This document specifies concrete data formats, serialization schemas, wire protocols, and system constants for VSAVM implementation. All formats are normative and must be followed for interoperability between modules.

## Encoding Conventions

- **Strings**: UTF-8 encoded
- **Integers**: Little-endian, signed unless specified
- **Floats**: IEEE 754 double precision (64-bit)
- **Timestamps**: Unix epoch milliseconds (int64)
- **UUIDs**: RFC 4122 v4, stored as 16 bytes or 36-char string

## Identifier Formats

### SymbolId

Canonical identifier for predicates, roles, and enum values.

```typescript
interface SymbolId {
  namespace: string;    // e.g., "vsavm.core", "domain.medical"
  name: string;         // e.g., "is_a", "located_in"
}

// String representation: "namespace:name"
// Example: "vsavm.core:is_a"

// Hash: SHA-256 of UTF-8 bytes of string representation, truncated to 16 bytes
```

**Reserved namespaces**:
- `vsavm.core`: Built-in predicates
- `vsavm.meta`: Metadata predicates
- `vsavm.temp`: Temporary/derived predicates

### EntityId

Canonical identifier for entities.

```typescript
interface EntityId {
  source: string;       // Origin system/dataset
  localId: string;      // ID within source
  version?: number;     // Optional version for mutable entities
}

// String representation: "source/localId" or "source/localId@version"
// Example: "wikidata/Q42" or "internal/person_001@3"

// Hash: SHA-256 of UTF-8 bytes, truncated to 16 bytes
```

### FactId

Canonical identifier for a fact (independent of polarity/scope/time).

```typescript
interface FactId {
  predicateHash: Uint8Array;  // 16 bytes, from SymbolId
  argumentsHash: Uint8Array;  // 16 bytes, from canonical arguments
  qualifiersHash: Uint8Array; // 16 bytes, from sorted qualifiers
}

// Total: 48 bytes
// String representation: base64url(predicateHash + argumentsHash + qualifiersHash)
```

**FactId computation**:
1. Canonicalize predicate → SymbolId → hash
2. Canonicalize each argument → sort by slot name → concatenate → hash
3. Canonicalize qualifiers (excluding time, scope, provenance) → sort by key → hash
4. Concatenate three hashes

### ScopeId

Derived from event stream context path.

```typescript
interface ScopeId {
  path: string[];  // e.g., ["doc_001", "section_2", "para_1"]
}

// String representation: path.join("/")
// Example: "doc_001/section_2/para_1"

// Hash: SHA-256 of UTF-8 bytes, truncated to 8 bytes
```

### SourceId

Provenance identifier.

```typescript
interface SourceId {
  type: 'document' | 'speaker' | 'sensor' | 'derived' | 'user';
  id: string;
  metadata?: Record<string, string>;
}

// String representation: "type:id"
// Example: "document:arxiv_2024_12345"
```

## Term Representation

### Atom Types

```typescript
type AtomType = 
  | 'entity'      // EntityId reference
  | 'symbol'      // SymbolId reference
  | 'string'      // UTF-8 string literal
  | 'number'      // IEEE 754 double
  | 'integer'     // 64-bit signed integer
  | 'boolean'     // true/false
  | 'time'        // TimeRef (see below)
  | 'null';       // Explicit null/unknown

interface Atom {
  type: AtomType;
  value: EntityId | SymbolId | string | number | bigint | boolean | TimeRef | null;
}
```

### TimeRef

Temporal references for facts.

```typescript
interface TimeRef {
  type: 'instant' | 'interval' | 'relative' | 'unknown';
  
  // For instant
  instant?: number;  // Unix epoch ms
  
  // For interval
  start?: number;    // Unix epoch ms (null = unbounded)
  end?: number;      // Unix epoch ms (null = unbounded)
  
  // For relative
  anchor?: string;   // Reference event ID
  offset?: number;   // Offset in ms
  
  // Precision
  precision: 'ms' | 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';
}
```

**Time overlap policy** (for conflict detection):
- `strict`: Intervals must share at least one instant at stated precision
- `lenient`: Intervals must share at least one instant at day precision
- Default: `strict`

### Struct

Typed record with named slots.

```typescript
interface Struct {
  type: SymbolId;                    // Struct type identifier
  slots: Map<string, Term>;          // slot name → Term
}

// Canonical slot ordering: lexicographic by slot name (UTF-8)
```

### Term (Union)

```typescript
type Term = Atom | Struct;

// Serialization discriminator byte:
// 0x01 = Atom (followed by AtomType byte)
// 0x02 = Struct
```

## Fact Instance Format

```typescript
interface FactInstance {
  // Identity (48 bytes as FactId)
  factId: FactId;
  
  // Core content
  predicate: SymbolId;
  arguments: Map<string, Term>;  // Slot name → value
  
  // Polarity
  polarity: 'assert' | 'deny';   // 1 byte: 0x01 = assert, 0x02 = deny
  
  // Context
  scopeId: ScopeId;
  
  // Temporal
  time?: TimeRef;
  
  // Confidence (0.0 to 1.0, or null for definite)
  confidence?: number;
  
  // Provenance (at least one required)
  provenance: ProvenanceLink[];
  
  // Additional qualifiers
  qualifiers: Map<string, Term>;
}

interface ProvenanceLink {
  sourceId: SourceId;
  eventSpan?: { start: number; end: number };  // Event IDs in stream
  extractorId?: string;                         // Which component extracted this
  timestamp: number;                            // When extracted
}
```

### Binary Serialization (Fact Instance)

```
+----------------+----------------+----------------+
| Magic (4B)     | Version (2B)   | Flags (2B)     |
| "FACT"         | 0x0001         | see below      |
+----------------+----------------+----------------+
| FactId (48B)                                     |
+--------------------------------------------------+
| Predicate SymbolId (var)                         |
+--------------------------------------------------+
| Argument count (2B) | Arguments (var)            |
+--------------------------------------------------+
| Polarity (1B)       | ScopeId (var)              |
+--------------------------------------------------+
| Time (var, optional based on flags)              |
+--------------------------------------------------+
| Confidence (8B float, optional based on flags)   |
+--------------------------------------------------+
| Provenance count (2B) | Provenance links (var)   |
+--------------------------------------------------+
| Qualifier count (2B) | Qualifiers (var)          |
+--------------------------------------------------+
| CRC32 (4B)                                       |
+--------------------------------------------------+

Flags (bit field):
  bit 0: has_time
  bit 1: has_confidence
  bit 2: has_qualifiers
  bits 3-15: reserved (must be 0)
```

## Event Stream Format

### Event

```typescript
interface Event {
  eventId: number;           // Sequential within stream, uint32
  type: EventType;
  payload: EventPayload;
  contextPath: string[];     // Scope derivation path
  sourceRef?: SourceRef;     // Link to raw input
}

type EventType =
  | 'text_token'
  | 'visual_token'
  | 'audio_token'
  | 'timestamp'
  | 'separator'
  | 'header'
  | 'list_item'
  | 'quote'
  | 'table_cell'
  | 'formula'
  | 'code_block'
  | 'metadata';

interface SourceRef {
  sourceId: SourceId;
  byteOffset?: number;
  charOffset?: number;
  timestamp?: number;
}
```

### EventPayload by Type

```typescript
// text_token
interface TextTokenPayload {
  token: string;           // Normalized token text
  originalForm?: string;   // Original before normalization
  pos?: string;            // Part of speech tag (optional)
}

// separator
interface SeparatorPayload {
  level: 'document' | 'section' | 'paragraph' | 'sentence' | 'phrase';
  label?: string;          // e.g., "Chapter 1", "Introduction"
}

// timestamp
interface TimestampPayload {
  time: TimeRef;
  role: 'event_time' | 'reference_time' | 'speech_time';
}

// header
interface HeaderPayload {
  level: number;           // 1-6
  text: string;
}
```

### Event Stream Binary Format

```
+----------------+----------------+
| Magic (4B)     | Version (2B)   |
| "EVTS"         | 0x0001         |
+----------------+----------------+
| Event count (4B)                |
+---------------------------------+
| Event 1 (var)                   |
+---------------------------------+
| Event 2 (var)                   |
+---------------------------------+
| ...                             |
+---------------------------------+
| Stream metadata (var)           |
+---------------------------------+
| CRC32 (4B)                      |
+---------------------------------+

Per-event format:
+----------------+----------------+
| Event ID (4B)  | Type (1B)      |
+----------------+----------------+
| Context depth (1B) | Context path (var) |
+----------------+-------------------+
| Payload length (2B) | Payload (var) |
+-------------------------------------+
| Source ref (var, optional)          |
+-------------------------------------+
```

## HyperVector Format

### In-Memory Representation

```typescript
interface HyperVector {
  dimensions: number;      // Must match strategy config
  encoding: 'binary' | 'bipolar' | 'float';
  data: ArrayBuffer;
}

// Binary encoding: 1 bit per dimension, packed into bytes
// dimensions=10000 → 1250 bytes

// Bipolar encoding: 1 byte per dimension (+1 or -1 stored as 0x01 or 0xFF)
// dimensions=10000 → 10000 bytes

// Float encoding: 4 bytes (float32) per dimension
// dimensions=10000 → 40000 bytes
```

### Serialization

```
+----------------+----------------+
| Magic (4B)     | Version (2B)   |
| "HVEC"         | 0x0001         |
+----------------+----------------+
| Dimensions (4B)| Encoding (1B)  |
+----------------+----------------+
| Data (var)                      |
+---------------------------------+
| CRC32 (4B)                      |
+---------------------------------+

Encoding byte:
  0x01 = binary
  0x02 = bipolar
  0x03 = float
```

## Schema Format

```typescript
interface QuerySchema {
  schemaId: string;        // Stable identifier, e.g., "schema:v1:check_contradiction"
  name?: string;           // Human-readable label
  version: number;         // Increment on breaking changes
  
  // Retrieval trigger
  trigger: {
    vsaKey: HyperVector;   // For similarity retrieval
    requiredFeatures: string[];  // e.g., ["QUESTION_MARKER", "NEGATION"]
    minSimilarity: number; // Threshold (0.0-1.0)
  };
  
  // Typed slots
  slots: SchemaSlot[];
  
  // Program template
  programTemplate: Instruction[];
  
  // Output specification
  outputContract: {
    kind: 'verdict' | 'entity_list' | 'fact_list' | 'explanation';
    mode: 'strict_only' | 'strict_or_conditional' | 'any';
  };
  
  // Telemetry (mutable, not part of identity)
  telemetry?: SchemaTelemetry;
}

interface SchemaSlot {
  name: string;
  type: SlotType;
  required: boolean;
  defaultValue?: Term;
  constraints?: SlotConstraint[];
}

type SlotType =
  | 'entity'
  | 'fact_pattern'
  | 'predicate'
  | 'term'
  | 'number'
  | 'string'
  | 'time'
  | 'scope';

interface SchemaTelemetry {
  retrievalCount: number;
  successCount: number;
  ambiguityRate: number;      // 0.0-1.0
  closureFailureRate: number; // 0.0-1.0
  avgExecutionMs: number;
  lastUsed: number;           // Timestamp
}
```

### Schema JSON Format

```json
{
  "schemaId": "schema:v1:is_x_a_y",
  "name": "Check Is-A Relationship",
  "version": 1,
  "trigger": {
    "vsaKey": "<base64-encoded-hypervector>",
    "requiredFeatures": ["QUESTION_MARKER"],
    "minSimilarity": 0.35
  },
  "slots": [
    { "name": "subject", "type": "entity", "required": true },
    { "name": "category", "type": "entity", "required": true }
  ],
  "programTemplate": [
    { "op": "MAKE_TERM", "args": { "predicate": "is_a", "subject": "$subject", "object": "$category" }, "out": "pattern" },
    { "op": "QUERY", "args": { "pattern": "$pattern" }, "out": "matches" },
    { "op": "BRANCH", "args": { "condition": "matches.length > 0", "then": "found", "else": "not_found" } }
  ],
  "outputContract": {
    "kind": "verdict",
    "mode": "strict_or_conditional"
  }
}
```

## Program IR Format

```typescript
interface Program {
  programId: string;
  instructions: Instruction[];
  metadata: ProgramMetadata;
}

interface Instruction {
  op: OpCode;
  args: Record<string, InstructionArg>;
  out?: string | string[];   // Output binding name(s)
  label?: string;            // Jump target label
}

type InstructionArg = 
  | { type: 'literal'; value: Term }
  | { type: 'binding'; name: string }
  | { type: 'slot'; name: string }
  | { type: 'label'; name: string };

type OpCode =
  // Term ops
  | 'MAKE_TERM'
  | 'CANONICALIZE'
  | 'BIND_SLOTS'
  // Fact ops
  | 'ASSERT'
  | 'DENY'
  | 'QUERY'
  // Logic ops
  | 'MATCH'
  | 'APPLY_RULE'
  | 'CLOSURE'
  // Control ops
  | 'BRANCH'
  | 'JUMP'
  | 'CALL'
  | 'RETURN'
  // Context ops
  | 'PUSH_CONTEXT'
  | 'POP_CONTEXT'
  | 'MERGE_CONTEXT'
  | 'ISOLATE_CONTEXT'
  // Built-in functions
  | 'COUNT'
  | 'FILTER'
  | 'MAP'
  | 'REDUCE';

interface ProgramMetadata {
  sourceSchemaId?: string;
  compiledAt: number;
  estimatedSteps: number;
  estimatedBranches: number;
  tracePolicy: 'none' | 'minimal' | 'full';
}
```

## Result Format

```typescript
interface QueryResult {
  // Response mode
  mode: 'strict' | 'conditional' | 'indeterminate';
  
  // Budget accounting
  budgetUsed: BudgetUsage;
  
  // Claims (empty if indeterminate)
  claims: Claim[];
  
  // Assumptions (for conditional mode)
  assumptions: Assumption[];
  
  // Conflicts detected
  conflicts: ConflictReport[];
  
  // Trace references
  traceRefs: TraceRef[];
  
  // Timing
  executionMs: number;
}

interface BudgetUsage {
  maxDepth: number;
  usedDepth: number;
  maxSteps: number;
  usedSteps: number;
  maxBranches: number;
  usedBranches: number;
  maxTimeMs?: number;
  usedTimeMs: number;
}

interface Claim {
  claimId: string;
  content: Term;
  confidence: number;        // 1.0 for strict, <1.0 for conditional
  supportingFacts: FactId[];
  derivationTrace: TraceRef;
}

interface Assumption {
  assumptionId: string;
  description: string;
  dependentClaims: string[]; // Claim IDs
}

interface ConflictReport {
  conflictId: string;
  type: 'direct' | 'indirect' | 'temporal';
  facts: FactId[];
  scopeId: ScopeId;
  resolution?: string;       // If resolved, how
}

interface TraceRef {
  logSegmentId: string;
  startOffset: number;
  endOffset: number;
}
```

## System Constants

### VSA Parameters

| Constant | Default | Range | Description |
|----------|---------|-------|-------------|
| `VSA_DIMENSIONS` | 10000 | 1000-100000 | Hypervector dimensionality |
| `VSA_SIMILARITY_THRESHOLD` | 0.35 | 0.1-0.8 | Minimum similarity for "match" |
| `VSA_RETRIEVAL_K` | 10 | 1-100 | Top-K candidates to retrieve |
| `VSA_HASH_SEED` | 0x5A5A5A5A | any uint32 | Deterministic hash seed |

### Budget Defaults

| Constant | Default | Range | Description |
|----------|---------|-------|-------------|
| `BUDGET_MAX_DEPTH` | 10 | 1-100 | Max inference chain depth |
| `BUDGET_MAX_STEPS` | 1000 | 10-100000 | Max inference steps |
| `BUDGET_MAX_BRANCHES` | 5 | 1-50 | Max parallel branches |
| `BUDGET_MAX_TIME_MS` | 5000 | 100-300000 | Wall-clock timeout |

### Search Parameters

| Constant | Default | Range | Description |
|----------|---------|-------|-------------|
| `SEARCH_BEAM_WIDTH` | 10 | 1-100 | Beam search width |
| `SEARCH_MAX_ITERATIONS` | 100 | 10-10000 | Max search iterations |
| `SEARCH_DIVERSITY_WEIGHT` | 0.2 | 0.0-1.0 | Diversity vs. quality tradeoff |
| `SEARCH_EARLY_STOP_THRESHOLD` | 0.95 | 0.5-1.0 | Stop if score exceeds |

### MDL Scoring Weights

| Constant | Default | Range | Description |
|----------|---------|-------|-------------|
| `MDL_COMPLEXITY_WEIGHT` | 1.0 | 0.1-10.0 | Program complexity cost weight |
| `MDL_RESIDUAL_WEIGHT` | 2.0 | 0.1-10.0 | Prediction loss weight |
| `MDL_CORRECTNESS_PENALTY` | 10.0 | 1.0-100.0 | Per-conflict penalty |
| `MDL_BUDGET_PENALTY` | 0.5 | 0.0-5.0 | Per-step budget overage |

### Canonicalization

| Constant | Default | Description |
|----------|---------|-------------|
| `CANON_CASE_SENSITIVE` | false | Preserve case in string atoms |
| `CANON_STRIP_PUNCTUATION` | true | Remove punctuation from strings |
| `CANON_NORMALIZE_WHITESPACE` | true | Collapse whitespace to single space |
| `CANON_NUMBER_PRECISION` | 6 | Decimal places for number comparison |
| `CANON_TIME_PRECISION` | 'second' | Default time comparison precision |

### Storage

| Constant | Default | Description |
|----------|---------|-------------|
| `STORAGE_CACHE_SIZE_MB` | 256 | In-memory cache size |
| `STORAGE_SNAPSHOT_RETENTION` | 10 | Max snapshots to keep |
| `STORAGE_INDEX_BATCH_SIZE` | 1000 | Index update batch size |
| `STORAGE_VACUUM_INTERVAL_MS` | 3600000 | Garbage collection interval |

### Closure

| Constant | Default | Description |
|----------|---------|-------------|
| `CLOSURE_TIME_OVERLAP_POLICY` | 'strict' | Time conflict detection |
| `CLOSURE_BRANCH_PRUNE_THRESHOLD` | 0.1 | Prune branches below this score ratio |
| `CLOSURE_CONFLICT_CHECK_INTERVAL` | 10 | Steps between full conflict scans |

## Version Compatibility

### Schema Version Rules

- **Major version** (e.g., v1 → v2): Breaking changes, not backward compatible
- **Minor version** (within schemaId): Additive changes, backward compatible

### Data Migration

When upgrading formats:
1. Old readers must reject unknown magic/version
2. New readers must handle old versions
3. Explicit migration tools for major version upgrades

### Checksums

All binary formats include CRC32 for integrity. Readers must verify before parsing.
