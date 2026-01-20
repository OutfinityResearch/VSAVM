# DS006 Question encoding, self-learned and multimodal

Question encoding starts with normalization into the event stream and structural marking of interrogative intent. Retrieval then uses VSA to find a top-K shortlist of schemas and macro programs similar to the question hypervector, reducing the search surface before execution.

Compilation into an executable query program means instantiating typed slots through discrete matching, simple coreference, and VSA association. For multimodal inputs, slot filling can reference temporal segments, detected objects, or other discrete identities, all handled uniformly by the VM.

The system maintains a beam of query programs and evaluates them by explanatory fit and consistency after partial execution. Interpretations that lead quickly to conflict are rejected or downgraded to conditional hypotheses.
