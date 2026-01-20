# AGENTS

All generated and saved files must be written in English, including documentation, markdown, and code comments. Instructions may arrive in Romanian, but file content must remain English.

## Collaboration and Safety

- Assume other agents/streams may modify files in parallel; avoid broad refactors and keep changes minimal and localized.
- Do not run `git` commands (e.g., `git status`, `git diff`, `git log`, `git blame`, `git checkout`, `git reset`).

## Critical Design Principle: Emergent Scope Discovery

**AVOID**: Hardcoding domain-specific scopes (e.g., "programming", "biology", "medical").

**PRINCIPLE**: Scopes must emerge automatically from structural separators in the data, maintaining modality-agnostic design.

### Implementation Guidelines

- **Structural separators** are the only valid scope boundaries (paragraphs, scenes, speakers, functions)
- **VSA clustering** discovers semantic coherence regions automatically  
- **RL optimization** shapes boundaries for reasoning effectiveness
- **Domain knowledge** should never be hardcoded into scope definitions

### Examples of Correct vs Incorrect Approach

❌ **Incorrect**: `createScopeId(['domain', 'programming'])` - hardcoded domain
✅ **Correct**: `createScopeId(['document', 'section_3', 'paragraph_1'])` - structural path

❌ **Incorrect**: Manual domain separation in evaluation tests
✅ **Correct**: Automatic separator detection from input structure

This ensures the system scales to new modalities (video, audio, code) without manual engineering.
