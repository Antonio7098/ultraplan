# Repo Analysis: opencode

## Runtime Contract and API Shape

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | TypeScript / Node.js / Effect |
| Analyzed | 2026-05-17 |

## Summary

OpenCode exposes its runtime contract through two distinct layers: a generated JavaScript SDK (`packages/sdk/js/`) and a session-centric HTTP API. The SDK surfaces a rich client — `OpencodeClient` — with namespaced API groups (Session, Project, Pty, Config, etc.) and SSE-based event streaming. The session abstraction is the central unit of work: it holds messages, parts, files, cost/tokens, and metadata. Events flow through a typed `Event` discriminated union (`packages/sdk/js/src/gen/types.gen.ts:704-736`) published via SSE from `/global/event` and `/event`. Runtime-specific mechanics (CLI invocation, `--format json` output parsing, permission prompts, MCP servers, ACP sessions) are embedded within the server implementation and not abstracted behind a generalized runtime interface.

**Rating: 6/10**

The API is usable and reasonably structured, but runtime-specific details leak heavily through the SDK's design. The SDK is generated from OpenAPI specs with `@hey-api/openapi-ts`, producing a typed client that couples callers to OpenCode's internal API shapes (session IDs, message IDs, part IDs). Switching to a second runtime would require rewriting the caller to accommodate OpenCode's concrete types and HTTP routes.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| SDK client | `OpencodeClient` class with namespaced API groups (Session, Project, Pty, Config, Tool, etc.) | `packages/sdk/js/src/gen/sdk.gen.ts:1157-1197` |
| SDK server | `createOpencodeServer()` spawns `opencode serve` CLI process and waits for "opencode server listening" output | `packages/sdk/js/src/server.ts:22-100` |
| Session interface | `Session.Service` Effect service with `list`, `create`, `fork`, `get`, `messages`, `remove`, etc. | `packages/opencode/src/session/session.ts:452-500` |
| Session Info schema | `Session.Info` Schema.Struct with id, slug, projectID, workspaceID, directory, path, parentID, model, cost, tokens, time, permission, revert | `packages/opencode/src/session/session.ts:207-227` |
| HTTP API routes | Effect-HttpApi group for session with endpoints: list, create, fork, prompt, abort, share, summarize, etc. | `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:103-458` |
| Event types | Discriminated union of 30+ event variants (message.updated, session.created, session.error, etc.) | `packages/sdk/js/src/gen/types.gen.ts:704-736` |
| Message types | `UserMessage` and `AssistantMessage` with cost, tokens, finish reason, error discriminated union | `packages/sdk/js/src/gen/types.gen.ts:47-143` |
| Part types | TextPart, ReasoningPart, FilePart, ToolPart, StepStartPart, StepFinishPart, SnapshotPart, PatchPart, AgentPart, RetryPart, CompactionPart | `packages/sdk/js/src/gen/types.gen.ts:160-404` |
| Provider model | `Model` schema with id, providerID, api, name, capabilities, cost, limit, status, options, headers | `packages/opencode/src/provider/provider.ts:910-925` |
| Provider service | `Provider.Service` Interface with `list`, `getProvider`, `getModel`, `getLanguage`, `closest`, `defaultModel` | `packages/opencode/src/provider/provider.ts:989-1000` |
| LLM package | `LLMClient` with `generate`/`stream`/`prepare` for AI SDK integration | `packages/llm/src/index.ts:1-36` |
| ACP session manager | `ACPSessionManager` wraps OpencodeClient for ACP protocol sessions | `packages/opencode/src/acp/session.ts:8-122` |
| Runtime adapters | `runtime-adapters.ts` utility for disposable/setOption/hoveredLink patterns | `packages/app/src/utils/runtime-adapters.ts:1-39` |
| Tool execution | `ToolState` discriminated union: pending, running, completed, error | `packages/sdk/js/src/gen/types.gen.ts:237-292` |
| Token usage | `Tokens` struct with input, output, reasoning, cache.read, cache.write | `packages/sdk/js/src/gen/types.gen.ts:131-138` |

## Answers to Protocol Questions

### 1. What is the core abstraction?

The core abstraction is **Session**, defined in `packages/opencode/src/session/session.ts:207-227`. A Session is a first-class entity with an ID, slug, project association, directory path, parent-child relationship (forking), model configuration, cost/tokens, timestamps, permission ruleset, and revert state. It is the unit of persistence, correlation, and UI representation.

Secondary abstractions include:
- **Message** (`MessageV2.WithParts`): user or assistant message within a session, containing typed Parts (text, reasoning, tool calls, file references, step markers)
- **Model** (`packages/opencode/src/provider/provider.ts:910-925`): provider-registered language model with capabilities, cost, limits
- **Provider** (`packages/opencode/src/provider/provider.ts:927-936`): LLM provider with auth source, model registry

### 2. Minimal caller-facing API for start, send, stream, stop, inspect?

**Start/Send**: `Session.Service.create()` → `Session.Service.prompt()` (or `promptAsync`) → `MessageV2.WithParts` returned (`packages/opencode/src/session/session.ts:656-676`, `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`)

**Stream**: SSE via `OpencodeClient.event.subscribe()` at `/global/event` (`packages/sdk/js/src/gen/sdk.gen.ts:1145-1154`) or `Session.messages()` via HTTP polling (`packages/sdk/js/src/gen/sdk.gen.ts:605-610`)

**Stop**: `Session.Service.remove()` or `Session.Service.abort()` (`packages/opencode/src/session/session.ts:594`, route at `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:249-254`)

**Inspect**: `Session.Service.get()` returns `Session.Info`, `Session.Service.messages()` returns paginated `MessageV2.WithParts[]`, `Session.Service.diff()` returns `Snapshot.FileDiff[]` (`packages/opencode/src/session/session.ts:570`, `766`, `760`)

The SDK surfaces these as `client.session.create()`, `client.session.prompt()`, `client.session.messages()`, etc. (`packages/sdk/js/src/gen/sdk.gen.ts:431-700`)

### 3. Runtime-specific concepts that leak through the public API

Several runtime-specific concepts leak through the SDK and API:

- **SessionID, MessageID, PartID** are branded string types (`packages/opencode/src/session/schema`) that callers must hold and pass back — these are OpenCode-internal ID schemes with no abstraction
- **Directory routing**: most SDK calls require a `directory` query parameter to scope requests to a workspace (`x-opencode-directory` header injected by `createOpencodeClient()` at `packages/sdk/js/src/client.ts:46-51`)
- **Instance context middleware**: HTTP routes are scoped by `InstanceContextMiddleware` and `WorkspaceRoutingMiddleware` — callers must understand project/directory/workspace hierarchy
- **Process spawning**: `createOpencodeServer()` spawns `opencode serve` as a child process and parses stdout for URL discovery (`packages/sdk/js/src/server.ts:22-100`)
- **Agent config keys** (`agent`, `build`, `plan`, `explore`) are named after OpenCode's internal agent modes
- **Permission ruleset** is a concrete OpenCode permission model (`Permission.Ruleset` at `packages/opencode/src/permission`)
- **Event types** like `EventTuiCommandExecute` with specific command literals (`session.list`, `session.new`, `agent.cycle`) expose TUI internals

These leaks are acceptable for an application embedded in OpenCode, but they would be significant obstacles for a generalized SDK contract targeting multiple runtimes.

### 4. How are structured events and final outputs represented?

**Events**: `Event` discriminated union at `packages/sdk/js/src/gen/types.gen.ts:704-736` with 30+ variants. Each event has a `type` discriminator and a `properties` object. Events are delivered via SSE at `/global/event` and `/event`. Event types include: `message.updated`, `message.part.updated`, `session.status`, `session.idle`, `session.error`, `permission.updated`, `file.edited`, `todo.updated`, `command.executed`, etc.

**Final outputs**: `MessageV2.WithParts` (a message with its resolved parts) returned from `Session.Service.messages()` and `Session.Service.prompt()`. Parts include:
- `TextPart` with text, synthetic flag, ignored flag, timing metadata (`packages/sdk/js/src/gen/types.gen.ts:160-175`)
- `ToolPart` with callID, tool name, ToolState (pending/running/completed/error) (`packages/sdk/js/src/gen/types.gen.ts:294-305`)
- `StepFinishPart` with reason, snapshot, cost, tokens (`packages/sdk/js/src/gen/types.gen.ts:315-332`)
- `AssistantMessage` with finish reason (`finish` field at `packages/sdk/js/src/gen/types.gen.ts:140`), error discriminated union (`error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError` at `packages/sdk/js/src/gen/types.gen.ts:120`)

The `finish` field on `AssistantMessage` is a string (e.g., `"stop"`, `"length"`, `"model"`) but its valid values are not enumerated as a schema type — they appear to be provider-specific strings without a common taxonomy.

### 5. How are metadata fields represented?

**Provider/Model**: `Model` schema (`packages/opencode/src/provider/provider.ts:910-925`) has `providerID` (ProviderID branded string), `api` (id, url, npm), `name`, `capabilities` (temperature, reasoning, attachment, toolcall, modalities), `cost` (input, output, cache.read/write, optional tiers), `limit` (context, input, output), `status` (alpha/beta/deprecated/active), `options` (record), `headers` (record)

**Token usage**: `Tokens` struct (`packages/sdk/js/src/gen/types.gen.ts:131-138`) with input, output, reasoning, cache.read, cache.write. Embedded in `AssistantMessage` and `StepFinishPart`.

**Cost**: `Decimal` from `decimal.js` computed from token counts × cost rates, stored as `number` on `Session.Info.cost` and `AssistantMessage.cost`.

**Timings**: `time.created`, `time.updated`, `time.compacting`, `time.archived` as Unix milliseconds on `Session.Info` (`packages/opencode/src/session/session.ts:104-109`) and `time.start`/`time.end` on parts.

**Source runtime**: Not explicitly represented — the model/provider IDs implicitly encode the runtime. There is no explicit `runtime` field on messages or sessions that would identify whether the source is OpenCode CLI, ACP, or another runtime.

### 6. Room for OpenCode, Codex, Claude Code, ACP, direct LLM providers?

**LLM providers**: The `Provider.Service` and `Model` schema support arbitrary providers via `@ai-sdk/provider` protocol. OpenCode already supports Anthropic, OpenAI, Google, Azure, Amazon Bedrock, GitHub Copilot, OpenRouter, and many others (`packages/opencode/src/provider/provider.ts:91-117`). Adding a new provider requires a route definition with protocol, endpoint, auth, framing axes. The `LLMClient` in `packages/llm/` is Effect-based and schema-validated with clear separation between protocol implementations and provider wiring.

**Session abstraction**: Session is specific to OpenCode's session model. Codex/Claude Code do not share this concept. A wrapper targeting those runtimes would need to either (a) map their session concepts to OpenCode's session schema, or (b) provide a separate abstraction layer. The current `Session.Info` schema is tightly coupled to OpenCode fields (workspaceID, slug, permission, revert, compacting) that would not generalize.

**ACP protocol**: `ACPSessionManager` at `packages/opencode/src/acp/session.ts:8-122` wraps the SDK's `OpencodeClient` for ACP sessions, managing session lifecycle separately from the core Session service. This suggests ACP is a distinct runtime mode that reuses the HTTP client but not the Session service.

**Direct LLM**: The `LLMClient` in `packages/llm/` is designed for direct LLM interaction, decoupled from the session model. Tools can be defined with typed parameters and success schemas, and the runtime handles tool execution loops. This is the most runtime-agnostic part of the codebase and could serve as a template for a generalized wrapper.

## Architectural Decisions

1. **Generated SDK from OpenAPI**: The JavaScript SDK is auto-generated by `@hey-api/openapi-ts` from OpenAPI specs. This means the SDK's types are a direct reflection of the HTTP API surface, which is in turn a reflection of internal Effect services. Changes to the backend propagate automatically to SDK types.

2. **Session as central entity**: Everything — messages, parts, files, cost, tokens, permissions, diffs — is scoped to a Session. This makes the session the natural unit for persistence, sharing, and lifecycle management.

3. **Effect-based services**: Core domain services (Session, Provider, Message, etc.) are Effect-based Context.Services with typed interfaces. Service composition uses Effect's Layer system.

4. **Typed event bus**: Events are Schema-defined SyncEvent/BusEvent types with versioned schemas. The event system uses a discriminated union Event type delivered via SSE.

5. **Provider model catalog**: Providers and models are loaded from a combination of baked `models.dev` data, config file, environment variables, and auth credentials, with a priority/override chain.

6. **CLI as server**: `createOpencodeServer()` spawns the `opencode serve` CLI, which starts an HTTP server. The SDK communicates with it via HTTP+JSON or SSE.

## Notable Patterns

- **Branded ID types**: `SessionID`, `MessageID`, `PartID`, `ModelID`, `ProviderID` are branded strings ensuring type safety at boundaries (`packages/opencode/src/session/schema`, `packages/opencode/src/provider/schema.ts:5-29`)
- **Event versioning**: SyncEvent definitions include a `version` field and aggregate key, enabling event sourcing patterns (`packages/opencode/src/session/session.ts:332-368`)
- **Tool state machine**: ToolPart uses a `ToolState` discriminated union (pending → running → completed/error) with timing metadata and attachment support (`packages/sdk/js/src/gen/types.gen.ts:237-292`)
- **Provider multi-axis decomposition**: Routes are composed of Protocol × Endpoint × Auth × Framing, allowing provider reuse (OpenAI-compatible providers reuse OpenAIChat protocol) (`packages/llm/AGENTS.md:protocols/`)
- **Schema-first validation**: Effect Schema used throughout for request/response validation, with `Schema.TaggedErrorClass` for typed errors

## Tradeoffs

1. **SDK is tightly coupled to OpenCode HTTP API**: The generated SDK exposes OpenCode's internal routing hierarchy (session/{id}/message, session/{id}/prompt_async, etc.). A caller targeting a second runtime would need to either reimplement the same routes or maintain parallel SDK variants.

2. **Session is OpenCode-specific**: The session model includes OpenCode-specific fields (slug, workspaceID, permission ruleset, revert, compacting). These do not map cleanly to Codex or Claude Code session concepts.

3. **Directory-scoped routing**: Most API calls require directory context, which is an OpenCode-specific concept for multi-project workspaces. External callers must understand this scoping.

4. **No clear runtime abstraction**: There is no `Runtime` or `Provider` interface that would allow swapping the underlying execution engine. `createOpencodeServer()` hard-codes CLI spawning, and the SDK's `OpencodeClient` is generated from OpenCode's own API spec.

5. **Event types include TUI-specific variants**: `EventTuiCommandExecute` with specific command literals exposes internal TUI commands that are not relevant for programmatic SDK usage.

6. **Effect Schema at boundaries**: While Effect Schema provides strong typing, it couples the public API to Effect's type system. Callers in non-Effect environments must work around this.

## Failure Modes / Edge Cases

- **Server startup timeout**: `createOpencodeServer()` times out after configurable ms (default 5000) if "opencode server listening" message is not received (`packages/sdk/js/src/server.ts:43-47`)
- **Session not found**: `Session.Service.get()` returns `NotFoundError` if session ID does not exist (`packages/opencode/src/session/session.ts:570-574`)
- **Provider auth failure**: `ProviderAuthError` discriminated union on `AssistantMessage.error` surfaces auth failures per provider (`packages/sdk/js/src/gen/types.gen.ts:70-76`)
- **Message output length**: `MessageOutputLengthError` returned when output exceeds model limits (`packages/sdk/js/src/gen/types.gen.ts:85-90`)
- **Tool execution errors**: `ToolStateError` with error string, start/end timing (`packages/sdk/js/src/gen/types.gen.ts:277-289`). Errors that are not `ToolFailure` are treated as defects and fail the stream.
- **Abort race**: `Session.Service.remove()` races against active background jobs — it calls `cancelBackgroundJobs()` but the session may have already been removed from the database (`packages/opencode/src/session/session.ts:594-615`)
- **Permission prompts block**: Sessions can block waiting for permission responses (`Permission` type with id, type, pattern, title, metadata) at `packages/sdk/js/src/gen/types.gen.ts:423-437`

## Future Considerations

1. **Runtime interface**: A `Runtime` interface that abstracts `createOpencodeServer()` / `createOpencodeClient()` would allow swapping the execution backend. The current design hard-codes CLI spawning.

2. **Generic session abstraction**: If targeting Codex/Claude Code, the Session schema would need generalization — removing OpenCode-specific fields or making them optional with runtime-specific extensions.

3. **Provider extensibility**: The provider system already supports custom providers via config. A structured provider SDK would allow third parties to register providers without modifying core code.

4. **Event schema versioning**: The event system uses versioned SyncEvents, but the Event discriminated union in the SDK (`packages/sdk/js/src/gen/types.gen.ts:704-736`) is flat. A versioned event envelope would help with forward compatibility.

5. **Structured output schema**: The LLM package supports `LLMClient.generateObject()` with schema-driven output parsing. This could be a model for a generalized tool/artifact contract.

## Questions / Gaps

1. **No explicit runtime identifier**: Messages and sessions do not carry a `runtime` field indicating whether they originated from OpenCode CLI, ACP, or another runtime. This makes multi-runtime correlation difficult.

2. **finish reason is a string, not an enum**: `AssistantMessage.finish` at `packages/sdk/js/src/gen/types.gen.ts:140` is typed as `string` with no enumerated values. The valid set (stop, length, model, etc.) is implied but not enforced.

3. **SDK generation coupling**: The SDK is generated from OpenAPI specs that reflect internal implementation. There is no documented public API contract separate from the implementation.

4. **No streaming abstraction for tool calls**: Tool calls are returned as `ToolPart` with state machine transitions, but there is no `LLMEvent`-style stream abstraction for incremental tool argument parsing. The tool stream is implicit in part updates.

5. **Permission model is opaque**: `Permission.Ruleset` at `packages/opencode/src/permission` is referenced but its internal structure is not visible in the SDK types, making it difficult to programmatically construct or validate permission responses.

---

Generated by `study-areas/01-runtime-contract-and-api-shape.md` against `opencode`.