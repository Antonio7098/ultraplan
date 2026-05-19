# Dimension: AI Runtime & Model Abstraction

## Purpose

Analyzes how AI/ML functionality is abstracted and managed — provider abstraction layers, prompt execution pipelines, model routing and selection, context window management, streaming response handling, retry strategies for LLM calls, and token usage accounting. Directly maps to HelloSales's AI orchestration layer.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify AI provider abstraction layers and adapter interfaces.
3. Examine prompt construction, template management, and context window tracking.
4. Look for streaming response handling and partial result processing.
5. Evaluate token counting, cost tracking, and rate-limit awareness.

## Evidence

- Provider adapter interfaces and registry
- Prompt template system with variable injection
- Streaming response parsers and chunk aggregation
- Token counting and context window management
- Rate-limit handling and model fallback logic

## Questions

1. How does the system abstract across different AI providers without leaky abstractions?
2. How are prompts constructed, versioned, and tested?
3. How is context window overflow handled — truncation, summarization, or segmentation?
4. How does streaming work end-to-end from provider to end user?
5. How are token costs tracked and attributed to tenants/users?

## Rating

Assign a score from 1-10 based on the analysis findings.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Poor implementation or absent |
| 4-6 | Basic implementation with gaps |
| 7-8 | Good implementation with minor issues |
| 9-10 | Excellent, exemplar implementation |

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
