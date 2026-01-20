# DS010 VM design and interaction with VSA

The VM is a symbolic execution engine with explicit state. The minimal state includes a canonical fact store, a memory of rules and macro programs, a binding environment for temporary variables, a call stack, and an execution log. The VM runs in interpretation mode and in reasoning mode.

The instruction set is small, typed, and universal. It includes term construction and canonicalization, ASSERT and DENY with immediate checks, MATCH for unification, APPLY_RULE for derivations, PUSH_CONTEXT and POP_CONTEXT for scope, and BRANCH and MERGE for exploration.

VSA does not replace the VM language. It accelerates retrieval and normalization by proposing discrete candidates. The VM decides truth and consistency by execution and bounded closure.
