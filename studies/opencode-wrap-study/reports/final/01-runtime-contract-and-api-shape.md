# Protocol: Runtime Contract and API Shape - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/01-runtime-contract-and-api-shape.md` |
| Groups | go-plugin, opencode, sdk-go, t3code |
| Date | 2026-05-17 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | go-plugin | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` | go-plugin |
| 2 | opencode | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` | opencode |
| 3 | sdk-go | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` | sdk-go |
| 4 | t3code | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` | t3code |

## Executive Summary

This study examined four repositories to identify patterns for a Go SDK contract that wraps OpenCode (and potentially other AI runtimes). The repos span three distinct architectural approaches: a general plugin subprocess host (go-plugin), a session-centric TypeScript/Effect SDK for OpenCode itself (opencode), a Temporal workflow SDK (sdk-go), and a multi-runtime TypeScript contract system for coding agents (t3code).

**Key finding**: No repo provides a production-ready, runtime-agnostic SDK contract suitable for wrapping OpenCode. t3code comes closest with its `ProviderDriverKind` abstraction and schema-first contracts in `packages/contracts`, but it is TypeScript/Effect-based, not Go. The go-plugin and sdk-go repos are fundamentally the wrong domain — they model plugin subprocesses and Temporal workflows respectively, not AI agent runtimes. The opencode repo models its own runtime well but is tightly coupled to OpenCode's internal implementation.

**Recommendation**: A Go SDK for OpenCode should be built as a small, stable contract layer with: (1) a `Runtime` interface that abstracts process spawning and connection management, (2) a `Session` type for long-lived working directory contexts, (3) a `Turn` type for individual request/response cycles, (4) a typed event discriminated union for structured streaming, and (5) clear adapter boundaries that isolate OpenCode-specific mechanics (CLI invocation, `--format json`, permission prompts) from the public API.

## Core Thesis

The smallest useful Go SDK contract for wrapping OpenCode requires five elements: a runtime abstraction (not CLI spawning), a session entity (not just messages), a turn entity (for request/response granularity), a typed event schema (not raw stdout), and provider/metadata fields (for multi-runtime support). Most existing approaches fail because they conflate the transport mechanism (stdio, HTTP, WebSocket) with the abstraction boundary, or because they model the internal implementation rather than a stable external contract.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| t3code | 7/10 | Session→Thread→Turn→Item hierarchy with Effect/Schema contracts | Schema-first design with clear runtime abstraction; `ProviderDriverKind` open branded slug; `RuntimeEventRaw` escape hatch | TypeScript/Effect-based (not Go); `RuntimeEventRawSource` union enumerates known runtimes rather than truly open; token usage not normalized |
| opencode | 6/10 | Session-centric HTTP API with generated TypeScript SDK, SSE events | Well-structured `Session.Info` schema; rich `Event` discriminated union (30+ variants); Effect-based services with strong typing | Tightly coupled to OpenCode's HTTP API and internal types (`SessionID`, `MessageID`); generated SDK reflects implementation not public contract; no `Runtime` abstraction |
| go-plugin | 4/10 | Plugin-as-subprocess over RPC (net/rpc and gRPC) | Clean `Plugin`/`GRPCPlugin` interface pattern; handshake-based version negotiation; `Runner` abstraction for custom execution | No AI runtime concepts; no sessions/turns/messages; no structured events; subprocess-only design; `Protocol`/`MuxBroker`/`GRPCBroker` leak through |
| sdk-go | 3/10 | Workflow/Activity model against Temporal server via gRPC | Strong `Client`/`Worker` interface; deterministic replay; `SessionInfo` for session affinity | Tightly coupled to Temporal primitives (`TaskQueue`, `WorkflowTask`, `ActivityID`); no streaming API; no token/cost metering; no runtime abstraction |

## Approach Models

### t3code: Multi-Runtime Driver with Schema-First Contracts

t3code uses Effect's Schema system as the contract language. The core abstraction is `ProviderDriver` — an interface that abstracts how a runtime (Codex, OpenCode, Claude Code, ACP) is spawned, connected to, and communicated with. Runtime-specific mechanics are isolated in driver packages (`effect-codex-app-server`, `effect-acp`, `opencodeRuntime.ts`) while the contract layer (`packages/contracts`) contains only Effect Schema definitions with zero runtime dependencies.

The session model is **session → thread → turn → item** hierarchy, where:
- Session: a provider's long-lived connection to one working directory
- Thread: a conversation context within a session
- Turn: a single actor's contribution (user input or provider response)
- Item: individual产出 within a turn — messages, reasoning traces, plans, tool calls, file changes

Events flow through a 48-variant `ProviderRuntimeEventV2` discriminated union. Runtime-specific payloads can pass through unnormalized via `raw: RuntimeEventRaw`, which serves as an intentional escape hatch.

**Key insight**: The `ProviderDriverKind` is an open branded slug, not a closed union. Module docs explicitly state unknown drivers must be tolerated and marked unavailable rather than causing parse failures (`providerInstance.ts:18-28`). This is the clearest pattern for supporting multiple runtimes.

### opencode: Session-Centric HTTP API with Generated SDK

opencode models the runtime as a session server accessed via HTTP+JSON and SSE. The `Session` entity is central — it holds messages, parts, files, cost/tokens, and metadata. The SDK is auto-generated from OpenAPI specs via `@hey-api/openapi-ts`, coupling callers to OpenCode's internal API shapes.

Events are delivered via SSE at `/global/event` and `/event` using a typed `Event` discriminated union (`packages/sdk/js/src/gen/types.gen.ts:704-736`). The session model is rich with fields like `slug`, `workspaceID`, `permission`, `revert`, `compacting` that are OpenCode-specific.

**Key insight**: The `LLMClient` in `packages/llm/` is the most runtime-agnostic part — it uses Effect-based schemas and clear separation between protocol implementations and provider wiring, and supports `@ai-sdk/provider` protocol for multiple providers.

### go-plugin: Interface-Based Plugin Host with RPC Transport

go-plugin exposes two public interfaces (`Plugin` and `GRPCPlugin`) that plugin authors implement, and two client-side types (`Client` and `ServeConfig`) that hosts use. The library supports both `net/rpc` and `gRPC` transport protocols. There is no concept of sessions, turns, structured events, or JSON event streams.

**Key insight**: The `Plugin`/`GRPCPlugin` interface pattern is clean — plugin authors implement `Server()` that returns an RPC server and `Client()` that returns the interface stub. However, this is designed for interface dispatch, not AI agent sessions.

### sdk-go: Workflow/Activity Model Against Temporal Server

sdk-go (Temporal Go SDK) models computation as workflows (deterministic Go functions with `workflow.Context`) and activities (context-aware functions with heartbeats). The `Client` interface connects to Temporal server; `Worker` registers handlers.

**Key insight**: The `SessionInfo` abstraction (`workflow/session.go:7-144`) groups activity executions with session affinity, but this is Temporal-specific (task queue binding, host name). There is no streaming API — `WorkflowRun.Get()` blocks until completion.

## Pattern Catalog

### Pattern 1: Branded ID Types for Type-Safe Boundaries

Both opencode and t3code use branded string types for IDs to prevent mixing session, message, part, and model IDs.

- opencode: `SessionID`, `MessageID`, `PartID`, `ModelID`, `ProviderID` at `packages/opencode/src/session/schema`, `packages/opencode/src/provider/schema.ts:5-29`
- t3code: `ProviderDriverKind` (`providerInstance.ts:70`), `ProviderInstanceId` (`providerInstance.ts:82`) using `slugSchema.pipe(Schema.brand(...))`

**When to copy**: Use branded slugs for all ID types in the SDK public API. This prevents callers from accidentally passing a SessionID where a MessageID is expected.

**When overkill**: Internal implementation IDs that never cross the SDK boundary don't need branding.

### Pattern 2: Discriminated Union Event Schema

t3code and opencode both use discriminated union event types with a `type` discriminant and `payload` object.

- t3code: `ProviderRuntimeEventV2` 48-variant union at `providerRuntime.ts:951-999`
- opencode: `Event` discriminated union at `packages/sdk/js/src/gen/types.gen.ts:704-736` with 30+ variants

**When to copy**: A discriminated union enables exhaustive switch handling by callers and clear event categorization. This is superior to opaque event envelopes or string-based event names.

**When overkill**: For fewer than 5 event types, a simpler callback-based API may suffice.

### Pattern 3: Open Branded Slug for Driver/Provider Selection

t3code's `ProviderDriverKind` is explicitly designed as an open union, not a closed set. Module docs state unknown drivers must be tolerated and marked unavailable rather than causing parse failures.

- `ProviderDriverKind = slugSchema.pipe(Schema.brand("ProviderDriverKind"))` at `providerInstance.ts:70`
- `providerInstance.ts:18-28` explicitly discusses tolerance for unknown drivers

**When to copy**: For a multi-runtime SDK, the driver/provider kind should be an open branded slug, not an enum. This allows new runtimes to be added without modifying the SDK's type definitions.

**When overkill**: For a single-runtime SDK (e.g., OpenCode-only), a closed enum may be acceptable.

### Pattern 4: Raw Event Escape Hatch

t3code includes `raw: RuntimeEventRaw` on every event (`providerRuntime.ts:260`), allowing runtime-specific payloads to pass through without normalization. This is an intentional escape hatch documented in the module.

**When to copy**: Include an escape hatch for runtime-specific payloads that don't fit the normalized schema. Without this, adding new event types requires modifying the discriminated union, which is a breaking change.

**When overkill**: If the event schema is comprehensive enough to handle all known cases, the escape hatch adds complexity.

### Pattern 5: Session as Central Entity

Both opencode and t3code model sessions as first-class entities with ID, state, metadata, and lifecycle methods.

- opencode: `Session.Info` at `packages/opencode/src/session/session.ts:207-227` with id, slug, projectID, workspaceID, directory, path, parentID, model, cost, tokens, time, permission, revert
- t3code: `ProviderSession` at `provider.ts:34-50` with provider, providerInstanceId, status, runtimeMode, cwd, model, threadId

**When to copy**: A session entity provides natural persistence, sharing, and lifecycle management boundaries. It groups messages, turns, and metadata under a single correlating ID.

**When overkill**: For stateless, single-turn use cases, a session may be unnecessary overhead.

### Pattern 6: Schema-Based Legacy Migration

t3code's `ModelSelection` schema uses `SchemaTransformation.transformOrFail` to automatically decode legacy `{provider, model}` payloads to `{instanceId, model}`, preserving backward compatibility without runtime compatibility code (`orchestration.ts:64-114`).

**When to copy**: If the SDK must persist data that may have been created with older schemas, include transform functions that migrate legacy formats on decode.

**When overkill**: If there is no persisted state, or if the SDK is at version 1.0 with no legacy data, transforms add unnecessary complexity.

### Pattern 7: Effect Context/Layer for Runtime Services

t3code's `OpenCodeRuntime extends Context.Service` (`opencodeRuntime.ts:546`) uses Effect's dependency injection, allowing the runtime to be swapped or mocked in tests.

**When to copy**: If using Go, the equivalent pattern is interface-based dependency injection with constructor options (not Effect's specific mechanisms). Define a `Runtime` interface and allow callers to provide mock implementations in tests.

**When overkill**: For simple SDKs without complex service composition, a concrete constructor may suffice.

## Key Differences

### Why go-plugin and sdk-go score low (4/10 and 3/10)

go-plugin and sdk-go are not AI runtime abstraction libraries — they model different domains. go-plugin is a plugin subprocess host system; sdk-go is a Temporal workflow SDK. Neither has concepts of:
- Sessions or turns for AI agent workflows
- Structured JSON event streams for streaming outputs
- Provider/model metadata fields
- Non-deterministic execution support

These are fundamental gaps, not implementable features. A wrapper SDK for OpenCode would need a completely different architecture.

### Why t3code scores highest (7/10)

t3code's design explicitly addresses multi-runtime composition. Its `ProviderDriverKind` abstraction, schema-first contracts, and escape hatch mechanism are precisely what the study area requires. The main weaknesses are:
1. TypeScript/Effect-based (not Go)
2. `RuntimeEventRawSource` union enumerates known runtimes rather than being truly open
3. Token usage reporting not normalized across providers

### Why opencode scores 6/10

opencode models its own runtime well — the session abstraction, event discriminated union, and provider system are well-designed. However, it is tightly coupled to OpenCode's internal HTTP API, generated SDK types, and session schema. There is no `Runtime` interface that would allow swapping the underlying execution engine.

## Tradeoffs

### Tradeoff 1: Schema-First vs. Interface-First

**Schema-first** (t3code): Effect Schema definitions provide compile-time type narrowing and validation at boundaries. Schemas can be used for codegen, documentation, and runtime validation.

**Interface-first** (go-plugin): Plain TypeScript interfaces with concrete implementation types. Simpler mental model but no automatic validation or codegen.

**Best-fit**: Schema-first for a stable, well-documented SDK contract. Interface-first for a quick implementation or internal use.

**Go equivalent**: Go's `encoding/json` and `schema` packages provide some schema-like functionality, but not as powerful as Effect Schema. Consider using protobuf or JSON Schema for cross-language compatibility.

### Tradeoff 2: Closed Enum vs. Open Branded Slug

**Closed enum** (like `Protocol` in go-plugin at `protocol.go:11-18`): Compile-time exhaustiveness, clear known values. Adding a new value requires modifying the enum.

**Open branded slug** (like `ProviderDriverKind` in t3code): Flexibility for unknown values, tolerance for forks and new drivers. Unknown values are parsed but marked unavailable.

**Best-fit**: Open branded slug for multi-runtime SDKs where new runtimes may be added. Closed enum for stable, mature APIs.

**Go equivalent**: Define a `type DriverKind string` with a `IsValid()` method that checks against a registry, rather than a Go `const` enum.

### Tradeoff 3: Flat Event Union vs. Hierarchical Events

**Flat discriminated union** (t3code's `ProviderRuntimeEventV2`): Single switch statement handles all events, easy to add new variants, but the union grows indefinitely.

**Hierarchical events** (like `SyncEvent` in opencode at `packages/opencode/src/session/session.ts:332-368`): Base event with aggregates and version fields, enabling event sourcing patterns.

**Best-fit**: Flat discriminated union for SDK contracts that need to be easily comprehensible. Hierarchical for systems that need event sourcing and replay.

**Go equivalent**: A `type Event interface` with a `EventType()` method, plus concrete implementation types.

### Tradeoff 4: Embedded Runtime vs. External Adapter

**Embedded runtime** (opencode's `createOpencodeServer()` at `packages/sdk/js/src/server.ts:22-100`): SDK spawns and manages the runtime process, transparent to caller.

**External adapter** (t3code's `OpenCodeRuntimeShape` at `opencodeRuntime.ts:108-148`): Caller provides the runtime process, SDK connects to it.

**Best-fit**: Embedded for simplicity and self-containment. External for flexibility and multi-runtime support.

**Go equivalent**: Both patterns are implementable. An embedded `NewClient(config *ClientConfig)` that spawns a subprocess is like opencode. A `Dial(addr string)` or `Connect(rt Runtime)` is like t3code.

### Tradeoff 5: Blocking Get vs. Streaming Events

**Blocking Get** (sdk-go's `WorkflowRun.Get`): Simple programming model. Caller blocks until result is ready.

**Streaming events** (opencode's SSE, t3code's WebSocket push): Real-time updates. Caller processes events as they arrive.

**Best-fit**: Blocking Get for workflows with clear completion states. Streaming for AI agents with incremental output.

**Go equivalent**: `chan Event` or `context.Context` with cancellation for streaming. `Receive()` blocking call for simple use cases.

## Decision Guide

**Q: Should the SDK use branded ID types?**
Yes. Use branded strings for all ID types (SessionID, MessageID, TurnID, etc.) to prevent type confusion at the API boundary. t3code at `providerInstance.ts:70-82` and opencode at `packages/opencode/src/session/schema` both demonstrate this.

**Q: Should events use a discriminated union or a base interface with type switch?**
Use a discriminated union (like t3code at `providerRuntime.ts:951-999`) for clear event categorization and exhaustive switch handling by callers.

**Q: Should the driver/provider kind be a closed enum or open slug?**
Open slug (like t3code's `ProviderDriverKind`). A closed enum requires SDK changes to add new runtimes. An open slug with a registry allows extension without modification.

**Q: Should the SDK embed the runtime or expect an external runtime?**
Start with embedded (SDK spawns and manages the OpenCode subprocess), like opencode's `createOpencodeServer()`. This simplifies the initial implementation. External adapters can be added as a separate pattern.

**Q: Should the SDK provide blocking Get or streaming events?**
Both. Provide `Stream()` for real-time event consumption and `Await()` for waiting on final completion. sdk-go's `WorkflowRun.Get` is a good model for the blocking pattern.

**Q: Should token usage be normalized or provider-specific?**
Normalized, but with escape hatches. t3code's `TurnCompletedPayload.usage: Schema.Unknown` is a known gap. A normalized struct with provider-specific extensions is preferable.

**Q: Should the SDK use Effect/Schema for validation?**
If targeting TypeScript, yes. If targeting Go, use protobuf or JSON Schema for cross-language compatibility. opencode's `Schema.TaggedErrorClass` pattern for typed errors is worth studying.

## Practical Tips

1. **Define a small `Runtime` interface first**: The interface should cover process spawning, connection management, and event consumption. Everything else builds on this.

2. **Use branded ID types from day one**: Retrofitting type safety for IDs is painful. Define `type SessionID string` with validation and use it everywhere.

3. **Include an escape hatch for raw events**: A normalized event schema will never capture all runtime-specific details. `raw: map[string]any` or similar allows passthrough without losing type safety.

4. **Model sessions, not just messages**: A session entity provides natural lifecycle boundaries (start, fork, stop, inspect). Single-message abstractions don't support long-running workflows.

5. **Separate provider configuration from runtime abstraction**: The `ProviderDriverKind` / `ProviderInstanceId` split in t3code is correct — "which driver" is separate from "which configured instance of that driver."

6. **Use structured events for streaming, not raw stdout**: go-plugin's raw stdout/stderr streaming is insufficient for AI agent SDKs. A typed event schema (like t3code's `content.delta`) enables proper handling.

7. **Prefer interface composition over inheritance**: The `Plugin`/`GRPCPlugin` pattern in go-plugin shows interface-based composition works well for runtime abstraction.

## Anti-Patterns / Caution Signs

**Anti-pattern**: Exposing transport details in public API (go-plugin's `Protocol`, `MuxBroker`, `GRPCBroker`, port ranges)

**Anti-pattern**: Generated SDK that reflects internal implementation rather than public contract (opencode's SDK generated from OpenAPI specs)

**Anti-pattern**: No runtime abstraction — hard-coded CLI spawning or Temporal-specific types leak through

**Anti-pattern**: Closed enum for driver/provider selection — adding a new runtime requires SDK changes

**Anti-pattern**: Flat string event names instead of typed discriminated unions — enables "stringly-typed" code

**Anti-pattern**: No token/cost metering fields — AI agent SDKs need usage tracking

**Caution sign**: Session schema includes product-specific fields (workspaceID, permission, revert, compacting) that don't generalize to other runtimes

**Caution sign**: Finish reason typed as `string` rather than enumerated union — valid values are implied but not enforced

**Caution sign**: Effect Schema at public API boundaries couples the SDK to Effect's type system — callers in non-Effect environments must work around this

## Notable Absences

**No Go SDK with runtime abstraction found**: The study examined four repos spanning Go and TypeScript, but no existing Go SDK provides the runtime abstraction pattern needed for OpenCode wrapping. The t3code contracts are TypeScript/Effect-based; go-plugin and sdk-go are Go but in the wrong domain.

**No streaming API in sdk-go**: The Temporal Go SDK has no way to stream incremental workflow results. `WorkflowRun.Get` blocks until completion. AI agent tooling requires real-time token streaming.

**No direct LLM provider support in t3code**: Only CLI-based runtimes (Codex app-server, OpenCode serve) have driver implementations. A direct HTTP-based LLM driver would require defining the adapter interface more explicitly.

**No multi-runtime SDK with Go**: None of the studied repos provide a Go SDK that targets multiple AI runtimes. This is the gap the study aims to fill.

## Per-Repo Notes

### go-plugin

The `Plugin`/`GRPCPlugin` interface pattern is clean and worth studying. The handshake-based version negotiation is a good pattern for ensuring compatibility. However, the library is fundamentally a plugin subprocess host, not an AI runtime SDK. It has no concept of sessions, turns, structured events, or JSON event streams. The `Protocol` type and broker mechanisms (MuxBroker, GRPCBroker) are low-level transport details that would not belong in a high-level AI SDK.

The `Runner` interface (`runner/runner.go:7-14`) is notable — it allows custom subprocess execution, enabling reattachment and non-standard process management. This is a good pattern for supporting different process spawning strategies.

**For Go SDK design**: The interface-based plugin registration pattern is worth adopting. The subprocess lifecycle management is the runtime's concern, not the SDK's.

### opencode

The session model is well-designed — `Session.Info` captures all the right fields (id, slug, projectID, directory, model, cost, tokens, time, permission). The `Event` discriminated union at `packages/sdk/js/src/gen/types.gen.ts:704-736` is comprehensive (30+ variants). The Effect-based services with typed errors are production-quality.

However, the SDK is generated from OpenAPI specs that reflect internal implementation. The `SessionID`, `MessageID`, `PartID` branded types are OpenCode-internal ID schemes. The `createOpencodeServer()` hard-codes CLI spawning.

**For Go SDK design**: The session abstraction, event discriminated union, and provider system are all worth borrowing from. The SDK generation approach (from OpenAPI) is problematic — better to define the public API contract first, then implement against it.

### sdk-go

The sdk-go repo is the Temporal Go SDK, not an OpenCode wrapper. Its `Client`/`Worker` interfaces are well-designed for Temporal, but Temporal's execution model (workflows, activities, task queues, deterministic replay) is fundamentally different from AI agent runtimes.

The `SessionInfo` abstraction (`workflow/session.go:7-144`) groups activity executions with session affinity, but this is tightly coupled to Temporal's task queue model.

**For Go SDK design**: The `Client` interface design is worth studying, but the underlying execution model is not applicable.

### t3code

t3code is the most relevant repo for the study's goals. Its `ProviderDriverKind` abstraction, schema-first contracts, and session→thread→turn→item hierarchy are precisely the patterns needed. The `RuntimeEventRaw` escape hatch is correct. The `ModelSelection` schema transformation for legacy migration is a good pattern.

The main weaknesses are: TypeScript/Effect-based (not Go), `RuntimeEventRawSource` union enumerates known runtimes (not truly open), token usage not normalized across providers.

**For Go SDK design**: Adopt the design patterns, not the implementation technology. The contract design (session, thread, turn, item, events, provider/driver abstraction) translates to Go even though Effect Schema does not.

## Open Questions

1. **Go schema validation**: Effect Schema provides powerful compile-time and runtime validation. What is the Go equivalent? Protobuf with `protoreflect`? `gojsonschema`? Custom validation functions? The choice affects how type safety is achieved at the SDK boundary.

2. **Event schema versioning**: t3code's 48-event union grows indefinitely. How should event schema evolution be managed? A version field on events? A separate schema registry? Backward-compatible transforms?

3. **Runtime process management**: Should the Go SDK spawn and manage the OpenCode subprocess (like opencode's `createOpencodeServer()`), or expect the caller to manage the process and just provide a connection (like t3code's `OpenCodeRuntimeShape`)?

4. **Cancellation semantics**: How should turn interruption work? `ProviderInterruptTurnInput` in t3code takes an optional `turnId`. The behavior when `turnId` is omitted needs definition.

5. **Direct LLM provider support**: Should the Go SDK support direct LLM API providers (OpenAI, Anthropic) in addition to CLI-based runtimes (OpenCode, Codex)? The t3code design leaves room for this but doesn't implement it.

## Evidence Index

### go-plugin

- `Plugin` interface: `plugin.go:24-32`
- `GRPCPlugin` interface: `plugin.go:36-46`
- `Client` struct: `client.go:89-118`
- `ClientConfig` struct: `client.go:142-277`
- `ServeConfig` struct: `server.go:62-104`
- `ClientProtocol` interface: `protocol.go:38-48`
- `ServerProtocol` interface: `protocol.go:20-36`
- `Protocol` type: `protocol.go:11-18`
- `HandshakeConfig`: `server.go:35-55`
- `MuxBroker`: `mux_broker.go:32-38`
- `GRPCBroker`: `grpc_broker.go:262-280`
- `BasicError`: `error.go:10-12`
- `Runner` interface: `runner/runner.go:7-14`
- `Discover` function: `discover.go:19-30`

### opencode

- `OpencodeClient` class: `packages/sdk/js/src/gen/sdk.gen.ts:1157-1197`
- `createOpencodeServer()`: `packages/sdk/js/src/server.ts:22-100`
- `Session.Info` schema: `packages/opencode/src/session/session.ts:207-227`
- `Session.Service` interface: `packages/opencode/src/session/session.ts:452-500`
- `Event` discriminated union: `packages/sdk/js/src/gen/types.gen.ts:704-736`
- `Model` schema: `packages/opencode/src/provider/provider.ts:910-925`
- `Provider.Service`: `packages/opencode/src/provider/provider.ts:989-1000`
- `LLMClient`: `packages/llm/src/index.ts:1-36`
- `ACPSessionManager`: `packages/opencode/src/acp/session.ts:8-122`
- `ToolState` discriminated union: `packages/sdk/js/src/gen/types.gen.ts:237-292`
- `Tokens` struct: `packages/sdk/js/src/gen/types.gen.ts:131-138`

### sdk-go

- `Client` interface: `client/client.go:995-1535`
- `WorkflowRun` type: `client/client.go:255-256`
- `Worker` interface: `worker/worker.go:26-52`
- `workflow.Context`: `workflow/workflow.go:259-335`
- `SessionInfo`: `workflow/session.go:7-144`
- `DataConverter` interface: `converter/data_converter.go:1-50`
- `StartWorkflowOptions`: `client/client.go:231`
- `HistoryEventIterator`: `client/client.go:1117`
- `WorkflowUpdateHandle`: `client/client.go:653-655`
- `sdkName` hardcoded: `internal/internal_event_handlers.go:167`

### t3code

- `ProviderDriverKind` branding: `providerInstance.ts:70`
- `ProviderInstanceId` branding: `providerInstance.ts:82`
- `ProviderRuntimeEventBase` fields: `providerRuntime.ts:247-261`
- `RuntimeEventRawSource` union: `providerRuntime.ts:21-31`
- `CanonicalItemType`: `providerRuntime.ts:121-132`
- `ProviderRuntimeEventV2` union: `providerRuntime.ts:951-999`
- `RuntimeSessionState`: `providerRuntime.ts:52-60`
- `ThreadTokenUsageSnapshot`: `providerRuntime.ts:306-323`
- `ProviderSession`: `provider.ts:34-50`
- `ProviderSessionStartInput`: `provider.ts:53-64`
- `ProviderSendTurnInput`: `provider.ts:67-77`
- `OpenCodeRuntimeShape`: `opencodeRuntime.ts:108-148`
- `builtInDrivers`: `provider/builtInDrivers.ts:1-10`
- `OpenCodeRuntime extends Context.Service`: `opencodeRuntime.ts:546`

---

Generated by protocol `study-areas/01-runtime-contract-and-api-shape.md` against repos go-plugin, opencode, sdk-go, t3code.