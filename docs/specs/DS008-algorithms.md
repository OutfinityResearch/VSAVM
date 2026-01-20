# DS008 Algorithms

This document specifies the core VSAVM algorithms in pseudocode. All algorithms are normative and implementations must follow the specified behavior.

## Canonicalization Algorithms

### Text Canonicalization

```
FUNCTION canonicalize_text(input: string) -> string:
    // Step 1: Unicode normalization
    text = unicode_normalize(input, form="NFC")
    
    // Step 2: Case normalization (if CANON_CASE_SENSITIVE = false)
    IF NOT CANON_CASE_SENSITIVE:
        text = text.to_lowercase()
    
    // Step 3: Whitespace normalization (if CANON_NORMALIZE_WHITESPACE = true)
    IF CANON_NORMALIZE_WHITESPACE:
        text = regex_replace(text, /\s+/, " ")
        text = text.trim()
    
    // Step 4: Punctuation removal (if CANON_STRIP_PUNCTUATION = true)
    IF CANON_STRIP_PUNCTUATION:
        text = regex_replace(text, /[^\w\s]/, "")
    
    RETURN text
```

### Number Canonicalization

```
FUNCTION canonicalize_number(input: number, unit?: string) -> CanonicalNumber:
    // Step 1: Normalize to base unit if unit provided
    IF unit IS NOT NULL:
        (value, base_unit) = convert_to_base_unit(input, unit)
    ELSE:
        value = input
        base_unit = null
    
    // Step 2: Round to canonical precision
    precision = 10 ^ CANON_NUMBER_PRECISION
    canonical_value = round(value * precision) / precision
    
    // Step 3: Handle special cases
    IF is_nan(canonical_value):
        RETURN CanonicalNumber(type="nan")
    IF is_infinite(canonical_value):
        RETURN CanonicalNumber(type="infinity", sign=sign(canonical_value))
    
    RETURN CanonicalNumber(
        type = "finite",
        value = canonical_value,
        unit = base_unit
    )
```

### Time Canonicalization

```
FUNCTION canonicalize_time(input: TimeRef) -> CanonicalTime:
    MATCH input.type:
        CASE "instant":
            // Truncate to precision
            truncated = truncate_to_precision(input.instant, input.precision)
            RETURN CanonicalTime(
                type = "instant",
                value = truncated,
                precision = input.precision
            )
        
        CASE "interval":
            start = truncate_to_precision(input.start, input.precision)
            end = truncate_to_precision(input.end, input.precision)
            // Ensure start <= end
            IF start > end:
                SWAP(start, end)
            RETURN CanonicalTime(
                type = "interval",
                start = start,
                end = end,
                precision = input.precision
            )
        
        CASE "relative":
            // Cannot canonicalize without resolving anchor
            RETURN CanonicalTime(
                type = "relative",
                anchor = input.anchor,
                offset = input.offset,
                precision = input.precision
            )
        
        CASE "unknown":
            RETURN CanonicalTime(type = "unknown")

FUNCTION truncate_to_precision(timestamp: int64, precision: string) -> int64:
    MATCH precision:
        CASE "ms":     RETURN timestamp
        CASE "second": RETURN (timestamp / 1000) * 1000
        CASE "minute": RETURN (timestamp / 60000) * 60000
        CASE "hour":   RETURN (timestamp / 3600000) * 3600000
        CASE "day":    RETURN (timestamp / 86400000) * 86400000
        CASE "month":  RETURN truncate_to_month(timestamp)
        CASE "year":   RETURN truncate_to_year(timestamp)
```

### Term Canonicalization

```
FUNCTION canonicalize_term(term: Term) -> CanonicalTerm:
    MATCH term:
        CASE Atom(type, value):
            canonical_value = MATCH type:
                "string"  -> canonicalize_text(value)
                "number"  -> canonicalize_number(value)
                "integer" -> value  // Already canonical
                "boolean" -> value  // Already canonical
                "time"    -> canonicalize_time(value)
                "entity"  -> canonicalize_entity_id(value)
                "symbol"  -> canonicalize_symbol_id(value)
                "null"    -> null
            
            RETURN CanonicalAtom(type, canonical_value)
        
        CASE Struct(type, slots):
            // Canonicalize struct type
            canonical_type = canonicalize_symbol_id(type)
            
            // Canonicalize all slots
            canonical_slots = new SortedMap()
            FOR (slot_name, slot_value) IN slots:
                canonical_name = canonicalize_text(slot_name)
                canonical_value = canonicalize_term(slot_value)
                canonical_slots.insert(canonical_name, canonical_value)
            
            RETURN CanonicalStruct(canonical_type, canonical_slots)

FUNCTION compute_term_hash(term: CanonicalTerm) -> bytes[16]:
    serialized = serialize_canonical_term(term)
    full_hash = sha256(serialized)
    RETURN full_hash[0:16]
```

### FactId Computation

```
FUNCTION compute_fact_id(
    predicate: SymbolId,
    arguments: Map<string, Term>,
    qualifiers: Map<string, Term>
) -> FactId:
    
    // Step 1: Canonicalize predicate
    canonical_pred = canonicalize_symbol_id(predicate)
    pred_hash = sha256(serialize(canonical_pred))[0:16]
    
    // Step 2: Canonicalize and sort arguments
    canonical_args = new SortedMap()
    FOR (name, value) IN arguments:
        canonical_name = canonicalize_text(name)
        canonical_value = canonicalize_term(value)
        canonical_args.insert(canonical_name, canonical_value)
    args_hash = sha256(serialize(canonical_args))[0:16]
    
    // Step 3: Canonicalize qualifiers (exclude provenance, time, scope)
    EXCLUDED_QUALIFIERS = {"time", "scope", "provenance", "confidence"}
    canonical_quals = new SortedMap()
    FOR (name, value) IN qualifiers:
        IF name NOT IN EXCLUDED_QUALIFIERS:
            canonical_name = canonicalize_text(name)
            canonical_value = canonicalize_term(value)
            canonical_quals.insert(canonical_name, canonical_value)
    quals_hash = sha256(serialize(canonical_quals))[0:16]
    
    RETURN FactId(pred_hash, args_hash, quals_hash)
```

## Entity Resolution

### Basic Entity Resolution

```
FUNCTION resolve_entity(
    mention: string,
    context: ScopeId,
    candidates: List<EntityId>
) -> EntityResolution:
    
    // Step 1: Exact match
    normalized = canonicalize_text(mention)
    FOR candidate IN candidates:
        IF get_canonical_name(candidate) == normalized:
            RETURN EntityResolution(
                entityId = candidate,
                confidence = 1.0,
                method = "exact_match"
            )
    
    // Step 2: Alias match
    FOR candidate IN candidates:
        FOR alias IN get_aliases(candidate):
            IF canonicalize_text(alias) == normalized:
                RETURN EntityResolution(
                    entityId = candidate,
                    confidence = 0.95,
                    method = "alias_match"
                )
    
    // Step 3: VSA similarity match
    mention_hv = vsa.generate(normalized)
    best_match = null
    best_sim = 0.0
    FOR candidate IN candidates:
        candidate_hv = vsa.generate(get_canonical_name(candidate))
        sim = vsa.similarity(mention_hv, candidate_hv)
        IF sim > best_sim AND sim >= VSA_SIMILARITY_THRESHOLD:
            best_match = candidate
            best_sim = sim
    
    IF best_match IS NOT NULL:
        RETURN EntityResolution(
            entityId = best_match,
            confidence = best_sim,
            method = "vsa_similarity"
        )
    
    // Step 4: Create new entity (if allowed)
    IF context.allows_new_entities:
        new_id = generate_entity_id(mention, context)
        RETURN EntityResolution(
            entityId = new_id,
            confidence = 1.0,
            method = "new_entity"
        )
    
    // Step 5: Ambiguous - return multiple hypotheses
    RETURN EntityResolution(
        entityId = null,
        confidence = 0.0,
        method = "unresolved",
        hypotheses = candidates
    )
```

## Forward Chaining Algorithm

```
FUNCTION forward_chain(
    initial_facts: Set<FactInstance>,
    rules: List<Rule>,
    budget: Budget
) -> ForwardChainResult:
    
    // Initialize
    fact_store = new FactStore(initial_facts)
    agenda = new PriorityQueue()  // Facts to process
    derived = new Set()
    trace = new ExecutionTrace()
    
    // Add initial facts to agenda
    FOR fact IN initial_facts:
        agenda.push(fact, priority=0)
    
    // Main loop
    WHILE NOT agenda.is_empty() AND budget.has_remaining():
        current_fact = agenda.pop()
        budget.consume_step(1)
        
        // Find applicable rules
        applicable = find_applicable_rules(current_fact, rules, fact_store)
        
        FOR (rule, bindings) IN applicable:
            IF budget.remaining_steps() < rule.estimated_cost:
                CONTINUE  // Skip expensive rules when low on budget
            
            // Apply rule
            new_facts = apply_rule(rule, bindings, fact_store)
            budget.consume_step(rule.estimated_cost)
            trace.log_rule_application(rule, bindings, new_facts)
            
            FOR new_fact IN new_facts:
                // Check for conflicts
                conflicts = find_conflicts(new_fact, fact_store)
                IF conflicts.is_not_empty():
                    trace.log_conflict(new_fact, conflicts)
                    CONTINUE  // Don't add conflicting facts
                
                // Add to store and agenda
                IF NOT fact_store.contains(new_fact):
                    fact_store.add(new_fact)
                    derived.add(new_fact)
                    priority = compute_priority(new_fact, rule)
                    agenda.push(new_fact, priority)
    
    RETURN ForwardChainResult(
        facts = fact_store.all(),
        derived = derived,
        trace = trace,
        budget_exhausted = NOT budget.has_remaining()
    )

FUNCTION find_applicable_rules(
    fact: FactInstance,
    rules: List<Rule>,
    store: FactStore
) -> List<(Rule, Bindings)>:
    
    result = []
    FOR rule IN rules:
        // Check if fact matches any premise
        FOR (premise_idx, premise) IN enumerate(rule.premises):
            bindings = unify(premise, fact)
            IF bindings IS NOT NULL:
                // Check remaining premises
                remaining = rule.premises.without(premise_idx)
                all_bindings = find_all_bindings(remaining, store, bindings)
                FOR binding_set IN all_bindings:
                    result.append((rule, binding_set))
    
    RETURN result

FUNCTION compute_priority(fact: FactInstance, rule: Rule) -> float:
    // Higher priority = process first
    base = 0.0
    
    // Prefer facts from more specific rules
    base += rule.specificity * 0.3
    
    // Prefer facts with higher confidence
    base += (fact.confidence OR 1.0) * 0.3
    
    // Prefer recent derivations
    base += 0.1  // Recency bonus for newly derived
    
    RETURN base
```

## Conflict Detection Algorithm

```
FUNCTION find_conflicts(
    new_fact: FactInstance,
    store: FactStore
) -> List<Conflict>:
    
    conflicts = []
    
    // 1. Direct polarity conflict
    direct = find_direct_conflicts(new_fact, store)
    conflicts.extend(direct)
    
    // 2. Temporal conflicts
    IF new_fact.time IS NOT NULL:
        temporal = find_temporal_conflicts(new_fact, store)
        conflicts.extend(temporal)
    
    // 3. Scope visibility conflicts
    scope_visible = store.get_visible_facts(new_fact.scopeId)
    FOR existing IN scope_visible:
        IF is_indirect_conflict(new_fact, existing):
            conflicts.append(Conflict(
                type = "indirect",
                facts = [new_fact.factId, existing.factId],
                scopeId = new_fact.scopeId
            ))
    
    RETURN conflicts

FUNCTION find_direct_conflicts(
    fact: FactInstance,
    store: FactStore
) -> List<Conflict>:
    
    conflicts = []
    
    // Find facts with same FactId but opposite polarity
    same_id = store.get_by_fact_id(fact.factId)
    FOR existing IN same_id:
        IF existing.polarity != fact.polarity:
            // Check scope visibility
            IF scopes_overlap(fact.scopeId, existing.scopeId):
                // Check time overlap
                IF times_overlap(fact.time, existing.time):
                    conflicts.append(Conflict(
                        type = "direct",
                        facts = [fact.factId, existing.factId],
                        scopeId = common_scope(fact.scopeId, existing.scopeId),
                        reason = "same_fact_opposite_polarity"
                    ))
    
    RETURN conflicts

FUNCTION times_overlap(t1: TimeRef?, t2: TimeRef?) -> bool:
    // Null times always overlap (unbounded)
    IF t1 IS NULL OR t2 IS NULL:
        RETURN true
    
    // Unknown times are treated based on policy
    IF t1.type == "unknown" OR t2.type == "unknown":
        RETURN CLOSURE_TIME_OVERLAP_POLICY == "lenient"
    
    // Convert to intervals for comparison
    i1 = time_to_interval(t1)
    i2 = time_to_interval(t2)
    
    // Check overlap at appropriate precision
    precision = coarser_precision(t1.precision, t2.precision)
    IF CLOSURE_TIME_OVERLAP_POLICY == "lenient":
        precision = "day"
    
    RETURN intervals_overlap(i1, i2, precision)

FUNCTION intervals_overlap(i1: Interval, i2: Interval, precision: string) -> bool:
    // Truncate to precision
    s1 = truncate_to_precision(i1.start, precision)
    e1 = truncate_to_precision(i1.end, precision)
    s2 = truncate_to_precision(i2.start, precision)
    e2 = truncate_to_precision(i2.end, precision)
    
    // Standard interval overlap check
    RETURN s1 <= e2 AND s2 <= e1
```

## Bounded Closure Algorithm

```
FUNCTION bounded_closure(
    query_program: Program,
    store: FactStore,
    budget: Budget,
    mode: ResponseMode
) -> ClosureResult:
    
    // Initialize execution
    vm = new VMExecutor(store)
    branches = new BranchManager(budget.maxBranches)
    conflicts = []
    claims = []
    
    // Create initial branch
    main_branch = branches.create_root()
    main_branch.snapshot = store.create_snapshot()
    
    // Execute program
    TRY:
        execution_result = vm.execute(
            program = query_program,
            budget = budget,
            branch = main_branch
        )
    CATCH BudgetExhaustedException:
        RETURN ClosureResult(
            mode = "indeterminate",
            reason = "budget_exhausted",
            budgetUsed = budget.usage(),
            claims = [],
            conflicts = []
        )
    CATCH ExecutionException AS e:
        RETURN ClosureResult(
            mode = "indeterminate",
            reason = "execution_error: " + e.message,
            budgetUsed = budget.usage(),
            claims = [],
            conflicts = []
        )
    
    // Perform closure on derived facts
    remaining_budget = budget.remaining()
    closure_result = forward_chain(
        initial_facts = execution_result.derived_facts,
        rules = store.get_active_rules(),
        budget = remaining_budget
    )
    
    // Collect conflicts
    FOR branch IN branches.all():
        branch_conflicts = detect_branch_conflicts(branch, store)
        conflicts.extend(branch_conflicts)
    
    // Determine response mode
    IF conflicts.is_empty():
        // No conflicts found within budget
        claims = build_claims(execution_result, closure_result, confidence=1.0)
        RETURN ClosureResult(
            mode = "strict",
            budgetUsed = budget.usage(),
            claims = claims,
            conflicts = [],
            trace = execution_result.trace
        )
    
    ELSE IF mode == "strict":
        // Conflicts found, strict mode refuses to emit
        RETURN ClosureResult(
            mode = "indeterminate",
            reason = "conflicts_detected",
            budgetUsed = budget.usage(),
            claims = [],
            conflicts = conflicts,
            trace = execution_result.trace
        )
    
    ELSE:  // conditional mode
        // Emit with qualifications
        assumptions = build_assumptions(conflicts)
        claims = build_claims(
            execution_result, 
            closure_result, 
            confidence = compute_conditional_confidence(conflicts)
        )
        RETURN ClosureResult(
            mode = "conditional",
            budgetUsed = budget.usage(),
            claims = claims,
            assumptions = assumptions,
            conflicts = conflicts,
            trace = execution_result.trace
        )

FUNCTION compute_conditional_confidence(conflicts: List<Conflict>) -> float:
    // Base confidence
    conf = 1.0
    
    // Reduce for each conflict
    FOR conflict IN conflicts:
        penalty = MATCH conflict.type:
            "direct"   -> 0.3
            "temporal" -> 0.2
            "indirect" -> 0.1
        conf = conf * (1.0 - penalty)
    
    // Floor at minimum confidence
    RETURN max(conf, 0.1)
```

## Branch Management

```
FUNCTION create_branch(
    parent: Branch,
    hypothesis: Hypothesis,
    budget: Budget
) -> Branch?:
    
    // Check branch budget
    IF budget.remaining_branches() <= 0:
        RETURN null
    
    // Create new branch
    new_branch = Branch(
        id = generate_branch_id(),
        parent = parent,
        hypothesis = hypothesis,
        snapshot = parent.snapshot.copy(),
        depth = parent.depth + 1,
        score = hypothesis.score
    )
    
    budget.consume_branch(1)
    RETURN new_branch

FUNCTION merge_branches(
    branches: List<Branch>,
    store: FactStore,
    conflict_resolver: ConflictResolver
) -> MergeResult:
    
    // Collect all facts from all branches
    all_facts = new Map<FactId, List<(Branch, FactInstance)>>()
    FOR branch IN branches:
        FOR fact IN branch.derived_facts():
            all_facts.get_or_create(fact.factId).append((branch, fact))
    
    // Identify conflicts
    conflicts = []
    resolved_facts = []
    
    FOR (fact_id, instances) IN all_facts:
        IF instances.length == 1:
            // No conflict, accept
            resolved_facts.append(instances[0].fact)
        ELSE:
            // Multiple branches derived same fact
            conflict = Conflict(
                type = "branch_conflict",
                facts = [i.fact.factId FOR i IN instances],
                branches = [i.branch.id FOR i IN instances]
            )
            
            // Try to resolve
            resolution = conflict_resolver.resolve(conflict)
            IF resolution.is_resolved:
                resolved_facts.extend(resolution.keep)
                conflicts.append(conflict.with_resolution(resolution))
            ELSE:
                conflicts.append(conflict)
    
    RETURN MergeResult(
        facts = resolved_facts,
        conflicts = conflicts,
        merged_branches = branches
    )

FUNCTION prune_branches(
    branches: List<Branch>,
    budget: Budget
) -> List<Branch>:
    
    IF branches.length <= 1:
        RETURN branches
    
    // Sort by score (descending)
    sorted = branches.sort_by(b -> b.score, descending=true)
    best_score = sorted[0].score
    
    // Prune branches with score below threshold
    threshold = best_score * CLOSURE_BRANCH_PRUNE_THRESHOLD
    kept = []
    FOR branch IN sorted:
        IF branch.score >= threshold:
            kept.append(branch)
        ELSE IF kept.length < 2:
            // Keep at least 2 branches for diversity
            kept.append(branch)
        ELSE:
            // Release branch budget
            budget.release_branch(1)
            branch.mark_pruned()
    
    RETURN kept
```

## Slot Filling Algorithm

```
FUNCTION fill_slots(
    schema: QuerySchema,
    query: NormalizedQuery,
    context: CompilationContext
) -> SlotFillResult:
    
    bindings = new Map<string, Term>()
    confidence = 1.0
    ambiguities = []
    
    FOR slot IN schema.slots:
        fill_result = fill_single_slot(slot, query, context, bindings)
        
        IF fill_result.is_filled:
            bindings[slot.name] = fill_result.value
            confidence = min(confidence, fill_result.confidence)
            
            IF fill_result.alternatives.is_not_empty():
                ambiguities.append(SlotAmbiguity(
                    slot = slot.name,
                    chosen = fill_result.value,
                    alternatives = fill_result.alternatives
                ))
        
        ELSE IF slot.required:
            // Required slot unfilled
            IF slot.defaultValue IS NOT NULL:
                bindings[slot.name] = slot.defaultValue
                confidence = confidence * 0.8  // Penalty for using default
            ELSE:
                RETURN SlotFillResult(
                    success = false,
                    error = "required_slot_unfilled: " + slot.name
                )
        
        // Optional slot unfilled - that's OK
    
    RETURN SlotFillResult(
        success = true,
        bindings = bindings,
        confidence = confidence,
        ambiguities = ambiguities
    )

FUNCTION fill_single_slot(
    slot: SchemaSlot,
    query: NormalizedQuery,
    context: CompilationContext,
    existing_bindings: Map<string, Term>
) -> SingleSlotResult:
    
    // Step 1: Direct syntactic match
    direct = find_direct_match(slot, query)
    IF direct IS NOT NULL:
        RETURN SingleSlotResult(
            is_filled = true,
            value = direct,
            confidence = 1.0,
            method = "direct"
        )
    
    // Step 2: Type-based inference
    type_matches = find_by_type(slot.type, query)
    // Filter out already-bound values
    type_matches = type_matches.filter(m -> m NOT IN existing_bindings.values())
    
    IF type_matches.length == 1:
        RETURN SingleSlotResult(
            is_filled = true,
            value = type_matches[0],
            confidence = 0.9,
            method = "type_inference"
        )
    ELSE IF type_matches.length > 1:
        // Ambiguous - use VSA to rank
        ranked = rank_by_vsa_similarity(slot, type_matches, context)
        RETURN SingleSlotResult(
            is_filled = true,
            value = ranked[0].value,
            confidence = ranked[0].similarity,
            method = "vsa_ranked",
            alternatives = ranked[1:]
        )
    
    // Step 3: VSA semantic search
    slot_hv = context.vsa.generate(slot.name)
    candidates = context.vsa.retrieve_similar(slot_hv, k=5)
    
    FOR candidate IN candidates:
        IF type_compatible(candidate, slot.type):
            RETURN SingleSlotResult(
                is_filled = true,
                value = candidate.term,
                confidence = candidate.similarity,
                method = "vsa_search",
                alternatives = candidates.filter(c -> c != candidate)
            )
    
    // No match found
    RETURN SingleSlotResult(is_filled = false)
```

## Beam Search for Programs

```
FUNCTION beam_search(
    initial_candidates: List<Hypothesis>,
    evaluator: Function<Hypothesis, float>,
    budget: Budget,
    config: SearchConfig
) -> List<Hypothesis>:
    
    beam = PriorityQueue(max_size = config.beamWidth)
    
    // Initialize beam
    FOR candidate IN initial_candidates:
        score = evaluator(candidate)
        beam.push(candidate, score)
    
    iteration = 0
    best_score = 0.0
    
    WHILE iteration < config.maxIterations AND budget.has_remaining():
        iteration += 1
        
        // Generate successors for each beam member
        successors = []
        FOR candidate IN beam.all():
            expansions = generate_expansions(candidate)
            FOR expansion IN expansions:
                score = evaluator(expansion)
                successors.append((expansion, score))
                
                IF score > best_score:
                    best_score = score
                    // Early stopping check
                    IF score >= config.earlyStopThreshold:
                        RETURN [expansion]
        
        // Select for next beam (with diversity)
        beam = select_diverse_beam(successors, config)
        
        budget.consume_step(len(successors))
    
    RETURN beam.all()

FUNCTION select_diverse_beam(
    candidates: List<(Hypothesis, float)>,
    config: SearchConfig
) -> PriorityQueue:
    
    // Sort by score
    sorted = candidates.sort_by(c -> c.score, descending=true)
    
    new_beam = PriorityQueue(max_size = config.beamWidth)
    
    // Select top candidates while maintaining diversity
    selected_features = new Set()
    
    FOR (candidate, score) IN sorted:
        IF new_beam.length >= config.beamWidth:
            BREAK
        
        features = extract_features(candidate)
        
        // Compute diversity bonus
        overlap = features.intersection(selected_features)
        diversity = 1.0 - (overlap.length / features.length)
        adjusted_score = score * (1 - config.diversityWeight) + diversity * config.diversityWeight
        
        new_beam.push(candidate, adjusted_score)
        selected_features.update(features)
    
    RETURN new_beam

FUNCTION generate_expansions(hypothesis: Hypothesis) -> List<Hypothesis>:
    expansions = []
    
    // Expansion type 1: Parameter modification
    FOR (param, value) IN hypothesis.program.parameters:
        alternatives = suggest_alternatives(param, value)
        FOR alt IN alternatives:
            new_program = hypothesis.program.with_param(param, alt)
            expansions.append(Hypothesis(new_program, hypothesis.assumptions))
    
    // Expansion type 2: Instruction substitution
    FOR (idx, instruction) IN enumerate(hypothesis.program.instructions):
        equivalents = find_equivalent_instructions(instruction)
        FOR equiv IN equivalents:
            new_program = hypothesis.program.with_instruction(idx, equiv)
            expansions.append(Hypothesis(new_program, hypothesis.assumptions))
    
    // Expansion type 3: Add/remove steps
    optional_steps = suggest_optional_steps(hypothesis.program)
    FOR step IN optional_steps:
        new_program = hypothesis.program.with_added_step(step)
        expansions.append(Hypothesis(new_program, hypothesis.assumptions))
    
    RETURN expansions
```

## MDL Scoring

```
FUNCTION compute_mdl_score(
    program: Program,
    context: ScoringContext
) -> ScoringResult:
    
    // Component 1: Program complexity
    complexity = compute_complexity_cost(program)
    
    // Component 2: Residual (prediction loss)
    residual = compute_residual_cost(program, context)
    
    // Component 3: Correctness penalty
    closure_result = run_bounded_closure(program, context.store, context.budget)
    correctness = compute_correctness_penalty(closure_result)
    
    // Component 4: Budget penalty
    budget_penalty = compute_budget_penalty(closure_result.budgetUsed, context.budget)
    
    // Weighted sum (lower is better)
    total = (
        MDL_COMPLEXITY_WEIGHT * complexity +
        MDL_RESIDUAL_WEIGHT * residual +
        MDL_CORRECTNESS_PENALTY * correctness +
        MDL_BUDGET_PENALTY * budget_penalty
    )
    
    RETURN ScoringResult(
        total = total,
        breakdown = {
            complexity = complexity,
            residual = residual,
            correctness = correctness,
            budget = budget_penalty
        }
    )

FUNCTION compute_complexity_cost(program: Program) -> float:
    cost = 0.0
    
    // Base: instruction count
    cost += program.instructions.length * 1.0
    
    // Penalty for unique symbols/entities (vocabulary cost)
    unique_symbols = count_unique_symbols(program)
    cost += log2(unique_symbols + 1) * 0.5
    
    // Penalty for nesting depth
    max_depth = compute_max_nesting(program)
    cost += max_depth * 0.3
    
    // Bonus for using consolidated macros
    macro_uses = count_macro_calls(program)
    cost -= macro_uses * 0.2  // Negative = bonus
    
    RETURN max(cost, 0.1)  // Minimum cost

FUNCTION compute_residual_cost(program: Program, context: ScoringContext) -> float:
    IF context.evaluation_examples IS NULL:
        RETURN 0.0  // No evaluation data
    
    total_loss = 0.0
    FOR example IN context.evaluation_examples:
        result = execute_program(program, example.input)
        loss = compute_loss(result, example.expected)
        total_loss += loss
    
    RETURN total_loss / context.evaluation_examples.length

FUNCTION compute_correctness_penalty(closure_result: ClosureResult) -> float:
    penalty = 0.0
    
    FOR conflict IN closure_result.conflicts:
        severity = MATCH conflict.type:
            "direct"   -> 1.0
            "temporal" -> 0.7
            "indirect" -> 0.5
        penalty += severity
    
    RETURN penalty

FUNCTION compute_budget_penalty(used: BudgetUsage, allocated: Budget) -> float:
    penalty = 0.0
    
    // Penalty for high utilization (near exhaustion)
    step_ratio = used.usedSteps / allocated.maxSteps
    IF step_ratio > 0.9:
        penalty += (step_ratio - 0.9) * 10.0
    
    branch_ratio = used.usedBranches / allocated.maxBranches
    IF branch_ratio > 0.9:
        penalty += (branch_ratio - 0.9) * 5.0
    
    RETURN penalty
```
