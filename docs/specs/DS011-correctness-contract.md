# DS011 Correctness contract and boundary behavior

The correctness contract specifies what the system may emit and under what conditions. Consistency is verified up to a configurable budget defined by depth, branching, step, and time limits. Budget monotonicity means a conclusion accepted at low budget does not become easier to accept at higher budget.

Bounded closure runs in a propagation phase and a conflict checking phase. Strict mode cuts inconsistent branches, while exploratory mode can retain them for analysis without using them in final conclusions.

When the budget is exhausted before robustness is confirmed, conclusions degrade in a controlled way. The system declares indeterminacy or emits results conditioned on explicit hypotheses. Selection among acceptable executions must be stable and auditable.
