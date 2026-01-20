# DS006 Implementation Plan

This document defines the implementation architecture for VSAVM. It specifies the source code structure, module boundaries, strategy interfaces, and test organization. The design uses a strategy pattern architecture to enable pluggable implementations for key subsystems.

## Design Principles

1. **Strategy Pattern**: Core subsystems define abstract interfaces; concrete implementations are injected at runtime via configuration.
2. **Modular Boundaries**: Each folder represents a cohesive module with explicit public interfaces.
3. **Dependency Inversion**: High-level modules depend on abstractions, not concrete implementations.
4. **Testability**: Every module exposes interfaces that can be mocked or stubbed for unit testing.
5. **Configuration-Driven**: Strategy selection and parameters are externalized to configuration files.

## Source Directory Structure

```
src/
├── core/                    # Core abstractions and shared types
│   ├── types/               # Fundamental type definitions
│   │   ├── terms.ts         # Term, Atom, Struct types
│   │   ├── facts.ts         # FactId, FactInstance, Polarity
│   │   ├── identifiers.ts   # SymbolId, EntityId, ScopeId, SourceId
│   │   ├── events.ts        # Event, EventStream types
│   │   └── results.ts       # Result, Verdict, TraceRef types
│   ├── interfaces/          # Strategy interfaces (contracts)
│   │   ├── vsa-strategy.ts          # VSA representation strategy
│   │   ├── canonicalizer-strategy.ts # Canonicalization strategy
│   │   ├── storage-strategy.ts      # Fact storage backend
│   │   ├── search-strategy.ts       # Program search strategy
│   │   ├── scoring-strategy.ts      # MDL scoring strategy
│   │   └── conflict-resolver-strategy.ts # Conflict resolution
│   ├── config/              # Configuration loading and validation
│   │   ├── config-schema.ts # Configuration type definitions
│   │   ├── config-loader.ts # Load from file/env
│   │   └── strategy-registry.ts # Strategy name → implementation mapping
│   └── errors.ts            # Error types and codes
│
├── event-stream/            # DS001: Event stream processing
│   ├── parser/              # Input parsing to events
│   │   ├── text-parser.ts   # Text → token events
│   │   ├── separator-detector.ts # Structural separator detection
│   │   └── multimodal-adapter.ts # Placeholder for audio/visual
│   ├── scope/               # Scope derivation from context paths
│   │   ├── scope-builder.ts # context_path → ScopeId
│   │   └── scope-tree.ts    # Hierarchical scope management
│   └── stream.ts            # EventStream class and iteration
│
├── vsa/                     # DS001: Vector Symbolic Architecture
│   ├── strategies/          # Pluggable VSA implementations
│   │   ├── binary-sparse.ts # Binary sparse hypervectors
│   │   ├── bipolar-dense.ts # Dense bipolar (+1/-1) vectors
│   │   ├── holographic.ts   # HRR-style holographic vectors
│   │   └── mock-vsa.ts      # Deterministic mock for testing
│   ├── operations/          # VSA operations
│   │   ├── bundle.ts        # Bundling (superposition)
│   │   ├── bind.ts          # Binding (role assignment)
│   │   ├── similarity.ts    # Cosine/Hamming similarity
│   │   └── hash.ts          # Deterministic hypervector generation
│   ├── index/               # VSA-based retrieval
│   │   ├── schema-index.ts  # Schema hypervector index
│   │   ├── fact-index.ts    # Fact hypervector index
│   │   └── ann-search.ts    # Approximate nearest neighbor
│   └── vsa-service.ts       # Facade: VSA proposes candidates
│
├── vm/                      # DS002: Virtual Machine
│   ├── state/               # VM state management
│   │   ├── fact-store.ts    # Canonical fact storage (uses storage strategy)
│   │   ├── rule-memory.ts   # Rule and macro-program storage
│   │   ├── binding-env.ts   # Variable binding stack
│   │   ├── execution-log.ts # Operation trace logging
│   │   ├── context-stack.ts # Reasoning context management
│   │   └── snapshot.ts      # State snapshot for branching/rollback
│   ├── instructions/        # Instruction implementations
│   │   ├── term-ops.ts      # MAKE_TERM, CANONICALIZE, BIND_SLOTS
│   │   ├── fact-ops.ts      # ASSERT, DENY, QUERY
│   │   ├── logic-ops.ts     # MATCH, APPLY_RULE, CLOSURE
│   │   ├── control-ops.ts   # BRANCH, CALL, RETURN
│   │   └── context-ops.ts   # PUSH_CONTEXT, POP_CONTEXT, MERGE, ISOLATE
│   ├── executor.ts          # Instruction dispatch and execution loop
│   ├── budget.ts            # Budget tracking and enforcement
│   └── vm-service.ts        # Facade: VM validates and executes
│
├── canonicalization/        # DS002: Fact canonicalization
│   ├── strategies/          # Pluggable canonicalization
│   │   ├── strict-canonical.ts   # Strict normalization rules
│   │   ├── fuzzy-canonical.ts    # Similarity-assisted (uses VSA)
│   │   └── identity-canonical.ts # Pass-through (for testing)
│   ├── normalizers/         # Component normalizers
│   │   ├── text-normalizer.ts    # Case, punctuation, whitespace
│   │   ├── number-normalizer.ts  # Numeric values, units
│   │   ├── time-normalizer.ts    # Temporal expressions
│   │   └── entity-resolver.ts    # Entity mention → EntityId
│   └── canonical-service.ts # Facade: term → canonical form
│
├── compiler/                # DS003: Query compilation
│   ├── pipeline/            # Compilation stages
│   │   ├── normalizer.ts    # Query text → normalized span
│   │   ├── entity-extractor.ts # Entity identification
│   │   ├── schema-retriever.ts # VSA-based schema retrieval
│   │   ├── slot-filler.ts   # Slot binding from query
│   │   └── program-emitter.ts # Schema → VM program
│   ├── schemas/             # Schema representation
│   │   ├── schema-model.ts  # Schema data structure
│   │   ├── schema-store.ts  # Schema library management
│   │   └── schema-validator.ts # Schema well-formedness checks
│   ├── programs/            # Program representation
│   │   ├── program-ir.ts    # Instruction list IR
│   │   ├── program-optimizer.ts # CSE, dead code elimination
│   │   └── hypothesis.ts    # Candidate program with score
│   └── compiler-service.ts  # Facade: query → candidate programs
│
├── search/                  # DS003: Program search
│   ├── strategies/          # Pluggable search strategies
│   │   ├── beam-search.ts   # Standard beam search
│   │   ├── mcts-search.ts   # Monte Carlo tree search
│   │   └── greedy-search.ts # Greedy best-first (fast)
│   ├── scoring/             # MDL scoring
│   │   ├── mdl-scorer.ts    # MDL score calculation
│   │   ├── complexity-cost.ts # Program description cost
│   │   ├── residual-cost.ts # Prediction loss component
│   │   └── penalty-cost.ts  # Correctness/budget penalties
│   ├── beam.ts              # Beam management (diversity, pruning)
│   └── search-service.ts    # Facade: candidates → ranked programs
│
├── closure/                 # DS004: Bounded closure
│   ├── algorithms/          # Closure computation
│   │   ├── forward-chain.ts # Forward chaining rule application
│   │   ├── conflict-detect.ts # Direct/indirect conflict detection
│   │   ├── branch-manager.ts # Branch creation and pruning
│   │   └── budget-allocator.ts # Dynamic budget distribution
│   ├── conflict/            # Conflict handling
│   │   ├── conflict-types.ts # Direct, indirect, temporal conflicts
│   │   └── resolver-strategies/ # Pluggable resolvers
│   │       ├── source-priority.ts   # Prefer reliable sources
│   │       ├── temporal-priority.ts # Prefer recent facts
│   │       └── probabilistic.ts     # Maintain uncertainty
│   ├── modes/               # Response mode handling
│   │   ├── strict-mode.ts   # No emit on uncertainty
│   │   ├── conditional-mode.ts # Emit with qualifiers
│   │   └── indeterminate-mode.ts # Report what was checked
│   ├── result-builder.ts    # Build result object with claims/trace
│   └── closure-service.ts   # Facade: program → verified result
│
├── training/                # DS005: Training and learning
│   ├── outer-loop/          # Next-phrase prediction
│   │   ├── phrase-predictor.ts # Phrase-level language model
│   │   ├── vm-conditioner.ts # VM state → conditioning vector
│   │   └── loss-calculator.ts # Prediction loss
│   ├── inner-loop/          # Program search and consolidation
│   │   ├── pattern-miner.ts # Recurring pattern discovery
│   │   ├── schema-proposer.ts # Propose new schemas
│   │   └── consolidator.ts  # Promote schemas/macros
│   ├── rl/                  # Reinforcement learning
│   │   ├── reward-shaper.ts # Hypothesis selection rewards
│   │   ├── penalty-shaper.ts # Consistency penalties
│   │   └── bandit-selector.ts # Multi-armed bandit strategy selection
│   ├── mdl/                 # MDL-based learning
│   │   ├── compression-tracker.ts # Track compression benefit
│   │   └── consolidation-criteria.ts # Promotion thresholds
│   └── training-service.ts  # Facade: training loop orchestration
│
├── storage/                 # Storage backends
│   ├── strategies/          # Pluggable storage
│   │   ├── memory-store.ts  # In-memory (for testing/small)
│   │   ├── sqlite-store.ts  # SQLite backend
│   │   ├── leveldb-store.ts # LevelDB backend
│   │   └── postgres-store.ts # PostgreSQL backend
│   ├── indices/             # Index implementations
│   │   ├── primary-index.ts # fact_id → FactInstance
│   │   ├── predicate-index.ts # predicate → fact_ids
│   │   ├── temporal-index.ts # time range queries
│   │   └── scope-index.ts   # scope_id → fact_ids
│   └── storage-service.ts   # Facade: unified storage access
│
├── generation/              # DS001: Controlled generation
│   ├── realizer/            # Surface realization
│   │   ├── claim-renderer.ts # claims → natural language
│   │   ├── trace-explainer.ts # trace → explanation text
│   │   └── uncertainty-marker.ts # Add qualifiers for conditional
│   ├── constraints/         # Generation constraints
│   │   ├── claim-gate.ts    # Only emit what's in claims
│   │   └── mode-adapter.ts  # Adapt output to response mode
│   └── generation-service.ts # Facade: result → response text
│
├── api/                     # External API layer
│   ├── query-handler.ts     # Handle user queries
│   ├── admin-handler.ts     # Admin operations (config, stats)
│   └── protocol/            # Wire protocol definitions
│       ├── request.ts       # Request types
│       └── response.ts      # Response types
│
└── index.ts                 # Main entry point and DI container
```

## Strategy Interfaces

### VSA Strategy

```typescript
// src/core/interfaces/vsa-strategy.ts

export interface HyperVector {
  readonly dimensions: number;
  readonly data: ArrayLike<number>;
}

export interface VSAStrategy {
  readonly name: string;
  readonly dimensions: number;
  
  // Generate deterministic hypervector from stable hash
  generate(seed: string): HyperVector;
  
  // Bundle multiple vectors (superposition)
  bundle(vectors: HyperVector[]): HyperVector;
  
  // Bind two vectors (role assignment)
  bind(a: HyperVector, b: HyperVector): HyperVector;
  
  // Unbind (inverse of bind)
  unbind(bound: HyperVector, key: HyperVector): HyperVector;
  
  // Similarity measure (0 to 1)
  similarity(a: HyperVector, b: HyperVector): number;
  
  // Threshold for "similar enough"
  similarityThreshold: number;
}
```

### Canonicalizer Strategy

```typescript
// src/core/interfaces/canonicalizer-strategy.ts

import { Term, CanonicalTerm } from '../types/terms';

export interface CanonicalizerStrategy {
  readonly name: string;
  
  // Canonicalize a term (deterministic)
  canonicalize(term: Term): CanonicalTerm;
  
  // Check if two terms are canonically equivalent
  areEquivalent(a: Term, b: Term): boolean;
  
  // Generate stable hash for canonical term
  hash(term: CanonicalTerm): string;
}
```

### Storage Strategy

```typescript
// src/core/interfaces/storage-strategy.ts

import { FactId, FactInstance, ScopeId } from '../types/facts';
import { QueryPattern, QueryResult } from '../types/results';

export interface StorageStrategy {
  readonly name: string;
  
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // CRUD operations
  assertFact(fact: FactInstance): Promise<void>;
  denyFact(factId: FactId, scopeId: ScopeId): Promise<void>;
  getFact(factId: FactId): Promise<FactInstance | null>;
  
  // Query operations
  query(pattern: QueryPattern): Promise<QueryResult[]>;
  queryByPredicate(predicate: string): Promise<FactInstance[]>;
  queryByScope(scopeId: ScopeId): Promise<FactInstance[]>;
  queryByTimeRange(start: Date, end: Date): Promise<FactInstance[]>;
  
  // Conflict detection
  findConflicting(fact: FactInstance): Promise<FactInstance[]>;
  
  // Snapshot/rollback
  createSnapshot(): Promise<string>;
  restoreSnapshot(snapshotId: string): Promise<void>;
}
```

### Search Strategy

```typescript
// src/core/interfaces/search-strategy.ts

import { Hypothesis } from '../../compiler/programs/hypothesis';
import { Budget } from '../../vm/budget';

export interface SearchStrategy {
  readonly name: string;
  
  // Search configuration
  configure(options: SearchOptions): void;
  
  // Run search
  search(
    initialCandidates: Hypothesis[],
    budget: Budget,
    evaluator: (h: Hypothesis) => Promise<number>
  ): Promise<Hypothesis[]>;
  
  // Get search statistics
  getStats(): SearchStats;
}

export interface SearchOptions {
  beamWidth: number;
  maxIterations: number;
  diversityWeight: number;
  earlyStopThreshold: number;
}

export interface SearchStats {
  candidatesExplored: number;
  candidatesPruned: number;
  iterations: number;
  bestScore: number;
}
```

### Scoring Strategy

```typescript
// src/core/interfaces/scoring-strategy.ts

import { Program } from '../../compiler/programs/program-ir';
import { ClosureResult } from '../../closure/closure-service';

export interface ScoringStrategy {
  readonly name: string;
  
  // Calculate MDL score components
  calculateComplexityCost(program: Program): number;
  calculateResidualCost(program: Program, context: ScoringContext): number;
  calculateCorrectnessPenalty(closureResult: ClosureResult): number;
  calculateBudgetPenalty(budgetUsage: BudgetUsage): number;
  
  // Combined score (lower is better)
  score(program: Program, context: ScoringContext): ScoringResult;
}

export interface ScoringResult {
  total: number;
  breakdown: {
    complexity: number;
    residual: number;
    correctness: number;
    budget: number;
  };
}
```

### Conflict Resolver Strategy

```typescript
// src/core/interfaces/conflict-resolver-strategy.ts

import { FactInstance, Conflict } from '../types/facts';

export interface ConflictResolverStrategy {
  readonly name: string;
  
  // Resolve a conflict, return which fact(s) to keep
  resolve(conflict: Conflict): ConflictResolution;
  
  // Can this resolver handle this type of conflict?
  canHandle(conflict: Conflict): boolean;
}

export interface ConflictResolution {
  keep: FactInstance[];
  reject: FactInstance[];
  reason: string;
  confidence: number;
}
```

## Configuration Schema

```typescript
// src/core/config/config-schema.ts

export interface VSAVMConfig {
  // Strategy selections
  strategies: {
    vsa: 'binary-sparse' | 'bipolar-dense' | 'holographic';
    canonicalizer: 'strict' | 'fuzzy' | 'identity';
    storage: 'memory' | 'sqlite' | 'leveldb' | 'postgres';
    search: 'beam' | 'mcts' | 'greedy';
    scoring: 'mdl-standard' | 'mdl-weighted';
    conflictResolver: 'source-priority' | 'temporal-priority' | 'probabilistic';
  };
  
  // VSA parameters
  vsa: {
    dimensions: number;  // Default: 10000
    similarityThreshold: number;  // Default: 0.3
  };
  
  // VM parameters
  vm: {
    defaultBudget: BudgetConfig;
    strictMode: boolean;
    traceLevel: 'minimal' | 'standard' | 'verbose';
  };
  
  // Search parameters
  search: {
    beamWidth: number;  // Default: 10
    maxIterations: number;  // Default: 100
    diversityWeight: number;  // Default: 0.2
  };
  
  // Storage parameters
  storage: {
    connectionString?: string;
    cacheSize: number;
    snapshotRetention: number;
  };
  
  // Closure parameters
  closure: {
    defaultMode: 'strict' | 'conditional';
    timeOverlapPolicy: 'strict' | 'lenient';
  };
}

export interface BudgetConfig {
  maxDepth: number;
  maxSteps: number;
  maxBranches: number;
  maxTimeMs?: number;
}
```

## Test Directory Structure

```
tests/
├── unit/                    # Unit tests (isolated, mocked dependencies)
│   ├── core/
│   │   ├── types/
│   │   │   ├── terms.test.ts
│   │   │   ├── facts.test.ts
│   │   │   └── events.test.ts
│   │   └── config/
│   │       └── config-loader.test.ts
│   │
│   ├── event-stream/
│   │   ├── text-parser.test.ts
│   │   ├── separator-detector.test.ts
│   │   └── scope-builder.test.ts
│   │
│   ├── vsa/
│   │   ├── strategies/
│   │   │   ├── binary-sparse.test.ts
│   │   │   ├── bipolar-dense.test.ts
│   │   │   └── holographic.test.ts
│   │   ├── operations/
│   │   │   ├── bundle.test.ts
│   │   │   ├── bind.test.ts
│   │   │   └── similarity.test.ts
│   │   └── index/
│   │       └── ann-search.test.ts
│   │
│   ├── vm/
│   │   ├── state/
│   │   │   ├── fact-store.test.ts
│   │   │   ├── binding-env.test.ts
│   │   │   ├── context-stack.test.ts
│   │   │   └── snapshot.test.ts
│   │   ├── instructions/
│   │   │   ├── term-ops.test.ts
│   │   │   ├── fact-ops.test.ts
│   │   │   ├── logic-ops.test.ts
│   │   │   └── context-ops.test.ts
│   │   ├── executor.test.ts
│   │   └── budget.test.ts
│   │
│   ├── canonicalization/
│   │   ├── strategies/
│   │   │   └── strict-canonical.test.ts
│   │   └── normalizers/
│   │       ├── text-normalizer.test.ts
│   │       ├── number-normalizer.test.ts
│   │       └── time-normalizer.test.ts
│   │
│   ├── compiler/
│   │   ├── pipeline/
│   │   │   ├── normalizer.test.ts
│   │   │   ├── entity-extractor.test.ts
│   │   │   ├── schema-retriever.test.ts
│   │   │   └── slot-filler.test.ts
│   │   ├── schemas/
│   │   │   └── schema-validator.test.ts
│   │   └── programs/
│   │       └── program-optimizer.test.ts
│   │
│   ├── search/
│   │   ├── strategies/
│   │   │   ├── beam-search.test.ts
│   │   │   └── greedy-search.test.ts
│   │   ├── scoring/
│   │   │   └── mdl-scorer.test.ts
│   │   └── beam.test.ts
│   │
│   ├── closure/
│   │   ├── algorithms/
│   │   │   ├── forward-chain.test.ts
│   │   │   ├── conflict-detect.test.ts
│   │   │   └── branch-manager.test.ts
│   │   ├── conflict/
│   │   │   └── resolver-strategies.test.ts
│   │   └── modes/
│   │       ├── strict-mode.test.ts
│   │       └── conditional-mode.test.ts
│   │
│   ├── storage/
│   │   ├── strategies/
│   │   │   ├── memory-store.test.ts
│   │   │   └── sqlite-store.test.ts
│   │   └── indices/
│   │       └── predicate-index.test.ts
│   │
│   └── generation/
│       └── realizer/
│           └── claim-renderer.test.ts
│
├── integration/             # Integration tests (real dependencies)
│   ├── event-to-fact.test.ts      # Event stream → canonical facts
│   ├── query-pipeline.test.ts     # Query → compiled program
│   ├── vm-execution.test.ts       # Program → VM execution
│   ├── closure-check.test.ts      # Execution → closure verification
│   ├── end-to-end.test.ts         # Full query → response
│   └── storage-backends.test.ts   # Storage strategy conformance
│
├── conformance/             # DS004 conformance tests
│   ├── strict-mode/
│   │   ├── determinism.test.ts    # Same input → same output
│   │   ├── budget-accounting.test.ts # Budget consumption correctness
│   │   └── trace-reproducibility.test.ts
│   ├── correctness/
│   │   ├── direct-conflict.test.ts # Same fact_id + opposite polarity
│   │   ├── temporal-conflict.test.ts # Time overlap conflicts
│   │   └── scope-isolation.test.ts # Context isolation
│   └── reporting/
│       └── result-schema.test.ts  # Result object completeness
│
├── regression/              # Regression test scenarios
│   ├── scenarios/           # JSON/YAML scenario definitions
│   │   ├── basic-query.yaml
│   │   ├── contradiction-detection.yaml
│   │   ├── schema-retrieval.yaml
│   │   └── budget-exhaustion.yaml
│   └── runner.test.ts       # Scenario test runner
│
├── fixtures/                # Shared test data
│   ├── facts/               # Sample fact instances
│   ├── schemas/             # Sample query schemas
│   ├── programs/            # Sample VM programs
│   └── events/              # Sample event streams
│
└── helpers/                 # Test utilities
    ├── mock-vsa.ts          # Deterministic VSA mock
    ├── mock-storage.ts      # In-memory storage mock
    ├── fact-factory.ts      # Generate test facts
    ├── program-factory.ts   # Generate test programs
    └── assertion-helpers.ts # Custom assertions
```

## Strategy Registration

```typescript
// src/core/config/strategy-registry.ts

import { VSAStrategy } from '../interfaces/vsa-strategy';
import { BinarySparseVSA } from '../../vsa/strategies/binary-sparse';
import { BipolarDenseVSA } from '../../vsa/strategies/bipolar-dense';
import { HolographicVSA } from '../../vsa/strategies/holographic';

export class StrategyRegistry {
  private static vsaStrategies = new Map<string, () => VSAStrategy>([
    ['binary-sparse', () => new BinarySparseVSA()],
    ['bipolar-dense', () => new BipolarDenseVSA()],
    ['holographic', () => new HolographicVSA()],
  ]);
  
  // ... similar maps for other strategy types
  
  static getVSAStrategy(name: string, config: VSAConfig): VSAStrategy {
    const factory = this.vsaStrategies.get(name);
    if (!factory) {
      throw new Error(`Unknown VSA strategy: ${name}`);
    }
    return factory();
  }
  
  static registerVSAStrategy(name: string, factory: () => VSAStrategy): void {
    this.vsaStrategies.set(name, factory);
  }
}
```

## Service Composition

```typescript
// src/index.ts

import { VSAVMConfig } from './core/config/config-schema';
import { StrategyRegistry } from './core/config/strategy-registry';
import { VSAService } from './vsa/vsa-service';
import { VMService } from './vm/vm-service';
import { CompilerService } from './compiler/compiler-service';
import { ClosureService } from './closure/closure-service';
import { GenerationService } from './generation/generation-service';

export class VSAVM {
  private vsa: VSAService;
  private vm: VMService;
  private compiler: CompilerService;
  private closure: ClosureService;
  private generation: GenerationService;
  
  constructor(config: VSAVMConfig) {
    // Wire up strategies based on config
    const vsaStrategy = StrategyRegistry.getVSAStrategy(
      config.strategies.vsa, 
      config.vsa
    );
    const storageStrategy = StrategyRegistry.getStorageStrategy(
      config.strategies.storage,
      config.storage
    );
    // ... etc
    
    // Compose services with injected strategies
    this.vsa = new VSAService(vsaStrategy);
    this.vm = new VMService(storageStrategy, config.vm);
    this.compiler = new CompilerService(this.vsa);
    this.closure = new ClosureService(this.vm, config.closure);
    this.generation = new GenerationService();
  }
  
  async query(input: string, budget?: BudgetConfig): Promise<QueryResponse> {
    // 1. Parse input to event stream
    // 2. Compile query to candidate programs
    // 3. Search for best program
    // 4. Execute in VM with closure checking
    // 5. Generate response from verified result
  }
}
```

## Implementation Phases

### Phase 1: Core Foundation (MVP)
- [ ] Type definitions (`src/core/types/`)
- [ ] Strategy interfaces (`src/core/interfaces/`)
- [ ] Configuration system (`src/core/config/`)
- [ ] Memory storage backend (`src/storage/strategies/memory-store.ts`)
- [ ] Basic text parser (`src/event-stream/parser/text-parser.ts`)
- [ ] Mock VSA for testing (`src/vsa/strategies/mock-vsa.ts`)

### Phase 2: VM Core
- [ ] Fact store with basic operations
- [ ] Instruction implementations (subset: ASSERT, QUERY, MATCH)
- [ ] Executor loop with budget tracking
- [ ] Snapshot/rollback support
- [ ] Unit tests for all VM components

### Phase 3: Canonicalization
- [ ] Text normalizer
- [ ] Number normalizer
- [ ] Strict canonicalizer strategy
- [ ] Entity resolution (basic)

### Phase 4: Query Compilation
- [ ] Query normalizer
- [ ] Schema model and store
- [ ] Basic slot filler
- [ ] Program IR and emitter

### Phase 5: Closure and Correctness
- [ ] Forward chaining algorithm
- [ ] Direct conflict detection
- [ ] Strict/conditional modes
- [ ] Result builder with claims/trace

### Phase 6: VSA Integration
- [ ] Binary sparse VSA implementation
- [ ] Schema index
- [ ] ANN search
- [ ] VSA-assisted retrieval in compiler

### Phase 7: Search and Scoring
- [ ] Beam search implementation
- [ ] MDL scorer
- [ ] Program ranking

### Phase 8: Generation
- [ ] Claim renderer
- [ ] Trace explainer
- [ ] Mode-aware output

### Phase 9: Advanced Features
- [ ] Additional VSA strategies
- [ ] SQLite storage backend
- [ ] Training loop (inner/outer)
- [ ] RL shaping

## Cost Model (VM Operations)

For budget accounting per DS004:

| Operation | Base Cost | Notes |
|-----------|-----------|-------|
| MAKE_TERM | 1 step | Fixed |
| CANONICALIZE | 2 steps | Includes normalization |
| ASSERT | 3 steps | Includes conflict check |
| DENY | 2 steps | |
| QUERY | 5 + matches | Scales with result size |
| MATCH | 2 steps | Unification |
| APPLY_RULE | 5 + premises | Scales with rule complexity |
| CLOSURE | budget-defined | Consumes remaining budget |
| BRANCH | 1 branch | From max_branches |
| CALL | 2 steps | Stack frame creation |
| PUSH_CONTEXT | 1 step | |
| POP_CONTEXT | 1 step | |
| MERGE_CONTEXT | 3 steps | Includes conflict check |

## VSA/VM Interface Boundary

Per review recommendations, the boundary is explicit:

**VSA proposes:**
- `retrieveSchemas(query: HyperVector, k: number) → Schema[]`
- `retrieveFacts(pattern: HyperVector, k: number) → FactId[]`
- Returns: candidates + similarity scores + justification (which hypervector matched)

**VM validates:**
- Executes candidate programs
- Runs closure checks
- Detects conflicts
- Produces verified result with claims and trace

**Persistence:**
- Schemas promoted only after DS004 health checks pass
- Macros require MDL improvement + held-out validation
- All promotions versioned for rollback
