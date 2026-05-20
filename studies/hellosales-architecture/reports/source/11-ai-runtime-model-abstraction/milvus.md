# Source Analysis: milvus

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go (primary), C++ (internal/core), Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus is an open-source vector database. Its AI Runtime & Model Abstraction layer is a **secondary feature** enabling text-to-vector conversion through external AI model providers (text embedding functions). The architecture is reasonably well-designed for provider abstraction but lacks critical features expected in a production AI orchestration layer: no streaming support, no centralized token accounting, no model fallback on failure, and limited context window management.

## Rating

**4/10** — Basic implementation with significant gaps. The provider abstraction is clean, but the system is designed for vector storage with AI as an辅助 feature, not as a primary AI orchestration platform.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Provider Interface | `textEmbeddingProvider` interface with `CallEmbedding`, `MaxBatch`, `FieldDim` | `internal/util/function/embedding/text_embedding_function.go:84-88` |
| Provider Factory | Switch-case factory creating 12 provider types | `internal/util/function/embedding/text_embedding_function.go:122-150` |
| Supported Providers | openai, azure_openai, dashscope, bedrock, vertexai, voyageai, cohere, siliconflow, tei, yc, zilliz, gemini | `internal/util/function/embedding/text_embedding_function.go:42-54` |
| Retry Logic | Exponential backoff with jitter, max 3 retries | `internal/util/function/models/common.go:329-369` |
| Truncation Config | `TruncateParamKey`, `TruncationDirectionParamKey` defined | `internal/util/function/models/common.go:62,144,147,149` |
| Prompt Config | TEI supports `ingestionPrompt` and `searchPrompt` per mode | `internal/util/function/embedding/tei_embedding_provider.go:39-40` |
| Token Counting | VertexAI response includes `token_count` in statistics | `internal/util/function/models/vertexai/vertexai_client.go:45` |
| Function Executor | Manages multiple function runners per collection | `internal/util/function/embedding/function_executor.go:58-142` |
| Batch Processing | `BatchFactor` scales max batch size | `pkg/util/paramtable/function_param.go:24,34-38` |
| Rerank Interface | `ModelProvider` interface for reranking | `internal/util/function/rerank/model_function.go:56-59` |
| Chain Operators | Filter, Map, Sort, Merge, GroupBy, Limit, Select operators | `internal/util/function/chain/chain.go:34-50` |

## Answers to Dimension Questions

### 1. How does the system abstract across different AI providers without leaky abstractions?

**Evidence**: The `textEmbeddingProvider` interface (`internal/util/function/embedding/text_embedding_function.go:84-88`) defines a clean contract:

```go
type textEmbeddingProvider interface {
    MaxBatch() int
    CallEmbedding(ctx context.Context, texts []string, mode models.TextEmbeddingMode) (any, error)
    FieldDim() int64
}
```

The factory in `NewTextEmbeddingFunction` (`text_embedding_function.go:122-150`) switches on provider name and creates provider-specific instances. Each provider (e.g., `OpenAIEmbeddingProvider`, `TeiEmbeddingProvider`) encapsulates its own HTTP client and API details.

**Assessment**: Clean abstraction for embedding. However, each provider returns `any` type and relies on type assertions in `packToFieldData` (`text_embedding_function.go:207-248`), which introduces some coupling.

### 2. How are prompts constructed, versioned, and tested?

**Evidence**: Only the TEI (Text Embeddings Inference) provider supports custom prompts:
- `ingestionPrompt` and `searchPrompt` parameters (`internal/util/function/embedding/tei_embedding_provider.go:39-40`)
- Prompt is simply prepended to text (`tei_embedding_provider.go:94-98`):

```go
if prompt != "" {
    var newTexts []string
    for _, text := range texts {
        newTexts = append(newTexts, prompt+text)
    }
    r.Inputs = newTexts
}
```

**Assessment**: No version control, no testing framework, no template variable injection. Prompts are static strings passed during provider initialization. No evidence of prompt engineering or A/B testing infrastructure.

### 3. How is context window overflow handled — truncation, summarization, or segmentation?

**Evidence**: Context window handling is delegated entirely to the provider:
- TEI provider supports `truncate` boolean and `truncationDirection` ("Left"/"Right") (`tei_embedding_provider.go:41-42,74-80`)
- VoyageAI supports `truncation` parameter (`models/voyageai/voyageai_client.go:68`)
- Cohere supports `truncate` parameter (`models/cohere/cohere_client.go:72`)

The `TextEmbeddingMode` enum (`models/common.go:41-44`)区分s insert vs. search mode but does NOT manage context window.

**Assessment**: No internal context window management. Overflow is handled by provider's truncation (or not handled, leading to errors). No segmentation or summarization.

### 4. How does streaming work end-to-end from provider to end user?

**Evidence**: **No streaming implementation found.** All embedding calls use synchronous HTTP POST via `PostRequest<T>` (`models/common.go:286-309`):

```go
func PostRequest[T Response](req any, url string, headers map[string]string, timeoutSec int64) (*T, error) {
    data, err := json.Marshal(req)
    // ...
    body, err := retrySend(ctx, data, http.MethodPost, url, headers, 3)
    // ...
    err = json.Unmarshal(body, &res)
    return &res, err
}
```

The function waits for complete response before returning. No Server-Sent Events, WebSocket, or chunked transfer encoding.

**Assessment**: Streaming is not supported. All requests are synchronous batch operations.

### 5. How are token costs tracked and attributed to tenants/users?

**Evidence**: Token counting exists in only one place — VertexAI response metadata (`vertexai_client.go:45`):

```go
type Statistics struct {
    Truncated  bool `json:"truncated"`
    TokenCount int  `json:"token_count"`
}
```

This is **response metadata only**, not used for cost tracking. No evidence of:
- Centralized token accounting
- Per-tenant or per-user cost attribution
- Token budget enforcement
- Cost reporting

**Assessment**: No token cost tracking. The `TokenCount` field is incidental metadata from the VertexAI API, not a designed accounting mechanism.

## Architectural Decisions

1. **Provider-as-Factory Pattern**: Clean separation via switch-case factory. Easy to add new providers but requires code changes (not plugin-based).

2. **Embedding Mode Distinction**: `InsertMode` vs `SearchMode` (`models/common.go:41-44`) allows different behavior per operation — a good design for prompts but not for context.

3. **Credential Hierarchy**: `ParseAKAndURL` (`models/common.go:165-209`) implements precedence: function params > yaml config > environment variables. Well-designed for flexibility.

4. **BatchFactor Scaling**: `BatchFactor` (`function_param.go:24`) multiplies `max_client_batch_size` to determine effective batch size. Allows tuning without code changes.

5. **No Streaming by Design**: The system treats embeddings as batch transformations, not interactive AI calls. Consistent with vector database use case.

## Notable Patterns

- **Interface Segregation**: `textEmbeddingProvider` is minimal — only 3 methods. Easy to implement new providers.
- **Configuration-driven Providers**: All provider configs come from `milvus.yaml` and function schema params. No hardcoded URLs or credentials.
- **Exponential Backoff with Jitter**: `retrySend` (`common.go:357-358`) uses exponential backoff + random jitter for transient error handling.
- **Goroutine Parallelism**: `FunctionExecutor.ProcessInsert` (`function_executor.go:168-208`) runs multiple runners concurrently with wait groups.

## Tradeoffs

| Design Choice | Tradeoff |
|--------------|----------|
| Provider returns `any` type | Type safety lost; callers must type-assert. Flexible but error-prone. |
| No streaming | Simplicity; fits batch vectorization use case. Not suitable for interactive LLM applications. |
| Truncation delegated to provider | Provider flexibility; but inconsistent behavior across providers. |
| No token accounting | Reduces complexity; Milvus is not an LLM gateway. Cannot track costs. |
| No model fallback | Simple error propagation; no resilience for provider outages. |

## Failure Modes / Edge Cases

1. **Provider Timeout**: 30-second timeout default (`tei_embedding_provider.go:103`). After 3 retries, error propagates to user. No fallback provider.

2. **Dimension Mismatch**: `Check()` (`text_embedding_function.go:161-185`) validates output dimension matches schema. Returns error if mismatch.

3. **Empty Text Rejection**: `hasEmptyString` (`text_embedding_function.go:56-63`) rejects empty strings. Prevents silent failures.

4. **Batch Size Violation**: `MaxBatch()` (`text_embedding_function.go:187-189`) enforced at `ProcessInsert` and `ProcessSearch` entry points.

5. **Concurrent Runner Access**: `FunctionExecutor` (`function_executor.go:58`) uses mutex for runner map access. Parallel insert processing uses separate goroutines.

## Future Considerations

1. **Streaming Support**: Add SSE/WebSocket support for real-time embedding results.
2. **Token Accounting**: Centralized token counting and per-tenant cost tracking.
3. **Model Fallback**: Automatic failover to secondary provider on primary failure.
4. **Prompt Versioning**: Formal prompt template system with versioning and A/B testing.
5. **Context Window Management**: Internal chunking/summarization for long texts.

## Questions / Gaps

1. **No evidence of prompt version control** — How are prompt changes tracked and rolled back?
2. **No evidence of rate-limit awareness** — Does the system detect 429 responses and throttle?
3. **No evidence of cost attribution** — How are AI costs charged to tenants in multi-tenant deployments?
4. **No evidence of fallback routing** — What happens when a provider is down?
5. **Token counting only in VertexAI** — Why isn't token counting standardized across all providers?

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `milvus`.