# Repo Analysis: t3code

## Runtime Contract and API Shape

### Repo Info

| Field | Value |
|-------|-------|
| Name | t3code |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` |
| Group | `t3code` |
| Language / Stack | TypeScript/Node.js, Effect framework, React |
| Analyzed | 2026-05-17 |

## Summary

T3 Code is a minimal web GUI for coding agents (Codex, Claude, OpenCode). Its SDK contract lives in `packages/contracts` as pure Effect/Schema types with no runtime logic. The central abstraction is **session → thread → turn → item** hierarchy, coordinated through a WebSocket RPC layer in `apps/server`. Runtime-specific mechanics (CLI spawning, JSON-RPC over stdio, permission prompts) are isolated in driver packages (`effect-codex-app-server`, `effect-acp`) with adapter boundaries defined by `ProviderDriverKind` branding. The design leaves room for OpenCode, Codex, Claude Code, ACP, and direct LLM providers, but Codex/OpenCode concepts still leak through the event `source` enum and `RuntimeEventRawSource` union.

## Rating

**7 / 10** — Clear interfaces with manageable runtime-specific escape hatches. The contracts package is commendably schema-only and uses Effect's type-safe error tracking. However, the `RuntimeEventRawSource` union (`providerRuntime.ts:21-31`) enumerates runtime-specific source literals rather than treating them as truly opaque, and some runtime concepts (e.g., `ProviderDriverKind` slug patterns, session state literals) remain visible at the contract layer.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| ProviderDriverKind branding | `ProviderDriverKind = slugSchema.pipe(Schema.brand("ProviderDriverKind"))` — open branded slug for driver selection | `providerInstance.ts:70` |
| ProviderInstanceId branding | `ProviderInstanceId = slugSchema.pipe(Schema.brand("ProviderInstanceId"))` — separate branding for user-configured instance routing | `providerInstance.ts:82` |
| Session/Thread/Turn/Item hierarchy | `ProviderRuntimeEventBase` fields: `threadId`, `turnId`, `itemId`, `providerRefs` | `providerRuntime.ts:247-261` |
| RuntimeEventRawSource union | Union of runtime-specific source literals: `codex.app-server.notification`, `claude.sdk.message`, `opencode.sdk.event`, `acp.jsonrpc` | `providerRuntime.ts:21-31` |
| CanonicalItemType | Literal union including `user_message`, `assistant_message`, `reasoning`, `plan`, tool types, and `unknown` | `providerRuntime.ts:121-132` |
| CanonicalRequestType | Approval and user-input request types: `command_execution_approval`, `file_change_approval`, `tool_user_input`, etc. | `providerRuntime.ts:135-145` |
| ProviderRuntimeEventV2 union | 48-event discriminated union covering session, thread, turn, item, content, request, task, hook, tool, auth, MCP, and error events | `providerRuntime.ts:951-999` |
| RuntimeSessionState | `Schema.Literals(["starting", "ready", "running", "waiting", "stopped", "error"])` | `providerRuntime.ts:52-60` |
| RuntimeThreadState | `Schema.Literals(["active", "idle", "archived", "closed", "compacted", "error"])` | `providerRuntime.ts:62-70` |
| RuntimeTurnState | `Schema.Literals(["completed", "failed", "interrupted", "cancelled"])` | `providerRuntime.ts:72-73` |
| Token usage schema | `ThreadTokenUsageSnapshot` with usedTokens, inputTokens, outputTokens, cachedInputTokens, reasoningOutputTokens, durationMs | `providerRuntime.ts:306-323` |
| ProviderSession | Caller-facing session type: `provider`, `providerInstanceId`, `status`, `runtimeMode`, `cwd`, `model`, `threadId` | `provider.ts:34-50` |
| ProviderSessionStartInput | Input for starting a session: `threadId`, `provider`, `providerInstanceId`, `cwd`, `modelSelection`, `approvalPolicy`, `sandboxMode`, `runtimeMode` | `provider.ts:53-64` |
| ProviderSendTurnInput | Turn input: `threadId`, `input` (max 120k chars), `attachments` (max 8), `modelSelection`, `interactionMode` | `provider.ts:67-77` |
| ProviderTurnStartResult | Turn start result: `threadId`, `turnId`, `resumeCursor` | `provider.ts:80-84` |
| OpenCodeRuntimeShape | Interface for spawning OpenCode server processes, connecting, running commands, creating SDK clients | `opencodeRuntime.ts:108-148` |
| OpenCode SDK import | Imports `createOpencodeClient` from `@opencode-ai/sdk/v2` | `opencodeRuntime.ts:5-13` |
| ModelSelection with legacy transform | Decodes `{provider, model}` legacy shape to `{instanceId, model}` via `SchemaTransformation.transformOrFail` | `orchestration.ts:64-114` |
| RuntimeMode | `Schema.Literals(["approval-required", "auto-accept-edits", "full-access"])` | `orchestration.ts:117-122` |
| ProviderInteractionMode | `Schema.Literals(["default", "plan"])` | `orchestration.ts:124-126` |
| effect-codex-app-server | Generated client from Codex JSON-RPC protocol (`schema.gen.ts` 1.4MB), stdio adapter in `_internal/stdio.ts` | `effect-codex-app-server/src/_generated/schema.gen.ts` |
| effect-acp | ACP protocol client with generated schema, stdio adapter | `effect-acp/src/_generated/schema.gen.ts` |
| builtInDrivers | Registers `codex`, `claudeAgent`, `cursor`, `opencode` driver kinds | `provider/builtInDrivers.ts:1-10` |
| ProviderDriverKind open design | Module docs explicitly state `ProviderDriverKind` is open (not closed union) so forks and unregistered drivers are tolerated | `providerInstance.ts:18-28` |

## Answers to Protocol Questions

### 1. What is the core abstraction: runtime, provider, session, turn, workflow, task, or something else?

The core abstraction is **session → thread → turn → item** (in that nesting order):

- **Session** (`ProviderSession` at `provider.ts:34`): A provider's long-lived connection to one working directory. Has states: `connecting`, `ready`, `running`, `error`, `closed`.
- **Thread** (`threadId` in `ProviderRuntimeEventBase` at `providerRuntime.ts:254`): A conversation context within a session. Thread state: `active`, `idle`, `archived`, `closed`, `compacted`, `error`.
- **Turn** (`turnId` at `providerRuntime.ts:256`): A single actor's contribution (user input or provider response). Turn states: `completed`, `failed`, `interrupted`, `cancelled`.
- **Item** (`itemId` at `providerRuntime.ts:257`, `CanonicalItemType` at `providerRuntime.ts:121-132`): Individual产出 within a turn — messages, reasoning traces, plans, tool calls, file changes, permission requests, etc.

"Runtime" in this codebase refers to the server-side process that wraps an external CLI (Codex app-server, OpenCode serve, etc.), not a first-class caller-facing type.

### 2. What is the minimal caller-facing API needed to start, send, stream, stop, and inspect a run?

Based on `provider.ts:53-96`:

- **Start**: `ProviderSessionStartInput` → creates a `ProviderSession` for a `threadId`, optionally selecting `provider`/`providerInstanceId`, `modelSelection`, `cwd`, `approvalPolicy`, `sandboxMode`, `runtimeMode`.
- **Send**: `ProviderSendTurnInput` → `threadId` + `input` (up to 120k chars) + optional `attachments` (up to 8) + `modelSelection` + `interactionMode`. Returns `ProviderTurnStartResult` (`threadId`, `turnId`, `resumeCursor`).
- **Stream**: Not a pull-based iterator; events are pushed through WebSocket as `ProviderRuntimeEventV2` discriminated union. The caller subscribes via `ORCHESTRATION_WS_METHODS.subscribeThread` (`orchestration.ts:32`).
- **Stop/Interrupt**: `ProviderInterruptTurnInput` (`provider.ts:87-90`) — `threadId` + optional `turnId`.
- **Stop session**: `ProviderStopSessionInput` (`provider.ts:93-95`) — `threadId`-only.
- **Inspect**: `ProviderSession` fields expose status, model, `activeTurnId`. Turn diffs retrievable via `orchestration.ts:1209-1238` RPC methods.

### 3. Which runtime-specific concepts leak through the public API, and are they acceptable?

**Leaks identified**:

1. **`RuntimeEventRawSource` literal union** (`providerRuntime.ts:21-31`): Lists exact source strings for Codex, Claude, OpenCode, ACP — directly coupling the contract to known runtimes. Adding a new runtime requires modifying this union. The module docs acknowledge this is a known coupling point.

2. **`ProviderDriverKind` slug pattern** (`providerInstance.ts:49`): The slug regex `/^[a-zA-Z][a-zA-Z0-9_-]*$/` is enforced at the schema layer, not just in the runtime registry. External fork authors must conform to this pattern.

3. **Default model tables** (`model.ts:130-153`): Hardcoded mappings of `ProviderDriverKind` to default model strings (e.g., `codex` → `gpt-5.4`). Adding a new driver requires editing this file.

4. **`RuntimeContentStreamKind` literals** (`providerRuntime.ts:81-89`): `assistant_text`, `reasoning_text`, `reasoning_summary_text`, `plan_text`, `command_output`, `file_change_output`, `unknown` — these map to OpenCode event semantics.

5. **`raw: RuntimeEventRaw` field** (`providerRuntime.ts:260`): The optional raw event envelope allows runtime-specific payloads to pass through without normalization. While pragmatic, it means callers may need to handle untyped data.

**Verdict**: The leaks are manageable but non-trivial. The `RuntimeEventRawSource` and `raw` field are intentional escape hatches documented in the module. The model defaults and driver kind slug pattern are more coupling than strictly necessary, suggesting the design is "Codex-first with extension points" rather than a fully runtime-agnostic SDK.

### 4. How are structured events and final outputs represented?

**Events**: `ProviderRuntimeEventV2` is a 48-variant discriminated union at `providerRuntime.ts:951-999`. Each event has:
- Common base: `eventId`, `provider`, `providerInstanceId`, `threadId`, `createdAt`, `turnId`, `itemId`, `requestId`, `providerRefs`, `raw`
- `type`: discriminant literal
- `payload`: typed per event type

Key event groups:
- Session: `session.started`, `session.configured`, `session.state.changed`, `session.exited`
- Thread: `thread.started`, `thread.state.changed`, `thread.metadata.updated`, `thread.token-usage.updated`
- Turn: `turn.started`, `turn.completed`, `turn.aborted`, `turn.plan.updated`, `turn.proposed.delta`, `turn.diff.updated`
- Item: `item.started`, `item.updated`, `item.completed`
- Content: `content.delta` (with `RuntimeContentStreamKind`: `assistant_text`, `reasoning_text`, etc.)
- Request: `request.opened`, `request.resolved`
- Tool: `tool.progress`, `tool.summary`

**Final outputs**: `TurnCompletedPayload` (`providerRuntime.ts:361-368`) includes `state: RuntimeTurnState`, `stopReason`, `usage: Schema.Unknown`, `modelUsage: UnknownRecordSchema`, `totalCostUsd: number`, `errorMessage`. The `usage` field is typed as `Schema.Unknown` — not structured — indicating token usage reporting is not fully normalized across providers.

### 5. How are metadata fields represented for provider, model, token usage, cost, timings, and source runtime?

- **Provider**: `ProviderDriverKind` branded slug (`providerInstance.ts:70-71`) + `ProviderInstanceId` branded slug (`providerInstance.ts:82`). Both are carried in `ProviderRuntimeEventBase` (`providerRuntime.ts:249`, `providerRuntime.ts:253`).

- **Model**: `ModelSelection` (`orchestration.ts:81-114`) with `instanceId: ProviderInstanceId` + `model: string` (e.g., `"gpt-5.4"`) + optional `options: ProviderOptionSelections`. Legacy `{provider, model}` shape auto-migrated via `SchemaTransformation.transformOrFail`.

- **Token usage**: `ThreadTokenUsageSnapshot` (`providerRuntime.ts:306-323`) with `usedTokens`, `inputTokens`, `outputTokens`, `cachedInputTokens`, `reasoningOutputTokens`, `last*` mirrors, `toolUses`, `durationMs`, `compactsAutomatically`. Emitted via `thread.token-usage.updated` events.

- **Cost**: `totalCostUsd: number` in `TurnCompletedPayload` (`providerRuntime.ts:366`).

- **Timings**: `durationMs: NonNegativeInt` in `ThreadTokenUsageSnapshot` (`providerRuntime.ts:320`). Also `ThreadTokenUsageUpdatedPayload.createdAt` implicitly on events via `IsoDateTime`.

- **Source runtime**: `provider: ProviderDriverKind` field in `ProviderRuntimeEventBase` (`providerRuntime.ts:249`) plus `raw: RuntimeEventRaw` (`providerRuntime.ts:260`) which preserves the original source string and untyped payload from the underlying runtime.

### 6. How does the design leave room for OpenCode, Codex, Claude Code, ACP, and direct LLM providers?

**Deliberate gaps and extension points**:

1. **OpenCode**: `OpenCodeRuntimeShape` (`opencodeRuntime.ts:108-148`) provides a local server spawning interface. The `@opencode-ai/sdk/v2` SDK is imported directly. OpenCode-specific event sources (`opencode.sdk.event`) are listed in `RuntimeEventRawSource` at `providerRuntime.ts:28`.

2. **Codex**: `effect-codex-app-server` package with generated schema from the Codex JSON-RPC protocol (`_generated/schema.gen.ts`), stdio adapter in `_internal/stdio.ts`. `codex.app-server.notification`, `codex.app-server.request`, `codex.eventmsg` are source variants at `providerRuntime.ts:22-24`.

3. **Claude Code**: `claude.sdk.message`, `claude.sdk.permission` source variants at `providerRuntime.ts:25-26`.

4. **ACP (Agent Communication Protocol)**: `acp.jsonrpc` source variant at `providerRuntime.ts:29`. Template literal pattern `acp.${string}.extension` at `providerRuntime.ts:30` allows extension events without modifying the union.

5. **Direct LLM providers**: No explicit support found. The design assumes a CLI-based runtime (Codex app-server, OpenCode serve) that communicates over stdio or HTTP. A direct LLM provider would require a new driver package implementing the `ProviderDriver` interface. No such package was found in the repo.

**Limitation**: All known runtime sources are enumerated in `RuntimeEventRawSource`. Adding a truly novel runtime (e.g., a pure REST API provider) would require either adding to this union or using the `raw` escape hatch.

## Architectural Decisions

1. **Effect/Schema as the contract language**: All contracts live in `packages/contracts` as Effect Schema definitions with zero runtime dependencies. This enables compile-time type narrowing and validation at boundaries.

2. **Session → Thread → Turn → Item hierarchy**: Chosen to model multi-turn conversations with per-turn granularity. The nesting is reflected in IDs (`threadId` → `turnId` → `itemId`) carried on every event.

3. **ProviderDriverKind as open branded slug**: Intentionally not a closed union. Module docs explicitly state unknown drivers must be tolerated and marked "unavailable" rather than causing parse failures (`providerInstance.ts:18-28`).

4. **ProviderDriverKind / ProviderInstanceId split**: Separates "which driver implementation" (`codex`, `opencode`, etc.) from "which user-configured instance" (e.g., `codex_personal`, `codex_work`). Enables multiple independent configurations of the same driver.

5. **Legacy migration via SchemaTransformation**: `ModelSelection` schema transparently upgrades legacy `{provider, model}` persisted payloads to `{instanceId, model}` on decode, preserving backward compatibility without runtime compatibility code.

6. **Raw event envelope**: `RuntimeEventRaw` on every event (`providerRuntime.ts:260`) allows runtime-specific payloads to pass through unnormalized, avoiding information loss at the adapter boundary.

7. **Effect Context / Layer for runtime services**: `OpenCodeRuntime extends Context.Service` (`opencodeRuntime.ts:546`) uses Effect's dependency injection, allowing the runtime to be swapped or mocked in tests.

## Notable Patterns

- **Generated protocol schemas**: `effect-codex-app-server` and `effect-acp` both have `_generated/schema.gen.ts` files (1.4MB for Codex) generated from external JSON-RPC specs, keeping the human-authored contracts clean.
- **Discriminated union events**: All `ProviderRuntimeEventV2` variants share a common base schema plus a `type` discriminant, enabling exhaustive switch handling.
- **Schema-only contracts package**: `packages/contracts` has no runtime logic — only Effect Schema definitions and TypeScript types. Runtime behavior lives in `apps/server` and driver packages.
- **Effect's TaggedError for error tracking**: Errors like `OpenCodeRuntimeError` (`opencodeRuntime.ts:51-59`) and `OrchestrationDispatchCommandError` (`orchestration.ts:1248-1253`) use `Schema.TaggedErrorClass` for type-safe error handling across Effect's `Cause` system.

## Tradeoffs

1. **Schema completeness vs. flexibility**: The 48-event union is comprehensive but growing. Adding a new event category requires modifying the union; the `raw` escape hatch mitigates this but loses type safety.

2. **Token usage as Schema.Unknown**: `TurnCompletedPayload.usage` is not structured across providers. This is a known gap — the field captures provider-specific usage shapes but doesn't normalize them.

3. **Codex-first terminology**: `codex.app-server.notification`, `codex.eventmsg` in the source enum anchor the design to Codex's event semantics. OpenCode and Claude use different event naming that is less naturally aligned.

4. **Effect dependency**: The entire contract layer uses Effect's `Schema`, `Effect`, `Option`, etc. Callers must accept this dependency. There's no plain TypeScript interface alternative.

5. **No version resilience mechanism**: The contracts don't include a version field or migration tracking. Schema evolution relies on backward-compatible transforms (like `ModelSelection`'s) rather than explicit versioning.

## Failure Modes / Edge Cases

- **Unknown driver kind**: Per `providerInstance.ts:18-28`, unknown `ProviderDriverKind` values are parsed successfully but marked unavailable in the runtime registry. Callers attempting to use an unavailable driver receive an error at session creation time, not schema parse time.

- **Legacy persisted payloads**: `ModelSelection`'s pre-decoding transform handles `{provider, model}` → `{instanceId, model}` automatically. Malformed legacy data fails validation with actionable error messages.

- **Large attachments**: `ProviderSendTurnInput` enforces max 120k char input and 8 attachments. Exceeding limits produces schema validation errors — no server-side truncation.

- **Orphaned sessions**: If a provider process crashes, the session enters `error` state. The `session.exited` event carries `recoverable: boolean` to guide reconnection strategy.

- **Untyped `raw` payloads**: Events with `raw: RuntimeEventRaw` carry `payload: Schema.Unknown`. Callers handling these must switch on `raw.source` and cast appropriately — no automated type narrowing.

## Future Considerations

1. **Version field in event schema**: A `schemaVersion: string` field on `ProviderRuntimeEventBase` would enable forward-compatible schema evolution without requiring immediate migration of all emitters.

2. **Normalized token usage schema**: A common `TokenUsage` struct covering all providers (input, output, cached, reasoning, cost) with provider-specific extensions via `unknown` would improve analytics and dashboards.

3. **Pure REST provider driver**: The current model assumes a long-lived CLI process. A direct HTTP-based LLM driver would require defining the adapter interface more explicitly (not just implied by `ProviderDriverKind` slug conventions).

4. **Schema registry**: Rather than enumerating runtime sources in `RuntimeEventRawSource`, a dynamic registry where each driver registers its event source prefix would eliminate the need to modify the union for new runtimes.

5. **Event schema documentation**: The 48-event union lacks per-event documentation. Adding doc comments to each payload type would improve the SDK's usability as a reference implementation.

## Questions / Gaps

1. **No evidence found** for a public Go SDK or Go-facing API. The study goal is "Define the smallest useful Go SDK contract for wrapping OpenCode first" but the analyzed repo is TypeScript/Node.js. The contracts are TypeScript-first using Effect/Schema. A Go SDK would need to replicate the schema semantics (discriminated unions, branded types, transform migrations) in Go, which Effect/Schema does not directly support.

2. **Direct LLM provider support**: No adapter or driver for a direct OpenAI/Anthropic API provider was found. Only CLI-based runtimes (Codex app-server, OpenCode serve) have driver implementations.

3. **Streaming API**: The event-based streaming model (`content.delta` events) is push-based over WebSocket. There's no pull-based streaming iterator API for callers that prefer controlled consumption.

4. **Cancellation semantics**: `ProviderInterruptTurnInput` takes an optional `turnId`. The behavior when `turnId` is omitted (interrupt current turn? all turns?) is not documented in the schema.

5. **Schema evolution strategy**: No explicit policy for how the 48-event union grows, how breaking changes are signaled, or how consumers migrate. The `raw` escape hatch is the only mechanism for forward compatibility.

---

Generated by `study-areas/01-runtime-contract-and-api-shape.md` against `t3code`.