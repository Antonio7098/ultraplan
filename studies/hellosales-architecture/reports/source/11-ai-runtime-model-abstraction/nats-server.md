# Source Analysis: nats-server

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server is a CNCF messaging infrastructure project implementing the NATS protocol — a pub/sub and request-reply distributed messaging system with an optional persistence layer called JetStream. The codebase contains no AI/ML functionality whatsoever. There are no AI provider abstraction layers, no prompt management systems, no token counting or cost tracking, no streaming LLM response handling, and no model routing or fallback logic. This dimension is entirely absent from the source.

## Rating

**1** — AI Runtime & Model Abstraction is not implemented and not within the scope of this project.

## Evidence Collected

No evidence found for any AI/ML runtime or model abstraction functionality.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Provider abstraction | No AI provider interfaces exist | N/A |
| Prompt management | No prompt templates or prompt engineering | N/A |
| Context window management | No context window or token limit handling for AI | N/A |
| Streaming responses | No streaming response handling for LLM outputs | N/A |
| Token counting | No token accounting or cost tracking | N/A |
| Rate limiting for AI | No AI-specific rate limit handling | N/A |

## Answers to Dimension Questions

**1. How does the system abstract across different AI providers without leaky abstractions?**

No evidence found. nats-server does not implement any AI provider abstraction. The project is a pure messaging broker.

**2. How are prompts constructed, versioned, and tested?**

No evidence found. nats-server has no prompt management system.

**3. How is context window overflow handled — truncation, summarization, or segmentation?**

No evidence found. nats-server does not handle AI context windows.

**4. How does streaming work end-to-end from provider to end user?**

No evidence found. nats-server implements generic message streaming through JetStream (`server/jetstream.go:1-5361`, `server/jetstream_api.go:1-5361`), but this is message brokering for general-purpose messaging, not LLM response streaming.

**5. How are token costs tracked and attributed to tenants/users?**

No evidence found. nats-server has no token cost tracking — it is not an AI project.

## Architectural Decisions

- **JetStream architecture**: JetStream (`server/jetstream.go:1-5361`) is a durable, replicated message streaming layer built on top of NATS. It provides at-least-once delivery, message persistence, key-value stores, and object storage. This is general-purpose infrastructure suitable as a transport for AI messages, but does not implement any AI logic itself.
- **Account-based multi-tenancy**: `server/accounts.go:1-` implements account-based isolation, which could theoretically be used to attribute AI usage per tenant if AI layers were built on top, but no such layers exist.

## Notable Patterns

- **Pub/Sub messaging**: NATS uses a subject-based publish/subscribe model (`server/client.go:1-`).
- **JetStream streams and consumers**: `server/stream.go:468` defines `Stream` as a jetstream stream of messages; `server/consumer.go:1-` defines consumers with pull/push delivery.
- **Key-Value store**: JetStream provides a KV interface built on streams with `kv.` subject prefix (observed in tests, e.g., `server/norace_1_test.go:2097`).

## Tradeoffs

Not applicable. nats-server is not designed to be an AI runtime. It provides messaging primitives that could theoretically transport AI messages, but it makes no decisions about AI model selection, prompt engineering, or LLM cost management.

## Failure Modes / Edge Cases

Not applicable to this dimension. nats-server's failure modes relate to message delivery guarantees (at-least-once, exactly-once), clustering, and JetStream storage — not AI operations.

## Future Considerations

nats-server could serve as a message transport for a separate AI orchestration layer (e.g., HelloSales could use JetStream streams as a backing queue for AI request/response correlation), but this would require building all AI abstraction in a separate service. No native AI integration is planned or indicated in the codebase.

## Questions / Gaps

1. **Why is nats-server in this study's source list for AI Runtime?** The source appears misaligned with the dimension. It is a messaging infrastructure project, not an AI system.
2. **Is there a companion AI layer in this architecture?** The study's context mentions HelloSales's AI orchestration layer — nats-server may serve as a message bus for AI services built elsewhere, but no such AI services are present in this source.
3. **No evidence of LLM integration** was found despite searching for: openai, llm, ai, ml, model, embedding, vector, prompt, token, gpt, anthropic, chat, completion, ChatCompletions, Embeddings, generative, chatbot, rag, semantic.

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `nats-server`.