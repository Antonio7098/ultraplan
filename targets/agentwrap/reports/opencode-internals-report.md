# OpenCode Internals and agentwrap Gap Analysis

## Purpose

This report documents the relevant internal architecture of OpenCode (the wrapped runtime) as observed from its source code at `studies/opencode-wrap-study/sources/opencode/`, then analyses how the agentwrap SDK implementation at `/home/antonioborgerees/coding/agentwrap/` aligns with or diverges from those internals. The goal is to identify where sprints 1–6 over- or under-utilised opencode evidence, and to inform sprints 7+ with concrete source-level references.

---

## Part 1: OpenCode Internal Architecture

### 1.1 Project Structure and Package Boundaries

OpenCode is a TypeScript monorepo (Bun + Turborepo) with clear separation:

| Package | Role | Boundary |
|---|---|---|
| `packages/opencode` | Main CLI application | Session management, CLI commands, config, processor, runner, bus |
| `packages/core` | Shared library | EventV2 system, session schemas, session-event catalog, utilities |
| `packages/sdk/js` | External SDK client | Generated HTTP client (OpenAPI), used by external consumers |
| `packages/plugin` | Plugin authoring SDK | Hooks, tool definitions, plugin lifecycle |
| `packages/llm` | LLM routing engine | Provider protocols, transports, model routing |

**Relevance to agentwrap:** The agentwrap SDK should mirror the `packages/core` + `packages/sdk` boundary — core primitives in one package, runtime-specific adapters separate. The current agentwrap layout (flat files + `opencode/` + `internal/`) matches this intent but conflates core types with adapter internals.

### 1.2 CLI Entrypoint and `--format json` Structured Output

**File:** `packages/opencode/src/cli/cmd/run.ts` (852 lines)

The `run` command has three modes: non-interactive (default), interactive local, and interactive attach. The critical mode for the SDK wrapper is **non-interactive with `--format json`**.

**The `emit()` function** (`run.ts:592-605`):
```ts
function emit(type: string, data: Record<string, unknown>) {
  if (args.format === "json") {
    process.stdout.write(
      JSON.stringify({
        type,
        timestamp: Date.now(),
        sessionID,
        ...data,
      }) + EOL,
    )
    return true
  }
  return false
}
```

This produces **one JSON line per event** with the wire format:
```json
{"type":"tool_use","timestamp":...,"sessionID":"...","part":{...}}
{"type":"step_start","timestamp":...,"sessionID":"...","part":{...}}
{"type":"step_finish","timestamp":...,"sessionID":"...","part":{...}}
{"type":"text","timestamp":...,"sessionID":"...","part":{...}}
{"type":"reasoning","timestamp":...,"sessionID":"...","part":{...}}
{"type":"error","timestamp":...,"sessionID":"...","error":"..."}
```

**The event subscription loop** (`run.ts:611+`) consumes bus events (`message.updated`, `message.part.updated`, `session.error`, `session.status`) and maps them to the five structured event types above. The loop breaks when `session.status` fires with `type: "idle"`.

**Session lifecycle in the CLI:**
- Resume existing (`--continue`, `--session`) or create fresh
- Fork before continuing (`--fork`)
- Send prompt via `sdk.session.prompt()` or command via `sdk.session.command()`
- Stream events via `sdk.event.subscribe()` -> `for await...of events.stream`
- Auto-share if configured (`--share`)

**Relevance to agentwrap:** The existing agentwrap `opencode/` adapter correctly uses `--format json` and maps the five exact event type names. This is the strongest-aligned area of the implementation.

### 1.3 Event Systems: EventV2 and Bus

OpenCode has **two parallel event systems**:

#### EventV2 (`packages/core/src/event.ts`, 157 lines)

The canonical typed event system:
```ts
// Definition
EventV2.define({ type, version?, aggregate?, schema })

// Payload shape
{ id: EventID, type: string, data: T, version?: number, location?: Location.Ref, metadata?: Record<string, unknown> }

// Service
EventV2.Service {
  publish(definition, data, options?) -> Effect<Payload>
  subscribe(definition) -> Stream<Payload>   // per-type stream
  all() -> Stream<Payload>                    // global stream
  sync(handler) -> Effect<Unsubscribe>        // sync callback before PubSub
}
```

- Global `registry: Map<string, Definition>` stores all definitions
- Backed by Effect `PubSub` (unbounded)
- Sync handlers run synchronously before PubSub publish — ideal for persistence bridges
- Events carry optional `Location.Ref` (directory + workspaceID) for multi-project routing

#### Bus System (`packages/opencode/src/bus/bus-event.ts`, 45 lines)

The legacy in-process event bus:
```ts
BusEvent.define(type, properties)  // Schema.Top for property validation
// Event shape: { id, type, properties }
// Per-instance isolation via InstanceState
```

`GlobalBus` (`bus/global.ts`) bridges events across project instances.

#### Session Event Catalog (`packages/core/src/session-event.ts`, 402 lines)

27+ event types defined via `EventV2.define` with `aggregate: "sessionID"`, `version: 1`:

| Namespace | Events | Key Fields (all include Base: timestamp, sessionID) |
|---|---|---|
| SessionLifecycle | AgentSwitched, ModelSwitched, Prompted, Synthetic | agent, model, prompt |
| Shell | Shell.Started, Shell.Ended | callID, command, output |
| Step | Step.Started, Step.Ended, Step.Failed | agent, model, snapshot, cost, tokens, error |
| Text | Text.Started, Text.Delta, Text.Ended | delta, text |
| Reasoning | Reasoning.Started, Reasoning.Delta, Reasoning.Ended | reasoningID, delta, text |
| Tool | Tool.Input.Started/Delta/Ended, Tool.Called, Tool.Progress, Tool.Success, Tool.Failed | callID, name, tool, input, output, error |
| Retry | Retried | attempt, error: RetryError |
| Compaction | Compaction.Started/Delta/Ended | reason, text |

**Token schema:**
```ts
{ input: number, output: number, reasoning: number, cache: { read: number, write: number } }
```

**RetryError schema:**
```ts
{ message: string, statusCode?: number, isRetryable: boolean,
  responseHeaders?: Record<string, string>, responseBody?: string,
  metadata?: Record<string, string> }
```

**Relevance to agentwrap:** The EventV2 payload shape (`{ id, type, data, version?, metadata? }`) is the lean reference for the agentwrap `Event` envelope. The current agentwrap envelope adds fields (`Sequence`, `RunID`, `TurnID`, `CorrelationID`, `CauseEventID`, `Context`, `Category`) that have no EventV2 precedent. The `RetryError` schema with `statusCode`, `responseHeaders`, `responseBody` is a richer error model than agentwrap's boolean classification flags.

### 1.4 Session Data Model

**File:** `packages/opencode/src/session/session.ts` (1011 lines)

```ts
Session.Info = {
  id: SessionID,                          // branded string
  slug: string,                           // human-readable
  projectID, workspaceID?, directory, path?,
  parentID?: SessionID,                   // fork parent
  summary?: { additions, deletions, files, diffs? },
  cost?: number,
  tokens?: { input, output, reasoning, cache: { read, write } },
  share?: { url },
  title, agent?, version,
  model?: { id: ModelID, providerID: ProviderID, variant? },
  time: { created, updated, compacting?, archived? },
  permission?, revert?
}
```

Session lifecycle methods: `list`, `create`, `fork`, `touch`, `get`, `setTitle`, `setArchived`, `setPermission`, `setRevert`, `setSummary`, `diff`, `messages` (paginated, 50 at a time), `children`, `remove`.

**Relevance to agentwrap:** The `parentID` field for fork tracking is directly relevant to agentwrap's session continuation model. The `model: { id, providerID, variant? }` structure is the reference for provider/model metadata. Token tracking with cache breakdown is the canonical shape for usage data.

### 1.5 Runner State Machine

**File:** `packages/opencode/src/effect/runner.ts` (217 lines)

```ts
type State<A, E> =
  | { _tag: "Idle" }
  | { _tag: "Running"; run: RunHandle }
  | { _tag: "Shell"; shell: ShellHandle }
  | { _tag: "ShellThenRun"; shell: ShellHandle; run: PendingHandle }

interface Runner<A, E> {
  state: State<A, E>
  busy: boolean
  ensureRunning(work) -> Effect<A, E>          // queues or runs
  startShell(work, ready?) -> Effect<A, E | Busy>  // shell mode (rejects if busy)
  cancel -> Effect<void>
}

// Tagged errors
class Cancelled extends Schema.TaggedErrorClass<...>("RunnerCancelled", {}) {}
class Busy extends Schema.TaggedErrorClass<...>("RunnerBusy", {}) {}
```

**Transitions:**
- `Idle` → `Running` (via `ensureRunning`)
- `Idle` → `Shell` (via `startShell`, only from idle — `Busy` error otherwise)
- `Shell` → `ShellThenRun` (`ensureRunning` called while shell active — work queued)
- `ShellThenRun` → `Running` (shell finishes, queued run starts)
- Any state → `Idle` (via `cancel` or natural completion)

Cancellation interrupts fibers and fails `Deferred`s with `Cancelled`. Cleanup via `onInterrupt` callback.

**`SessionRunState`** (`session/run-state.ts`, 153 lines) wraps `Runner` with session semantics via `InstanceState` (per-directory scoped). `assertNotBusy` fails with `BusyError`, `cancel` cancels background jobs + runner.

**Relevance to agentwrap:** The 4-state Runner is the canonical reference. The agentwrap lifecycle (14 states including `health_checking`, `ready`, `retrying`, `fallback`, `validating`, `repairing`, `cleaned_up`) diverges significantly — policy concerns like retry/fallback/validation/repair are baked into state rather than composed as independent layers.

### 1.6 Processing Loop and Tool Lifecycle

**File:** `packages/opencode/src/session/processor.ts` (823 lines)

The processor consumes an `LLM.Stream` and translates events into session events and persisted parts:

| LLM Stream Event | Processor Action |
|---|---|
| `start` | Sets status to `busy` |
| `reasoning-start` | Creates `ReasoningPart`, publishes `Reasoning.Started` |
| `tool-input-start` | Creates `ToolPart` (pending), publishes `Tool.Input.Started` |
| `tool-call` | Updates ToolPart to `running`, publishes `Tool.Called`, checks doom loops |
| `tool-result` | Completes tool call, publishes `Tool.Success`, normalizes attachments |
| `tool-error` | Fails tool call, publishes `Tool.Failed` |
| `step-start` | Creates step-start part, captures snapshot, publishes `Step.Started` |
| `finish-step` | Computes cost/tokens, triggers summarization, checks overflow |
| `text-start/delta/end` | Creates/appends/finalizes `TextPart`, publishes `Text.Started/Delta/Ended` |

**Tool part states:** `pending → running → completed | error`

**Doom loop detection:** Same tool called 3+ times identically triggers intervention.

**Relevance to agentwrap:** The per-part state machine (`pending → running → completed | error`) is the reference for agentwrap's tool lifecycle. The `updateToolCall()`, `completeToolCall()`, `failToolCall()` methods are the exact seam for repair flow integration.

### 1.7 Retry System

**File:** `packages/opencode/src/session/retry.ts` (200 lines)

```ts
type Retryable = {
  message: string
  action?: {
    reason: RetryReason        // "free_tier_limit" | "account_rate_limit" | string
    provider: string
    title: string
    message: string
    label: string
    link?: string
  }
}
```

**Delay calculation:** `delay(attempt, error)` — respects `retry-after-ms` and `retry-after` headers, otherwise exponential backoff: `2000 * 2^(attempt-1)`, capped at 30s (no headers) or 32-bit signed int max (with headers).

**Error classification:** `retryable(error, provider)` — maps errors to `Retryable`:
- `ContextOverflowError` → NOT retryable (triggers compaction instead)
- `APIError` with 5xx → ALWAYS retryable
- Rate limit patterns (header + message text matching) → retryable with action
- `FreeUsageLimitError` → upsell action
- `Overloaded` → retryable with "Provider is overloaded" message

**Policy construction:** `policy(opts)` uses `Schedule.fromStepWithMetadata` — each step parses error, classifies, computes delay, calls `set()` callback which publishes `SessionEvent.Retried` with attempt number and error info.

**Notable gaps (from the study report):**
- No circuit breaker
- No maximum retry limit (retries indefinitely until `retryable()` returns `undefined`)
- Retry state is in-memory only (lost on process restart)

**Relevance to agentwrap:** OpenCode's retry is a simple function, not a policy framework. The `Retryable` type captures `{ message, action? }` — enough for the CLI to render actionable UI. The agentwrap `ResiliencePolicy`/`PolicyRunner`/`PolicyDecision`/`BackoffPolicy` system is architecturally more complex than the wrapped system it abstracts.

### 1.8 Configuration System

**File:** `packages/opencode/src/config/config.ts` (833 lines)

**Loading precedence (highest to lowest):**
1. `OPENCODE_CONFIG_CONTENT` env var (inline JSON/JSONC)
2. Project-local config files (`opencode.json[c]` in directory tree)
3. `OPENCODE_CONFIG` env var (file path)
4. Well-known remote config from auth providers
5. Cloud/Console config from active account organization
6. Managed config (MDM/mobileconfig on macOS)
7. Global user config (`~/.config/opencode/opencode.jsonc`)

**Key schema fields:** `model`, `small_model`, `default_agent`, `agent` (definitions), `provider` (API keys, base URLs), `mcp`, `permission`, `tools`, `experimental`, `compaction`, `plugin`, `logLevel`, `command` (custom commands), `instructions`, `formatter`, `lsp`, `tool_output` (truncation thresholds).

**Pattern:** Deep merge with `mergeConfigConcatArrays` (arrays concatenated and deduplicated for `instructions`). JSONC support via `jsonc-parser`. Config variable substitution: `$VAR`/`${VAR}` env expansion, `{{ }}` template syntax.

**Relevance to agentwrap:** OpenCode's config is JSON/JSONC file-based with deep merge. The agentwrap `ConfigLayer`/`ConfigValue[T]`/`ConfigSource` pattern with provenance tracking is a sound abstraction but does not model OpenCode's actual file-based loading chain.

### 1.9 SDK Client

**File:** `packages/sdk/js/src/v2/client.ts` (90 lines)

```ts
createOpencodeClient({ baseUrl, directory?, headers?, fetch? }): OpencodeClient

// Client methods organized by domain:
session.*       // list, create, fork, get, prompt, command, shell, abort, share, messages, remove
config.*        // get, update
event.subscribe  // SSE event stream
permission.reply // respond to permission requests
file.*, mcp.*, provider.*, project.*, pty.*, question.*, app.*, path.*
```

Header-based directory/workspace routing: `x-opencode-directory`, `x-opencode-workspace`. Request/response interceptors for timeout disabling, content-type checking, error wrapping.

**The `OpencodeServer` helper** (`packages/sdk/js/src/server.ts`) spawns `opencode serve` and parses the URL from stdout — proving the subprocess-launch pattern for headless operation.

**Relevance to agentwrap:** The factory-pattern entrypoint with typed domain methods is the reference for the agentwrap external API shape. The subprocess-launch pattern in `OpencodeServer` validates agentwrap's own subprocess management approach.

### 1.10 Instance State and Scoped State

**File:** `packages/opencode/src/effect/instance-state.ts`

```ts
InstanceState.make<A>(init: (ctx) => Effect<A>): InstanceState<A>
InstanceState.get(state): Effect<A>
InstanceState.use(state, select): Effect<B>
```

Per-directory scoped state via `ScopedCache` — each project directory gets its own isolated state, automatically cleaned up on disposal. Used for config, session run state, bus, and other per-project services.

**Relevance to agentwrap:** The per-directory scoping pattern validates agentwrap's runtime instance management approach. OpenCode's `ScopedCache`-backed `InstanceState` is the production-proven equivalent of agentwrap's runtime instance isolation.

---

## Part 2: Gap Analysis — agentwrap vs OpenCode Internals

### 2.1 Strong Alignment

| Area | agentwrap | OpenCode | Verdict |
|---|---|---|---|
| `--format json` consumption | `opencode/runtime.go` uses `run --format json`, parses JSON-lines | `cli/cmd/run.ts:592-605` produces `{type, timestamp, sessionID, ...data}` | **Correct** |
| Event type mapping | `projector.go:classify()` maps `step_start`, `step_finish`, `text`, `reasoning`, `tool_use`, `error` | `cli/cmd/run.ts:634-698` emits exact those types | **Correct** |
| Session continuation | `--session` flag with `SessionID` | `--continue`/`--session` session resumption | **Correct** |
| Cancellation | SIGTERM-then-SIGKILL with timeout | `Runner.cancel` via fiber interruption | **Functional** |
| Rate-limit detection | `rate_limit.go` handles headers, status codes, message text | `retry.ts` classifies rate limits via headers + text patterns | **Strong** |
| Fake runtime testing | `internal/testkit/fake_runtime.go` | No direct equivalent (Effect mocks used) | **Good** |
| JSONL fixtures | `internal/testkit/loadJSONL` | No direct equivalent | **Good** |

### 2.2 Over-Engineering (Divergence Without Justification)

| agentwrap | OpenCode | Gap |
|---|---|---|
| **14 lifecycle states**: initialized, health_checking, ready, starting, running, waiting, retrying, fallback, validating, repairing, completed, failed, cancelled, cleaned_up | **4 runner states**: Idle, Running, Shell, ShellThenRun | Policy concerns (retry, fallback, validation, repair) baked into lifecycle. Should be composed as independent layers on top of a simpler 4-state core. |
| **Event envelope**: 16 fields incl. Sequence, RunID, TurnID, CorrelationID, CauseEventID, Context, Category, Raw | **EventV2**: `{ id, type, data, version?, metadata? }` or **`--format json`**: `{ type, timestamp, sessionID, ...data }` | Extra fields add complexity without matching any opencode concept. `Category` duplicates `Type`. `CorrelationID`/`CauseEventID` are add-ons, not canon. |
| **Policy system**: ResiliencePolicy interface, PolicyRunner, PolicyDecision, BasicPolicy, BackoffPolicy (fixed + exponential), fallback alternatives | **Retry utility**: single `retry(fn, opts)` function with `attempts, delay, factor, maxDelay, retryIf` | Full decision framework when the wrapped system uses a simple function. Policy metadata recording and fallback alternatives are SDK inventions, not derivable from opencode. |
| **Error system**: SDKError with 4 boolean flags (Retryable, Fallbackable, UserActionable, Unrecoverable) + 13 ErrorCategory constants | **RetryError**: `{ message, statusCode, isRetryable, responseHeaders, responseBody, metadata }` | Lost structured provider response data (statusCode, headers, body). Boolean flags duplicate what a richer error schema would provide. |

### 2.3 Missed Simplicity Opportunities

| area | What opencode does | What agentwrap could do |
|---|---|---|
| **Lifecycle** | 4 states, tagged union | Replace 14-state string enum with a 4-state sum type (Idle, Running, Shell, ShellThenRun). Push retry/fallback/validation/repair into policy layer. |
| **Events** | `{type, timestamp, sessionID, ...data}` per JSON line | Remove `Category` (native Type suffices). Remove `Sequence`, `RunID`, `TurnID` unless the consuming layer proves they're needed. Use `Raw` with `Safe` flag only. |
| **Errors** | `{message, statusCode, isRetryable, responseHeaders, responseBody}` | Replace 4 boolean flags with structured provider response. Let the policy system classify based on data, not flags set at error-construction time. |
| **Policy** | `retry(fn, {attempts, delay, factor, maxDelay, retryIf})` | Collapse `ResiliencePolicy`/`PolicyRunner`/`PolicyDecision`/`BackoffPolicy` into configurable retry options. Add fallback as a separate concern only if caller demand emerges. |
| **IDs** | Branded schemas with sortable generation (`Identifier.ascending()`) | Use branded types that prevent cross-type assignment. Add generation format (e.g., `run_`, `evt_` prefixes). |

### 2.4 What's Correctly Missing

Some agentwrap features have no opencode precedent but are valuable SDK inventions:

| Feature | Rationale |
|---|---|
| **Redact** (`redact.go`) | No opencode counterpart, but essential for secure diagnostics output |
| **Config provenance** (`ConfigSource`, `ConfigLayer`) | OpenCode uses deep-merge JSON, not layered Go generics. The provenance tracking is a valid SDK concern. |
| **Health check interface** (`HealthChecker`, `CheckHealth`) | OpenCode has no preflight health check system. The adapter's probe-based approach (mapping to real CLI commands) is correct. |
| **Capabilities** (`runtime.go` Capabilities constants) | No opencode counterpart, but useful for multi-runtime feature discovery |
| **Metadata** (`RunMetadata` with 20 fields) | OpenCode tracks cost/tokens/model per step but not through a unified struct. The aggregation is a valid SDK concern. |

---

## Part 3: Key Lessons for Sprints 7+

### 3.1 What to Keep Doing

- **Consume `--format json` directly** — this is the correct seam and the adapter does it right
- **Map exact opencode event type names** — projector.go `classify()` is well-aligned
- **Use JSONL fixtures** — the testkit pattern matches opencode's actual output format
- **Subprocess lifecycle** — SIGTERM-then-SIGKILL with configurable timeout matches production patterns
- **Rate-limit detection** — rate_limit.go is thorough and tracks opencode's approach

### 3.2 What to Simplify

- **Lifecycle states**: Drop from 14 to 4 core states. Policy concerns (retry/fallback/validation/repair) belong in a separate policy layer, not in the state machine.
- **Event envelope**: Remove `Category`, `Sequence`, `RunID`, `TurnID` until a consuming layer proves they're needed. The native opencode event `Type` is sufficient for classification.
- **Error system**: Restructure `SDKError` to carry structured provider response data (statusCode, responseHeaders, responseBody) instead of pre-classified boolean flags. Let policy code classify, not error constructors.

### 3.3 OpenCode Internals References for Remaining Sprints

| Sprint | Key OpenCode Source | What to Use |
|---|---|---|
| **Sprint 7** (Validation/Repair) | `processor.ts:updateToolCall/completeToolCall/failToolCall` | Per-part state machine (`pending→running→completed|error`) for repair lifecycle |
| | `prompt.ts:StructuredOutput` tool | Schema-enforced output validation pattern |
| | `session.ts:fork/parentID` | Same-session continuation for repair |
| **Sprint 8** (Observability) | `session-event.ts:Step.Ended` (cost, tokens) | Token/cost capture schema |
| | `session.ts:Info` | Canonical metadata shape |
| | `event.ts:sync()` | Persistence hook pattern |
| **Sprint 9** (Interface Review) | `sdk/js/v2/client.ts` | Factory-pattern entrypoint for optional CLI surface |
| | `cli/cmd/run.ts` effectCmd pattern | Thin CLI bridge that delegates to SDK, no business logic |
| **Sprint 10** (Second Runtime) | `sdk/js/v2/client.ts` HTTP contract | REST/SSE as alternative runtime protocol |
| | `instance-state.ts` | Per-instance isolation pattern |
| **Sprint 11** (UltraPlan Integration) | `session.ts:fork/parentID` | Session tree navigation for multi-step workflows |
| | `session-event.ts:All` tagged union | Complete event catalog for dashboard filters |
| | `event.ts:subscribe(definition)` | Typed event consumption without log parsing |

---

## Part 4: Source Reference Index

### OpenCode Source Files Referenced

| File | Path | Relevance |
|---|---|---|
| `run.ts:592-605` | `packages/opencode/src/cli/cmd/run.ts` | `--format json` emit() function — canonical wire format |
| `run.ts:611+` | `packages/opencode/src/cli/cmd/run.ts` | Event subscription loop — consumer API pattern |
| `runner.ts:33-37` | `packages/opencode/src/effect/runner.ts` | 4-state Runner state machine |
| `runner.ts:11-12` | `packages/opencode/src/effect/runner.ts` | Cancelled and Busy tagged errors |
| `event.ts:34-59` | `packages/core/src/event.ts` | EventV2.define() and Payload shape |
| `event.ts:84-153` | `packages/core/src/event.ts` | EventV2.Service with publish/subscribe/sync |
| `session-event.ts` | `packages/core/src/session-event.ts` | Full 27+ event catalog, token/cost schemas |
| `session.ts` | `packages/opencode/src/session/session.ts` | Session.Info schema, fork/parentID |
| `processor.ts` | `packages/opencode/src/session/processor.ts` | Processing loop, tool part lifecycle |
| `retry.ts:13-23` | `packages/opencode/src/session/retry.ts` | Retryable type with action |
| `retry.ts:67-151` | `packages/opencode/src/session/retry.ts` | retryable() classification function |
| `retry.ts:175-198` | `packages/opencode/src/session/retry.ts` | Effect Schedule retry policy |
| `config.ts` | `packages/opencode/src/config/config.ts` | Config loading chain and schema |
| `client.ts` | `packages/sdk/js/src/v2/client.ts` | External SDK client factory |
| `instance-state.ts` | `packages/opencode/src/effect/instance-state.ts` | Per-directory scoped state |
| `bus-event.ts` | `packages/opencode/src/bus/bus-event.ts` | Legacy bus event system |
| `handlers/event.ts` | `packages/opencode/src/server/handlers/event.ts` | SSE streaming endpoint |
| `sync/index.ts:167-183` | `packages/opencode/src/sync/index.ts` | SyncEvent immediate transaction projection |

### AgentWrap Source Files Referenced

| File | Assessment |
|---|---|
| `events.go` | Event envelope — over-engineered (16 fields, 18 categories vs opencode's 4-field EventV2) |
| `lifecycle.go` | Lifecycle states — over-engineered (14 states vs opencode's 4) |
| `policy.go` | Policy system — over-engineered (full decision framework vs simple retry function) |
| `errors.go` | Error system — over-engineered (4 boolean flags vs structured provider response) |
| `opencode/runtime.go` | OpenCode adapter — **strong alignment** with `--format json` |
| `opencode/projector.go` | Event classification — **strong alignment** with exact opencode type names |
| `opencode/rate_limit.go` | Rate-limit detection — **strong alignment** with opencode patterns |
| `opencode/health.go` | Preflight health — **good**, maps to real opencode CLI commands |
| `opencode/decoder.go` | JSON-lines decoder — **correct** |
| `opencode/process.go` | Subprocess management — **correct** |
| `internal/testkit/fake_runtime.go` | Test harness — **good** |
| `ids.go` | ID types — **weak** (plain aliases, no branding or generation) |
| `config.go` | Config system — **independent invention**, sound pattern but not from opencode |
| `redact.go` | Redaction — **independent invention**, valuable for secure diagnostics |
| `metadata.go` | Metadata — **independent invention**, well-structured |

---

*Generated from direct source analysis of `studies/opencode-wrap-study/sources/opencode/` (TypeScript) and `/home/antonioborgerees/coding/agentwrap/` (Go).*
