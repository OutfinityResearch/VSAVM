# NFS

This table lists non-functional constraints and high-level implementation modes.

## Technology Stack

| Constraint | Specification |
| --- | --- |
| **Language** | JavaScript (ES2022+) |
| **Module System** | ES Modules (.mjs files) |
| **Async Pattern** | async/await syntax throughout |
| **TypeScript** | Not used - pure JavaScript only |
| **External Dependencies** | None - zero npm dependencies |
| **Code Style** | Clean, straightforward, minimal abstraction |
| **Runtime** | Node.js 18+ (native ES modules support) |

## Non-Functional Requirements

| ID | Constraint | Notes | Implemented in |
| --- | --- | --- | --- |
| NFS01 | Predictable performance under configurable budgets. | Time and memory scale with closure depth and branching limits. | DS004, DS005 |
| NFS02 | Deterministic behavior in strict mode. | Same input and budget produce the same result. | DS002, DS004 |
| NFS03 | Modular architecture with clear subsystem boundaries. | Representation, execution, retrieval, and realization are separable. | DS001, DS002 |
| NFS04 | Auditability through execution logging. | Logs expose budgets, explored branches, and conflicts. | DS004 |
| NFS05 | Safe degradation when budgets are insufficient. | Responses become conditional or indeterminate rather than invented. | DS004 |
| NFS06 | Federated compatibility without raw data sharing. | Aggregate filtered statistics and VSA prototypes only. | DS005 |
| NFS07 | Rule consolidation with consistency testing. | New rules must pass health checks before promotion. | DS003, DS005 |
| NFS08 | Portable deployment across research environments. | Support local runs and controlled cluster execution. | DS001, DS005 |
| NFS09 | Configurable implementation modes. | Allow strict, exploratory, and analysis modes. | DS004 |
| NFS10 | Scalable performance optimization strategies. | Memory management, parallel processing, and distributed execution. | DS005 |
| NFS11 | **Zero hardcoded domain/modality scopes.** | **All scopes must emerge from structural separators. No domain-specific logic, no modality-specific if/else branches, no hardcoded scope patterns.** | **DS001, Emergent Discovery** |
## Emergent Scope Discovery Enforcement

**CRITICAL CONSTRAINT NFS11**: The system must maintain complete modality-agnostic design:

### ❌ FORBIDDEN PATTERNS
- `createScopeId(['domain', 'programming'])` - Hardcoded domain scopes
- `if (modality === 'video')` - Modality-specific branching logic  
- `switch (contentType)` - Content-type discrimination
- Domain-specific separator rules or thresholds
- Hardcoded scope validation lists

### ✅ REQUIRED PATTERNS  
- `createScopeId(['document', 'section_3', 'paragraph_1'])` - Structural paths only
- Automatic separator detection from event stream structure
- Context path analysis for scope boundaries
- Strength-based separator classification without domain knowledge
- Universal structural patterns across all modalities

### Enforcement Mechanisms
- **Runtime validation** in `createScopeId()` rejects hardcoded domain patterns
- **Evaluation tests** verify no domain-specific logic exists
- **Code review** must flag any modality-specific branching
- **Separator detection** must work identically across text, video, audio, code
