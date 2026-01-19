# DS009 Correctness through bounded closure

Correctness is defined as an inference contract. The system does not emit conclusions that, within a configurable budget, produce contradictions either immediately or within the closure of learned rules. This requires a canonical internal form, explicit negation, and a controlled exploration mechanism.

Canonicalization maps assertions to internal fact identifiers with typed slots. Conflict is detected when the same fact identifier appears with opposing polarity in the same context. Context includes both execution scope and structural source scope.

Bounded closure applies rules and macro programs within limits on depth, steps, and branching. Exploration uses beam search over VM states, and conclusions are robust or conditional depending on consistency across explored branches.
