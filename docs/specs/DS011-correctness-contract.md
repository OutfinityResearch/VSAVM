# DS011 Correctness contract and boundary behavior

The correctness contract specifies what the system may emit and under what conditions. Consistency is verified up to a configurable budget defined by depth, branching, step, and time limits. Budget monotonicity means a conclusion accepted at low budget does not become easier to accept at higher budget.

Bounded closure runs in a propagation phase and a conflict checking phase. Strict mode cuts inconsistent branches, while exploratory mode can retain them for analysis without using them in final conclusions.

When the budget is exhausted before robustness is confirmed, conclusions degrade in a controlled way. The system declares indeterminacy or emits results conditioned on explicit hypotheses, ideally expressed as internal fact identifiers rather than as vague language. This preserves the ability to re-evaluate the conclusion when the budget is increased.

The contract also requires stable selection behavior. When multiple executions remain acceptable, the system uses a deterministic or user-controlled policy, such as selecting the lowest-complexity program under an MDL-inspired score or selecting the highest predictive fit penalized by complexity. Auditing is supported by reporting the budget used, the number of explored branches, the depth reached, and whether conflicts were detected or pruned.
