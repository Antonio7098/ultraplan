# Source Analysis: milvus

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus is a vector database, not a workflow/orchestration system. It does not implement a general-purpose workflow engine, DAG execution model, or agent orchestration framework. Instead, it provides internal task scheduling for database operations (compaction, indexing, segment loading) through simple state machines. These internal tasks are **not** designed as multi-step workflows with resumability, checkpointing, or compensation semantics — they are bounded operations with basic retry logic.

## Rating

**3/10** — Poor fit for workflow orchestration. Milvus has internal task management (priority queues, state machines, basic retries) but lacks fundamental workflow orchestration capabilities: no DAG-based execution, no checkpointing/resumability for interrupted tasks, no parallel branch coordination, no compensation/Saga patterns, and no workflow-level timeout/cancellation semantics beyond individual task boundaries.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Task definition interface | `CompactionTask` interface with `Process() bool` state machine method | `internal/datacoord/compaction_task.go:24-48` |
| Task state persistence | `compactionTaskMeta` persists tasks via `SaveCompactionTask` to catalog | `internal/datacoord/compaction_task_meta.go:168-177` |
| Task retry logic | `mixCompactionTask.Process()` handles `failed` and `timeout` states | `internal/datacoord/compaction_task_mix.go:267-289` |
| Task priority queue | `CompactionQueue` with heap-based priority scheduling | `internal/datacoord/compaction_queue.go:36-75` |
| Global task scheduler | `globalTaskScheduler` manages pending/running tasks with `schedule()` loop | `internal/datacoord/task/global_scheduler.go:91-133` |
| Task step-based execution | `baseTask.Step()` and `baseTask.StepUp()` track action progression | `internal/querycoordv2/task/task.go:273-279` |
| Action-based task model | `SegmentTask` and `ChannelTask` contain ordered `[]Action` slices | `internal/querycoordv2/task/task.go:73-111` |
| Task state transitions | `TaskStatusCreated/Started/Succeeded/Canceled/Failed` states | `internal/querycoordv2/task/task.go:44-50` |
| No workflow-level timeout | Context timeout per-task but no workflow-level timeout coordination | `internal/querycoordv2/task/scheduler.go:1048-1055` |
| No compensation logic | TxnBuffer rollback is for WAL transactions, not workflow compensation | `internal/streamingnode/server/wal/utility/txn_buffer.go:163` |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**They are not.** Milvus does not have multi-step workflow definitions. Operations like compaction are implemented as single `CompactionTask` objects with a `Process()` method that executes a state machine. The "steps" are implicit state transitions (pipelining → executing → completed/failed/timeout) rather than explicit workflow definitions.

Tasks are stored in `compactionTaskMeta.compactionTasks` map (in-memory) and persisted to kv catalog via `SaveCompactionTask` (`internal/datacoord/compaction_task_meta.go:168-177`). Execution is driven by `globalTaskScheduler.schedule()` which polls worker nodes via `CreateTaskOnWorker`/`QueryTaskOnWorker`.

In querycoordv2, `SegmentTask` and `ChannelTask` have an `actions []Action` slice (`internal/querycoordv2/task/task.go:129`) representing ordered steps, but these are simple action lists, not a DAG. Tasks execute actions sequentially via `StepUp()` until `IsFinished()` returns true (`internal/querycoordv2/task/scheduler.go:975-1021`).

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**No resumability.** Tasks do not support resuming from the point of interruption. If a `CompactionTask` is interrupted (e.g., DataNode crashes), the task remains in its last persisted state (e.g., `executing`). The `GlobalScheduler.check()` loop (`internal/datacoord/task/global_scheduler.go:203-232`) will query the worker's status, and if the task has progressed, it continues from the new state. However, if the worker is down and the task is stuck in `executing`, there is no mechanism to resume the compaction from its checkpoint — the task would likely timeout and be retried from the beginning.

The `reloadFromKV()` method (`internal/datacoord/compaction_task_meta.go:83-118`) reloads tasks on startup, but it only marks tasks with missing `PreAllocatedSegmentIDs` as failed — it cannot reconstruct in-progress state.

### 3. How are parallel workflow branches coordinated and joined?

**No parallel branch coordination.** Milvus does not have DAG-based execution or parallel branch patterns. Compaction tasks operate on a single set of input segments. The `GlobalTaskScheduler` (`internal/datacoord/task/global_scheduler.go`) processes multiple tasks concurrently via `execPool.Submit()` but these are independent tasks, not parallel branches of a single workflow.

The `mixCompactionTask` processes segments serially. The scheduler's `check()` method iterates running tasks independently, with no join/gate mechanism.

### 4. How does the system handle workflow-level timeouts and cancellations?

**Per-task timeout only.** Each `CompactionTask` has a `state` field (`datapb.CompactionTaskState`). When a task times out on the worker, the state transitions to `timeout` and `Process()` returns `true` (exit state machine). However, there is no workflow-level timeout that spans multiple related tasks. Cancellation is per-task via `DropTaskOnWorker()` which sends a `DropCompaction` RPC to the DataNode.

Context timeouts exist per-operation (e.g., `context.WithTimeout` at `internal/datacoord/task_stats.go:138`) but these are local to the operation, not a workflow-level timeout mechanism.

### 5. Is there compensation logic for partial workflow failures?

**No compensation logic.** Milvus does not implement Saga patterns or any form of compensation/rollback for multi-step operations. The only "rollback" found is:

1. `TxnBuffer.rollbackTxn()` in the WAL layer (`internal/streamingnode/server/wal/utility/txn_buffer.go:163`) — this rolls back uncommitted transactions in the WAL, not workflow compensation
2. `snapshot_manager.go` has a `rollback` callback for snapshot restoration (`internal/datacoord/snapshot_manager.go:1356`) — this is for aborting restore operations, not compensating failed workflows

When a compaction fails mid-way, the partial results (new segments) are abandoned. The system relies on the next compaction trigger to clean up and retry. There is no automatic rollback of previously completed steps within a task.

## Architectural Decisions

1. **Task-as-state-machine pattern**: Instead of a general workflow engine, Milvus uses Go interfaces (`CompactionTask`, `task.Task`) with a `Process()` method that returns `true` when the task is complete. This is a simple, ad-hoc pattern unsuitable for complex orchestration (`internal/datacoord/compaction_task.go:24-48`).

2. **Scheduler-driven task dispatch**: Tasks are not pre-defined workflows but are created dynamically by triggers (e.g., `compaction_trigger.go`) and dispatched via `GlobalTaskScheduler`. This is a push-based model, not a pull-based workflow execution engine (`internal/datacoord/task/global_scheduler.go:162-201`).

3. **Action-list task model**: In querycoordv2, tasks contain ordered `[]Action` slices executed sequentially. This is a linear task model, not a DAG. No branching, joining, or fan-out/fan-in patterns exist (`internal/querycoordv2/task/task.go:269-287`).

4. **No workflow persistence layer**: Unlike Temporal (event-sourcing), Milvus does not persist workflow state. Task state is the proto `CompactionTask` stored in etcd/kv. If the DataCoord process crashes, in-flight tasks are reconstructed from the kv store on restart, but their current execution progress (e.g., compaction percentage) is lost.

## Notable Patterns

1. **Priority queue scheduling**: `CompactionQueue` uses a heap-based `PriorityQueue[T]` with configurable `Prioritizer` functions (level, mix) to order compaction tasks (`internal/datacoord/compaction_queue.go:36-75`).

2. **Task step execution with completion check**: `baseTask.IsFinished(dist *meta.DistributionManager)` returns `task.Step() >= len(task.Actions())`. This simple linear progression model means tasks execute all actions in order until complete (`internal/querycoordv2/task/task.go:282-287`).

3. **Two-phase task lifecycle**: `schedule()` assigns tasks to workers; `check()` monitors completion. Failed tasks are moved back to pending for retry, but only if `taskcommon.Retry` state is set (`internal/datacoord/task/global_scheduler.go:216-226`).

4. **Slot-based worker allocation**: `GlobalTaskScheduler.pickNode()` allocates tasks based on worker slot availability (`internal/datacoord/task/global_scheduler.go:140-160`). This is resource-aware scheduling but limited to compaction tasks.

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Simple state machine vs workflow engine | `Process()` returning `bool` is simple to implement but lacks expressiveness for complex multi-step workflows |
| No workflow persistence | Task state is persisted but execution progress (compaction percentage) is lost on failure — requires full retry |
| Per-task retry vs saga | Only individual tasks retry on failure; no automatic compensation for partial workflow completion |
| No DAG model | Tasks are linear or independent — cannot model workflows with branches, joins, or fan-out |
| Synchronous task polling | `GlobalScheduler.check()` polls workers periodically — latency in detecting task completion/failure |

## Failure Modes / Edge Cases

1. **Compaction task stuck in `executing`**: If a DataNode crashes while compaction runs, the task stays in `executing`. `check()` will eventually timeout and the trigger will create a new task, but the original segment state may be inconsistent.

2. **No atomic multi-task transactions**: Compaction trigger creates tasks independently. If the coordinator fails mid-creation, some segments may have pending compaction tasks while others don't.

3. **Slot exhaustion causing task reassignment**: If a worker refuses a task due to slot limit, `CreateTaskOnWorker` resets `NodeID` to `NullNodeID` and sets state to `pipelining`, causing reassignment on next schedule cycle (`internal/datacoord/compaction_task_mix.go:110`).

4. **Reload-from-KV marks valid tasks as failed**: `reloadFromKV()` marks tasks with nil `PreAllocatedSegmentIDs` as failed, which could incorrectly fail in-progress tasks during rolling upgrades (`internal/datacoord/compaction_task_meta.go:102-113`).

## Future Considerations

1. **Formal workflow definition DSL**: Milvus could benefit from a declarative workflow definition (e.g., YAML/JSON) to define multi-step operations like collection creation with schema, indexes, and load steps.

2. **Checkpointing for long-running tasks**: Compaction and indexing tasks could persist intermediate state to enable resumption after interruption.

3. **DAG execution for parallel operations**: The current task model only supports linear or independent-parallel execution. A DAG model would enable complex dependencies between operations.

4. **Saga pattern for multi-step operations**: Collection creation involves multiple coordinated steps (create collection → create index → load). A Saga pattern could provide automatic rollback on partial failure.

## Questions / Gaps

1. **No evidence of DAG-based workflow engine**: Searched for `workflow`, `DAG`, `orchestrat` patterns — found no DAG execution model or workflow definition DSL. The codebase uses simple state machines for individual tasks.

2. **No checkpointing mechanism**: Tasks persist their state (proto) but not intermediate execution state. If a task is interrupted, the system cannot resume from the checkpoint — only retry from the beginning.

3. **No compensation/rollback for partial failures**: The `rollback` operations found are WAL-level transaction rollbacks, not workflow-level Saga compensation. Failed multi-step operations (e.g., import) leave partial data without automatic cleanup.

4. **No parallel branch join patterns**: `GlobalTaskScheduler` and `taskScheduler` process independent tasks concurrently, but there is no mechanism to wait for multiple parallel branches and join results within a single workflow.

5. **No workflow-level timeout coordination**: Timeout is managed per-task via context deadlines or worker-side timeouts. There is no workflow-level timeout that could cancel all constituent tasks if a deadline is exceeded.

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `milvus`.