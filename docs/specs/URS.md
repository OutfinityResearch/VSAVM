# URS

This table captures high-level user requirements for VSAVM.
Each item is concise and intended for early-phase alignment rather than exhaustive design.

| ID | Requirement | Notes | Implemented in |
| --- | --- | --- | --- |
| URS01 | Provide an LLM-like interface while using an executable VM core. | Interaction should feel conversational, but execution governs answers. | DS001, DS002 |
| URS02 | Enforce operational correctness via bounded closure. | The system avoids contradictions within a configurable budget. | DS004 |
| URS03 | Support multimodal inputs through a unified event stream. | Text, audio, and visuals are normalized to symbolic events. | DS001 |
| URS04 | Learn the NL to query compiler rather than hardcoding it. | Emerges through compression and prediction pressure. | DS003, DS005 |
| URS05 | Use VSA to accelerate retrieval and schema discovery. | VSA guides search but does not define truth. | DS001, DS003 |
| URS06 | Allow configurable reasoning depth on demand. | Budgets can be increased when the user requests deeper analysis. | DS004 |
| URS07 | Provide strict and conditional response behaviors. | If consistency is not verified, results are conditioned or withheld. | DS004 |
| URS08 | Enable transparent and explainable reasoning processes. | Users can understand how conclusions were reached and verify reasoning steps. | DS004 |
