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
├── api/                     # HTTP-like request/response layer
│   ├── protocol/
│   │   ├── request.mjs
│   │   └── response.mjs
│   ├── admin-handler.mjs
│   ├── query-handler.mjs
│   └── index.mjs
│
├── canonicalization/        # Term canonicalization (DS002)
│   ├── normalizers/
│   │   ├── text-normalizer.mjs
│   │   ├── number-normalizer.mjs
│   │   ├── time-normalizer.mjs
│   │   └── entity-resolver.mjs
│   ├── strategies/
│   │   ├── strict-canonical.mjs
│   │   └── identity-canonical.mjs
│   ├── canonical-service.mjs
│   └── index.mjs
│
├── closure/                 # Bounded closure (DS004)
│   ├── algorithms/
│   │   ├── forward-chain.mjs
│   │   ├── conflict-detect.mjs
│   │   └── branch-manager.mjs
│   ├── modes/
│   │   ├── strict-mode.mjs
│   │   ├── conditional-mode.mjs
│   │   └── indeterminate-mode.mjs
│   ├── result-builder.mjs
│   └── closure-service.mjs
│
├── compiler/                # Query compilation (DS003)
│   ├── pipeline/
│   │   ├── normalizer.mjs
│   │   └── slot-filler.mjs
│   ├── programs/
│   │   ├── program-ir.mjs
│   │   └── hypothesis.mjs
│   ├── schemas/
│   │   ├── schema-model.mjs
│   │   └── schema-store.mjs
│   └── compiler-service.mjs
│
├── core/                    # Shared types, interfaces, config
│   ├── config/
│   │   ├── config-schema.mjs
│   │   ├── config-loader.mjs
│   │   └── strategy-registry.mjs
│   ├── interfaces/
│   │   ├── vsa-strategy.mjs
│   │   ├── canonicalizer-strategy.mjs
│   │   ├── storage-strategy.mjs
│   │   ├── search-strategy.mjs
│   │   ├── scoring-strategy.mjs
│   │   └── conflict-resolver-strategy.mjs
│   ├── types/
│   │   ├── terms.mjs
│   │   ├── facts.mjs
│   │   ├── identifiers.mjs
│   │   ├── events.mjs
│   │   └── results.mjs
│   ├── errors.mjs
│   ├── error-handling.mjs
│   ├── hash.mjs
│   └── index.mjs
│
├── event-stream/            # Event ingestion + structural scope (DS001/DS010)
│   ├── parser/
│   │   ├── text-parser.mjs
│   │   ├── multimodal-adapter.mjs
│   │   └── index.mjs
│   ├── scope/
│   │   ├── scope-builder.mjs
│   │   └── scope-tree.mjs
│   ├── ingest.mjs
│   ├── separator-detector.mjs
│   ├── vsa-separator-detector.mjs
│   ├── boundary-optimizer.mjs
│   └── index.mjs
│
├── generation/              # Deterministic rendering + constraints
│   ├── constraints/
│   │   ├── claim-gate.mjs
│   │   └── mode-adapter.mjs
│   ├── realizer/
│   │   ├── claim-renderer.mjs
│   │   ├── uncertainty-marker.mjs
│   │   └── trace-explainer.mjs
│   ├── vm-state-conditioner.mjs
│   ├── generation-service.mjs
│   └── index.mjs
│
├── search/                  # Program search + scoring (DS003)
│   ├── strategies/
│   │   ├── beam-search.mjs
│   │   └── greedy-search.mjs
│   ├── scoring/
│   │   ├── mdl-scorer.mjs
│   │   ├── complexity-cost.mjs
│   │   ├── residual-cost.mjs
│   │   └── penalty-cost.mjs
│   ├── beam.mjs
│   └── search-service.mjs
│
├── storage/                 # Storage backends (DS006/DS012)
│   ├── strategies/
│   │   ├── memory-store.mjs
│   │   ├── file-store.mjs
│   │   ├── sqlite-store.mjs
│   │   ├── leveldb-store.mjs
│   │   └── postgres-store.mjs
│   └── index.mjs
│
├── training/                # Training loops (DS005/DS011)
│   ├── compression/
│   │   └── pattern-compressor.mjs
│   ├── inner-loop/
│   │   ├── pattern-miner.mjs
│   │   ├── schema-proposer.mjs
│   │   └── consolidator.mjs
│   ├── outer-loop/
│   │   ├── macro-unit-model.mjs
│   │   └── phrase-predictor.mjs
│   ├── rule-learner.mjs
│   ├── training-service.mjs
│   └── index.mjs
│
├── vm/                      # Virtual machine core (DS002)
│   ├── instructions/
│   │   ├── builtin-ops.mjs
│   │   ├── term-ops.mjs
│   │   ├── fact-ops.mjs
│   │   ├── logic-ops.mjs
│   │   ├── inference-ops.mjs
│   │   ├── control-ops.mjs
│   │   ├── context-ops.mjs
│   │   └── index.mjs
│   ├── state/
│   │   ├── fact-store.mjs
│   │   ├── rule-store.mjs
│   │   ├── binding-env.mjs
│   │   ├── context-stack.mjs
│   │   ├── execution-log.mjs
│   │   └── index.mjs
│   ├── budget.mjs
│   ├── executor.mjs
│   ├── expr.mjs
│   ├── vm-service.mjs
│   └── index.mjs
│
├── vsa/                     # VSA retrieval service
│   ├── strategies/
│   │   ├── binary-sparse.mjs
│   │   └── mock-vsa.mjs
│   ├── serialization.mjs
│   ├── vsa-service.mjs
│   └── index.mjs
│
└── index.mjs                # Top-level exports and strategy registration
```

## Strategy Interfaces

### VSA Strategy

```typescript
// src/core/interfaces/vsa-strategy.mjs

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
// src/core/interfaces/canonicalizer-strategy.mjs

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
// src/core/interfaces/storage-strategy.mjs

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
// src/core/interfaces/search-strategy.mjs

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
// src/core/interfaces/scoring-strategy.mjs

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
// src/core/interfaces/conflict-resolver-strategy.mjs

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
// src/core/config/config-schema.mjs

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
├── helpers/
│   ├── test-helpers.mjs
│   └── index.mjs
└── unit/
    ├── canonicalization.test.mjs
    ├── closure.test.mjs
    ├── compiler.test.mjs
    ├── core.test.mjs
    ├── entity-resolver.test.mjs
    ├── events.test.mjs
    ├── facts-binary.test.mjs
    ├── file-store.test.mjs
    ├── generation.test.mjs
    ├── ingest.test.mjs
    ├── pipeline.test.mjs
    ├── search.test.mjs
    ├── training.test.mjs
    ├── vm.test.mjs
    └── vsa-serialization.test.mjs
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
