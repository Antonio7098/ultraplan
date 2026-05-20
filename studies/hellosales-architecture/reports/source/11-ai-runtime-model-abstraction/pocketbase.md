# Source Analysis: pocketbase

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase is an open-source Go backend framework providing embedded SQLite database, auth, file management, and REST API. The codebase implements various "provider" patterns (OAuth2, search, file storage, mail), but **there is no AI/ML runtime, model abstraction, LLM integration, token counting, or streaming AI response handling**.

The provider abstraction layer in PocketBase exclusively handles:
- OAuth2 authentication providers (`tools/auth/` directory)
- Search providers (`tools/search/provider.go`)
- File storage providers (`tools/filesystem/`)
- Mail providers (`mails/` directory)

No evidence was found of any AI provider abstraction, prompt engineering system, token usage tracking for LLMs, model routing, or streaming response handling for AI workloads.

## Rating

**1/10** — Absent

AI runtime and model abstraction is not part of PocketBase's architecture. This is expected given PocketBase's focus as a lightweight backend-as-a-service, not an AI orchestration platform.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Provider abstraction | `tools/auth/auth.go:13-21` defines `ProviderFactoryFunc` for OAuth2 providers | `tools/auth/auth.go:13` |
| Search provider | `tools/search/provider.go:63` defines `Provider` struct for database search | `tools/search/provider.go:63` |
| File storage providers | `tools/filesystem/blob/bucket.go` implements storage provider interface | `tools/filesystem/blob/bucket.go:1` |
| Mail providers | `mails/` directory contains mail handler implementations | `mails/mailer.go:1` |
| AI/ML providers | No evidence found — search for "openai\|anthropic\|llm\|ai\.provider" returned no relevant matches | N/A |

## Answers to Dimension Questions

### 1. How does the system abstract across different AI providers without leaky abstractions?

**No evidence found.** PocketBase does not implement AI provider abstraction. The provider interfaces found in `tools/auth/auth.go:13-21` and `tools/search/provider.go:63-77` handle OAuth2 and database search respectively — not AI model providers.

### 2. How are prompts constructed, versioned, and tested?

**No evidence found.** PocketBase has no prompt management system. The codebase does contain template rendering (`tools/template/registry.go`) but this is used for email templates and static content, not AI prompts.

### 3. How is context window overflow handled — truncation, summarization, or segmentation?

**No evidence found.** There is no context window management in PocketBase because there is no AI integration.

### 4. How does streaming work end-to-end from provider to end user?

**No evidence found.** PocketBase does implement realtime subscriptions (`apis/realtime.go:1-200`) via SSE (Server-Sent Events), but this is for database change notifications, not AI streaming responses.

### 5. How are token costs tracked and attributed to tenants/users?

**No evidence found.** There is no token accounting system in PocketBase. Token-related code in the codebase refers to JWT tokens (`tools/security/jwt.go`) and database record tokens (`core/record_tokens.go`), not LLM tokens.

## Architectural Decisions

- **Provider pattern**: PocketBase uses a provider factory pattern for OAuth2 (`tools/auth/auth.go:13-21`) and search (`tools/search/provider.go:63`), demonstrating a consistent extensibility model — but exclusively for non-AI workloads.
- **Plugin architecture**: PocketBase uses plugins (`plugins/`) for extensibility (JSVM, migrations, GitHub updates), but none relate to AI/ML.

## Notable Patterns

- **OAuth2 Provider Factory**: `tools/auth/auth.go:13` defines `ProviderFactoryFunc` which returns provider instances by name, a clean extension pattern.
- **Search Provider**: `tools/search/provider.go:63` implements a chainable query builder for database searches.
- **Realtime via SSE**: `apis/realtime.go` implements Server-Sent Events for database change subscriptions.

## Tradeoffs

- **Focus over breadth**: PocketBase intentionally omits AI capabilities to remain lightweight and simple. This is a design choice, not a gap.
- **No AI integration**: Users requiring LLM integration must build it externally or extend via the JSVM plugin.

## Failure Modes / Edge Cases

Not applicable — AI runtime is not part of PocketBase's scope.

## Future Considerations

If HelloSales requires AI orchestration, PocketBase would need:
1. A new AI provider adapter interface
2. Prompt template management system
3. Token counting and cost attribution
4. Streaming response handling infrastructure

This would be a significant new subsystem requiring architectural planning.

## Questions / Gaps

- **Q**: Does PocketBase have any plans to integrate AI capabilities?
  **A**: No evidence found in the codebase or documentation indicating AI/ML roadmap.
- **Q**: Could the existing provider pattern be extended for AI providers?
  **A**: Theoretically yes, but would require substantial new interfaces for model routing, streaming, token counting, and context management.

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `pocketbase`.