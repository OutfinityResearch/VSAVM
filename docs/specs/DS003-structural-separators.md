# DS003 Structural separators and correctness

Structural separators delimit executable units and units of meaning. A deterministic structural parser detects sentences, blocks, lists, titles, definitions, procedural steps, assertions, and questions. In multimodal inputs, separators include temporal segments, scene changes, and object groupings from pre-processing.

Separators are not only for training; they are required for correctness. Transitive closure and contradiction detection are infeasible without context and scope. Separators define what belongs to the same paragraph or section and what belongs to a different chapter, enabling the system to maintain local theories without collapsing all knowledge into a single inconsistent base.

This structural scoping is the minimal requirement for a practical non-contradiction promise when the corpus is imperfect or contains conflicting sources.
