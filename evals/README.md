# VSAVM Evaluation System

This directory contains the evaluation framework for VSAVM, designed to provide rapid and convincing evidence that the system exhibits the expected properties without requiring large-scale training.

## Overview

The evaluation system focuses on demonstrating core capabilities through synthetic data and targeted metrics:

1. **Rule Learning** - System learns rules on different types of deterministically generated synthetic data
2. **Data Compression** - System compresses learned patterns effectively
3. **Reasoning** - System performs logical inference and deduction
4. **RL-based Prediction** - System learns through reinforcement learning to make predictions on learned shapes
5. **Query Response** - System answers questions based on learned knowledge

## Structure

- `/fastEval/` - Rapid evaluation suite with minimal computational requirements
- `/generators/` - Synthetic data generators for different domains
- `/metrics/` - Measurement and scoring systems
- `/benchmarks/` - Standard test cases and thresholds
- `/results/` - Evaluation outputs and analysis

## Quick Start

```bash
cd evals/fastEval
npm install
npm run eval-all
```

## Evaluation Domains

### 1. Arithmetic Rules
- Pattern: Simple arithmetic sequences and operations
- Goal: Learn addition, multiplication, modular arithmetic rules
- Metrics: Rule extraction accuracy, compression ratio

### 2. Logical Relations
- Pattern: Propositional and first-order logic relationships
- Goal: Learn implication, conjunction, disjunction rules
- Metrics: Inference accuracy, consistency checking

### 3. Temporal Sequences
- Pattern: Time-based event sequences and causality
- Goal: Learn temporal ordering and causal relationships
- Metrics: Sequence prediction accuracy, temporal reasoning

### 4. Graph Structures
- Pattern: Node-edge relationships and graph properties
- Goal: Learn graph traversal and structural patterns
- Metrics: Path finding accuracy, structural compression

### 5. String Patterns
- Pattern: Regular expressions and string transformations
- Goal: Learn pattern matching and string manipulation rules
- Metrics: Pattern recognition accuracy, transformation correctness

## Key Metrics

### Learning Metrics
- **Rule Extraction Rate**: Percentage of underlying rules correctly identified
- **Convergence Speed**: Training steps required to reach threshold performance
- **Generalization**: Performance on unseen but similar patterns

### Compression Metrics
- **Compression Ratio**: Original data size / compressed representation size
- **MDL Score**: Minimum Description Length principle compliance
- **Schema Efficiency**: Reusability of learned schemas across domains

### Reasoning Metrics
- **Inference Accuracy**: Correctness of logical deductions
- **Consistency Score**: Absence of contradictions in derived facts
- **Bounded Closure**: Completeness within computational budget

### RL Metrics
- **Prediction Accuracy**: Correctness of learned predictions
- **Reward Convergence**: Speed of RL policy optimization
- **Transfer Learning**: Application of learned shapes to new domains

### Technical Metrics
- **Memory Usage**: Peak and average memory consumption
- **Execution Time**: Processing speed for different operations
- **Scalability**: Performance degradation with data size
- **Stability**: Consistency across multiple runs

## Thresholds and Benchmarks

Based on literature review and system requirements:

- **Rule Learning**: >90% accuracy on synthetic patterns
- **Compression**: >50% size reduction with <5% information loss
- **Reasoning**: >95% consistency in bounded closure
- **RL Convergence**: <1000 episodes for simple patterns
- **Query Response**: <100ms for basic factual queries

## Implementation Status

- [ ] Core evaluation framework
- [ ] Synthetic data generators
- [ ] Metric calculation systems
- [ ] Benchmark test suites
- [ ] Results analysis tools
- [ ] Documentation and examples
