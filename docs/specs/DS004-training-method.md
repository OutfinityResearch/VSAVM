# DS004 Training method and self-learned compiler

Training uses a single predictive objective but a two-loop architecture. The outer loop performs next-phrase modeling, while the inner loop performs program search, proposing VM programs that explain the current segment and produce a state that improves prediction.

The NL to query compiler is learned through the same compression pressure. Repeated question patterns drive the emergence of compact schema and macro programs that reduce MDL and improve predictive power. VSA accelerates the process by grouping paraphrases and retrieving similar schemas early.

Consolidation happens when a candidate program repeatedly wins and remains short, at which point it becomes a macro instruction. As many surface forms converge on the same macro instruction, the schema becomes robust to new phrasing.
