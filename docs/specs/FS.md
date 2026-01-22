# FS

This table summarizes functional capabilities for the VSAVM system at a high level.

| ID | Function | Notes | Implemented in |
| --- | --- | --- | --- |
| FS01 | Ingest inputs into a canonical event stream. | Normalize text, audio, and visuals with structural separators. | DS001, DS010 |
| FS02 | Maintain a canonical fact store and rule library. | Store facts, rules, macro programs, and execution traces. | DS002 |
| FS03 | Compile natural language into executable query programs. | Use VSA retrieval and guided program search. | DS003 |
| FS04 | Execute programs in the VM and update state. | Support interpretation and reasoning modes. | DS002 |
| FS05 | Apply bounded closure for consistency checking. | Enforce limits on depth, branching, and steps. | DS004 |
| FS06 | Generate continuation candidates conditioned on VM state. | Combine LM proposals (macro-units/bytes), schema constraints, and retrieval. | DS001, DS003, DS011 |
| FS07 | Decode VM results into text or modality-compatible outputs. | Preserve fidelity to VM state and avoid new facts. | DS001 |
| FS08 | Expose configurable reasoning budgets and response modes. | Provide strict and conditional behaviors. | DS004 |
| FS09 | Record execution logs for audit and explanation. | Enable operational traceability of answers. | DS004 |
| FS10 | Support multimodal reasoning and cross-modal inference. | Handle relationships between text, audio, visual, and temporal data. | DS001, DS003 |
| FS11 | Support belief revision with metadata retention. | Track provenance, confidence, timestamps; allow rule retraction; newer evidence with higher confidence wins; old beliefs marked superseded, not deleted. | DS005 |

## Critical Implementation Insight: Emergent Scope Discovery

**Problem**: Hardcoding domain-specific scopes would violate the modality-agnostic principle (NFS11) and would not scale to new inputs.

**Solution**: Scopes must emerge automatically from structural separators in the data, not be predefined by domain knowledge.

### Modality-Agnostic Scope Discovery

Structural separators exist naturally in all modalities:
- **Text**: Paragraphs, sections, documents, speaker changes
- **Video**: Scene cuts, shot boundaries, temporal segments  
- **Audio**: Silence gaps, speaker transitions, topic shifts
- **Code**: Function boundaries, class definitions, module imports

The system should:
1. **Detect separators** automatically from input structure
2. **Cluster similar contexts** through VSA similarity
3. **Optimize boundaries** through RL based on reasoning effectiveness
4. **Maintain scope isolation** without domain-specific knowledge

### Implementation Requirements

- Separator detection must work for any discrete input stream
- VSA clustering identifies semantically coherent regions  
- RL shapes scope boundaries for optimal reasoning performance
- VM execution respects discovered scope boundaries automatically

**IMPLEMENTATION STATUS**: The codebase enforces structural-only scopes and provides a minimal DS010 implementation:

- <code>createScopeId</code> rejects any scope that begins with <code>['domain', ...]</code>.
- <code>detectStructuralSeparators</code> and <code>createStructuralScopeId</code> exist in <code>src/event-stream/separator-detector.mjs</code>.
- The VSA-based detector lives in <code>src/event-stream/vsa-separator-detector.mjs</code> and uses similarity gradients plus context-path changes as signals.
- When events carry a stable <code>contextPath</code>, scope derivation prefers it (most reliable). Separator discovery is a fallback/augmenter.

This ensures the system scales to new modalities and domains without manual scope engineering.
