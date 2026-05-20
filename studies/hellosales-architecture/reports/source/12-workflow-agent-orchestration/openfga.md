# Source Analysis: openfga

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA is a high-performance **ReBAC (Relationship-Based Access Control)** authorization engine inspired by Google Zanzibar. It evaluates graph-based authorization queries using set operations (union, intersection, exclusion). **It is not a workflow/orchestration system.** The system processes authorization Check, ListObjects, ListUsers, and Write requests, but does not orchestrate multi-step workflows. The only graph-based execution occurs within single-request authorization resolution, not across multiple stages or agents.

## Rating

**2/10** — **Poor fit for Workflow / Agent Orchestration**

OpenFGA is fundamentally an authorization engine, not a workflow orchestrator. It has no workflow definition DSL, no multi-step workflow execution, no state persistence for workflow resumption, no checkpointing, and no compensation (Saga) patterns. The "workflow" dimension is completely absent from this system's design.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Authorization Model DSL | Authorization models define permissions, not workflows. Models use `type`, `relations`, and `define` keywords for ReBAC | `pkg/typesystem/typesystem.go:1-200` |
| Graph Resolution | Single-request graph traversal for authorization checks via `LocalChecker.ResolveCheck()` | `internal/graph/check.go:395-472` |
| Pipeline Architecture | ListObjects uses internal pipeline of workers for reverse expansion, but this is authorization resolution, not workflow orchestration | `internal/listobjects/pipeline/pipeline.go:120-131` |
| Worker Subscription Model | Workers subscribe to edges forming a directed graph, DFS-based construction | `internal/listobjects/pipeline/pipeline.go:340-362` |
| Cycle Detection | Graph resolution includes cycle detection for recursive authorization | `internal/graph/check.go:419-428` |
| Timeout Handling | Request-level timeouts via Go context (`upstreamTimeout`, `listObjectsDeadline`) | `internal/graph/check.go:54` |
| Error Cancellation | Context cancellation propagates through resolution chain | `internal/graph/check.go:399-401` |
| No Workflow Persistence | No evidence of workflow state persistence or checkpoint/recovery | N/A |
| No Compensation Logic | No Saga or rollback patterns for partial failures | N/A |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**No evidence found.** OpenFGA does not support multi-step workflows. It has an authorization model DSL (`model/schema 1.1` format) that defines object types, relations, and permission rules using rewrite operators (Userset_This, Userset_ComputedUserset, Userset_TupleToUserset, Userset_Union, Userset_Intersection, Userset_Difference). These models define *permission relationships*, not workflows. Requests are single-shot authorization queries (Check, ListObjects, ListUsers, Write) that resolve immediately without workflow execution.

The "pipeline" in `internal/listobjects/pipeline/pipeline.go:120-131` is an internal optimization for the ListObjects reverse expansion algorithm, not a workflow definition or execution engine.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**No evidence found.** OpenFGA has no checkpointing or resumability mechanism. Authorization requests are atomic and stateless — a Check request either completes with a result or fails with an error. There is no concept of partial execution state that could be resumed. If a request is interrupted (context cancelled), the resolution simply terminates without recovery.

The `Pipeline` struct in `internal/listobjects/pipeline/pipeline.go:120-131` has a `Close()` method that drains buffered output and waits for workers, but this is cleanup not resumption.

### 3. How are parallel workflow branches coordinated and joined?

**Partial evidence.** OpenFGA has set operation reducers (`union`, `intersection`, `exclusion`) in `internal/graph/check.go:158-374` that coordinate parallel resolution of authorization subproblems:

- `union()` - short-circuits on first `Allowed: true` (line 207)
- `intersection()` - short-circuits on first `Allowed: false` (line 276)
- `exclusion()` - evaluates base and subtract in parallel (lines 307-316)

The ListObjects pipeline uses a worker subscription model (`internal/listobjects/pipeline/pipeline.go:340-345`) where workers subscribe to edges, and results stream to downstream listeners. However, this is parallel graph traversal for a single authorization query, not multi-step workflow branches.

### 4. How does the system handle workflow-level timeouts and cancellations?

**Partial evidence.** OpenFGA uses Go context for timeout and cancellation:

- `upstreamTimeout` in `LocalChecker` (`internal/graph/check.go:54`)
- `listObjectsDeadline` configurable per request (`pkg/server/commands/list_objects.go:513-517`)
- Context cancellation propagates through the resolver chain (`internal/graph/check.go:399-401`)
- Resolution depth limit (`maxResolutionDepth`) terminates deeply nested resolution (`internal/graph/check.go:415-417`)

However, there is **no workflow-level timeout** because there are no workflows. These are request-level timeouts for single authorization queries.

### 5. Is there compensation logic for partial workflow failures?

**No evidence found.** OpenFGA does not have Saga or compensation patterns. Write operations (`Write` command in `pkg/server/commands/write.go`) are atomic — tuples are either all written or none are. There is no rollback or compensation for partial failures because the system does not support multi-step transactions that could partially fail.

The exclusion set operation (`internal/graph/check.go:293-374`) computes `base - subtract`, but this is a set operation on authorization results, not a compensation mechanism.

## Architectural Decisions

1. **Authorization Model over Workflow Model**: OpenFGA chose to model permissions (ReBAC) rather than workflows. This is evident in the authorization model DSL which focuses on `type`, `relations`, and `define` rather than steps, tasks, or agents.

2. **Resolver Chain Pattern**: The `CheckResolver` interface (`internal/graph/interface.go:13-41`) uses a circular linked list chain for composable resolution layers (caching, throttling, shadow testing). This is a middleware pattern, not a workflow pattern.

3. **Thompson Sampling for Strategy Selection**: The planner (`internal/planner/`) uses Thompson Sampling to select between resolution strategies based on observed reward signals. This is for query optimization, not workflow routing.

4. **Worker Graph for ListObjects**: The ListObjects pipeline (`internal/listobjects/pipeline/`) uses a directed graph of workers that communicate via channels. This is architecturally similar to a workflow engine's task graph, but it executes a single authorization algorithm (reverse expansion with Check), not a multi-step business process.

## Notable Patterns

1. **Graph-Based Authorization Resolution**: The core `LocalChecker` (`internal/graph/check.go`) traverses authorization graphs by recursively resolving relationships using set operations. This is not a workflow pattern but an authorization algorithm.

2. **Pipeline Worker Pattern** (`internal/listobjects/pipeline/internal/worker/core.go:32-41`): Workers process messages from upstream senders, transform through an Interpreter, and broadcast to downstream listeners. Uses message pooling for efficiency.

3. **Cycle Detection Group** (`internal/listobjects/pipeline/internal/worker/cycle.go`): Manages cyclical graph edges during pipeline construction to prevent infinite loops in recursive authorization models.

4. **Set Operation Reducers**: `union`, `intersection`, and `exclusion` functions in `internal/graph/check.go:158-374` that coordinate parallel subproblem resolution with concurrency limiting.

## Tradeoffs

1. **Authorization Focus vs. Workflow Capability**: OpenFGA optimizes for correct, performant authorization evaluation at the cost of workflow/orchestration features. It is not designed to orchestrate multi-step business processes.

2. **Stateless Request/Response vs. Long-Running Workflows**: Each authorization request is stateless and self-contained. There is no mechanism for tracking workflow state across multiple steps or resuming interrupted workflows.

3. **Single-Query Resolution vs. Multi-Agent Coordination**: Authorization resolution may involve recursive graph traversal, but it does not involve multiple autonomous agents coordinating toward a shared goal.

4. **Atomic Writes vs. Saga Transactions**: Tuple writes are atomic. For scenarios requiring multi-step transactions with compensation, OpenFGA would need to be combined with an external workflow engine.

## Failure Modes / Edge Cases

1. **Resolution Depth Exceeded**: If graph traversal exceeds `maxResolutionDepth`, returns `ErrResolutionDepthExceeded` (`internal/graph/check.go:415-417`).

2. **Cycle Detection**: Cycles in authorization models are detected and return `CycleDetected: true` in response (`internal/graph/check.go:419-428`).

3. **Context Cancellation**: If request context is cancelled (timeout or client disconnect), resolution terminates immediately without partial results.

4. **No Partial Results**: Unlike a workflow engine that might return partial results on failure, OpenFGA authorization queries either succeed completely or fail with an error.

## Future Considerations

OpenFGA has no stated plans to become a workflow orchestration system. Its roadmap focuses on:
- Performance optimizations for authorization resolution
- Storage backend improvements
- Additional SDKs and language support
- Weighted graph optimizations

For workflow orchestration, OpenFGA would need to be paired with a dedicated workflow engine (e.g., Temporal, Conductor).

## Questions / Gaps

1. **Workflow Definition**: Does OpenFGA have any workflow definition capability? **No.** It has authorization model definitions only.

2. **State Persistence**: Does OpenFGA persist workflow state? **No.** It persists authorization state (relationship tuples), not workflow state.

3. **Checkpoint/Resume**: Can interrupted workflows resume? **No.** Requests are atomic and stateless.

4. **Saga/Compensation**: Does OpenFGA support compensation for partial failures? **No.** Writes are atomic.

5. **Multi-Agent Coordination**: Does OpenFGA coordinate multiple agents? **No.** It is a single-service authorization engine.

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `openfga`.
