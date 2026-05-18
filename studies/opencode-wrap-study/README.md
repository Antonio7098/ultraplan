# opencode-wrap-study

A focused comparative study for designing a Go library that wraps agent runtimes, starting with OpenCode and leaving room for Codex, Claude Code, ACP-compatible runtimes, and direct provider integrations later.

The target library is an SDK primitive, not an UltraPlan-specific framework. UltraPlan, 24-hour-testers, and other tools should use it to start runtime sessions, consume structured events, apply retry/fallback policies, validate outputs, and project progress without knowing runtime internals.

## Study Dimensions

### 1. Runtime Contract and API Shape

Find the smallest useful public Go API. Study runtime/session/turn abstractions, typed events, artifacts, errors, usage metadata, versioning, and where runtime-specific details should or should not leak.

Core question: could the same caller use OpenCode now and another runtime later without redesigning the app?

### 2. Process and Session Lifecycle

Study how runtimes are started, supervised, cancelled, resumed, and cleaned up. For OpenCode, prioritize `opencode run --format json`, structured event decoding, stderr diagnostics, timeout/cancel behavior, and process cleanup.

Core question: if the runtime emits malformed JSON, hangs, exits early, or is cancelled, do we know exactly what the SDK reports?

### 3. Resilience, Fallback, and Validation

Study health checks, provider/model validation, rate limit handling, retry/backoff/fallback policy, output validation, repair loops, checkpoints, and explicit failure classification.

Core question: can callers compose policies like `retry -> fallback -> validate -> repair -> retry` without hard-coding a product-specific flow?

### 4. Workflow Composition and Observability

Study how runtime events become workflow progress, durable state, logs, dashboards, metrics, costs, token usage, artifacts, and auditable decisions.

Core question: could UltraPlan show all active agents, progress, cost, model/provider metadata, and outputs by consuming canonical events only?

## Current Sources

| Source | Why It Matters |
| ------ | -------------- |
| `opencode` | Primary source. Study OpenCode's SDK, server/client model, JSON event output, provider/model handling, permissions, sessions, and runtime behavior. |
| `sdk-go` | Temporal Go SDK reference. Study durable workflow APIs, activities, retries, cancellation, metadata, and long-running orchestration boundaries. |
| `t3code` | Best comparator. Study provider adapters, OpenCode integration, ACP support, event projection, orchestration, persistence, and multi-runtime boundaries. |

## Non-Goals

This study is not trying to design all of UltraPlan:

- Study dimensions, source scoring, and synthesis templates.
- PRD/TRD/feature/sprint document models.
- Product-specific run directories and report formats.
- Repository search and source discovery.
- YouTube/article ingestion.

The runtime wrapper should provide the primitives those features need: sessions, events, artifacts, validation hooks, policy hooks, metadata, and lifecycle control.

## Expected Go Library Shape

The study should inform a package shaped roughly like this:

```go
type Runtime interface {
    Health(ctx context.Context) (HealthReport, error)
    Start(ctx context.Context, req StartRequest) (Session, error)
    Run(ctx context.Context, req RunRequest) (<-chan Event, error)
}

type Session interface {
    ID() string
    Send(ctx context.Context, req TurnRequest) (<-chan Event, error)
    Cancel(ctx context.Context) error
    Close(ctx context.Context) error
}

type Event struct {
    ID        string
    Type      EventType
    Runtime   string
    SessionID string
    RunID     string
    Provider  string
    Model     string
    Usage     *Usage
    Artifact  *ArtifactRef
    Payload   json.RawMessage
    Time      time.Time
}
```

This is only a sketch. The study should decide the real surface area.

## Design Bias

Prefer boring, typed Go primitives:

- `context.Context` for cancellation and deadlines.
- Interfaces at runtime/provider boundaries, not everywhere.
- `encoding/json` or generated schemas for native event decoding.
- Explicit error types for health, config, rate limit, runtime exit, malformed event, validation, and cancellation failures.
- Durable metadata that higher-level tools can inspect without parsing logs.

Keep the first implementation small: OpenCode JSON mode, canonical events, health check, cancellation, validation hook, retry/fallback policy hook, and enough state for a caller to build a dashboard.
