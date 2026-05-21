# Extensibility & Plugin Architecture - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `13-extensibility-plugin-architecture` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-21 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Extensibility architectures across these nine systems fall into four distinct tiers:

1. **Tier 1 — Absent/minimal (2–3/10):** nats-server, openfga, victoriametrics, and cli offer no meaningful plugin APIs. Extensibility is limited to compile-time interface substitution or subprocess execution of arbitrary binaries with no structured contracts.

2. **Tier 2 — Go plugin mechanism (5/10):** milvus uses Go's deprecated `plugin.Open()` for hook and cipher loading. Same-process execution with no isolation. Pocketbase uses hook-based registration with a JavaScript runtime but no sandbox.

3. **Tier 3 — Composition via DI (6/10):** temporal wires components via Uber's fx DI framework. Pocketbase uses hook chains. Neither supports dynamic loading but both provide structured lifecycle management.

4. **Tier 4 — Mature plugin systems (8/10):** grafana and kubernetes provide formal plugin architectures with discovery, lifecycle hooks, isolation, and observability. grafana uses HashiCorp go-plugin for process isolation; kubernetes uses webhooks and registry-based scheduling frameworks.

The core tradeoff is between **simplicity vs. isolation vs. flexibility**. Systems without plugin architectures (nats-server, openfga, victoriametrics) prioritize correctness and performance. Systems with mature plugin architectures (grafana, kubernetes) invest in developer ecosystem at the cost of complexity.

## Core Thesis

Plugin architectures are not universally appropriate. The right choice depends on three questions: (1) Does the product need an external ecosystem? (2) Is the extension surface stable enough to version? (3) Can the system tolerate process overhead? Products built for ecosystem growth (grafana, kubernetes) invest heavily in formal plugin contracts and isolation. Products prioritizing simplicity, correctness, or embedded use (openfga, nats-server, victoriametrics) deliberately omit dynamic plugin loading. Between these poles, systems like pocketbase and milvus offer intermediate models that sacrifice isolation for convenience.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| grafana | 8/10 | Pipeline loader + go-plugin process isolation | Security: signature validation, env var whitelisting, header clearing, auto-restart | Frontend plugin sandbox is deprecated; middleware chain complexity |
| kubernetes | 8/10 | Registry-based static plugins + external webhooks | 14 scheduler extension points; admission chain; dependency injection via Wants* interfaces | No explicit plugin API versioning; webhook-only isolation for external plugins |
| pocketbase | 6/10 | Hook-based event system + JSVM | Rich lifecycle hooks across app, model, record, auth, HTTP, realtime | No sandbox; no API versioning; misbehaving JS can corrupt app state |
| temporal | 6/10 | fx DI composition + worker components + Nexus | Goroutine-based isolation; per-namespace worker isolation; retry/backoff policies | No external plugin loading; goroutine isolation not fault-isolated |
| milvus | 5/10 | Go plugin.Open() + hook/extension/cipher interfaces | Three typed plugin interfaces; config-driven panic-or-warn behavior | Go plugin deprecated; no isolation; no API versioning; no observability |
| cli | 3/10 | Subprocess exec + markdown skills | Zero overhead extensions; any language | No lifecycle hooks; no isolation; no API contract; no verification |
| nats-server | 3/10 | Internal interfaces only; NATS-based auth callout | Zero-copy in-process extension via NATS messaging | No discovery; no isolation; no API versioning; no lifecycle management |
| victoriametrics | 3/10 | Configuration-driven relabeling and aggregation | Prometheus-compatible; debug endpoints; no attack surface | No runtime extensibility; regex DoS risk; no lifecycle hooks |
| openfga | 2/10 | Interface swap points; functional options | Monolithic correctness; compile-time type safety | No dynamic loading; no extensibility for custom business logic |

## Approach Models

### 1. Subprocess Passthrough (cli)

Extensions are OS processes invoked via `exec.Command`. Discovery is directory scanning (`~/.config/gh/extensions/gh-*`). The `Extension` interface (`pkg/extensions/extension.go:18-29`) is read-only metadata — no capability contract. Dispatch passes all args through with no interception, no pre/post hooks, no health checks, no resource limits. The only lifecycle "management" is a PreRun update check.

**Model:** "Run any binary, get out of the way."

### 2. Pipeline Loader with Process Isolation (grafana)

A five-stage pipeline (Discovery → Bootstrap → Validation → Initialization → Termination) orchestrates plugin loading (`pkg/plugins/manager/loader/loader.go:21-30`). Backend plugins run as separate processes via HashiCorp go-plugin with gRPC communication (`pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:86-89`). Core plugins run in-memory. Signature validation, Module.js checks, and Angular detection gate loading. Environment variables are whitelisted. Auth headers are stripped before plugin requests. A middleware chain of 15 components handles tracing, metrics, auth, and caching.

**Model:** "Structured pipeline, locked-down process boundary."

### 3. Registry-Based Static Plugins with Webhook Isolation (kubernetes)

Static registration via `Register()` functions at init time builds registry maps (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:71-85`). Scheduler plugins receive a `Handle` interface for cluster access. 14 scheduler extension points (PreEnqueue through PostBind) form a chain-of-responsibility pipeline (`pkg/scheduler/framework/runtime/framework.go:125-142`). Admission uses `MutationInterface.Admit()` and `ValidationInterface.Validate()` with fail-fast chain behavior. External admission webhooks provide process isolation via HTTP. Dependency injection via `Wants*` interfaces (`staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:82-99`) limits plugin access to declared dependencies. No explicit plugin API versioning.

**Model:** "Compile-time registry, interface contract, external isolation for out-of-tree."

### 4. Go Plugin with Singleton Hooks (milvus)

`plugin.Open()` loads `.so` files serialized by a global mutex (`internal/util/hookutil/plugin.go:18-44`). Three interfaces are exported: `hook.Hook` (auth/interception), `hook.Extension` (observability), `hook.Cipher` (encryption). A `sync.Once` guard ensures singleton initialization (`internal/util/hookutil/hook.go:118-141`). `PanicWhenPluginFail` config (`pkg/util/paramtable/component_param.go:1196-1202`) controls whether init failures panic or warn. WAL builders use compile-time `init()` registration. No process isolation, no API versioning, no sandbox.

**Model:** "Load a shared library once, call its functions forever."

### 5. Hook-Based Event System (pocketbase)

Hooks are first-class citizens. `Hook[T]` struct with `Bind`/`Trigger` methods (`tools/hook/hook.go:54`) drives an event chain where each handler must call `e.Next()` to continue. The `App` interface (`core/app.go:28-1200+`) defines hundreds of hook points: lifecycle (OnBootstrap, OnServe, OnTerminate), model CRUD, record CRUD, collection CRUD, auth, HTTP requests, file operations, realtime, mailer, settings. JSVM plugin exposes `$app`, `$dbx`, `$security`, `$http`, `$filesystem`, `$template`, plus `routerAdd`, `cronAdd` to JavaScript. A VM pool (`plugins/jsvm/pool.go:15-73`) pre-warms goja VMs. Panic recovery catches JS errors but re-throws Go plugin panics. No sandbox, no API versioning, file watching for dev-mode reload.

**Model:** "Every behavior is an event, every event can be hooked."

### 6. DI Composition Without Dynamic Loading (temporal)

Uber's fx framework wires components at compile time. `worker.Module` (`service/worker/fx.go:44-106`) composes sub-modules (migration, deletenamespace, scheduler, batcher). `WorkerComponent` and `PerNSWorkerComponent` interfaces (`service/worker/common/interface.go:12-45`) define registration hooks. Nexus endpoints use a registry with long-polling cache. `goro.Handle` (`common/goro/goro.go:8-71`) provides goroutine-based cooperative cancellation. Per-namespace workers are isolated by namespace with consistent hashing allocation. `OnFatalError` callback classifies errors as retryable or non-retryable. No external plugin loading, no process isolation, no formal API versioning contract.

**Model:** "Compile-time composition, runtime goroutine isolation."

### 7. Configuration-Driven Extensibility (nats-server, victoriametrics)

No plugin system exists. Extensions are configured via static config files parsed at startup. nats-server uses interface-based resolvers (AccountResolver, SubjectTransformer) selected via configuration. victoriametrics uses Prometheus-compatible relabel configs and stream aggregation configs parsed from YAML. No dynamic loading, no SDK, no lifecycle hooks. The relabel debug endpoints (`/metric-relabel-debug`, `/target-relabel-debug`) at `lib/promscrape/relabel_debug.go:12,37` allow testing transforms but not extending behavior.

**Model:** "Configure behavior, don't code it."

## Pattern Catalog

### Pattern 1: Pipeline Loader

**What it solves:** Plugin loading becomes a series of discrete, composable, observable stages rather than a monolithic load.

**Sources:** grafana (`pkg/plugins/manager/loader/loader.go:21-30`)

**Evidence:** Five stages (Discovery→Bootstrap→Validation→Initialization→Termination) allow independent evolution and injection of new steps (e.g., signature validation, Angular detection).

**Why it works:** Each stage has a single responsibility. Failures in validation don't block initialization of other plugins. Timing and errors are captured per stage.

**When to copy:** When plugin loading has multiple concerns (discovery, security, initialization, lifecycle) that need independent evolution.

**When overkill:** When the system has 1–2 plugins and loading is trivial.

### Pattern 2: Process Isolation via go-plugin

**What it solves:** Plugin crashes, infinite loops, or memory leaks don't bring down the host.

**Sources:** grafana (`pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:68-103`)

**Evidence:** Backend plugins run as separate processes communicating via gRPC. The `grpcPlugin` state machine (notStarted→init→startSuccess/startFail→stopped) manages lifecycle. Plugin crash kills only the plugin process.

**Why it works:** OS process boundary is the strongest isolation available without hardware support. gRPC provides a well-defined wire protocol.

**When to copy:** When plugins can be arbitrary code (third-party, untrusted, polyglot). Required when security or stability are at risk.

**When overkill:** When plugins are first-party, trusted, and always Go. The serialization overhead of go-plugin is non-trivial.

**Risk:** go-plugin is complex to set up and debug. Protocol version mismatches cause silent failures.

### Pattern 3: Registry with Factory Functions

**What it solves:** How plugins register themselves without a central manifest file or service locator antipattern.

**Sources:** kubernetes (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:71-85`), kubernetes scheduler (`pkg/scheduler/framework/runtime/registry.go:75-81`), milvus (WAL builders at `pkg/streaming/walimpls/registry/registry.go:10-21`)

**Evidence:** `Factory func(config io.Reader) (Interface, error)` registered in a `map[string]Factory`. `Registry.Register()` and `Registry.Merge()` combine registries. `NewFromPlugins()` instantiates by name.

**Why it works:** Compile-time safe. The factory function signature is enforced by the type system. Configuration is passed as `io.Reader`, allowing any config format.

**When to copy:** When plugin discovery should be static (compile-time) and plugins need per-instance configuration.

**When overkill:** When plugins must be discovered at runtime from directories or network services.

### Pattern 4: Middleware Chain

**What it solves:** Plugin requests need consistent cross-cutting concerns (auth, tracing, metrics, caching) without modifying plugin or core logic.

**Sources:** grafana (`pkg/services/pluginsintegration/pluginsintegration.go:185-222` with 15 middleware components)

**Evidence:** Each middleware wraps the next in a chain. `ClearAuthHeadersMiddleware` (`pkg/services/pluginsintegration/clientmiddleware/clear_auth_headers_middleware.go:31-42`) strips auth headers before forwarding. TracingMiddleware, MetricsMiddleware, OAuthTokenMiddleware layer on top.

**Why it works:** Each concern is a single responsibility middleware. Chains can be reordered or augmented without changing plugins.

**When to copy:** When plugin requests flow through a request path that needs consistent treatment (auth, logging, rate limiting).

**When overkill:** When plugins don't receive incoming requests (e.g., hook-only systems).

### Pattern 5: Dependency Injection via Wants* Interfaces

**What it solves:** Plugins need access to shared services (client sets, informers, loggers) without coupling to how those services are constructed.

**Sources:** kubernetes admission (`staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:82-99`)

**Evidence:** Plugins implement `WantsExternalKubeClientSet`, `WantsExternalKubeInformerFactory`, etc. The initializer checks which interfaces a plugin implements and injects the corresponding dependency.

**Why it works:** Plugins declare what they need; the framework provides it. Unused dependencies aren't created. Testability is high since dependencies can be mocked.

**When to copy:** When plugins need shared infrastructure and the system uses Go interfaces for that infrastructure.

**When overkill:** When plugin surface is small and all plugins need the same dependencies.

### Pattern 6: Singleton Hook Container with sync.Once

**What it solves:** Plugin/hook loaded once, safely, with concurrent access prevented.

**Sources:** milvus (`internal/util/hookutil/hook.go:118-141`)

**Evidence:** `GetHook()` uses `sync.Once` to call `loadPlugin()` exactly once. `atomic.Value` containers store the hook. Global `pluginMutex` serializes `plugin.Open()` calls.

**Why it works:** `sync.Once` guarantees exactly-one initialization even with concurrent access. `atomic.Value` provides lock-free reads after initialization.

**When to copy:** When a plugin is a singleton and loading is expensive or must be serialized.

**When overkill:** When plugins don't need singleton semantics or when initialization can be done at startup without concurrency concerns.

### Pattern 7: Event Chain with Next() Continuation

**What it solves:** Hook handlers need to run before and after a core operation, with the ability to short-circuit or modify behavior.

**Sources:** pocketbase (`tools/hook/event.go:25-35`)

**Evidence:** `Event` struct has `Next()` method that calls the next handler. Handlers receive the event and must call `e.Next()` to continue. Early return terminates the chain.

**Why it works:** Simple to implement. Each handler sees pre-operation state and can modify it. The `Next()` call pattern makes flow explicit rather than implicit.

**When to copy:** When you need pre/post hooks with optional mutation or short-circuit capability.

**When risky:** If a handler forgets to call `e.Next()`, the chain silently stops. This is a common footgun in pocketbase extensions.

### Pattern 8: Signature Validation as Loading Gate

**What it solves:** Prevent loading of tampered or unsigned plugins.

**Sources:** grafana (`pkg/plugins/manager/signature/signature.go:28-85`)

**Evidence:** `Validator` checks `SignatureStatus`: `Valid`, `Invalid`, `Modified`, `Unsigned`. Loading is blocked unless status is `Valid` or plugin is explicitly authorized. Descendant plugins inherit parent signature.

**Why it works:** Cryptographic verification of plugin artifacts creates trust boundaries. Blocking unsigned plugins in production is a strong security control.

**When to copy:** When plugins can come from external sources and the host needs to establish trust.

**When overkill:** When all plugins are built-in or from a trusted registry.

### Pattern 9: Environment Variable Whitelist for Plugins

**What it solves:** Prevent plugins from reading sensitive environment variables (credentials, secrets) from the host process.

**Sources:** grafana (`pkg/plugins/envvars/envvars.go:12-25`)

**Evidence:** Only 7 env vars pass to plugins: proxy settings + `PLUGIN_UNIX_SOCKET_DIR`. Everything else is filtered.

**Why it works:** Principle of least privilege. Plugins get only what they need for their job.

**When to copy:** When plugins are untrusted and the host has secrets in the environment.

**When overkill:** When plugins are first-party or the host has no sensitive env vars.

### Pattern 10: Panic Recovery Per-Plugin

**What it solves:** A panicking plugin doesn't kill the host process.

**Sources:** pocketbase (`plugins/jsvm/jsvm.go:330-340`)

**Evidence:** `defer recover()` in the JS hook loader catches panics and either logs them (dev mode) or re-panics (prod). Go plugin panics are not caught.

**Why it works:** `recover()` catches panics that propagate up the goroutine stack. Separate goroutines per hook execution contain the blast radius.

**When to copy:** When plugins run in-process and you want to contain crashes.

**When risky:** Silent swallowing of panics in dev mode can hide bugs until production. Re-panicking in prod can still crash the process if the panic propagates to the main goroutine.

## Key Differences

### Design Philosophy: Ecosystem vs. Embedded

**grafana and kubernetes** invest in extensibility because their business depends on third-party plugins. grafana's plugin ecosystem powers data sources, panels, and connectors. kubernetes's scheduler, admission, and cloud provider plugins allow it to run anywhere. Both systems are primarily **infrastructure for other software**, so extensibility is load-bearing.

**openfga, nats-server, and victoriametrics** are **self-contained systems** where correctness is paramount. OpenFGA is an authorization engine; a compromised plugin could silently authorize the wrong principal. nats-server is a message broker; a buggy plugin could corrupt in-flight messages. victoriametrics is a time-series database; a bad relabel regex could cause data loss. For these systems, "no plugin API" is a deliberate security and correctness choice, not a gap.

**pocketbase** is an application framework (like a CMS/BaaS). Extensibility serves application developers building on it, not end-users installing third-party plugins. The hook system targets developers customizing pocketbase itself.

**temporal** is a durable execution engine where the "plugins" are workflows and activities written by application developers. The plugin system targets operators extending the Temporal server itself, not end-user code.

### Process Isolation Strategy

Three isolation strategies appear across sources:

| Strategy | Sources | Isolation Level | Overhead |
|----------|---------|-----------------|----------|
| Subprocess exec | cli | Process boundary only | Medium (fork/exec) |
| go-plugin (gRPC) | grafana | Full process isolation | High (serialization) |
| Go plugin.Open() | milvus | None (same process) | Low |
| Webhook HTTP | kubernetes | Full process + network | High (HTTP) |
| Goroutine handle | temporal, pocketbase (JS) | None (same process) | Lowest |
| No isolation | nats-server, openfga, victoriametrics | N/A | N/A |

The choice of isolation strategy depends on the trust model. grafana's external plugins may be untrusted; kubernetes's admission webhooks run against in-cluster services that may be untrusted. milvus's cipher plugins are customer-provided encryption keys and may be untrusted. In all cases, process isolation is the strongest defense.

### Extension Point Distribution

**kubernetes** has the most structured extension surface: 14 scheduler extension points, admission chain, cloud provider interface, and webhook match conditions via CEL. Each extension point is a named Go interface in `staging/src/k8s.io/kube-scheduler/framework/interface.go`.

**grafana** has the most layered extension: backend plugin interfaces (QueryData, CheckHealth, CallResource, Stream, Admission, Conversion), frontend extensions (AddedLinks, AddedComponents, ExposedComponents, ExtensionPoints, AddedFunctions), and an internal hooks service.

**pocketbase** has the deepest hook integration: hooks fire on every lifecycle event (app, model, record, collection, auth, HTTP, file, realtime, mailer, settings). The depth of hooks is unmatched but they are all in-process.

**nats-server, openfga, and victoriametrics** have almost no code-level extension points. Their "extensibility" is configuration — swapping behavior via config files or compile-time interface substitution.

### Lifecycle Management

| Source | Init | Start | Stop | Health | Unload |
|--------|------|-------|------|--------|--------|
| grafana | ✓ (5-stage pipeline) | ✓ (process start) | ✓ (Termination stage) | ✓ (CheckHealth) | ✓ (deregister) |
| kubernetes scheduler | ✓ (factory) | ✓ (via Handle) | ✓ (Handle returned cleanup) | ✓ (WaitForReady 10s timeout) | Partial |
| kubernetes admission | ✓ (InitPlugin) | N/A | N/A | ✓ (WaitForReady) | N/A |
| pocketbase | ✓ (OnBootstrap) | ✓ (OnServe) | ✓ (OnTerminate) | ✗ | ✗ |
| temporal | ✓ (fx lifecycle) | ✓ (PerNSWorkerManager.Start) | ✓ (PerNSWorkerManager.Stop) | ✗ | ✓ (cleanup func) |
| milvus | ✓ (hook.Init) | runtime Before/After | ✗ (Release exists but no lifecycle) | ✗ | ✗ |
| cli | ✗ | ✗ | ✗ | ✗ | ✗ |
| nats-server | N/A | N/A | N/A | N/A | N/A |
| openfga | N/A | N/A | N/A | N/A | N/A |
| victoriametrics | N/A | N/A | N/A | N/A | N/A |

## Tradeoffs

### Subprocess vs. In-Process Extensions

**Subprocess (cli, grafana's external plugins):**
- Benefit: Crash isolation, polyglot support, no shared memory corruption risk
- Cost: Serialization overhead, complex IPC, slower communication
- Best-fit: Untrusted or third-party plugins, plugins in different languages
- Failure mode: Network-style failure modes (timeout, unavailable) rather than crash

**In-process (kubernetes scheduler plugins, temporal worker components, pocketbase hooks, milvus hooks):**
- Benefit: Zero serialization, shared memory, type safety, lower latency
- Cost: Crash isolation requires separate process (goroutine isolation is not fault isolation)
- Best-fit: Trusted plugins, Go plugins, latency-sensitive paths
- Failure mode: Go panic crashes entire process; infinite loop blocks event loop

### Formal Pipeline vs. Direct Hook

**Formal pipeline (grafana):**
- Benefit: Each stage is independently testable, replaceable, observable. Errors in validation don't block initialization of other plugins.
- Cost: More code, more abstractions, harder to trace end-to-end flow
- Best-fit: Complex plugin loading with multiple concerns (discovery, security, initialization)

**Direct hook (pocketbase, milvus):**
- Benefit: Simpler model, easier to understand, lower overhead
- Cost: No structure around loading; hooks fire at fixed points with no ability to reorder or filter
- Best-fit: Applications where hooks are implementation details, not user-facing APIs

### Registry-Based vs. Configuration-Based Discovery

**Registry-based (kubernetes admission, kubernetes scheduler, grafana backend):**
- Benefit: Type-safe, compile-time known, easy to test, plugins are first-class code
- Cost: Requires recompilation to add plugins; no dynamic loading
- Best-fit: Systems where plugins are known at build time and type safety matters

**Configuration-based (nats-server auth callout, victoriametrics relabel):**
- Benefit: No code changes, no recompilation, operators can change behavior without developers
- Cost: No type safety, limited expressiveness, hard to test, no IDE support
- Best-fit: Operators who need to adapt behavior without rebuilding binaries

### Versioned API vs. Type-Safe Interface

**Versioned API (grafana's gRPC protocol, kubernetes's staged components in staging/src/):**
- Benefit: Plugins can evolve independently; clear compatibility guarantees
- Cost: Version negotiation adds complexity; old versions may need compatibility shims
- Best-fit: Long-lived plugins, public plugin ecosystems, third-party distribution

**Type-Safe Interface (kubernetes scheduler, temporal, pocketbase):**
- Benefit: Compile-time safety, no version negotiation needed, refactoring tools work
- Cost: Any interface change is potentially breaking; no ability to run old plugins on new hosts
- Best-fit: Internal plugin ecosystems, plugins compiled with the host

## Decision Guide

**Should you build a plugin architecture?**

Build one if:
- Your product's value grows with third-party integrations (data sources, workflows, auth providers)
- Your users need to customize behavior without rebuilding or forking the core
- Your system is infrastructure that other software builds on
- You can invest in API versioning, documentation, and ecosystem maintenance

Do not build one if:
- Your system is correctness-sensitive (authorization, data integrity, financial transactions)
- Your users are operators who configure behavior, not developers who code it
- You lack resources to maintain API contracts and versioning
- Your product is a library meant to be embedded rather than extended

**Which plugin architecture type?**

| Need | Choose | Examples |
|------|--------|----------|
| Third-party ecosystem, security-critical | Process isolation via go-plugin or webhooks | grafana, kubernetes admission |
| In-tree plugins, low-latency paths, type safety | Registry-based static plugins | kubernetes scheduler, temporal worker components |
| User-customizable behavior, developer-facing hooks | Hook-based event system | pocketbase |
| Operator configuration, no custom code | Configuration-driven | victoriametrics relabel, nats-server resolver |
| Polyglot extensions, any binary | Subprocess exec | cli extensions |
| No extensibility needed | Monolithic design | openfga, nats-server (by design) |

**Isolation strategy decision tree:**

1. Are plugins third-party or untrusted? → Yes → Use process isolation (go-plugin, WASM, or webhooks)
2. Are plugins the same language as the host? → Yes → Consider goroutine-based isolation with panic recovery
3. Are plugins loaded from disk at runtime? → No → Static registration via registry map
4. Do plugins need lifecycle management? → Yes → Use a pipeline loader with distinct stages
5. Do plugins handle sensitive data? → Yes → Use env var whitelisting and auth header clearing

## Practical Tips

### Patterns to Copy

1. **Middleware chain for plugin requests** — Layer auth, tracing, and metrics consistently without modifying plugins or core logic (grafana's 15-component chain).

2. **Signature validation as loading gate** — Block unsigned/tampered plugins before they can execute (grafana's `SignatureStatus` checks).

3. **Environment variable whitelist** — Prevent credential leakage to plugins (grafana's 7-var allowlist).

4. **Wants* interfaces for dependency injection** — Let plugins declare what they need; don't give them everything (kubernetes admission initializer).

5. **Factory + registry pattern** — Type-safe plugin instantiation with configuration passed as `io.Reader` (kubernetes admission `Factory`, scheduler `Registry`).

6. **Pipeline loader with deferred error recording** — Load what you can; record failures without blocking other plugins (grafana's `ErrorTracker` in loader).

7. **Per-namespace worker isolation** — Partition plugin execution by tenant to contain blast radius (temporal's `PerNSWorkerComponent`).

8. **Auto-restart watchdog for plugin processes** — Keep managed plugins alive without manual intervention (grafana's `ProcessManager`, kubernetes scheduler's requeue on `NamespaceNotFound`).

### Patterns to Avoid or Delay

1. **Go `plugin.Open()`** — Deprecated by the Go team, lacks cross-platform support, no isolation. Use subprocess gRPC or WASM instead (milvus uses it, but it's a known weakness).

2. **No auth header clearing** — If plugins receive HTTP requests, stripping auth headers prevents credential leakage. This is absent in most systems studied (only grafana does it).

3. **Flat middleware chain without short-circuit** — Middleware chains that run all middleware even after a rejection are slower and potentially less secure (kubernetes admission chain fails fast; grafana's middleware chain does not appear to short-circuit).

4. **No timeout on plugin initialization** — A blocking `Initialize()` can stall the entire host (kubernetes's 10-second `WaitForReady` timeout is a good model; milvus has no such timeout).

5. **No panic recovery in-process** — If running plugins in-process, panic recovery per plugin is essential (pocketbase has it for JS hooks; milvus has no recovery for Go plugins).

### Decision Rules

**Rule 1:** If you need third-party plugins → process isolation is mandatory (go-plugin, webhooks, or WASM).

**Rule 2:** If plugins are compile-time known → registry-based static registration is safer than dynamic loading.

**Rule 3:** If you have more than 5 extension points → use a pipeline loader to separate concerns.

**Rule 4:** If plugins touch auth or credentials → env var whitelisting + auth header clearing.

**Rule 5:** If you don't need extensibility → don't add it. openfga and nats-server are intentionally minimal and correct.

**Rule 6:** If using Go in-process plugins → implement panic recovery and document that Go plugins are not recommended for production.

**Rule 7:** If using goroutine-based isolation (not process) → document that a Go panic crashes the process and implement `OnFatalError` classification.

## Anti-Patterns / Caution Signs

### Brittle Plugin Loading

- Plugin loading fails silently on error (milvus: `loadManifest()` returns empty `binManifest{}` on parse failure)
- No timeout on plugin initialization (milvus has none; kubernetes has 10s)
- Crash loop without backoff (grafana's `keepPluginAlive` can tight-loop on immediate crash)
- Concurrent plugin loading causes panic (milvus's `pluginMutex` workaround for `plugin.Open()`)

### Over-Coupled Extension Contracts

- `core.App` interface with 1000+ lines and hundreds of methods (pocketbase at `core/app.go:28-1200+`)
- No API versioning → upgrades silently break extensions (pocketbase, milvus, kubernetes scheduler)
- Hard-coded agent registry list requiring code changes to add new agents (cli at `internal/skills/registry/registry.go:45-319`)

### Missing Isolation Boundaries

- Go plugins without panic recovery (milvus Go cipher plugins)
- No auth header clearing for plugin requests (most systems studied)
- Env vars passed wholesale to plugins (all systems except grafana)
- Same-process goroutine execution presented as "isolation" (temporal, pocketbase)

### Hard-to-Test Extension Logic

- Handler chains where skipping `e.Next()` silently breaks the system (pocketbase)
- Middleware chains with 15+ components where debugging requires understanding all layers (grafana)
- Plugins relying on informer caches with no enforcement of `HasSynced()` (kubernetes admission)

### Operational Blindness

- No per-plugin metrics, logs, or tracing (milvus, pocketbase, nats-server, openfga, victoriametrics)
- No plugin health checks (only grafana and kubernetes scheduler have them)
- No debugging endpoints for plugin execution (only victoriametrics has `/metric-relabel-debug` and grafana has general observability)

## Notable Absences

1. **No WASM-based plugin isolation** — Across all nine sources, no system uses WebAssembly for plugin isolation. grafana's frontend sandbox is deprecated; kubernetes and grafana use go-plugin; everything else is in-process or subprocess. WASM remains an aspirational model with no production-scale implementation in these codebases.

2. **No formal plugin API versioning with semver** — Only grafana's gRPC protocol negotiation and kubernetes's staging directory structure approach versioning. No system has explicit `PluginV1`/`PluginV2` interface versioning with deprecation cycles.

3. **No plugin marketplace or registry service** — cli has a hardcoded list of official extensions; kubernetes has no plugin distribution mechanism beyond OCI images for cloud providers; grafana has a community plugin ecosystem but no formal SDK for distribution.

4. **No RBAC enforcement for plugin operations** — grafana has `RequiresRBACAction()` on `Includes` (`pkg/plugins/models.go:173-175`) but no evidence of enforcement during plugin access. kubernetes has no RBAC model for admission plugin operations.

5. **No graceful degradation when plugins fail** — grafana's middleware chain propagates errors; pocketbase re-throws panics in prod; kubernetes admission chain fails fast on first rejection. Only temporal has structured error classification (retryable vs. non-retryable via `OnFatalError`).

6. **No testing utilities for extension authors** — Across all sources, no evidence of a `PluginTestKit`, mock plugin registry, or sandboxed test runner for plugin developers.

## Per-Source Notes

### grafana (8/10) — Best-in-class plugin architecture for TypeScript/Go ecosystem

The 5-stage pipeline, HashiCorp go-plugin process isolation, signature validation, env var whitelisting, and auth header clearing form the most complete plugin security model in the study. The 15-component middleware chain is comprehensive but complex. Frontend plugin sandbox is deprecated. Gaps: no explicit API versioning, no circuit breaker for failing plugins, Angular detection has a 10-second timeout that can block loading.

### kubernetes (8/10) — Deepest and most structured extension surface

14 scheduler extension points, admission chain with mutation and validation, cloud provider abstraction, external webhook isolation, and Wants* dependency injection form a complete extensibility system. Gaps: no explicit plugin API versioning, no process isolation for in-tree scheduler/admission plugins, no dynamic plugin loading (static only).

### pocketbase (6/10) — Richest hook system with weakest isolation

The `App` interface defines hundreds of hook points across every layer of the application. The JSVM exposes a rich API surface. The VM pool for concurrent JS execution is well-engineered. Gaps: no sandbox, no API versioning, no per-hook execution tracing, panic re-throw in production mode for Go plugins, handler must remember to call `e.Next()`.

### temporal (6/10) — Mature internal composition, no external plugins

fx-based component wiring is elegant and testable. Per-namespace worker isolation with consistent hashing is sophisticated. `goro.Handle` for cooperative goroutine cancellation is a good isolation primitive. Gaps: no external plugin loading, no formal API contract for plugin authors, goroutine isolation is not fault isolation, no per-plugin tracing.

### milvus (5/10) — Functional but using deprecated Go plugin mechanism

The three typed plugin interfaces (Hook, Extension, Cipher) and singleton pattern are sound. The WAL builder registry is clean. Gaps: Go `plugin.Open()` is deprecated, no process isolation, no API versioning, no per-plugin observability, global mutex serialization of all plugin loads.

### cli (3/10) — Exec-based extensions, no structured plugin API

Subprocess model is simple and language-agnostic. Skills-as-markdown cleanly separates CLI from AI agent runtime. Gaps: no lifecycle hooks, no API contract, no isolation beyond process boundary, no verification, no observability. The `Extension` interface is read-only metadata.

### nats-server (3/10) — Intentionally no plugin system

The NATS-based auth callout is an elegant extension mechanism within the constraints of no dynamic loading. The resolver interface pattern (Fetch/Store/Start/Close) is reusable. Gaps: no discovery, no isolation, no lifecycle, no versioning, no observability. Explicit "not part of public API" disclaimers.

### victoriametrics (3/10) — Configuration-driven, no runtime extensibility

Prometheus-compatible relabel configs are well-implemented with debug endpoints. The `MustStop()` pattern on aggregators is clean. Gaps: no runtime extensibility, regex DoS risk, no API versioning, no lifecycle hooks, no isolation beyond goroutine.

### openfga (2/10) — Monolithic, no extensibility for custom business logic

The storage interface (`OpenFGADatastore`) and functional options pattern are well-designed within the monolithic model. Gaps: no dynamic loading, no custom business logic hooks, no webhook/extension points for tuple writes or authorization checks, no plugin system.

## Open Questions

1. **What would a versioned plugin API contract look like across these systems?** No system in this study has explicit `PluginV1`/`ExtensionV2` semantic versioning with deprecation cycles. The gap is industry-wide, not specific to these sources.

2. **Can hook-based systems be made as safe as process-isolated systems?** pocketbase and temporal prove hooks are powerful but neither has true fault isolation. WASM is the theoretical answer but no production system here uses it.

3. **What is the right granularity for extension point definition?** kubernetes has 14 scheduler extension points and 3 admission interfaces. grafana has 6 backend handler types plus frontend extensions. pocketbase has hundreds of hooks. Is there an optimal density?

4. **How should plugin failures be classified and handled?** temporal's `OnFatalError` with retryable/non-retryable distinction is the most sophisticated model seen, but it's internal-only. A generalized plugin error classification framework doesn't exist.

5. **Should configuration-driven extensibility be considered a "plugin system"?** victoriametrics and nats-server provide meaningful operator-level customization without code plugins. The definitional boundary of "plugin architecture" is contested.

## Evidence Index

Every evidence reference follows the `source_file:line` format from per-source reports.

### grafana
- Pipeline loader: `pkg/plugins/manager/loader/loader.go:21-30`
- Backend plugin interface: `pkg/plugins/backendplugin/ifaces.go:12-30`
- Lifecycle pipeline: `pkg/plugins/manager/loader/loader.go:61-118`
- gRPC plugin (process isolation): `pkg/plugins/backendplugin/grpcplugin/grpc_plugin.go:86-89`
- Signature validation: `pkg/plugins/manager/signature/signature.go:8-10,56-85`
- Env var isolation: `pkg/plugins/envvars/envvars.go:12-25`
- Middleware chain: `pkg/services/pluginsintegration/pluginsintegration.go:185-222`
- Auth header clearing: `pkg/services/pluginsintegration/clientmiddleware/clear_auth_headers_middleware.go:31-42`
- Process manager: `pkg/plugins/manager/process/process.go:48-87`
- Extension models: `pkg/plugins/models.go:61-67`

### kubernetes
- Admission plugin registry: `staging/src/k8s.io/apiserver/pkg/admission/plugins.go:31-35,71-85`
- Extension interfaces: `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:122-167`
- Scheduler plugin registry: `pkg/scheduler/framework/runtime/registry.go:71,75-81`
- Scheduler framework impl: `pkg/scheduler/framework/runtime/framework.go:58-142`
- Scheduler extension points: `staging/src/k8s.io/kube-scheduler/framework/interface.go:445-699`
- Plugin initializer: `staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:68-100`
- Webhook dispatch: `staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:357-376`
- Admission chain: `staging/src/k8s.io/apiserver/pkg/admission/chain.go:23-60`

### pocketbase
- Hook struct: `tools/hook/hook.go:54`
- Handler structure: `tools/hook/hook.go:13-32`
- Tagged hooks: `tools/hook/tagged.go:30`
- Event chain: `tools/hook/event.go:25-35`
- App interface: `core/app.go:28-1200+`
- JSVM plugin: `plugins/jsvm/jsvm.go:128-175`
- VM pool: `plugins/jsvm/pool.go:15-73`
- Panic recovery: `plugins/jsvm/jsvm.go:330-340`
- No sandbox statement: `CHANGELOG_16_22.md:321`

### temporal
- WorkerComponent interface: `service/worker/common/interface.go:12-25`
- PerNSWorkerComponent: `service/worker/common/interface.go:36-45`
- fx module: `service/worker/fx.go:44-106`
- Lifecycle hooks: `service/worker/pernamespaceworker.go:133-161`
- OnFatalError: `service/worker/pernamespaceworker.go:511-525`
- goro.Handle: `common/goro/goro.go:8-71`
- Endpoint registry: `common/nexus/endpoint_registry.go:39-46`
- SQL plugin interface: `common/persistence/sql/sqlplugin/interfaces.go:31-36`

### milvus
- Plugin loading: `internal/util/hookutil/plugin.go:18-44`
- Hook singleton: `internal/util/hookutil/hook.go:118-141`
- Default hook: `internal/util/hookutil/default.go:29-53`
- PanicWhenPluginFail: `pkg/util/paramtable/component_param.go:1196-1202`
- SoPath config: `pkg/util/paramtable/component_param.go:1998,2254-2259`
- Cipher plugin: `internal/util/hookutil/cipher.go:429`
- WAL registry: `pkg/streaming/walimpls/registry/registry.go:10-21`

### cli
- Extension interface: `pkg/extensions/extension.go:18-29`
- Extension manager: `pkg/extensions/extension.go:32-42`
- Extension discovery: `pkg/cmd/extension/manager.go:145-194`
- Extension dispatch: `pkg/cmd/extension/manager.go:91-134`
- Agent registry: `internal/skills/registry/registry.go:45-319`
- Skill discovery: `internal/skills/discovery/discovery.go:531-598`
- Skills installer: `internal/skills/installer/installer.go:251-305`

### nats-server
- Auth callout config: `server/opts.go:378-392`
- Auth callout processing: `server/auth_callout.go:44-452`
- Account resolver: `server/accounts.go:4045-4053`
- Subject transformer: `server/subject_transform.go:74-79`
- TLS OCSP: `server/ocsp_peer.go:137-161`

### victoriametrics
- Relabel config: `lib/promrelabel/config.go:20-45`
- Relabel apply: `lib/promrelabel/relabel.go:163-431`
- Stream aggregation: `lib/streamaggr/streamaggr.go:244-250`
- Querier interface: `app/vmalert/datasource/datasource.go:16-26`
- Rule interface: `app/vmalert/rule/rule.go:20-38`
- Relabel debug: `lib/promscrape/relabel_debug.go:12,37`

### openfga
- Storage interface: `pkg/storage/storage.go:407-421`
- Datastore selection: `cmd/run/run.go:504-529`
- Authenticator interface: `internal/authn/authn.go`
- Server options: `pkg/server/server.go:261-869`
- Middleware chain: `cmd/run/run.go:563-584`

---

Generated by dimension `13-extensibility-plugin-architecture.md`.
