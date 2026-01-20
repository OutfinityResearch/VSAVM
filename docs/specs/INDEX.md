# VSAVM Specifications Index

## Primary Requirements Documents
- [URS](URS.md) - User Requirements Specification
- [FS](FS.md) - Functional Specification  
- [NFS](NFS.md) - Non-Functional Specification

## Core Design Specifications

The VSAVM system is specified through five comprehensive design documents that provide complete technical coverage of the system architecture and implementation requirements:

- [DS001 System Architecture and Core Concepts](DS001-system-architecture.md) - LLM-like interface with VM core, unified event stream representation, VSA integration and acceleration, training architecture overview

- [DS002 Virtual Machine Design and Execution](DS002-vm-design-execution.md) - VM state and memory model, instruction set architecture, execution modes and semantics, macro-instruction system

- [DS003 Query Compilation and Program Search](DS003-query-compilation-search.md) - Natural language to query compilation, program search and selection, schema learning and consolidation, multimodal query processing

- [DS004 Correctness and Bounded Closure](DS004-correctness-bounded-closure.md) - Correctness contract definition, bounded closure algorithm, consistency checking and conflict resolution, execution tracing and auditability

- [DS005 Training, Learning, and Optimization](DS005-training-learning-optimization.md) - Two-loop training architecture, compression-driven learning, reinforcement learning integration, performance optimization and scaling

## Analysis and Legacy Documents

- [ANALYSIS](ANALYSIS.md) - Comprehensive analysis of specification gaps and restructuring recommendations

### Legacy Specifications (Superseded)
The following documents have been superseded by the comprehensive DS001-DS005 specifications above:
- DS001-high-level-vision.md, DS002-input-representation.md, DS003-structural-separators.md, DS004-training-method.md, DS005-rl-shaping.md, DS006-question-encoding.md, DS007-next-phrase-closure.md, DS008-output-decoding.md, DS009-correctness-bounded-closure.md, DS010-vm-design-vsa.md, DS011-correctness-contract.md, DS012-geometric-interpretation.md, DS013-federated-learning.md, DS014-trustworthy-ai.md
