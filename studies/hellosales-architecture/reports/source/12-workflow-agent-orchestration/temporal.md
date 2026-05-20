# Source Analysis: temporal

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a durable execution platform implementing event-sourcing-based workflow orchestration. Workflows are defined as code (in any supported SDK language) and executed durably by the Temporal server cluster. The core execution model uses event-sourcing with an append-only Workflow History that serves as the source of truth for workflow state, enabling seamless resume after interruption. Temporal does not use a traditional DAG or state machine pattern internally; instead it uses a "workflow task" model where workers poll for tasks and advance workflow execution by sending commands (ScheduleActivity, StartTimer, etc.) back to the server.

## Rating

**9/10** — Excellent, exemplar implementation for durable workflow orchestration. The event-sourcing model provides natural checkpointing via History Events, tasks enable retry-at-step semantics, and child workflows handle parallel branch coordination. Minor gaps in formal compensation/Saga patterns for multi-step partial failures, though the ContinueAsNew mechanism provides retry capabilities.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workflow definition model | Workflows defined as code in SDK languages, not DSL | `docs/architecture/README.md:22` |
| Event-sourcing architecture | Append-only History Events reconstruct workflow state | `docs/architecture/README.md:32` |
| Workflow execution model | Workflow Tasks processed by workers, advancing execution via commands | `docs/architecture/README.md:67-68` |
| Mutable State persistence | `MutableStateImpl` tracks pending activities, timers, child workflows | `service/history/workflow/mutable_state_impl.go:127-200` |
| History reconstruction | `NewMutableStateFromDB` reconstructs state from persistence | `service/history/workflow/mutable_state_impl.go:435-586` |
| State transition atomicity | `GetAndUpdateWorkflowWithNew` commits events + mutable state atomically | `docs/architecture/history-service.md:300-301` |
| Task generation for steps | `TaskGenerator` creates Transfer/Timer tasks for activities, timers, children | `service/history/workflow/task_generator.go:34-96` |
| Workflow task state machine | `workflowTaskStateMachine` manages workflow task lifecycle | `service/history/workflow/workflow_task_state_machine.go:1` |
| Retry logic | `getBackoffInterval` computes exponential retry with max attempts | `service/history/workflow/retry.go:32-54` |
| Child workflow support | `AddStartChildWorkflowExecutionInitiatedEvent` spawns child workflows | `service/history/workflow/mutable_state_impl.go:2716-2718` |
| Persistence interface | `ExecutionStore` manages workflow execution including mutable states/history | `common/persistence/persistence_interface.go:115-167` |
| Transaction interface | `Transaction` interface for Create/Update/ConflictResolve workflow execution | `service/history/workflow/transaction.go:12-57` |
| Context loading | `LoadMutableState` loads execution context from persistence | `service/history/workflow/context.go:141-179` |
| Workflow task timeout | `AddWorkflowTaskScheduleToStartTimeoutEvent` handles WFT timeouts | `service/history/interfaces/mutable_state.go:76` |
| Timer tasks | `TimerQueueActiveTaskExecutor` processes timer task types | `service/history/timer_queue_active_task_executor.go:90` |
| Transfer queue | `TransferQueueActiveTaskExecutor` dispatches Workflow/Activity tasks | `service/history/transfer_queue_active_task_executor.go:114` |
| Update registry | `update.Registry` tracks workflow updates with admit/reject/complete states | `service/history/workflow/update/registry.go:1` |
| Query registry | `QueryRegistry` handles workflow queries without advancing execution | `service/history/workflow/query_registry.go:1` |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

Workflows are defined as code in supported SDK languages (Go, Java, Python, etc.), not via a DSL or configuration file. Users implement Workflow functions that contain calls to Activities and control flow constructs (timers, child workflows, conditionals).

Storage: Workflow state is stored in an append-only sequence of History Events. The `WorkflowMutableState` proto (`service/history/interfaces/mutable_state.go:147`) contains execution info, execution state, pending activities, timers, child executions, signal infos, and buffered events. This is persisted via `ExecutionStore` interface (`common/persistence/persistence_interface.go:122-123`).

Execution: The server maintains Workflow History as the source of truth. Workers poll for Workflow Tasks via the Matching service (`service/history/handler.go:319` for `RecordWorkflowTaskStarted`). When a worker completes a workflow task, it sends commands (ScheduleActivity, StartTimer, etc.) back to the server (`docs/architecture/README.md:68`). The History service appends new events to the history and updates MutableState.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**Yes, workflows resume seamlessly.** The event-sourcing architecture ensures that complete workflow state can be reconstructed by replaying the History Events (`docs/architecture/README.md:32`). When a workflow is interrupted (worker crash, server failure, network issue):

1. The MutableState and unprocessed History Events remain persisted in the database
2. Timer tasks remain in the Timer queue and will fire when their deadline arrives
3. When the worker or another worker polls again, it receives the current Workflow Task
4. The worker replays the History Events locally to reconstruct the current workflow state
5. Execution continues from where it left off

Evidence: `NewMutableStateFromDB` (`service/history/workflow/mutable_state_impl.go:435-586`) reconstructs complete workflow state including pending activities, timers, child workflows from the database record. The `bufferEventsInDB` field handles events that were appended but not yet processed.

### 3. How are parallel workflow branches coordinated and joined?

Temporal supports parallel branches primarily through **Child Workflows**:

- `AddStartChildWorkflowExecutionInitiatedEvent` (`service/history/workflow/mutable_state_impl.go:2716`) initiates a child workflow execution
- `pendingChildExecutionInfoIDs` map tracks in-progress child executions (`mutable_state_impl.go:140-142`)
- `GenerateChildWorkflowTasks` (`service/history/workflow/task_generator.go:602`) creates tasks to track child workflow state changes

Child workflows have their own Workflow History and can execute independently. The parent workflow waits for child completion via `ChildWorkflowExecution*` events (Started, Completed, Failed, Canceled, TimedOut, Terminated).

For in-progress parallel activities within a single workflow:
- `pendingActivityInfoIDs` (`mutable_state_impl.go:129`) tracks scheduled but not yet completed activities
- Activities execute asynchronously and results are reported via `RespondActivityTaskCompleted` / `RespondActivityTaskFailed`
- The workflow continues when activities complete or fail

**No explicit join/gate pattern exists** — developers use child workflows + activity results + signals to coordinate parallel branches. The `SignalExternalWorkflowExecution` API (`mutable_state_impl.go:83`) allows signaling running workflows.

### 4. How does the system handle workflow-level timeouts and cancellations?

**Workflow Execution Timeout**: `GenerateWorkflowStartTasks` (`service/history/workflow/task_generator.go:127-192`) creates `WorkflowExecutionTimeoutTask` and `WorkflowRunTimeoutTask` based on `WorkflowExecutionExpirationTime` and `WorkflowRunExpirationTime`. These timer tasks are processed by `TimerQueueActiveTaskExecutor.executeUserTimerTimeoutTask` (`timer_queue_active_task_executor.go:136`).

**Workflow Task Timeout**: `AddWorkflowTaskScheduleToStartTimeoutEvent` (`service/history/interfaces/mutable_state.go:76`) handles schedule-to-start timeout for workflow tasks. `WorkflowTaskTimeout` timer tasks are generated and processed via the timer queue.

**Cancellation**: `RequestCancelWorkflowExecution` RPC creates `RequestCancelExternalWorkflowExecutionInitiatedEvent`. The cancel is signaled to the target workflow via `AddRequestCancelExternalWorkflowExecutionInitiatedEvent` (`mutable_state_impl.go:87`). If the target workflow is a child, the cancellation propagates.

**Workflow Cancellation**: `AddWorkflowExecutionCanceledEvent` (`mutable_state_impl.go:100`) records cancellation in history.

Evidence: Timer task processing in `timer_queue_active_task_executor.go:90-250` handles various timer types including workflow execution timeout, workflow task timeout, activity timeouts, etc.

### 5. Is there compensation logic for partial workflow failures?

**Limited formal compensation (Saga pattern) exists.** Temporal provides mechanisms for handling partial failures but does not have an explicit built-in compensation framework:

1. **Activity retry with backoff**: Activities that fail can be automatically retried with exponential backoff (`retry.go:32-113`). The retry policy is specified per-activity. Non-retryable failures are distinguished from retryable ones.

2. **Workflow retry/continue-as-new**: `SetupNewWorkflowForRetryOrCron` (`retry.go:156-371`) handles retry and cron scenarios. Failed workflows can be retried as new runs with the same workflow ID, inheriting state from the failed run.

3. **Child workflow handling**: If a child workflow fails, the parent receives `ChildWorkflowExecutionFailedEvent` and can handle it accordingly. Child workflows have their own retry policies.

4. **Rollback callback**: The update system has `OnAfterRollback` callbacks (`service/history/workflow/update/store.go:25`) that execute after an update is rolled back, but this is for update protocol rollback, not workflow-level compensation.

5. **No automatic compensation for partial saga-style transactions**: Temporal does not have built-in Saga-style compensation where if step 3 of 5 steps fails, steps 1-2 are automatically rolled back. Developers must implement compensation logic manually by:
   - Using Try/Catch around activity calls
   - Implementing compensation activities that undo previous operations
   - Using ContinueAsNew with explicit state machine transitions

**Gap**: For complex multi-step business transactions requiring automatic rollback, developers need to implement compensation logic explicitly in workflow code.

## Architectural Decisions

1. **Event-sourcing over state machine**: Temporal uses event-sourcing where the append-only History is the source of truth, not an in-memory state machine. This enables efficient replays and durability guarantees (`docs/architecture/README.md:32`).

2. **Workflow task model over direct method invocation**: Workers poll for Workflow Tasks and execute workflow code until blocked (on activity call, timer, etc.). Commands are sent to server to advance state. This decouples execution from the server.

3. **MutableState as in-memory cache with DB persistence**: `MutableStateImpl` is an in-memory representation that is periodically persisted. The actual History Events are the durable record; MutableState is an optimization for fast access (`history-service.md:101-103`).

4. **Task-based decoupling**: History service creates tasks (Transfer, Timer, Replication) that are processed asynchronously. This allows the system to handle millions of concurrent workflow executions by scaling History shards independently.

5. **HSM (Hierarchical State Machines) for future state**: The `hsm` package and `chasm` engine represent a newer framework for state machine definitions, but `workflow.MutableState` currently does not support full HSM persistence (`state_machine_definition.go:22-24`).

6. **Chasm for complex workflow patterns**: Temporal introduced "Chasm" (`chasm_tree.go`) as a tree structure for representing complex workflow state beyond the basic MutableState, with support for arbitrary node types and path encoding.

## Notable Patterns

1. **Transactionally consistent state transitions**: Every state transition (RPC from user app, RPC from worker, timer fired, cross-workflow signal) uses the same atomic pattern: in-memory MutableState update + History event append + Task creation, all committed transactionally (`history-service.md:285-304`).

2. **Queue processors for async task handling**: History Shards run multiple `QueueProcessor` instances (transfer, timer, replication, visibility, archival) that poll tasks from persistence and process them via `Execute`/`Ack`/`Nack` cycles (`queue_base.go:281`).

3. **RangeID fencing for shard ownership**: Shards use RangeID for fencing - a monotonically increasing generation number that prevents stale reads/writes when ownership transfers between History service instances (`history-service.md:86`).

4. **Workflow task state machine**: `workflowTaskStateMachine` (`workflow_task_state_machine.go`) manages the lifecycle of workflow tasks: Scheduled → Started → Completed/Failed/Timeout, with explicit handling for `WorkflowTaskStarted` event which updates MutableState.

5. **Update protocol for synchronous changes**: The update system (`workflow/update/update.go`) provides synchronous update/admit/reject/complete flows for workflows, with `OnAfterCommit` and `OnAfterRollback` callbacks.

6. **Versioned transitions for replication**: `VersionedTransition` tracks namespace failover versions, enabling consistency guarantees across cluster replication (`mutable_state_impl.go:181`).

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Event-sourcing replays | Replaying full History on every Workflow Task can be expensive for long-running workflows. Temporal uses "replay-nth-event-from-db" caching to mitigate. |
| MutableState vs pure event-sourcing | MutableState provides fast access but requires careful synchronization with History Events. Inconsistent MutableState must be reloaded from DB. |
| No native Saga compensation | Developers must implement compensation logic manually. Built-in compensation would add complexity and may not fit all use cases. |
| Shard ownership complexity | Fixed number of shards with ownership transfer requires RangeID fencing. Misconfigured shards can cause unavailability. |
| Timer queue scalability | Timer tasks must be processed in-order per workflow. High timer density (many concurrent timers per workflow) can create bottleneck. |
| Child workflow overhead | Child workflows have full isolation (separate history, tasks) which provides reliability but adds overhead vs. in-process parallel activities. |
| Update protocol complexity | The update protocol with admit/update/reject/complete states adds complexity for developers expecting simple synchronous calls. |

## Failure Modes / Edge Cases

1. **Worker crash mid-workflow-task**: Worker processes Workflow Task but crashes before sending completion. The workflow task remains in `Started` state with an active timeout timer. When timeout fires, the server creates a new Workflow Task and another worker can pick it up and replay history.

2. **History shard owner failure**: RangeID fencing ensures new owner cannot serve stale requests. On ownership transfer, the new owner loads MutableState from DB and continues processing.

3. **Database write failure after event append**: The transaction commits events atomically with MutableState updates. If DB write fails, the transaction is rolled back and the worker will resend the completion on retry.

4. **Speculative workflow tasks**: Temporal supports speculative workflow tasks where the server can try to advance workflow before activity completes. These can be rolled back (`workflow_task_state_machine.go:763` for speculative rollback metrics).

5. **Conflict resolution on active/passive namespace**: `ConflictResolveWorkflowExecution` handles conflict resolution when reconciling state from passive namespace during failover (`transaction.go:23-37`).

6. **Buffered events**: `bufferEventsInDB` handles events that are appended but not yet applied to MutableState. This occurs when a workflow task is completed but the state update fails - the events are buffered and reprocessed on next workflow task.

7. **Long-running workflows with large history**: History growth is mitigated by archival to external storage after retention period. Visibility into archived workflows requires replay from archival store.

8. **Stuck workflows due to missing activity completion**: If an activity completes but the completion RPC fails repeatedly, the workflow could become stuck. `pendingActivityInfoIDs` tracks activities, and heartbeat mechanism helps detect worker failures.

## Future Considerations

1. **HSM framework completion**: The HSM (Hierarchical State Machine) framework is partially implemented but `workflow.MutableState` persistence is not yet supported in HSM (`state_machine_definition.go:23`). Full HSM support would enable more complex workflow patterns with explicit state machine definitions.

2. **Chasm tree expansion**: The Chasm tree structure for representing complex workflow state is relatively new. As it matures, it may enable features like structured concurrency, explicit parallelism management, and better debugging visibility.

3. **Transition history stability**: The `transitionHistoryEnabled` flag indicates transition history is still being stabilized. Once stable, it may replace the current MutableState approach with more explicit state transitions.

4. **Time-skipping for testing**: The `TimeSkippingConfig` and `wrapTimeSourceWithTimeSkipping` mechanism allow accelerating time in workflows for testing purposes. This could be expanded for simulation scenarios.

5. **Enhanced compensation patterns**: Native support for Saga-style compensation patterns could be added as a higher-level abstraction on top of the current retry/continue mechanisms.

## Questions / Gaps

1. **No evidence found for formal DAG execution engine**: Temporal does not use a DAG-based execution model internally. Workflows are orchestrated through event-sourcing and the workflow task model. Developers define control flow in code rather than a declarative DAG.

2. **No explicit "join" pattern for parallel branches**: While child workflows provide isolation and `WaitGroup`-style patterns can be implemented in code, there is no built-in join/gate mechanism for parallel branches within a single workflow execution.

3. **No evidence of built-in saga compensation**: Compensation for partial workflow failures must be implemented manually in workflow code. The `OnAfterRollback` callbacks are for update protocol rollback, not business-level compensation.

4. **HSM persistence not yet implemented**: The transition history framework is still under development, and `workflow mutable state persistence is not supported in the HSM framework` (`state_machine_definition.go:23`).

5. **Limited visibility into Chasm tree**: While the Chasm tree is stored (`dbRecord.ChasmNodes`), the `TODO@time-skipping: support time skipping for chasm` comment indicates some features are still incomplete.

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `temporal`.