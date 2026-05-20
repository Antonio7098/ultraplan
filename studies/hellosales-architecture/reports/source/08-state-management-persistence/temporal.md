# Source Analysis: temporal

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a durable execution platform that implements a sophisticated multi-layer state management system. Workflow execution state is persisted through a layered architecture: upper-layer `ExecutionManager` handles serialization and business logic, while lower-layer `ExecutionStore` provides storage primitives. State is stored in blob columns using protobuf serialization, with history events forming an append-only tree structure. The system uses conditional updates (via `next_event_id` and `range_id`) for optimistic concurrency control. Caching is implemented for cross-DC replication events via `XDCCache`. Long-running workflows are natively supported through the durable execution model where workflow state survives server restarts.

## Rating

**8/10** — Good implementation with minor issues. Temporal demonstrates a mature, well-designed state management architecture with clear separation between persistence abstractions and implementation. The system properly handles long-running workflow state persistence through its durable execution model. However, the reliance on last-write-wins semantics for history nodes and lack of explicit transaction support in Cassandra requires careful handling of consistency edge cases.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| DataStoreFactory interface | `DataStoreFactory` interface with `NewExecutionStore`, `NewTaskStore`, `NewShardStore`, etc. | `common/persistence/persistence_interface.go:32-51` |
| ExecutionManager abstraction | `ExecutionManager` interface with `CreateWorkflowExecution`, `UpdateWorkflowExecution`, `GetWorkflowExecution`, etc. | `common/persistence/data_interfaces.go:1116-1173` |
| ExecutionStore interface | `ExecutionStore` interface defining low-level persistence operations | `common/persistence/persistence_interface.go:116-167` |
| WorkflowSnapshot/Mutation types | `WorkflowSnapshot` and `WorkflowMutation` types containing all workflow state | `common/persistence/data_interfaces.go:344-398` |
| Blob serialization | `Serializer` interface with methods like `WorkflowExecutionInfoToBlob`, `ActivityInfoToBlob`, etc. | `common/persistence/serialization/serializer.go:108-112` |
| ExecutionManagerImpl | Implementation wrapping `ExecutionStore` with serialization logic | `common/persistence/execution_manager.go:28-37` |
| ShardManager | `shardManagerImpl` handles shard creation with range ID management | `common/persistence/shard_manager.go:12-15` |
| History tree/branch model | `HistoryTree` and `HistoryNode` tables with tree_id, branch_id, node_id, txn_id | `schema/cassandra/temporal/schema.cql:58-80` |
| Range ID for fencing | `range_id` column in `tasks` and `tasks_v2` tables for write synchronization | `schema/cassandra/temporal/schema.cql:89,108` |
| Conditional update support | `next_event_id` column enables conditional updates on session history | `schema/cassandra/temporal/schema.cql:32` |
| Transaction isolation | MySQL default `READ-COMMITTED` isolation level configured | `common/persistence/sql/sqlplugin/mysql/session/session.go:31` |
| XDC Cache | `XDCCacheImpl` implements LRU cache with TTL for cross-DC replication events | `common/persistence/xdc_cache.go:38-41` |
| HistoryTaskQueueManager | `HistoryTaskQueueManagerImpl` manages task queues using `QueueV2` interface | `common/persistence/history_task_queue_manager.go:1272-1275` |
| QueueV2 interface | `QueueV2` interface for generic FIFO queue with `EnqueueMessage`, `ReadMessages` | `common/persistence/persistence_interface.go:809-835` |
| Version history tracking | `VersionHistoryItem` with event_id and version for history versioning | `common/persistence/serialization/serializer.go:29` |
| Consistency error types | `CurrentWorkflowConditionFailedError`, `WorkflowConditionFailedError`, `ConditionFailedError` | `common/persistence/data_interfaces.go:113-148` |
| Metric clients | `executionPersistenceClient` wraps `ExecutionManager` with metrics and health signals | `common/persistence/persistence_metric_clients.go:33-37` |
| Retryable clients | `persistence_retryable_clients.go` wraps operations with automatic retry logic | `common/persistence/persistence_retryable_clients.go` |
| Checksum for corruption detection | `checksum` column stores `persistencespb.Checksum` for mutable state validation | `schema/cassandra/temporal/schema.cql:50-51` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

State is accessed through a **layered repository pattern** with two main layers:

**Upper Layer (ExecutionManager)**: `common/persistence/execution_manager.go:28-37` defines `executionManagerImpl` which wraps `ExecutionStore` and provides:
- Serialization/deserialization of workflow state via `Serializer` (`common/persistence/serialization/serializer.go:108-112`)
- Business logic validation (e.g., `ValidateCreateWorkflowModeState`, `ValidateCreateWorkflowStateStatus`)
- Transaction boundary handling for multi-entity updates

**Lower Layer (ExecutionStore)**: `common/persistence/persistence_interface.go:116-167` defines `ExecutionStore` interface with methods:
- `CreateWorkflowExecution`, `UpdateWorkflowExecution`, `ConflictResolveWorkflowExecution`
- `GetWorkflowExecution`, `GetCurrentExecution`
- `AppendHistoryNodes`, `ReadHistoryBranch`

**Mutation approach**: Workflow state is stored as protobuf blobs in columns like `execution`, `execution_state`, `activity_map`, `timer_map`, etc. (`schema/cassandra/temporal/schema.cql:18-21,34-43`). Mutations use conditional updates via `next_event_id` (`common/persistence/data_interfaces.go:349`) to detect conflicts.

The system is **not purely event-sourced** — while history events are append-only, current workflow state is stored as mutable blobs that are overwritten on each update, with history preserved separately.

### 2. What consistency model does the system provide to callers?

**Optimistic concurrency with last-write-wins** for history nodes:

- **History nodes**: Use `txn_id` (transaction ID) for conflict resolution — for the same `node_id`, the batch with larger `txn_id` always wins (`common/persistence/history_manager.go:1055-1059`)
- **Workflow executions**: Conditional updates via `next_event_id` and `db_record_version` (`common/persistence/data_interfaces.go:132,373`)
- **Shards**: Use `range_id` for ownership fencing (`common/persistence/persistence_interface.go:225`)
- **Task queues**: Use `range_id` to ensure only one process writes (`schema/cassandra/temporal/schema.cql:89,108`)

**Explicit error types for conflicts**:
- `CurrentWorkflowConditionFailedError` (`common/persistence/data_interfaces.go:113-125`)
- `WorkflowConditionFailedError` (`common/persistence/data_interfaces.go:127-132`)
- `ConditionFailedError` (`common/persistence/data_interfaces.go:134-137`)
- `ShardOwnershipLostError` (`common/persistence/data_interfaces.go:144-148`)

**MySQL default isolation**: `READ-COMMITTED` (`common/persistence/sql/sqlplugin/mysql/session/session.go:31`) — Temporal does not use serializable isolation.

**Limitation**: No multi-document transactions across different entity types (e.g., cannot atomically update workflow execution and task queue in a single transaction).

### 3. How is cache invalidation handled without stale reads?

**Two-tier caching approach**:

1. **XDCCache** (`common/persistence/xdc_cache.go:38-41`): An in-memory LRU cache with TTL for cross-DC replication event blobs
   - Key: `XDCCacheKey` (workflow key, min event ID, version)
   - Value: `XDCCacheValue` (base workflow info, version history items, event blobs, next event ID)
   - TTL-based expiration with `Pin: false` option

2. **Shard/Execution caching**: Managed at higher layers via `ClientCache` (`common/client_cache.go:23-29`) which caches service clients based on membership.

**Cache population strategy** (`common/persistence/execution_manager.go:532-541`):
```go
func (m *executionManagerImpl) addXDCCacheKV(xdcKVs map[XDCCacheKey]XDCCacheValue) {
    if m.eventBlobCache == nil {
        return
    }
    for k, v := range xdcKVs {
        m.eventBlobCache.Put(k, v)
    }
}
```

**No explicit cache invalidation**: Cache entries expire via TTL rather than explicit invalidation. The system relies on the property that once a workflow completes, it no longer receives updates that would require cache invalidation.

### 4. How is long-running workflow state persisted and resumed?

**Durable execution model** — core design principle:

1. **State persistence**: Workflow state (execution info, execution state, activity infos, timer infos, etc.) is persisted to `executions` table as blobs on each state transition (`common/persistence/execution_manager.go:72-130`)
   
2. **History preservation**: History events are stored in `history_node` table as an append-only tree structure with `tree_id`, `branch_id`, `node_id`, `txn_id` keys (`schema/cassandra/temporal/schema.cql:58-70`). Branches allow forking new branches on reset.

3. **Resumability**: When a workflow executes:
   - Workflow code is deterministic and replayable
   - State is loaded from persistence on worker start
   - Events are re-processed to reconstruct workflow state
   - Idempotency keys prevent duplicate execution

4. **Task queue persistence**: Tasks are stored durably in `tasks` or `tasks_v2` tables with `range_id` for fencing, ensuring exactly-once delivery even across server restarts.

5. **Shard ownership**: Shards have `range_id` that increments on ownership change, preventing concurrent updates (`common/persistence/persistence_interface.go:224-231`).

### 5. What happens to in-flight state during schema migrations?

**No explicit migration handling found for in-flight state**:

- Schema versioning is handled via versioned schema directories (`schema/cassandra/temporal/versioned/`)
- The system uses protobuf for serialization which provides forward/backward compatibility
- `EncodingType` field in blobs (`schema/cassandra/temporal/schema.cql:4`) allows encoding versioning

**Potential issues**:
- In-flight workflow updates during migration may see old schema data
- If a migration changes blob structure, older workflows may fail deserialization
- The system does not appear to have a mechanism to drain in-flight operations before migration

**Mitigation mechanisms**:
- Checksum field (`schema/cassandra/temporal/schema.cql:50-51`) can detect corruption
- `QueueMetadataToBlob` uses JSON encoding (`common/persistence/serialization/serializer.go:566`) which is more tolerant of schema changes
- Proto3's `DiscardUnknown: true` option (`common/persistence/serialization/serializer.go:227-228`) allows forward compatibility

## Architectural Decisions

### Layered Persistence Architecture
Temporal implements a clear separation between high-level persistence operations (`ExecutionManager`) and low-level storage (`ExecutionStore`). This allows different storage backends (Cassandra, MySQL, PostgreSQL) to share the same high-level logic while implementing their own storage-specific behaviors.

### Blob-Based State Storage
Workflow state is stored as protobuf blobs (`common/persistence/serialization/serializer.go`) rather than normalized tables. This design prioritizes write throughput and schema evolution over query flexibility. The trade-off is that individual attributes cannot be queried without deserializing the entire blob.

### History Tree Model
Events are stored in a tree structure (`schema/cassandra/temporal/schema.cql:58-80`) where each node has a `txn_id` for conflict resolution. This allows for non-contiguous event IDs when forks/reset occur. The model is append-only for each branch, enabling efficient event replay.

### Range ID for Distributed Fencing
Task queues and shards use `range_id` as a fencing mechanism (`schema/cassandra/temporal/schema.cql:89`). This is a lightweight alternative to distributed locks — if a process sees a stale range_id, its write will be rejected.

## Notable Patterns

### Serializer Pattern
The `Serializer` interface (`common/persistence/serialization/serializer.go:108-112`) provides a unified interface for all persistence serialization. Implementations handle protobuf encoding with version tracking via `EncodingType` field.

### Condition-Based Conflict Detection
Workflow mutations include `Condition` or `DBRecordVersion` fields that are used for conditional updates (`common/persistence/data_interfaces.go:371-373`). This allows the system to detect concurrent modifications and fail fast rather than merge.

### QueueV2 for Internal Tasks
Internal history tasks (transfer, timer, replication) are managed through `QueueV2` interface (`common/persistence/persistence_interface.go:809-835`) which provides a more flexible naming scheme than the legacy `Queue` interface. The comment explains the migration rationale: the old `queue_metadata` table had a primary key of just `queue_type`, limiting it to one queue per type.

### Task Category-Based Routing
Tasks are categorized (transfer, timer, visibility, replication, archival, outbound) and the serializer routes to the correct serialization method based on `task.GetCategory()` (`common/persistence/serialization/serializer.go:149-169`).

## Tradeoffs

### Write Throughput vs. Query Flexibility
Blob-based storage enables high write throughput but prevents querying individual workflow attributes without loading and deserializing the entire state. This is a deliberate design choice favoring Temporal's workflow-centric model over general-purpose data access.

### Consistency vs. Availability
The use of last-write-wins for history nodes (`common/persistence/history_manager.go:1055`) prioritizes availability over strong consistency. In a partition scenario, the version with higher `txn_id` will win, potentially losing earlier writes.

### No Multi-Entity Transactions
Temporal does not support ACID transactions across multiple entity types. Updating a workflow execution and creating tasks happen in separate operations. If a failure occurs between these operations, the system relies on cleanup processes to resolve inconsistencies.

### Schema Evolution Complexity
Protobuf blobs provide forward/backward compatibility, but schema evolution requires careful versioning. Adding new fields is safe, but removing or changing fields requires version management to avoid deserialization failures for in-flight workflows.

## Failure Modes / Edge Cases

### Concurrent Workflow Updates
When two processes attempt to update the same workflow concurrently:
- Conditional update via `next_event_id` fails with `CurrentWorkflowConditionFailedError`
- The losing process must reload state and retry (`common/persistence/execution_manager.go:224-235`)

### Cassandra Lacks Transactions
Cassandra does not support multi-row transactions. The comment at `common/persistence/tests/cassandra_test.go:312` states: "can only happen in Cassandra due to its lack of transactions, so we need to test those here." Temporal handles this through idempotent operations and retry logic.

### History Node Conflicts
When multiple nodes write to the same history branch with overlapping event IDs, the one with higher `txn_id` wins (`common/persistence/history_manager.go:1052-1058`). Lower transaction IDs are silently dropped.

### XDCCache Duplicate Key Issue
The `XDCCacheImpl.Put` method (`common/persistence/xdc_cache.go:105-126`) logs an error when putting a duplicate key with a different `NextEventID`, indicating a programming error or cache corruption.

### Schema Migration Data Loss
If a schema migration changes the structure of serialized blobs without proper versioning, older workflows may fail to deserialize. The system relies on `DiscardUnknown: true` and protobuf's forward compatibility to mitigate this.

## Future Considerations

### Transition to QueueV2
The legacy `Queue` interface is being replaced by `QueueV2` which supports dynamic queue names (`common/persistence/persistence_interface.go:799-835`). The migration is driven by the limitation of one queue per type in the old `queue_metadata` table.

### Checkpointing History
The current history tree model requires scanning all ancestors to reconstruct state. Future optimizations may add checkpoint nodes to speed up state reconstruction.

### Enhanced Consistency Guarantees
The current last-write-wins model could be enhanced with vector clocks or explicit version vectors to provide stronger consistency guarantees for history events.

## Questions / Gaps

1. **No evidence found** for explicit cross-shard transaction support. The `InternalCreateWorkflowExecutionRequest` (`common/persistence/persistence_interface.go:337-350`) only has a single `ShardID`, suggesting atomic multi-shard operations are not supported.

2. **No evidence found** for online schema migrations. The system appears to require downtime or careful sequencing for schema changes to avoid corrupting in-flight workflow state.

3. **No evidence found** for cache coherence protocols between nodes. The XDCCache relies on TTL expiration rather than active invalidation, which could lead to stale reads in multi-node deployments.

4. **Limited visibility into migration strategy** — while versioned schemas exist, the actual migration scripts and their handling of in-flight state were not examined in detail.

---

Generated by `08-state-management-persistence.md` against `temporal`.