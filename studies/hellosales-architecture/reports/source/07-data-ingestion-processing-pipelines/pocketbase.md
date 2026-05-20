# Source Analysis: pocketbase

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase is an embedded database-as-a-service with a SQLite backend. Data ingestion and processing pipelines manifest as a multi-stage flow: HTTP API entry → form validation → record transformation → hook-triggered execution → DB transaction commit. Raw data becomes trustworthy through field-level `ValidateValue` per field type, form-level validation in `forms/record_upsert.go`, and collection schema validation in `core/collection_validate.go`. Batch operations use a transaction-wrapped recursive processor with timeout and backpressure controls. No explicit batching/flushing semantics exist for bulk ingestion — each record is processed individually within a transaction.

## Rating

**5/10** — Basic implementation with gaps. The pipeline has solid validation layers and transaction support, but lacks: explicit batching for bulk operations, backpressure mechanisms, DLQ for failed items, independent stage scaling, and OOM protection for large payloads.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Ingestion entry | `batchTransaction` receives batch requests | `apis/batch.go:94` |
| Batch validation | `batchRequestsForm.validate()` checks max requests limit | `apis/batch.go:84-88` |
| Batch timeout | `txTimeout` defaults to 3 seconds | `apis/batch.go:100-103` |
| Transaction wrapper | `batchProcessor.Process()` wraps in `RunInTransaction` | `apis/batch.go:192` |
| Record upsert form | `RecordUpsert.Submit()` validates then calls `app.SaveWithContext` | `forms/record_upsert.go:284-292` |
| Field validation | `onRecordValidate` calls `f.ValidateValue` per field | `core/record_model.go:1413-1427` |
| Collection validation | `collectionValidator.run()` validates schema, fields, rules, indexes | `core/collection_validate.go:71-164` |
| Record interceptor | Fields implement `RecordInterceptor` for pre/post validation hooks | `core/field.go:169-185` |
| Transaction nesting | `runInTransaction` detects existing tx and reuses it | `core/db_tx.go:26-29` |
| After tx callbacks | `TxAppInfo.OnComplete()` registers cleanup on tx commit | `core/db_tx.go:79-90` |
| Batch recursion | `batchProcessor.process()` recursively processes one item at a time | `apis/batch.go:235-273` |
| File field validation | `FileField.ValidateValue` checks MIME types and max size | `core/field_file.go:241` |
| Email field validation | `EmailField.ValidateValue` checks format and uniqueness | `core/field_email.go:122` |
| Relation field validation | `RelationField.ValidateValue` checks relation existence | `core/field_relation.go:198` |
| Batch body limit | `applyBodyLimit` enforces max body size (128MB default) | `apis/batch.go:110-113` |
| Collection import | `ImportCollections` validates and upserts in single transaction | `core/collection_import.go:36-199` |
| Internal request | `InternalRequest` struct holds method, URL, body, headers | `core/event_request_batch.go` |
| Record data extraction | `recordDataFromRequest` resolves modifiers and uploads | `apis/record_crud.go:631-688` |
| Cascade delete | `cascadeRecordDelete` handles relation cleanup in tx | `core/record_model.go:1496-1530` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Raw data enters via HTTP API (`apis/record_crud.go:recordCreate`, `apis/record_crud.go:recordUpdate`) or batch API (`apis/batch.go:batchTransaction`). The flow:

1. **HTTP body parsing**: `e.BindBody()` parses JSON into `map[string]any` (`apis/record_crud.go:237`)
2. **Modifier resolution**: `record.ReplaceModifiers(info.Body)` resolves field modifiers like `+field` for append (`apis/record_crud.go:638`)
3. **File extraction**: `extractUploadedFiles()` pulls multipart files (`apis/record_crud.go:641-644`)
4. **Hidden field filtering**: Fields marked `Hidden` are stripped for non-superusers (`apis/record_crud.go:674-685`)
5. **Form loading**: `forms.NewRecordUpsert` + `form.Load(data)` loads into record (`apis/record_crud.go:256-260`)
6. **Auth password sync**: `syncPasswordFields()` syncs password fields with record (`forms/record_upsert.go:294-316`)
7. **Form validation**: `validateFormFields()` validates auth-specific fields (`forms/record_upsert.go:128-196`)
8. **Submit**: `form.Submit()` calls `app.SaveWithContext()` (`forms/record_upsert.go:290-292`)
9. **Hook chain**: `OnRecordCreateRequest()` trigger runs user hooks (`apis/record_crud.go:346`)
10. **Model validation**: `onRecordValidate` iterates fields calling `f.ValidateValue` (`core/record_model.go:1413-1427`)
11. **Field-specific validation**: Each field type (email, file, relation, etc.) validates its value (`core/field_*.go`)
12. **Transaction commit**: `RunInTransaction` wraps the save (`core/db_tx.go:14-16`)
13. **Unique index normalization**: `NormalizeUniqueIndexError` translates DB errors to user-friendly form (`core/record_model.go:1469-1473`)

### 2. What happens when a pipeline stage fails mid-batch?

When a batch item fails (`apis/batch.go:265-267`):
- `processInternalRequest` returns error immediately
- `p.failedIndex` is set to the failing index (`apis/batch.go:257-258`)
- The error is wrapped in a `BatchResponseError` with the failed index (`apis/batch.go:202-210`)
- The entire transaction is rolled back on error (`apis/batch.go:192`)
- The error is returned as a 400 Bad Request with `batch_request_failed` code (`apis/batch.go:162`)

**No partial success**: If any item in the batch fails, the entire batch is rolled back. There is no DLQ, no partial commit, and no item-level retry. The batch is atomic.

**Transactional behavior**: `RunInTransaction` ensures that if any record save fails, the transaction rolls back and no records are persisted. This is all-or-nothing per batch, not per-item.

### 3. How is data quality validated at each pipeline stage?

- **At HTTP layer**: Body size limit enforced via `applyBodyLimit` (`apis/batch.go:110-113`), max requests checked (`apis/batch.go:95-98`)
- **At form layer**: `batchRequestsForm.validate()` checks requests array length (`apis/batch.go:84-88`), `recordUpsert.validateFormFields()` checks auth-specific fields (`forms/record_crud.go:128-196`)
- **At modifier resolution**: `ReplaceModifiers` resolves field modifiers and validates constraint keys
- **At field level**: Each field implements `ValidateValue(ctx, app, record)` (`core/field.go:109`), called per-field in `onRecordValidate` (`core/record_model.go:1413-1427`)
- **Email field**: `EmailField.ValidateValue` checks regex, DNS MX records (optional), and uniqueness against DB (`core/field_email.go:122-149`)
- **File field**: `FileField.ValidateValue` checks MIME type against allowed list, file size vs. field config (`core/field_file.go:241-297`)
- **Relation field**: `RelationField.ValidateValue` verifies related record exists and user has access (`core/field_relation.go:198-230`)
- **Number field**: `NumberField.ValidateValue` checks min/max bounds (`core/field_number.go:134-159`)
- **Select field**: `SelectField.ValidateValue` checks value against allowed options (`core/field_select.go:185-205`)
- **At collection schema**: `collectionValidator.run()` validates field ids/names/types, rules syntax, indexes (`core/collection_validate.go:71-164`)
- **At API rule level**: List/View/Create/Update/Delete rules checked before mutation (`apis/record_crud.go:52-54`, `apis/record_crud.go:230-233`)

### 4. How does the pipeline scale with data volume without OOM?

**No evidence found** for explicit batching, backpressure, or OOM protection mechanisms:

- **Batch recursion**: `batchProcessor.process()` processes items one-by-one via recursion (`apis/batch.go:235-273`). Each item is held until the previous completes.
- **No streaming**: Entire request body is read into memory via `e.BindBody(form)` (`apis/batch.go:118`). For large batch requests, this could cause memory pressure.
- **No chunked flush**: Records are not flushed to DB in chunks — the entire batch runs in a single transaction (`apis/batch.go:192`).
- **DB connection pools**: SQLite uses `DataMaxOpenConns=120` default (`core/base.go:33-34`), but this limits connections, not memory.
- **No circuit breaker**: No evidence of circuit breaker or backpressure when DB is slow.
- **Transaction timeout**: Batch has a 3-second timeout (`apis/batch.go:100-103`), but this kills the entire batch, not just slow items.

**Gap**: No explicit memory bounds. Large batch payloads (up to 128MB per `maxBodySize`) could cause OOM if many concurrent batch requests arrive.

### 5. Can pipeline stages be independently deployed or scaled?

**No evidence found.** PocketBase is a single binary with no pipeline stage isolation:

- **Single-process**: All HTTP handlers, record processing, and DB operations run in the same process.
- **No worker separation**: Batch processing, record CRUD, and realtime subscriptions all share the same app instance.
- **No task queue**: Unlike Temporal which has distinct task categories (transfer, timer, replication), PocketBase has no internal queue system.
- **No horizontal scaling path**: Single-file deployment model means no independent scaling of ingestion vs. processing vs. storage.
- **Single DB**: SQLite is embedded; there is no separate ingestion/processing/storage layer that could scale independently.

## Architectural Decisions

- **Form objects as pipeline stage holders**: `forms.RecordUpsert` holds all validation logic per record (`forms/record_upsert.go:23-34`). This is the primary vehicle for data transformation.
- **Field interceptor pattern**: Fields implement `RecordInterceptor` to inject behavior at save/delete hooks (`core/field.go:169-185`), allowing file fields to auto-upload/delete as part of record lifecycle.
- **Dual DB pools for SQLite**: `ConcurrentDB()` for reads, `NonconcurrentDB()` for writes (`core/base.go:490-499`) to minimize `SQLITE_BUSY` errors.
- **Transaction-scoped app clone**: `createTxApp()` shallow-clones app with tx-specific DB references (`core/db_tx.go:52-69`), allowing nested transactions.
- **All-or-nothing batch**: Batch transaction rolls back entirely on any item failure (`apis/batch.go:192`), trading atomicity for simplicity.
- **Collection schema as contract**: Collections define the data contract; fields are typed and validated via `Field.ValidateValue()`.

## Notable Patterns

- **Hook-driven validation chain**: `OnRecordValidate()` → `onRecordValidate` → per-field `ValidateValue` (`core/record_model.go:55-72`, `core/record_model.go:1413-1427`)
- **Request-scoped form submission**: Form instance is created per request, loaded with data, validated, then submitted (`apis/record_crud.go:256-350`)
- **Modifier-based field updates**: Field names with `+` prefix resolve to append/prepend operations (`apis/record_crud.go:638`, `core/record_model.go:115-117`)
- **Hidden field enforcement at API layer**: API handlers strip hidden fields before form loading (`apis/record_crud.go:674-685`)
- **Auth record cross-collection ID check**: On auth record save, PocketBase checks ID uniqueness across all auth collections (`core/record_model.go:1445-1461`)
- **Deferred cascade delete**: Record deletion defers cascade to after main delete within the transaction (`core/record_model.go:1476-1499`)

## Tradeoffs

- **Atomic batch vs. partial success**: All-or-nothing batch is simpler but wastes work on partial failure. No item-level success reporting.
- **Embedded SQLite simplicity**: No separate ingestion/processing layer means lower operational complexity but also limits horizontal scale.
- **Form objects per request**: Creating new `RecordUpsert` per request is explicit but adds GC pressure vs. reusable pools.
- **Synchronous validation**: Field validation is synchronous; no pipelining of independent field checks.
- **Transaction-per-record in batch**: Each record save in a batch may trigger additional reads (auth check, cascade delete), all within the batch transaction. Under high load, this could hold locks longer.
- **No DLQ**: Failed batch items are returned as errors with no durable queue for later retry.

## Failure Modes / Edge Cases

- **Batch timeout**: If batch doesn't complete within `txTimeout` (default 3s), the entire transaction is rolled back and an error is returned (`apis/batch.go:224-228`).
- **Stale collection reference**: If collection is deleted mid-batch, subsequent items fail with "not found" (`apis/record_crud.go:38-40`).
- **Unique constraint violation**: If two items in a batch have the same ID, the second fails at DB commit time with no partial results.
- **File upload partial failure**: If file upload succeeds but record save fails, the uploaded file may be orphaned (no cleanup unless field interceptor handles it).
- **Transaction nested call**: If `RunInTransaction` is called inside another transaction, it reuses the existing tx (`core/db_tx.go:28-29`). This prevents accidental new transactions but could surprise callers expecting new scope.
- **Hidden field bypass**: `record.SetIfFieldExists` is used for loading (`core/record_model.go:115`), but hidden fields are only stripped at the API layer (`apis/record_crud.go:122-124`). Low-level saves via `UnsafeWithoutHooks` could bypass this.

## Future Considerations

- **Batch chunking**: Process large batches in smaller chunks with individual commits to reduce lock contention and timeout risk.
- **DLQ for batch failures**: Route failed batch items to a durable queue for later retry instead of immediate error.
- **Streaming ingestion**: Support for streaming large record imports without loading entire payload into memory.
- **Independent scaling**: Extract ingestion, processing, and storage into separate processes/units for independent scale.
- **Backpressure mechanism**: Add readback pressure when DB connections are exhausted rather than queuing unbounded.
- **Field-level parallel validation**: Validate independent fields concurrently before building the full validation result.

## Questions / Gaps

- **No evidence found** for distributed tracing of batch flow through stages.
- **No evidence found** for pipeline observability beyond generic HTTP request logs.
- **No evidence found** for configurable batch item retry with backoff.
- **No evidence found** for bulk insert optimization (batch API currently creates one record at a time via `processInternalRequest`).
- **No evidence found** for pipeline staleness detection (e.g., if a record changes during batch processing).
- **No evidence found** for cross-collection transaction support (batch API only supports single collection operations per batch).

---

Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `pocketbase`.