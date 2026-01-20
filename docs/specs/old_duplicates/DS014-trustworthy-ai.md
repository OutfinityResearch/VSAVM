# DS014 Trustworthy AI in VM plus VSA

Separating execution from surface realization yields a trust contract. In strict mode, the system cannot emit facts that are not present in VM state or derivable under bounded closure. This reduces hallucinations through emission rules rather than through probability calibration alone.

Explanations are operational and based on the execution log and the budget used. Users can inspect the number of explored branches, detected conflicts, and the robustness of conclusions. This form of audit is deterministic and reproducible.

Symbolic-like reasoning emerges from canonicalization and explicit negation even when rules are learned statistically. Context isolation prevents global inconsistency, and rules are health-tested before consolidation to maintain stability.
