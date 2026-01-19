# DS007 Next-phrase completion and bounded closure

Generation proceeds incrementally at the phrase level. Candidates come from a discrete language model over macro units, from structural constraints of the active schema, and from VSA retrieval of semantically similar completions. The VM provides a state describing the required answer type, active slots, and already derived conclusions.

Correctness is enforced before acceptance. Each candidate is simulated against the VM state, and a local bounded closure is executed to check for contradictions. Candidates that introduce conflicts are rejected or marked unacceptable in strict mode.

When the user asks the system to think more, the closure budget and exploration breadth increase. If contradictions remain under a larger budget, the system responds conditionally or declares indeterminacy instead of inventing facts.
