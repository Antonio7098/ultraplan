# Source Analysis: grafana

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana's AI runtime abstraction is primarily implemented through an external npm package `@grafana/llm` (version 1.0.8). This source tree contains only the **consumer-side code** — the UI components and hooks that invoke the LLM package's APIs. The actual provider abstraction (OpenAI, Azure OpenAI, etc.), streaming implementation, token counting, and rate-limit handling reside inside the `@grafana/llm` package, which is not present in this source tree.

Grafana provides GenAI features for dashboard changes description, panel title generation, and enterprise alerting integrations. The abstraction layer is thin — it uses enum-based model selection (`llm.Model.LARGE`, `llm.Model.BASE`) without exposing actual model names to consumers.

## Rating

**4/10** — Basic implementation with significant gaps. The AI orchestration layer is largely in an external package, limiting visibility into provider abstraction, token cost tracking, rate-limit handling, and model fallback logic. The consumer code shows streaming via RxJS and manual context window truncation, but lacks first-class prompt versioning, structured template management, and multi-tenant cost attribution.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| LLM package consumption | `@grafana/llm` imported in GenAI utilities | `public/app/features/dashboard/components/GenAI/utils.ts:3` |
| Model enum abstraction | `llm.Model.LARGE` and `llm.Model.BASE` used | `public/app/features/dashboard/components/GenAI/utils.ts:35` |
| Message type | `llm.Message` re-exported as local `Message` type | `public/app/features/dashboard/components/GenAI/utils.ts:21` |
| Health check | `llm.health()` returns `{ok: boolean, configured: boolean}` | `public/app/features/dashboard/components/GenAI/utils.ts:85` |
| Streaming implementation | `llm.streamChatCompletions()` with `llm.accumulateContent()` RxJS operator | `public/app/features/dashboard/components/GenAI/hooks.ts:101-110` |
| Stream status enum | `StreamStatus` enum with `IDLE`, `GENERATING`, `COMPLETED` | `public/app/features/dashboard/components/GenAI/hooks.ts:15-19` |
| Timeout handling | 10-second timeout on LLM stream | `public/app/features/dashboard/components/GenAI/hooks.ts:21,155-157` |
| Context truncation | Manual truncation at 8000 chars for user/migration changes | `public/app/features/dashboard/components/GenAI/GenAIDashboardChangesButton.tsx:57-67` |
| Panel context limit | Limit of 10 panels due to "context window constraints" | `public/app/features/dashboard/components/GenAI/utils.ts:121-145` |
| Prompt construction | Inline string composition with `Role.system` | `public/app/features/dashboard/components/GenAI/GenAIDashboardChangesButton.tsx:69-99` |
| Role enum | `Role.system = 'system'`, `Role.user = 'user'` | `public/app/features/dashboard/components/GenAI/utils.ts:13-19` |
| Enterprise AI pattern | `addAIAlertRuleButton()` plugin registration pattern | `public/app/features/alerting/unified/enterprise-components/AI/AIGenAlertRuleButton/addAIAlertRuleButton.ts:9` |
| LLM package version | `@grafana/llm": "1.0.8"` in dependencies | `package.json:293` |

## Answers to Dimension Questions

### 1. How does the system abstract across different AI providers without leaky abstractions?

**No evidence found** of provider abstraction in this source tree. The `@grafana/llm` package (external, not present in this source) handles provider abstraction. The consumer code uses abstract enum values (`llm.Model.LARGE`, `llm.Model.BASE`) that hide actual model names from callers (`public/app/features/dashboard/components/GenAI/utils.ts:29-35`), but the mechanism for switching providers is inside the external package.

### 2. How are prompts constructed, versioned, and tested?

Prompts are constructed **inline as string literals** in TypeScript files — not in a separate template system. Example in `GenAIDashboardChangesButton.tsx:17-37`:
```typescript
const CHANGES_GENERATION_PREFIX_PROMPT = [
  'You are an expert in Grafana Dashboards',
  'Your goal is to write a description of the changes...',
].join('.\n');
```

**No evidence found** of prompt versioning, testing infrastructure, or template management. Each GenAI feature composes its own prompts locally. Unit tests exist for utility functions (`utils.test.ts`) but do not test prompt output quality.

### 3. How is context window overflow handled — truncation, summarization, or segmentation?

**Manual character-count truncation**. In `GenAIDashboardChangesButton.tsx:55-67`:
- User changes truncated at **8000 characters**
- Migration changes truncated at **8000 characters**
- If migration diff has fewer than 10 lines, replaced with "No significant migration changes"

In `utils.ts:117-146` (`getDashboardPanelPrompt`):
- Panels limited to **10 panels maximum**
- Priority given to panels with descriptions
- Comment states: "This truncation should prevent exceeding the allowed size for GPT calls."

**No evidence found** of dynamic summarization, recursive truncation, or semantic chunking.

### 4. How does streaming work end-to-end from provider to end user?

Streaming is implemented via **RxJS observables** in `hooks.ts:101-116`:

```typescript
const stream = llm
  .streamChatCompletions({ model, temperature, messages })
  .pipe(llm.accumulateContent());
```

Flow:
1. `llm.streamChatCompletions()` returns an Observable stream
2. `llm.accumulateContent()` RxJS operator accumulates chunks into strings
3. Subscriber's `next` callback receives accumulated content (`hooks.ts:121-122`)
4. `complete` callback finalizes reply and calls `onResponse` (`hooks.ts:125-128`)

**No visibility** into the actual provider streaming implementation (it's in the external `@grafana/llm` package).

### 5. How are token costs tracked and attributed to tenants/users?

**No evidence found** of token counting, cost tracking, or multi-tenant attribution in this source tree. The `@grafana/llm` package likely handles this internally, but the mechanism is not visible here.

## Architectural Decisions

1. **External LLM package** — Grafana extracted the LLM orchestration into a separate `@grafana/llm` npm package. This source is only a consumer. The benefit is clean separation; the cost is reduced visibility into provider abstraction, token accounting, and fallback logic.

2. **Enum-based model selection** — Using `llm.Model.LARGE` and `llm.Model.BASE` abstracts actual provider model names, allowing the underlying provider to change without consumer code changes (`utils.ts:35`).

3. **RxJS for streaming** — Standard ReactiveX pattern with `streamChatCompletions()` returning an Observable, allowing standard RxJS operators like `accumulateContent()`.

4. **Health check caching** — Shared `llmHealthCheck` promise avoids redundant health checks (`utils.ts:66`).

5. **Enterprise plugin pattern** — Alerting AI features use a registration pattern (`addAIAlertRuleButton`) allowing enterprise code to inject implementations (`AIGenAlertRuleButton/addAIAlertRuleButton.ts:9`).

## Notable Patterns

- **Inline prompt construction**: Prompts are TypeScript string templates, not externalized
- **Role enum**: `Role.system` / `Role.user` for message construction (`utils.ts:13-19`)
- **Hard-coded truncation limits**: 8000 char and 10-panel limits hardcoded in feature components
- **Streaming with timeout**: 10-second timeout with `setTimeout` on stream generation (`hooks.ts:21,155-157`)
- **Error logging with message dump**: LLM errors logged with full message JSON for debugging (`hooks.ts:74`)

## Tradeoffs

- **External abstraction hides implementation details**: Provider interface, token accounting, and rate-limit handling are in a package not present in this source tree, making it impossible to audit or extend these aspects from this repository.
- **Manual context truncation vs. smart management**: Simple character limits used instead of semantic chunking or dynamic summarization, risking incoherent prompts when dashboard complexity grows.
- **No prompt versioning or testing**: Inline prompts cannot be versioned, reviewed, or tested in isolation from the application.
- **Single streaming mode**: All LLM interactions use the same streaming pattern; non-streaming alternatives not evident.

## Failure Modes / Edge Cases

- **LLM app not installed**: `isLLMPluginEnabled()` returns `false` if `grafana-llm-app` plugin not installed (`utils.ts:73-76`)
- **Health check failure clears cache**: On health check failure, the cached promise is cleared so next call retries (`utils.ts:88`)
- **Stream timeout**: After 10 seconds of no response, stream errors with timeout message (`hooks.ts:155-157`)
- **Empty dashboard**: If no panels have titles/descriptions, panel prompt returns empty string (`utils.ts:165-172`)
- **Panel overflow**: If dashboard has >10 panels, only panels with descriptions are prioritized — others silently excluded (`utils.ts:124-141`)

## Future Considerations

- **Externalize prompts to a template system**: Move prompts outside code for versioning, A/B testing, and non-technical editing
- **Add token budget tracking**: Implement tenant-level token accounting visible in this source tree
- **Dynamic truncation**: Replace hard-coded 8000-char limits with semantic chunking or summary-based truncation
- **Provider fallback**: No evidence of automatic fallback when a provider/model fails — consider circuit-breaker pattern
- **Non-streaming option**: Not all LLM use cases require streaming — consider a request/response API option

## Questions / Gaps

1. **Provider implementation hidden**: The actual LLM provider abstraction (OpenAI, Azure OpenAI, etc.) is inside `@grafana/llm` package, not visible here
2. **Token accounting invisible**: No token counting or cost tracking visible in this source tree
3. **Rate-limit handling absent**: No evidence of rate-limit awareness, backoff, or fallback in the consumer code
4. **Prompt testing nonexistent**: No infrastructure for testing prompt quality or consistency
5. **No multi-model routing**: Only `BASE` and `LARGE` enum values — no mechanism for model selection based on task complexity
6. **Enterprise dependency**: Several AI features for alerting require Grafana Enterprise (`enterprise-components/AI/`)

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `grafana`.