# DS009 Correctness through bounded closure

Correctness is defined as an inference contract. The system does not emit conclusions that, within a configurable budget, produce contradictions either immediately or within the closure of learned rules. This requires a canonical internal form, explicit negation, and a controlled exploration mechanism.

Canonicalization maps assertions to internal fact identifiers with typed slots. Conflict is detected when the same fact identifier appears with opposing polarity in the same context. Context includes both execution scope and structural source scope.

Bounded closure applies rules and macro programs within limits on depth, steps, branching, and optionally time. Exploration uses beam search over VM states, and conclusions are robust or conditional depending on consistency across explored branches. A robust conclusion is one that remains consistent across the explored frontier. A conditional conclusion is tied to explicit hypotheses or branch conditions when robustness cannot be established under the current budget.

Because bounded closure is explicitly budgeted, the system can report what was checked. An execution trace and a closure journal record applied rules, explored branches, detected conflicts, and the budget used. This makes the correctness claim operational: the system can say that a conclusion is consistent up to a particular depth and beam width, and it can degrade to indeterminacy when the budget is insufficient.
