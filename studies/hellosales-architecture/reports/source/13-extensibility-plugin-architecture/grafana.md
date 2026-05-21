# Source Analysis: grafana

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-21 |

## Summary

Grafana implements a mature, production-grade plugin architecture with clear separation between core and external plugins. The system uses a **pipeline-based loader** with distinct stages (Discovery → Bootstrap → Validation → Initialization → Termination) and **process isolation** via HashiCorp `go-plugin` for backend plugins. Extension points exist for data processing (middleware chain), auth (header clearing), and frontend React components. Plugin verification includes signature validation, module.js checks, and Angular detection. The architecture prioritizes security through environment variable whitelisting, header sanitization, and a deprecated sandbox feature.

## Rating

**8/10** — Very strong implementation with minor gaps. Process isolation for backend plugins is exemplary. Frontend extensibility is limited compared to backend plugin model. Sandbox for frontend plugins is present but appears deprecated.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin Loader | `Loader` struct orchestrates 5-stage pipeline | `pkg/plugins/manager/loader/loader.go:21-30` |
| Plugin Registry | In-memory registry with alias support, thread-safe | `pkg/plugins/manager/registry/in_memory.go:12-16` |
| Backend Plugin Interface | `Plugin` interface requires Start/Stop/QueryData/CheckHealth | `pkg/plugins/backendplugin/ifaces.go:12-30` |
| Lifecycle Pipeline | Discovery→Bootstrap→Validation→Initialization→Termination | `pkg/plugins/manager/loader/loader.go:61-118` |
| gRPC Plugin (Process Isolation) | Uses HashiCorp go-plugin, protocol version >= 2 required | `pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:86-89` |
| Signature Validation | `Validator` checks SignatureStatusValid/Invalid/Modified/Unsigned | `pkg/plugins/manager/signature/signature.go:8-10,56-85` |
| Env Var Isolation | Permitted list only: proxy vars + PLUGIN_UNIX_SOCKET_DIR | `pkg/plugins/envvars/envvars.go:12-25` |
| Middleware Chain | 15 middleware components for plugin requests | `pkg/services/pluginsintegration/pluginsintegration.go:185-222` |
| Auth Header Clearing | Clears auth headers before forwarding to plugins | `pkg/services/pluginsintegration/clientmiddleware/clear_auth_headers_middleware.go:31-42` |
| Plugin Health Check | `CheckHealth` handler on Plugin interface | `pkg/plugins/backendplugin/ifaces.go:23` |
| Process Manager | Auto-restart for managed plugins | `pkg/plugins/manager/process/process.go:48-87` |
| Extension Models | ExtensionsV2 with AddedLinks/Components/ExtensionPoints | `pkg/plugins/models.go:61-67` |
| Hooks Service | IndexDataHook for index page modification | `pkg/services/hooks/hooks.go:1-26` |
| Core Plugin | In-memory target, no separate process | `pkg/plugins/backendplugin/coreplugin/core_plugin.go:77-79` |
| Client Service | Routes all plugin calls through registry | `pkg/plugins/manager/client/client.go:50-95` |
| Validation Steps | Signature, ModuleJS, Angular detection | `pkg/plugins/manager/pipeline/validation/steps.go:16-21` |
| Sandbox (deprecated) | Frontend sandbox config present | `pkg/services/pluginsintegration/sandbox/sandbox.go:23-24` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**Discovery:** Plugins are discovered via `plugins.PluginSource` implementations. `LocalSource` (`pkg/plugins/manager/sources/source_local_disk.go:1-288`) reads `plugin.json` files recursively from configured paths. The `Discovery` stage (`pkg/plugins/manager/pipeline/discovery/discovery.go:54-82`) applies `FilterFunc` steps.

**Loading:** The `Loader` (`pkg/plugins/manager/loader/loader.go:61-118`) runs a 5-stage pipeline:
1. **Discovery** — finds plugin bundles from source
2. **Bootstrap** — constructs plugin metadata from plugin.json
3. **Validation** — signature, Module.js, Angular checks
4. **Initialization** — registers backend client, starts process, adds to registry
5. **Termination** — stops process, deregisters on unload

**Verification:** Three validation steps (`pkg/plugins/manager/pipeline/validation/steps.go:16-21`):
- Signature validation (`pkg/plugins/manager/signature/signature.go:28-85`) — rejects invalid/modified/unsigned (unless authorized)
- ModuleJS validation (`pkg/plugins/manager/pipeline/validation/steps.go:58-77`) — checks module.js exists
- Angular detection (`pkg/plugins/manager/pipeline/validation/steps.go:98-124`) — blocks Angular plugins when disabled

### 2. What extension points exist for custom business logic?

**Backend extension points:**
- `backend.QueryDataHandler` — intercept/handle data queries
- `backend.CheckHealthHandler` — custom health checks
- `backend.CallResourceHandler` — intercept HTTP resource calls
- `backend.StreamHandler` — real-time streaming
- `backend.AdmissionHandler` — mutate/validate admission requests
- `backend.ConversionHandler` — object conversion

**Frontend extension points:**
- `AddedLinks` — add links to extension points (`pkg/plugins/models.go:116-120`)
- `AddedComponents` — React components (`pkg/plugins/models.go:122-126`)
- `ExposedComponents` — components exposed by plugins (`pkg/plugins/models.go:134-138`)
- `ExtensionPoints` — define where plugins can attach (`pkg/plugins/models.go:140-144`)
- `AddedFunctions` — JavaScript functions (`pkg/plugins/models.go:128-132`)

**Hooks Service:**
- `IndexDataHook` for index page modification (`pkg/services/hooks/hooks.go:8-25`)

**Middleware chain** (`pkg/services/pluginsintegration/pluginsintegration.go:185-222`):
- Tracing, metrics, contextual logging
- Auth: `ClearAuthHeadersMiddleware`, `OAuthTokenMiddleware`
- Data: `CachingMiddleware`
- Headers: `CookiesMiddleware`, `ForwardIDMiddleware`

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**Process isolation:** Backend plugins run as separate processes via HashiCorp `go-plugin` (`pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:68-103`). A plugin crash only kills the plugin process, not Grafana.

**Environment variable whitelisting:** Only 7 env vars can pass to plugins (`pkg/plugins/envvars/envvars.go:12-25`): proxy settings + `PLUGIN_UNIX_SOCKET_DIR`.

**Auth header clearing:** `ClearAuthHeadersMiddleware` (`pkg/services/pluginsintegration/clientmiddleware/clear_auth_headers_middleware.go:1-102`) strips authentication headers before forwarding to plugins, preventing credential leakage.

**Header sanitization:** `removeConnectionHeaders`, `removeHopByHopHeaders`, `removeNonAllowedHeaders` in client (`pkg/plugins/manager/client/client.go:323-380`) sanitize headers on both request and response.

**Auto-restart with watchdog:** `ProcessManager` (`pkg/plugins/manager/process/process.go:48-87`) auto-restarts crashed managed plugins with a 1-second ticker.

**Decommissioning:** Plugins can be decommissioned (`Decommission()`/`IsDecommissioned()` in `pkg/plugins/backendplugin/ifaces.go:19-20`) to stop serving new requests.

**Plugin unavailable error:** `ErrPluginUnavailable` (`pkg/plugins/manager/client/client.go:35`) returned when plugin not started/failed.

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**Protocol versioning:** gRPC plugin protocol requires version >= 2 (`pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:86-89`). The `NegotiatedVersion()` method on the plugin client determines compatibility.

**Extension model versioning:** `ExtensionsV2` struct (`pkg/plugins/models.go:61-67`) with fallback unmarshaling for deprecated V1 format (`pkg/plugins/models.go:85-111`). Version detection during plugin.json parsing.

**Plugin JSON schema:** `ReadPluginJSON()` in `pkg/plugins/plugins.go:140-205` parses metadata with validation.

**Interface methods not versioned:** Backend plugin interface (`pkg/plugins/backendplugin/ifaces.go:12-30`) uses Go interface composition from `grafana-plugin-sdk-go/backend`. No explicit version field in the interface itself — compatibility maintained through the SDK's protocol negotiation.

### 5. What debugging and observability exists for plugin execution?

**Logging:** Each plugin has a logger (`Logger()` in `pkg/plugins/backendplugin/ifaces.go:14`). Pipeline stages log at debug level with timing (`pkg/plugins/manager/loader/loader.go:69,84,96,108`). State machine in `grpcPlugin` logs debug messages for not-started/init/fail/stopped states (`pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:154-172`).

**Tracing:** OpenTelemetry tracer used throughout pipeline (`pkg/plugins/manager/pipeline/discovery/discovery.go:7-8,57-60`). Span attributes include plugin class.

**Metrics:** `MetricsMiddleware` in middleware chain (`pkg/services/pluginsintegration/pluginsintegration.go:188`).

**Error tracking:** `pluginerrs.ErrorTracker` records/clears errors per plugin (`pkg/plugins/manager/loader/loader.go:49-58,111-113`).

**Health checks:** `CheckHealth` handler (`pkg/plugins/backendplugin/ifaces.go:23`) allows plugins to report health status.

**Instrumented load:** `instrumentLoad()` at `pkg/plugins/manager/loader/loader.go:124-145` logs plugin names and load duration.

## Architectural Decisions

1. **Pipeline architecture** — Loading split into discrete, composable stages (Discovery→Bootstrap→Validation→Initialization→Termination) allows independent evolution and easy insertion of new validation/initialization steps.

2. **HashiCorp go-plugin for process isolation** — External backend plugins run as separate processes with gRPC communication. This provides fault isolation at the cost of serialization overhead.

3. **In-memory registry with aliases** — Thread-safe map with alias support allows single-version plugins with multiple IDs (`pkg/plugins/manager/registry/in_memory.go:12-16`).

4. **Middleware chain for request processing** — 15 middleware components layer concerns (tracing, metrics, auth, caching) without modifying core plugin logic.

5. **Signature validation as gate** — Plugin loading blocked for invalid/modified signatures unless explicitly authorized. Internal (core) plugins exempt.

6. **Environment variable whitelist** — Only explicitly permitted env vars pass to plugin processes, limiting information leakage.

7. **Core plugins run in-process** — `TargetInMemory` (`pkg/plugins/backendplugin/coreplugin/core_plugin.go:77-79`) means core plugins don't fork separate processes.

## Notable Patterns

1. **State machine for plugin lifecycle** — `pluginStateNotStarted` → `pluginStateStartInit` → `pluginStateStartSuccess/pluginStateStartFail` → `pluginStateStopped` (`pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:30-36`). Prevents invalid state transitions.

2. **Middleware composition** — `backend.HandlerMiddlewareFunc` adapter wraps `http.Handler`-style middleware for plugin request processing.

3. **Handler interface composition** — `Plugin` interface embeds multiple `backend.Handler` interfaces (CollectMetrics, CheckHealth, QueryData, etc.) (`pkg/plugins/backendplugin/ifaces.go:22-29`).

4. **Deferred error recording** — Errors during bootstrap/validation recorded but don't stop pipeline; failed plugins skipped (`pkg/plugins/manager/loader/loader.go:76-81,91-93`).

5. **Static FS for strict mode** — Files captured at load time prevent "sneak in" attacks (`pkg/plugins/manager/sources/source_local_disk.go:117-126`).

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Process isolation vs performance | go-plugin adds serialization overhead; in-memory (core) plugins avoid this but lack isolation |
| Angular detection | Blocking Angular plugins limits plugin ecosystem but improves security and enables future React migration |
| Sandbox (frontend) | Present but appears deprecated; frontend plugins run with full privileges |
| Middleware chain | Comprehensive but complex; 15 components make debugging harder |
| Auto-restart watchdog | Ensures resilience but can mask underlying plugin issues |

## Failure Modes / Edge Cases

1. **Plugin crash loops** — `keepPluginAlive` (`pkg/plugins/manager/process/process.go:67-87`) continuously restarts crashed plugins. If a plugin crashes immediately on start, this creates a tight loop with no backoff.

2. **Signature inheritance** — Descendant plugins inherit parent signature (`pkg/plugins/manager/signature/signature.go:34-49`). A compromised parent could "sign" malicious children.

3. **Unsigned plugin allowance** — `CanLoadPlugin` authorizer can permit unsigned plugins (`pkg/plugins/manager/signature/signature.go:58-66`). In production, this is a security risk.

4. **Angular blocking** — Angular detection has 10-second timeout (`pkg/plugins/manager/pipeline/validation/steps.go:107`). Slow inspection blocks plugin load.

5. **Plugin version conflicts** — Registry only holds one version per plugin ID (`pkg/plugins/manager/registry/in_memory.go:11`). No side-by-side versions.

6. **Decommission race** — `IsDecommissioned()` checked after registry lookup (`pkg/plugins/manager/client/client.go:306-316`) but state could change between check and use.

## Future Considerations

1. **Frontend sandbox revival** — Current sandbox is a stub (`pkg/services/pluginsintegration/sandbox/sandbox.go:23-24`). Full iframe/Worker-based sandboxing for frontend plugins would improve security.

2. **Plugin API versioning** — No explicit API version negotiation for backend plugin methods. Could benefit from version checking like gRPC protocol version.

3. **Circuit breaker** — No per-plugin circuit breaker for failed plugins. Could prevent cascade failures when plugins are in bad states.

4. **Graceful degradation** — Plugin failures in middleware chain propagate. Could add fallback behavior for specific error types.

## Questions / Gaps

1. **Frontend plugin isolation** — How are frontend React plugins isolated? The `Sandbox` interface appears deprecated/unimplemented. Evidence: `pkg/services/pluginsintegration/sandbox/sandbox.go:23-24` just returns config.

2. **Extension point registry** — How are extension points declared and discovered? `ExtensionPoint` struct exists but no evidence of a registry/enumeration mechanism.

3. **Plugin upgrade path** — How are plugin instances migrated when a plugin is upgraded? No evidence of state migration or instance update mechanism.

4. **RBAC for plugin operations** — `RequiresRBACAction()` exists on `Includes` (`pkg/plugins/models.go:173-175`) but no evidence of enforcement during plugin access.

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `grafana`.