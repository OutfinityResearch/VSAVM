# DS004 Training method and self-learned compiler

Training uses a single predictive objective but a two-loop architecture. The outer loop performs next-phrase modeling, while the inner loop performs program search, proposing VM programs that explain the current segment and produce a state that improves prediction.

Training is best understood as two complementary pressures. One pressure learns a surface prior for language and structure that can propose plausible continuations. The other pressure induces executable structure, discovering schemas and VM macro instructions through an MDL-style preference for compact programs that explain repeated patterns without exploding complexity.

The NL to query compiler is learned through the same compression pressure and behaves as a latent programmer. Early in training the system can rely on a small set of general primitive opcodes and treat questions as text. As repeated intents accumulate, such as definition questions, contradiction checks, comparisons, or coarse estimates, the system discovers compact program skeletons that reduce description length and stabilize prediction.

VSA accelerates emergence by clustering paraphrases and retrieving similar schemas early, reducing combinatorial search. VSA proposes candidates by similarity, while execution and bounded closure constrain which candidates are acceptable to consolidate.

Consolidation happens when a candidate program repeatedly wins and remains short, at which point it becomes a macro instruction. As many surface forms converge on the same macro instruction, the schema becomes robust to new phrasing.
