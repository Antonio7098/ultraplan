# Source Analysis: openfga

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA is a high-performance ReBAC (Relationship-Based Access Control) authorization engine inspired by Google Zanzibar. It evaluates graph-based authorization queries using set operations (union, intersection, exclusion). **This source contains zero AI/ML functionality.** There is no AI provider abstraction, no LLM integration, no prompt construction pipelines, no token counting, no streaming AI responses, and no model routing. The only "planner" in the codebase (`internal/planner/`) implements Thompson Sampling for resolver strategy selection within the authorization graph traversal, entirely unrelated to AI model abstraction.

## Rating

**1/10 — Poor implementation or absent**

The dimension being studied (AI Runtime & Model Abstraction) is entirely absent from this source. OpenFGA is not an AI system; it is a traditional authorization engine using deterministic graph algorithms.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| AI Provider Abstraction | No AI provider abstraction exists in this repository. OpenFGA does not integrate with any LLM provider. | N/A |
| Prompt Template System | No prompt templates found. OpenFGA uses CEL (Common Expression Language) for authorization model conditions, not prompts for LLMs. | N/A |
| Streaming Response Handling | No streaming responses from AI providers. Streaming found in the codebase relates to gRPC/HTTP response streaming for ListObjects/ListUsers APIs, entirely unrelated to AI streaming. | N/A |
| Token Counting | No token counting for AI models. OpenFGA does not call any AI APIs. | N/A |
| Context Window Management | No context window management for AI. OpenFGA's typesystem handles authorization model schema validation, not AI context. | N/A |
| Rate-Limit Handling for AI | No AI rate-limit handling exists. | N/A |
| Thompson Sampling Planner | The `internal/planner/` package uses Thompson Sampling for selecting resolver execution strategies (which graph resolution path to try first), NOT for AI model routing. | `internal/planner/thompson.go:1`, `internal/planner/planner.go:1` |
| CheckResolver Interface | The graph resolution uses a resolver chain pattern (CachedCheckResolver → DispatchThrottlingCheckResolver → LocalChecker), unrelated to AI. | `internal/graph/interface.go:13` |

## Answers to Dimension Questions

### 1. How does the system abstract across different AI providers without leaky abstractions?

**No evidence found.** OpenFGA does not integrate with any AI providers. It does not have AI provider abstraction layers, adapter interfaces, or model routing. This question is inapplicable to this source.

### 2. How are prompts constructed, versioned, and tested?

**No evidence found.** OpenFGA does not use prompts or LLMs. Authorization model conditions are expressed in CEL (Common Expression Language), which are evaluated by the CEL runtime, not constructed as natural language prompts for AI models.

### 3. How is context window overflow handled — truncation, summarization, or segmentation?

**No evidence found.** OpenFGA does not have an AI context window. It has authorization model size limits enforced at the storage/validation layer, but these are unrelated to AI context windows.

### 4. How does streaming work end-to-end from provider to end user?

**No evidence found for AI streaming.** OpenFGA does support streaming for `StreamedListUsers` and `StreamedListObjects` APIs, but these stream relationship tuples over gRPC/HTTP, not AI model responses. The streaming uses standard Go iterators and gRPC server-side streaming.

### 5. How are token costs tracked and attributed to tenants/users?

**No evidence found.** OpenFGA does not call any AI APIs, so there are no token costs to track. OpenFGA does track latency metrics per request and per tenant for performance monitoring purposes, but not AI token usage.

## Architectural Decisions

- **No AI Layer Architecture**: OpenFGA was designed as a deterministic authorization engine from the ground up. It intentionally has no AI components.
- **Graph-Based Resolution**: Authorization queries are resolved through graph traversal using resolvers composed in a circular chain (`internal/graph/builder.go`), not through AI inference.
- **Thompson Sampling for Resolver Selection**: The planner selects between resolution strategies based on observed latency distributions, which is a performance optimization unrelated to AI model selection.

## Notable Patterns

- **Resolver Chain Pattern**: `CheckResolver` interface (`internal/graph/interface.go:13`) with implementations (CachedCheckResolver, DispatchThrottlingCheckResolver, LocalChecker, ShadowResolver) composed by `Builder` (`internal/graph/builder.go`).
- **CEL Conditions**: Authorization model conditions use CEL expressions evaluated at check time (`pkg/typesystem/`).
- **YAML Matrix Tests**: Authorization model test cases are defined in YAML files embedded via `go:embed` in `assets/assets.go`.

## Tradeoffs

- **AI Abstraction**: Not applicable — this source does not target AI workloads. The tradeoffs of AI integration (cost, latency, reliability, hallucination) are intentionally avoided by design.

## Failure Modes / Edge Cases

- **AI-Related Failures**: Not applicable. OpenFGA does not fail due to AI provider outages, rate limits, or token quota exhaustion because it has no AI dependencies.

## Future Considerations

- **AI Integration Possibility**: OpenFGA could theoretically integrate AI for features like natural language authorization queries (e.g., "Can Alice access this document?"), but no such integration exists currently. Any future AI integration would require significant architectural changes.

## Questions / Gaps

- **Gap**: No AI runtime or model abstraction exists. This study dimension is not applicable to OpenFGA.
- **Search Boundary**: Explored entire repository including `internal/`, `pkg/`, `cmd/`, and `tests/` directories. Searched for terms including: `llm`, `openai`, `anthropic`, `embedding`, `vector`, `chat.Completion`, `ai.Process`, `tokenizer`, `prompt`. Found zero AI-related code.

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `openfga`.