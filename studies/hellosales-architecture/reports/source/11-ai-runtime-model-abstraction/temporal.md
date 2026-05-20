# Source Analysis: temporal

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a distributed, durable execution platform for workflow orchestration (forked from Uber's Cadence). The codebase implements task queue management, workflow state machines, activity execution, and replication — but **there is no AI/ML runtime, model abstraction, LLM integration, token counting, or streaming AI response handling**.

The "provider" abstractions found in Temporal handle:
- gRPC transport providers (`client/` directory)
- Persistence/data store providers (`common/persistence/`)
- Authorization providers (`common/authorization/`)
- Dynamic configuration providers (`config/`)

No evidence was found of any AI provider abstraction, prompt engineering system, token usage tracking for LLMs, model routing, or streaming response handling for AI workloads.

## Rating

**1/10** — Absent

AI runtime and model abstraction is not part of Temporal's architecture. This is a workflow orchestration engine, not an AI platform. Temporal could theoretically be used to orchestrate AI tasks (as a workflow engine), but the codebase itself contains no AI model abstractions.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workflow engine | Core workflow execution logic | `service/history/workflow.go:1` |
| Task queue management | Task dispatch and rate limiting | `service/matching/matcher.go:1` |
| gRPC client factories | Client communication | `client/client.go:1` |
| Persistence providers | Data store abstraction | `common/persistence/dataInterfaces.go:1` |
| AI/ML providers | No evidence found — search for "openai\|anthropic\|llm\|ai\.provider\|embedding\|tokenizer" returned no relevant matches | N/A |
| Rate limiting | Found rate limiting for task queues, not AI | `service/matching/matchingContext.go:1` |

## Answers to Dimension Questions

### 1. How does the system abstract across different AI providers without leaky abstractions?

**No evidence found.** Temporal does not implement AI provider abstraction. The abstraction layers found handle gRPC inter-service communication, persistence backends, and task routing — not AI model providers.

### 2. How are prompts constructed, versioned, and tested?

**No evidence found.** Temporal has no prompt management system. The codebase focuses on workflow definition and execution, not prompt engineering.

### 3. How is context window overflow handled — truncation, summarization, or segmentation?

**No evidence found.** There is no context window management in Temporal because there is no AI integration. Workflow history does manage large state transitions, but this is not related to LLM context windows.

### 4. How does streaming work end-to-end from provider to end user?

**No evidence found.** Temporal implements gRPC streaming for replication and event handling, but this is not AI response streaming. The streaming found relates to workflow event streams and task dispatch.

### 5. How are token costs tracked and attributed to tenants/users?

**No evidence found.** There is no token accounting system in Temporal. Token-related references found relate to:
- SQL query tokenization (`common/persistence/visibility/store/sql/query_converter_util_legacy.go:122`) for legacy search
- Task queue token limits (`service/matching/matcher.go:56`) for dispatch throttling

Neither relates to LLM token counting.

## Architectural Decisions

- **No AI subsystem**: Temporal intentionally omits AI capabilities to remain focused as a general-purpose workflow orchestration engine.
- **Task routing**: Temporal uses task queues with rate limiting (`service/matching/matchingContext.go:1`) to dispatch work, not model routing.

## Notable Patterns

- **gRPC client factory**: `client/client.go:1` provides a clean client interface for service communication.
- **Workflow state machines**: `service/history/workflow.go:1` implements durable workflow execution via state machines.
- **Persistence abstraction**: `common/persistence/dataInterfaces.go:1` abstracts data storage backends.

## Tradeoffs

- **Focus over breadth**: Temporal's design intentionally excludes AI/ML capabilities to remain a general-purpose orchestration engine.
- **No built-in AI integration**: Users requiring AI task orchestration must build AI invocations as Temporal activities.

## Failure Modes / Edge Cases

Not applicable — AI runtime is not part of Temporal's scope. If AI tasks fail, they would be handled as regular Temporal activity failures.

## Future Considerations

If HelloSales requires AI orchestration via Temporal:
1. AI model calls would be implemented as Temporal activities
2. Token counting would need to be implemented in activity code
3. Streaming responses would need to be handled within activity execution
4. Context window management would be the responsibility of the AI client library used

## Questions / Gaps

- **Q**: Could Temporal be used to orchestrate AI tasks?
  **A**: Yes, as a workflow engine. AI model calls would be activities in a workflow, but Temporal itself provides no AI abstractions.
- **Q**: Does Temporal have any AI-related extensions?
  **A**: No evidence found in the codebase indicating AI/ML integration plans.

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `temporal`.