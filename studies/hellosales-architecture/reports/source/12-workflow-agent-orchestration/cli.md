# Source Analysis: cli

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-20 |

## Summary

The `cli` source is the **GitHub CLI (`gh`)**, a command-line client for GitHub. It does **not** implement a local workflow/orchestration engine. Instead it:

1. Wraps the **GitHub Actions Workflow API** (`workflow run`, `workflow list`, etc.) — these are thin API clients that trigger/list/view remote GitHub Actions workflows, not a local execution engine.
2. Wraps the **GitHub Copilot Agents API (CAPI)** via the `agent-task` command family — these create agent sessions, poll for state, stream logs, and display results.

All actual workflow execution, state persistence, checkpointing, retry, and compensation happen on GitHub's backend. The CLI is purely a client.

## Rating

**2 / 10** — Near-absent for local workflow orchestration

The CLI has no local workflow execution engine. For GitHub Actions workflows it is a passthrough client. For Copilot agent tasks it manages session lifecycle via CAPI polling but delegates all step execution, state, and fault-tolerance to the backend.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workflow dispatch (GitHub Actions) | `workflow run` sends `workflow_dispatch` event via REST API; no local step execution | `pkg/cmd/workflow/run/run.go:1-120` |
| Agent task session model | `Session` struct with `State` field managed by backend | `pkg/cmd/agent-task/capi/sessions.go:29-53` |
| Session state machine | States: `queued`, `in_progress`, `completed`, `failed`, `idle`, `waiting_for_user`, `timed_out`, `cancelled` | `pkg/cmd/agent-task/shared/display.go:28-49` |
| Job/session creation | `CreateJob()` POST to CAPI `agents/swe/v1/jobs` | `pkg/cmd/agent-task/capi/job.go:58-128` |
| Log streaming renderer | `LogRenderer.Follow()` polls `GetSessionLogs()` every 5s and renders SSE `chat.completion.chunk` entries | `pkg/cmd/agent-task/shared/log.go:29-54` |
| Backoff retry on job polling | Exponential backoff (10s max, 300ms initial, 1.5x multiplier) when polling for PR number | `pkg/cmd/agent-task/create/create.go:217-222` |
| CAPI client interface | `CapiClient` interface: `CreateJob`, `GetJob`, `GetSession`, `GetSessionLogs`, `ListSessionsByResourceID` | `pkg/cmd/agent-task/capi/client.go:13-21` |
| Workflow list command | `workflow list` fetches workflow definitions via REST `repos/{owner}/{repo}/actions/workflows` | `pkg/cmd/workflow/list/list.go` |
| No DAG execution engine | CLI never evaluates or executes YAML workflow definitions locally | No evidence (searched `dag`, `workflow engine`, `step execution`) |
| No local state persistence | CLI holds no workflow state between invocations | No evidence |
| No compensation/rollback | No files contain `rollback`, `compensation`, or `compensate` | grep search returned no matches |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**No local multi-step workflow engine.** For GitHub Actions (`workflow run`), the workflow is defined in YAML files stored in `.github/workflows/` in the repository. The CLI reads this YAML to determine inputs, but the workflow itself is **executed by GitHub Actions runners** — the CLI merely triggers the `workflow_dispatch` event via the GitHub REST API (`pkg/cmd/workflow/run/run.go`). There is no local workflow definition DSL or execution runtime.

For Copilot agent tasks (`agent-task create`), the "workflow" is implicitly defined by the agent's reasoning loop. The CLI provides only a `problem_statement` string and receives back a session with logs. There is no step-level definition.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**No resumability in the CLI.** If a `workflow run` is interrupted (e.g., user kills the process), the workflow continues on GitHub's infrastructure but the CLI has no mechanism to reconnect and observe progress — the user must re-run `gh run watch` or query `gh run list`. For `agent-task` sessions, the CLI polls `GetSessionLogs()` and can display the accumulated log stream (`log.go:31-54`), but the CLI itself does not store checkpoints or support reconnecting to a paused session.

### 3. How are parallel workflow branches coordinated and joined?

**No parallel branch coordination.** The CLI does not model parallel execution internally. For GitHub Actions, parallel steps and job matrixes are handled by GitHub Actions' YAML runner (executed remotely). For agent tasks, multiple sessions can exist concurrently (via `ListSessionsByResourceID`), but the CLI does not orchestrate branching or joins — it simply lists all sessions.

Parallel HTTP requests do exist in other parts of the CLI (e.g., `status.go:260` splits by endpoint; `skills/search/search.go:277` runs content/path/owner searches in parallel), but this is concurrent I/O, not workflow DAG execution.

### 4. How does the system handle workflow-level timeouts and cancellations?

**Backend-handled with limited CLI awareness.** For `agent-task`, the backend reports session states including `timed_out` and `cancelled` (`display.go:42-45`), which the CLI displays. The CLI itself does not enforce timeouts — the 10-second backoff in `create.go:218` is a timeout for **polling** (waiting for PR to be created), not a workflow execution timeout. Cancellation (`gh run cancel`) is sent as an API request to GitHub Actions (`pkg/cmd/run/cancel/cancel.go`), but the actual cancellation happens remotely.

### 5. Is there compensation logic for partial workflow failures?

**No compensation logic.** There is no saga pattern, no compensation transactions, and no rollback mechanism in the CLI. If a Copilot agent task fails mid-execution, the session state becomes `failed` and the user receives an error message. GitHub Actions may or may not have retry/rollback for a given workflow — that is a property of the remote YAML definition, not the CLI.

## Architectural Decisions

1. **Thin API client only**: The CLI never executes workflows locally. All execution is delegated to GitHub (Actions runners) or Copilot (agent backend). This keeps the CLI simple but means it has no visibility into step-level progress, no granular error recovery, and no coordination of parallel tasks.

2. **Polling over streaming**: Agent session logs are fetched via periodic HTTP polling every 5 seconds (`defaultLogPollInterval` in `create.go:24`), not WebSocket or SSE push. This is simple to implement but adds latency and polling overhead.

3. **State in backend**: Session and job state (`Session.State`, `Job.Status`) is maintained by the CAPI backend. The CLI only reads and displays this state, it does not own or persist workflow state.

4. **Exponential backoff for polling**: When waiting for a PR to be created by an agent, `fetchJobWithBackoff()` uses exponential backoff (max 10s) to avoid hammering the API (`create.go:217-222`). This is retry-at-step only in the narrow sense of "polling until PR appears."

## Notable Patterns

- **Log Renderer as Streaming Display**: `LogRenderer.Follow()` continuously fetches logs, diffs against last known state (`log.go:32-53`), and renders SSE-parsed `chat.completion.chunk` entries — but this is display-only, not workflow control.
- **CAPI as a well-scoped interface**: `CapiClient` interface (`client.go:13-21`) cleanly isolates all Copilot API interactions, making testing via mocks straightforward.
- **Environment-based agent detection** (`internal/agents/detect.go`): Detects which AI tool is running via env vars, purely observational.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No local execution engine | Zero implementation burden for step execution; CLI is thin and maintainable; but no visibility into step-level progress |
| State delegated to backend | Simple state management; CLI stays stateless between invocations; but no offline resume or checkpoint |
| Polling every 5s | Simple, HTTP-friendly, no server push requirement; but latency between log updates and potential API rate limits |
| No compensation/rollback | CLI complexity stays low; but partial failures leave user to manually inspect and retry |

## Failure Modes / Edge Cases

1. **Polling timeout on job creation**: If the PR is not created within 10 seconds of backoff, `fetchJobWithBackoff()` returns `(nil, nil)` and the user gets a fallback URL (`create.go:256`). The agent may still be running but the CLI has given up.

2. **Session state not reconnectable**: If the CLI process is killed while following logs (`Follow()` loop), the session continues server-side but the CLI cannot reconnect — the user must re-run `gh agent-task view` to see accumulated logs.

3. **Malformed SSE log entries silently skipped**: `renderLogEntry()` skips any SSE line that doesn't unmarshal to `chatCompletionChunkEntry` with `object == "chat.completion.chunk"` (`log.go:77-78`). New log entry types are silently ignored.

4. **No circuit breaker or rate-limit awareness**: The CAPI transport adds auth headers but has no rate-limit backoff; HTTP errors surface as plain errors.

5. **No workflow cancellation guarantee**: `gh run cancel` sends a cancellation request but GitHub Actions handles the actual cancellation. If the runner is already finishing, cancellation may not be instantaneous.

## Future Considerations

- A local workflow execution engine (DAG-based) would require defining a workflow DSL, a state store, a step executor, and a checkpoint mechanism. This would be a substantial new subsystem.
- Session resumption would require persisting session IDs and log cursors locally (e.g., in `~/.config/gh/`), then reconnecting on subsequent invocations.
- Step-level retry would require the CLI to track step completion and expose retry-from-step semantics, either via a local state machine or by delegating to a backend that supports it.
- Parallel branch coordination would require a proper DAG runtime with fan-out/fan-in join semantics.

## Questions / Gaps

| Question | Answer |
|----------|--------|
| Is there a local workflow execution engine? | **No** — all execution is remote (GitHub Actions or Copilot backend) |
| Is there state persistence or checkpointing? | **No** — CLI is stateless between invocations; state is in the backend |
| Is there resumability after interruption? | **No** — no mechanism to reconnect to an in-progress session |
| Is there step-level retry? | **Only** for polling operations (job PR creation), not for workflow steps |
| Is there parallel branch coordination? | **No** — no local DAG model |
| Is there compensation/rollback logic? | **No** — no saga pattern, no compensation |
| Is there workflow-level timeout enforcement? | **No** — timeouts are handled by the backend |

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `cli`.