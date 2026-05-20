# AI Runtime & Model Abstraction - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `11-ai-runtime-model-abstraction.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| 2 | grafana | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| 3 | kubernetes | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| 4 | milvus | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| 5 | nats-server | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| 6 | openfga | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| 7 | pocketbase | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| 8 | temporal | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| 9 | victoriametrics | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |

## Executive Summary

Of 9 sources studied, only 3 (cli, grafana, milvus) exhibit any AI runtime functionality. The remaining 6 sources are infrastructure projects (container orchestration, messaging, authorization, workflow orchestration, time-series database) with no AI/ML integrations. The three AI-active sources use fundamentally different approaches: GitHub CLI acts as a thin HTTP client for Copilot's remote inference; Grafana outsources AI orchestration to an external npm package; Milvus implements a clean but embedding-specific provider interface. No source implements a production-grade AI runtime with complete provider abstraction, prompt versioning, token accounting, and context window management.

## Core Thesis

AI Runtime & Model Abstraction is absent from most studied sources because it lies outside their architectural scope. Among sources that do implement AI features, there is no shared pattern for provider abstraction, prompt management, streaming, token accounting, or context window handling — each source either delegates entirely to an external package or implements only the subset needed for its narrow use case (text embeddings). The field is young and patterns are not yet standardized.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 2/10 | Thin HTTP client for Copilot CAPI | Zero AI implementation burden; leverages Copilot's infrastructure | No provider abstraction, no prompt management, polling-based streaming |
| grafana | 4/10 | External npm package consumer | Clean enum-based model selection; RxJS streaming | AI logic hidden in external package; manual context truncation; no token accounting |
| kubernetes | 1/10 | Not applicable | N/A | No AI functionality |
| milvus | 4/10 | Embedding provider interface with factory | Clean provider interface; 12 supported providers; retry logic | No streaming; no token accounting; embedding-only scope |
| nats-server | 1/10 | Not applicable | N/A | No AI functionality |
| openfga | 1/10 | Not applicable | N/A | No AI functionality |
| pocketbase | 1/10 | Not applicable | N/A | No AI functionality |
| temporal | 1/10 | Not applicable | N/A | No AI functionality |
| victoriametrics | 1/10 | Not applicable | N/A | No AI functionality |

## Approach Models

### Thin Client / Delegating Architecture (cli)
GitHub CLI implements no AI runtime. It acts as a task lifecycle manager for Copilot's remote inference, passing a `problem_statement` string to CAPI and rendering SSE logs. AI reasoning, model selection, prompt engineering, and token accounting all reside on GitHub's servers. This is a valid architectural choice for a CLI tool that invokes remote AI agents, but it provides no reusable AI runtime abstractions.

### External Package Consumer (grafana)
Grafana's AI features consume an external `@grafana/llm` npm package. The source tree contains only the consumer code — UI hooks and components. The provider abstraction (OpenAI, Azure OpenAI), streaming implementation, token counting, and rate-limit handling are inside the external package, invisible to this source tree. The consumer uses abstract enum values (`llm.Model.LARGE`, `llm.Model.BASE`) that decouple caller code from actual model names.

### Embedding-Specific Provider Interface (milvus)
Milvus implements a purpose-built `textEmbeddingProvider` interface for text-to-vector conversion. The factory pattern (`NewTextEmbeddingFunction`) creates provider-specific instances via switch-case. Each provider encapsulates its own HTTP client and API details. This is the most complete AI runtime implementation among studied sources, but it is scoped to embeddings only — there is no chat/completion interface, no streaming, and no token accounting.

## Pattern Catalog

### Pattern 1: Provider Interface Segregation
- **Problem**: How to abstract across AI providers without leaky abstractions
- **Sources**: milvus (`text_embedding_function.go:84-88`), grafana (via external package)
- **Mechanism**: Define a minimal interface with 2-3 methods (`MaxBatch()`, `CallEmbedding()`, `FieldDim()` in milvus). Factory switches on provider name to instantiate concrete implementations.
- **Why it works**: Interface segregation keeps the contract small, making it easy to implement new providers. Factory pattern centralizes creation logic.
- **When to copy**: When building embedding or inference pipelines that need to swap providers.
- **When overkill**: When only one provider is ever needed; adds indirection without benefit.
- **Evidence**: milvus `internal/util/function/embedding/text_embedding_function.go:84-88`

### Pattern 2: Enum-Based Model Selection
- **Problem**: How to decouple caller code from specific model names
- **Sources**: grafana (`utils.ts:35`)
- **Mechanism**: Use abstract enum values (`llm.Model.LARGE`, `llm.Model.BASE`) instead of hardcoded model strings. The underlying package maps enums to actual provider models.
- **Why it works**: Allows provider to change model without consumer code changes. Enables A/B testing of models.
- **When to copy**: For consumer-facing AI features where implementation details should be hidden.
- **When overkill**: Internal tools where developers directly control model selection.
- **Evidence**: grafana `public/app/features/dashboard/components/GenAI/utils.ts:35`

### Pattern 3: Exponential Backoff with Jitter
- **Problem**: How to handle transient AI API failures gracefully
- **Sources**: milvus (`common.go:357-358`), cli (`create.go:216-223`)
- **Mechanism**: Retry failed requests with exponential backoff + random jitter, typically capped at 3 retries.
- **Why it works**: Jitter prevents thundering herd when multiple clients retry simultaneously. Exponential backoff allows transient issues to resolve.
- **When to copy**: Any network call to external AI APIs.
- **When overkill**: Non-critical calls where failures are acceptable.
- **Evidence**: milvus `internal/util/function/models/common.go:357-358`

### Pattern 4: SSE Streaming with Polling
- **Problem**: How to deliver AI streaming responses to end users
- **Sources**: cli (via CAPI polling), grafana (RxJS observables)
- **Mechanism**: 
  - cli: Client polls `GetSessionLogs()` every 5 seconds, fetches SSE-formatted log entries, parses `chatCompletionChunkEntry` objects, renders tool calls.
  - grafana: `llm.streamChatCompletions()` returns an Observable; `llm.accumulateContent()` RxJS operator accumulates chunks.
- **Why it works**: Polling is simple to implement and avoids WebSocket complexity. RxJS provides standard operators for stream transformation.
- **When to copy**: For CLI tools and simple streaming use cases.
- **When overkill**: High-frequency streaming where WebSocket or GRPC would be more efficient.
- **Evidence**: cli `pkg/cmd/agent-task/shared/log.go:31-54`, grafana `public/app/features/dashboard/components/GenAI/hooks.ts:101-110`

### Pattern 5: Manual Character-Count Truncation
- **Problem**: How to prevent context window overflow with limited AI context budgets
- **Sources**: grafana (`GenAIDashboardChangesButton.tsx:55-67`)
- **Mechanism**: Hardcoded character limits (8000 chars) applied before sending to AI. Panels capped at 10. No dynamic summarization.
- **Why it works**: Simple to implement and reason about. Predictable behavior.
- **When to copy**: For Proof-of-concept or when input size is well-bounded.
- **When overkill/risk**: When input complexity grows; naive truncation can produce incoherent prompts.
- **Evidence**: grafana `public/app/features/dashboard/components/GenAI/GenAIDashboardChangesButton.tsx:57-67`

### Pattern 6: Health Check Caching
- **Problem**: How to avoid redundant AI service health checks
- **Sources**: grafana (`utils.ts:66`)
- **Mechanism**: Shared promise cached at module level. On failure, cache is cleared so next call retries.
- **Why it works**: Prevents hammering the health endpoint when many components check simultaneously.
- **When to copy**: For any external service health check that may be called frequently.
- **Evidence**: grafana `public/app/features/dashboard/components/GenAI/utils.ts:66`

## Key Differences

### Delegation vs. Implementation
cli and grafana delegate AI logic to external services (Copilot backend, @grafana/llm package). milvus implements its own provider abstraction internally. The delegation approach reduces internal complexity but hides implementation details from the source tree. The implementation approach provides full visibility but requires more code.

### Embedding-only vs. General-purpose
milvus is scoped to text embeddings, which simplifies the problem space: no chat interface, no streaming of generated text, no tool calls. cli and grafana deal with chat/completion-style AI but in different ways — cli as a remote agent executor, grafana as a consumer of a full-featured package.

### Provider Count
milvus supports 12 embedding providers via a factory pattern. grafana abstracts 2 model sizes via enum. cli integrates only with GitHub Copilot. The spectrum from single-provider to multi-provider reflects different flexibility requirements.

### Token Accounting
No source implements comprehensive token accounting. grafana and milvus have zero visibility into token counts. cli relies entirely on Copilot backend for accounting. This is a significant gap across all sources.

## Tradeoffs

| Decision | Benefit | Cost | Best-fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|--------------|
| Delegate AI to external package | Reduced complexity; expert implementation | Hidden implementation; cannot audit or extend from source tree | Grafana's model where AI is a secondary feature | Package changes break consumer code; version coupling | In-house implementation (milvus model) |
| Factory-based provider creation | Easy to add new providers; centralized creation | Requires code changes for new providers; not plugin-based | Multi-provider embedding pipelines | Large switch statement; enum-based dispatch | Plugin registry with dynamic loading |
| SSE polling for streaming | Simple to implement; no WebSocket complexity | 5-second latency floor; server load from polling | Low-frequency updates; CLI tools | High server load at scale; delayed updates | WebSocket or true streaming |
| Manual character truncation | Simple; predictable; no dependencies | Naive; can produce incoherent prompts | POC or well-bounded inputs | Degraded output quality as inputs grow | Semantic chunking or summarization |
| Enum-based model selection | Decouples consumers from model names | Requires package coordination for enum changes | Consumer-facing APIs | Enum drift between package versions | String-based model names |

## Decision Guide

**For a new AI runtime implementation, choose your approach based on:**

1. **Scope**: Is this embedding-only or general-purpose AI?
   - Embedding-only → milvus-style provider interface with factory
   - General-purpose → Consider external package or full in-house implementation

2. **Provider flexibility needs**: Single provider or multi-provider?
   - Single provider → Direct integration; no abstraction needed
   - Multi-provider → Factory pattern or plugin registry

3. **Streaming requirements**: Does the use case need real-time streaming?
   - Yes → RxJS observables (grafana) or SSE polling (cli) or WebSocket
   - No → Synchronous request/response is simpler

4. **Token accounting needs**: Is cost attribution required?
   - Yes → Currently no studied pattern to copy; need to build custom
   - No → Skip; reduces complexity

5. **Context window strategy**: How to handle overflow?
   - Simple inputs → Manual truncation with generous limits
   - Complex inputs → Semantic chunking or dynamic summarization

## Practical Tips

1. **Start with a minimal provider interface** — 2-3 methods (call, batch size, dimensions) is enough to get started. Add complexity as requirements grow.

2. **Use enum-based model selection for consumer-facing code** — Maps abstract capabilities to actual models without exposing provider details.

3. **Implement retry with exponential backoff + jitter for all AI API calls** — Transient failures are common; this pattern handles them gracefully.

4. **Cache health check results** — Prevents redundant calls that could count against rate limits.

5. **Externalize prompts, even in early versions** — Even simple file-based prompt storage enables versioning and testing that inline strings cannot.

6. **Consider the external package model for secondary AI features** — If AI is not core to your product, consuming a dedicated package may be more effective than building in-house.

7. **Design for embedding providers separately from chat providers** — The interfaces, streaming models, and token accounting needs differ significantly.

## Anti-Patterns / Caution Signs

- **No streaming for interactive AI features** — If your users expect real-time responses, synchronous request/response creates poor UX.
- **No retry logic for AI API calls** — Without backoff, transient provider failures cascade into user-visible errors.
- **Hardcoded model names in consumer code** — Creates tight coupling; changing providers requires consumer code changes.
- **No truncation strategy for context overflow** — Sending unbounded input eventually produces incoherent output or API errors.
- **Token counts invisible to operators** — Without accounting, cost attribution and budget enforcement are impossible.
- **Single provider with no fallback** — Provider outages create complete AI feature failures.
- **Polling at fixed intervals without jitter** — Creates thundering herd when many clients poll simultaneously.

## Notable Absences

### Prompt Versioning and Testing
No source implements a prompt versioning system, A/B testing infrastructure, or prompt quality testing. Prompts are either inline string literals (grafana) or entirely delegated (cli). This is a significant gap for production AI systems.

### Token Cost Tracking
Across all 9 sources, token counting exists in only one place — VertexAI response metadata in milvus — and even there it is incidental metadata, not a designed accounting mechanism. No source implements per-tenant or per-user cost attribution.

### Model Fallback on Failure
cli has no fallback to alternate providers when Copilot CAPI is unavailable. grafana relies on the external package but shows no evidence of fallback logic. milvus propagates errors after 3 retries but does not switch to a secondary provider.

### Semantic Context Management
grafana's truncation is purely character-count-based. milvus delegates to providers. No source implements dynamic summarization, recursive truncation, or semantic chunking for context window management.

### Multi-Tenant Token Accounting
No source tracks AI usage per tenant. In multi-tenant deployments (grafana, milvus), this prevents cost attribution, budget enforcement, and usage reporting.

## Per-Source Notes

### cli (GitHub CLI) — 2/10
A thin Copilot integration that demonstrates the "AI as external service" model. Acts as a task manager and log renderer; all AI intelligence is server-side. Polling-based streaming with 5-second intervals. No provider abstraction, no prompt management, no token accounting. The approach is appropriate for a CLI tool that delegates to a single AI service, but it provides no reusable abstractions for building AI runtimes.

### grafana — 4/10
Consumer of an external `@grafana/llm` package. Enum-based model selection is a good pattern. RxJS streaming is well-implemented. However, AI implementation details are hidden in the external package, limiting auditability. Manual character truncation (8000 chars, 10 panels) is a red flag for scalability. No token accounting visible in source tree.

### kubernetes — 1/10
Not applicable. Container orchestration system with no AI functionality. Only OpenTelemetry semantic convention constants for AI tracing exist in vendor directory, unused.

### milvus — 4/10
The most complete AI runtime among studied sources for its embedding-specific scope. Clean `textEmbeddingProvider` interface with 12 provider types via factory. Exponential backoff with jitter for retry. Embedding mode distinction (insert vs. search) is a good design for different prompt strategies. Gaps: no streaming, no token accounting, no model fallback, `any` type returns requiring type assertions.

### nats-server — 1/10
Not applicable. Messaging infrastructure with no AI functionality. JetStream could theoretically transport AI messages, but no AI layer exists.

### openfga — 1/10
Not applicable. Authorization engine using deterministic graph algorithms. No AI functionality despite having a `planner` package (uses Thompson Sampling for resolver strategy selection, unrelated to AI model selection).

### pocketbase — 1/10
Not applicable. Backend-as-a-service with OAuth2, search, file storage, and mail provider patterns — all non-AI. Could theoretically extend provider pattern for AI, but would require substantial new interfaces.

### temporal — 1/10
Not applicable. Workflow orchestration engine with no AI functionality. Could theoretically orchestrate AI tasks as activities, but provides no AI abstractions.

### victoriametrics — 1/10
Not applicable. Time-series database with no AI functionality. OpenTelemetry GenAI constants in vendor directory are unused.

## Open Questions

1. **How should HelloSales handle the external package vs. in-house implementation tradeoff?** Grafana's external `@grafana/llm` package keeps AI logic isolated but hides implementation. milvus builds internally but is scoped to embeddings. Which model fits HelloSales depends on how central AI is to the product.

2. **What prompt versioning and testing infrastructure is needed?** No source implements this. For a production AI system with frequent prompt changes, this is a critical gap.

3. **How should token cost tracking be implemented?** No studied source provides a pattern. HelloSales would need to build this from scratch or adopt a dedicated AI gateway.

4. **Should context window management be centralized or per-feature?** grafana handles truncation per-feature with hardcoded limits. milvus delegates to providers. A centralized `ContextManager` would provide consistency but adds coupling.

5. **Is the polling-based streaming model acceptable for HelloSales's use case?** cli uses 5-second polling intervals which introduces latency. Interactive AI features likely need true streaming (WebSocket/SSE).

## Evidence Index

| Source | Area | Evidence | Reference |
|--------|------|----------|-----------|
| cli | Agent Detection | `detectWith()` checks env vars for AI agents | `internal/agents/detect.go:38-98` |
| cli | Copilot CLI Invocation | `runCopilot()` downloads and executes Copilot binary | `pkg/cmd/copilot/copilot.go:133-193` |
| cli | CAPI Client | `CapiClient` interface with job and session methods | `pkg/cmd/agent-task/capi/client.go:13-21` |
| cli | Streaming Log Parser | `chatCompletionChunkEntry` matches OpenAI chunk format | `pkg/cmd/agent-task/shared/log.go:496-518` |
| cli | Backoff Retry | Exponential backoff for job polling | `pkg/cmd/agent-task/create/create.go:216-223` |
| cli | SSE Log Format | `LogRenderer.Follow()` fetches and renders SSE logs | `pkg/cmd/agent-task/shared/log.go:31-54` |
| grafana | LLM Package Consumption | `@grafana/llm` imported in GenAI utilities | `public/app/features/dashboard/components/GenAI/utils.ts:3` |
| grafana | Model Enum Abstraction | `llm.Model.LARGE` and `llm.Model.BASE` used | `public/app/features/dashboard/components/GenAI/utils.ts:35` |
| grafana | RxJS Streaming | `llm.streamChatCompletions()` with `accumulateContent()` | `public/app/features/dashboard/components/GenAI/hooks.ts:101-110` |
| grafana | Context Truncation | 8000 char limit for user/migration changes | `public/app/features/dashboard/components/GenAI/GenAIDashboardChangesButton.tsx:57-67` |
| grafana | Panel Limit | Max 10 panels due to context constraints | `public/app/features/dashboard/components/GenAI/utils.ts:121-145` |
| grafana | Health Check Caching | `llmHealthCheck` promise cached at module level | `public/app/features/dashboard/components/GenAI/utils.ts:66` |
| milvus | Provider Interface | `textEmbeddingProvider` interface with 3 methods | `internal/util/function/embedding/text_embedding_function.go:84-88` |
| milvus | Provider Factory | Switch-case factory for 12 provider types | `internal/util/function/embedding/text_embedding_function.go:122-150` |
| milvus | Retry with Jitter | Exponential backoff + random jitter | `internal/util/function/models/common.go:357-358` |
| milvus | Token Counting | VertexAI response includes `token_count` | `internal/util/function/models/vertexai/vertexai_client.go:45` |
| milvus | Function Executor | Manages multiple function runners per collection | `internal/util/function/embedding/function_executor.go:58-142` |
| milvus | Truncation Config | TEI provider supports `truncate` and `truncationDirection` | `internal/util/function/embedding/tei_embedding_provider.go:41-42,74-80` |
| kubernetes | Not Applicable | No AI functionality | N/A |
| nats-server | Not Applicable | No AI functionality | N/A |
| openfga | Not Applicable | No AI functionality | N/A |
| pocketbase | Not Applicable | No AI functionality | N/A |
| temporal | Not Applicable | No AI functionality | N/A |
| victoriametrics | Not Applicable | No AI functionality | N/A |

---

Generated by dimension `11-ai-runtime-model-abstraction.md`.