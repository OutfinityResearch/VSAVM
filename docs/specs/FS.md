# FS

This table summarizes functional capabilities for the VSAVM system at a high level.

| ID | Function | Notes | Implemented in |
| --- | --- | --- | --- |
| FS01 | Ingest inputs into a canonical event stream. | Normalize text, audio, and visuals with structural separators. | DS001 |
| FS02 | Maintain a canonical fact store and rule library. | Store facts, rules, macro programs, and execution traces. | DS002 |
| FS03 | Compile natural language into executable query programs. | Use VSA retrieval and guided program search. | DS003 |
| FS04 | Execute programs in the VM and update state. | Support interpretation and reasoning modes. | DS002 |
| FS05 | Apply bounded closure for consistency checking. | Enforce limits on depth, branching, and steps. | DS004 |
| FS06 | Generate next-phrase candidates conditioned on VM state. | Combine LM proposals, schema constraints, and VSA retrieval. | DS001, DS003 |
| FS07 | Decode VM results into text or modality-compatible outputs. | Preserve fidelity to VM state and avoid new facts. | DS001 |
| FS08 | Expose configurable reasoning budgets and response modes. | Provide strict and conditional behaviors. | DS004 |
| FS09 | Record execution logs for audit and explanation. | Enable operational traceability of answers. | DS004 |
| FS10 | Support multimodal reasoning and cross-modal inference. | Handle relationships between text, audio, visual, and temporal data. | DS001, DS003 |
