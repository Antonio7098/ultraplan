# opencode-wrap-study

A focused comparative study for designing a Go library that wraps agent runtimes, starting with OpenCode and leaving room for Codex, Claude Code, ACP-compatible runtimes, and direct provider integrations later.

The target library is an SDK primitive, not an UltraPlan-specific framework. UltraPlan, 24-hour-testers, and other tools should be able to use it to start runtime sessions, consume structured events, apply retry/fallback policies, validate outputs, and project progress without knowing runtime internals.

## Study Goal

Design the foundations for a Go runtime wrapper library that can:

- Run OpenCode through its structured JSON mode (`opencode run --format json`).
- Decode native runtime events into a canonical Go event model.
- Expose a stable API for sessions, runs, turns, artifacts, errors, usage, and lifecycle state.
- Support graceful failure handling: health checks, rate limits, retries, fallbacks, validation, and repair loops.
- Feed higher-level workflows without becoming the workflow product itself.

## Repository Layout

```
opencode-wrap-study/
├── sources/                        # Cloned reference repos
│   ├── opencode/                   # Primary runtime and SDK target
│   ├── sdk-go/                     # Temporal Go SDK workflow reference
│   ├── go-plugin/                  # Subprocess lifecycle, handshake, RPC boundary design
│   └── t3code/                     # Multi-runtime wrapper reference
├── dimensions/                     # Study dimensions (formerly study-areas/)
│   ├── 01-runtime-contract-and-api-shape.md
│   ├── 02-process-session-lifecycle.md
│   ├── 03-resilience-fallback-and-validation.md
│   └── 04-workflow-composition-and-observability.md
├── reports/
│   ├── sources/                    # Per-source analyses by dimension
│   └── final/                      # Synthesized reports by dimension
└── summary.csv                     # Score summary
```

Ultraplan shared resources (at `ultraplan/` root):

```
ultraplan/
├── prompts/                        # Shared execution prompts
│   ├── base.md
│   └── synthesize.md
├── templates/                      # Shared output templates
│   ├── repo-analysis.md
│   └── report.md
└── config.json                     # Shared model configuration
```

## Current Sources

| Source | Why It Matters |
| ------ | -------------- |
| `opencode` | Primary source. Study OpenCode's SDK, server/client model, JSON event output, provider/model handling, permissions, sessions, and runtime behavior. |
| `sdk-go` | Temporal Go SDK reference. Study durable workflow APIs, activities, retries, cancellation, metadata, and long-running orchestration boundaries. |
| `t3code` | Best comparator. Study provider adapters, OpenCode integration, ACP support, event projection, orchestration, persistence, and multi-runtime boundaries. |

## Recommended Additions

Keep the first study to fewer than 4 sources. Add at most one:

| Source | Why Add It |
| ------ | ---------- |
| `hashicorp/go-plugin` | Go subprocess/runtime boundary reference for process lifecycle, handshake, RPC boundaries, supervision, cleanup, and plugin-style adapter separation. |

Useful alternates if the study shifts:

| Source | Use When |
| ------ | -------- |
| `inngest/inngestgo` | You want more focus on developer-friendly durable step APIs, throttling, retries, and function orchestration. |
| `dagger/dagger` | You want more focus on Go workflow composition over external execution graphs and live progress. |

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

## Non-Goals

This study is not trying to design all of UltraPlan. Keep these outside the runtime wrapper unless a lower-level primitive is clearly needed:

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

## CLI Usage

Run from the ultraplan root.

```bash
# List available studies
bun run cli/src/index.ts list

# List sources and dimensions for this study
bun run cli/src/index.ts opencode-wrap-study list

# Study one dimension against one source
bun run cli/src/index.ts opencode-wrap-study run 01 opencode

# Run all dimension × source combinations
bun run cli/src/index.ts opencode-wrap-study run-all --parallel 2

# Stateful batch runner with retry/backoff
bun run cli/src/index.ts opencode-wrap-study run-loop --batch-size 2
```

### Options

| Flag | Description |
| ---- | ----------- |
| `--model <model>` | Model override. Defaults come from `ultraplan/config.json`. |
| `--variant <effort>` | Model variant, such as `high`, `max`, or `minimal`. |
| `--parallel N` | Max parallel invocations. |
| `--batch-size N` | Max concurrent tasks for `run-loop`. |
| `--dry-run` | Print generated prompts without executing. |
| `--timeout <ms>` | Per-task timeout in milliseconds. |
| `--dimensions "01,03"` | Filter dimensions. |
| `--sources "opencode,t3code"` | Filter sources. |

The runner invokes OpenCode with structured output:

```text
opencode run ... --format json
```

The study target library should parse that structured stream instead of treating stdout as free-form text.

## How It Works

1. The CLI discovers sources under `sources/`.
2. The CLI discovers dimensions under `dimensions/`.
3. Each dimension × source pair gets its own `opencode run` invocation.
4. The agent reads the inlined prompt containing base instructions and the selected dimension.
5. The agent writes per-source analysis to `reports/source/{NN}-{dimension}/{source}.md`.
6. After all sources finish for a dimension, synthesis writes `reports/final/{NN}-{dimension}.md`.

## Evidence Rules

Every claim in a report should be backed by source evidence:

- Use file paths and line numbers.
- Prefer implementation, tests, schemas, and public interfaces over README claims.
- Distinguish implemented behavior from inferred intent.
- State `No evidence found` when a question cannot be answered within the source.

## Output Structure

```
reports/
├── sources/
│   ├── 01-runtime-contract-and-api-shape/
│   │   ├── opencode.md
│   │   └── t3code.md
│   └── ...
└── final/
    ├── 01-runtime-contract-and-api-shape.md
    └── ...
```

## Design Bias

Prefer boring, typed Go primitives:

- `context.Context` for cancellation and deadlines.
- Interfaces at runtime/provider boundaries, not everywhere.
- `encoding/json` or generated schemas for native event decoding.
- Explicit error types for health, config, rate limit, runtime exit, malformed event, validation, and cancellation failures.
- Durable metadata that higher-level tools can inspect without parsing logs.

Keep the first implementation small: OpenCode JSON mode, canonical events, health check, cancellation, validation hook, retry/fallback policy hook, and enough state for a caller to build a dashboard.
