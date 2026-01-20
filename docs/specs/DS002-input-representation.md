# DS002 Input representation, modality agnostic

The implementation begins with a canonical event stream. Each event has a type, a discrete payload, and a structural context, where context is a path such as document to section to paragraph to sentence to span. Event types include text tokens, visual tokens, timestamps, sentence separators, headers, lists, quotes, formula spans, and table cells.

For multimodal input, the event stream is the unification layer rather than a modality-specific embedding. Text becomes token events directly. Audio becomes transcription events plus temporal metadata events that preserve alignment. Images and video become symbolic descriptions or discrete visual tokens if an external encoder is available, but the design only assumes that these tokens are discrete and that separators can represent structural or temporal segmentation.

The system operates on two granularities. A lexical layer holds stable, reversible tokens, while a phrase layer holds macro units discovered by compression. Reversibility is essential, because every macro unit must expand deterministically into elementary units for scoring, evaluation, and coherent generation.

VSA attaches in parallel to each unit. Tokens and macro tokens have deterministic hypervectors derived from stable hashes, and spans combine these through bundling with role and position signals. This hypervector is an associative index for fast retrieval and paraphrase clustering, not a direct representation of truth.
