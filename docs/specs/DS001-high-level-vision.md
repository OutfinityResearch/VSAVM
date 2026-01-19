# DS001 High-level vision

VSAVM is an Axiologic Research experiment within the Achilles project. The system exposes an LLM-like interface, yet its core is an executable virtual machine. Next-phrase prediction remains the primary training objective, but it is conditioned on VM state obtained through execution. Correctness is defined operationally as avoiding contradictions both immediately and within a bounded transitive closure.

Multimodality is handled through a unified event stream in which any input becomes symbolic events with structural separators. The NL to query compiler is not hardcoded; it emerges under compression pressure, while VSA accelerates schema discovery and retrieval. At runtime the input is segmented into events, candidate interpretations are executed in the VM, the query is compiled through retrieval and search, and the output is realized from the VM state.

When a user asks the system to think more, the closure and exploration budget increases. The system preserves the consistency contract by either strengthening its conclusions or falling back to conditional results when contradictions cannot be ruled out.
