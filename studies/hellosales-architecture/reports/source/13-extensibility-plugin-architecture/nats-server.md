# Source Analysis: nats-server

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server does not implement a traditional plugin architecture with loadable modules, process isolation, or formal extension APIs. Instead, it provides extensibility through **internal interfaces**, **callback hooks**, and **configuration-driven behaviors**. The primary extension mechanisms are: (1) Auth Callout for external authentication, (2) Account Resolver interface for account JWT management, (3) Subject Transformers for import/export mapping, and (4) TLS verification callbacks via OCSP peer validation. All extension code runs in the same process with no isolation boundaries.

## Rating

**3** — Poor implementation or absent. nats-server lacks a formal plugin system with discovery, lifecycle management, isolation, or versioned APIs. The extensibility mechanisms are limited to internal interfaces that require recompilation and offer no runtime isolation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Auth Callout config | `AuthCallout` struct with Issuer, Account, AuthUsers, XKey, AllowedAccounts fields | `server/opts.go:378-392` |
| Auth Callout processing | `processClientOrLeafCallout` function sends auth requests via NATS internal messaging | `server/auth_callout.go:44-452` |
| Auth Callout subject | `AuthCalloutSubject = "$SYS.REQ.USER.AUTH"` constant | `server/auth_callout.go:30` |
| Account Resolver interface | `AccountResolver` interface with Fetch, Store, Start, Close methods | `server/accounts.go:4045-4053` |
| Memory resolver | `MemAccResolver` implementation using sync.Map | `server/accounts.go:4083-4104` |
| URL resolver | `URLAccResolver` implementation with HTTP client | `server/accounts.go:4107-4150` |
| Directory resolver | `DirAccResolver` with file-based storage and NATS sync | `server/accounts.go:4153-4541` |
| Resolver lifecycle | `DirAccResolver.Start()` registers NATS subscriptions for sync | `server/accounts.go:4362-4541` |
| TLS OCSP plugging | `plugTLSOCSPPeer` function for TLS handshake lifecycle | `server/ocsp_peer.go:137-161` |
| OCSP peer config | `OCSPPeerConfig` struct with verify, timeout, clockskew settings | `server/certidp/certidp.go:100-108` |
| Subject transformer interface | `SubjectTransformer` interface with Match/Transform methods | `server/subject_transform.go:74-79` |
| Server shutdown | `Server.Shutdown()` method for graceful shutdown | `server/server.go:2558-2649` |
| Internal Logger type | `certidp.Log` struct with Debugf/Noticef/Warnf/Errorf/Tracef | `server/certidp/certidp.go:123-129` |
| Server running flag | `s.running atomic.Bool` for lifecycle state | `server/server.go:185` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

No evidence found. nats-server has no plugin discovery or loading mechanism. There is no `plugin.go`, no dynamic module loading, no manifest files, and no verification process for external plugins.

**What exists instead:**
- **Configuration-based extension**: Extensions like `AuthCallout` are configured via static config files (`server/opts.go:4555-4760`)
- **Account resolver initialization**: Resolvers are created at startup via `Options.AccountResolver` field and initialized through `s.configureResolver()` (`server/server.go:908-921`)
- **No runtime loading**: All extensions must be compiled into the server binary

### 2. What extension points exist for custom business logic?

| Extension Point | Mechanism | File:Line |
|-----------------|-----------|-----------|
| Authentication | Auth Callout via `$SYS.REQ.USER.AUTH` subject with JWT request/response | `server/auth_callout.go:30,44-452` |
| Account JWT resolution | `AccountResolver` interface with Fetch/Store/Start/Close | `server/accounts.go:4045-4053` |
| Subject transformation | `SubjectTransformer` interface for import/export mapping | `server/subject_transform.go:74-79` |
| TLS verification | `VerifyConnection` callback via OCSP peer plugging | `server/ocsp_peer.go:173-179` |
| Authorization | Permission-based Pub/Sub deny rules per user | `server/auth.go:641-719` |

**No evidence found** for: workflow hooks, data processing hooks, custom business logic callbacks, or any user-defined code execution points.

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**No evidence found** of any isolation mechanism:
- No process isolation (no separate processes, no WASM)
- No goroutine isolation (extensions run in same goroutines as core)
- No memory protection (all code shares same address space)
- No timeout/circuit-breaker on auth callout responses (only `authTimeout` channel select at `server/auth_callout.go:447`)
- Auth callout timeout is the only documented failure boundary

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No evidence found** of API versioning:
- Extensions use internal Go interfaces with no semver commitments
- Many interfaces explicitly state "not part of public API" (e.g., `server/subject_transform.go:73-74`: "This API is not part of the public API and not subject to SemVer protections")
- No compatibility guarantees for custom implementations of `AccountResolver` or `SubjectTransformer`
- No deprecation mechanism observed

### 5. What debugging and observability exists for plugin execution?

Limited observability:
- `certidp.Log` struct provides `Debugf`, `Noticef`, `Warnf`, `Errorf`, `Tracef` methods (`server/certidp/certidp.go:123-129`)
- Server events for auth callout rejection (`server/ocsp_peer.go:175,195`)
- Debug logging through `s.Debugf()` calls scattered in auth and resolver code
- **No metrics, tracing, or structured logging** specific to plugin execution
- **No per-extension health endpoints** or status reporting

## Architectural Decisions

1. **No plugin system by design**: nats-server prioritizes simplicity and performance over extensibility. The server is monolithic with compile-time configuration.

2. **NATS-based extension communication**: Auth callout uses internal NATS messaging (`sendInternalAccountMsgWithReply` at `server/auth_callout.go:437`) rather than direct function calls, providing some decoupling but no isolation.

3. **Interface-based extension points**: Extensions implement Go interfaces (`AccountResolver`, `SubjectTransformer`) rather than a plugin SDK, requiring recompilation to add extensions.

4. **Configuration-driven setup**: Extensions are configured via static config files parsed at startup, not discovered dynamically at runtime.

## Notable Patterns

1. **Auth Callout Pattern** (`server/auth_callout.go:44-452`):
   - Server creates temporary subscription on `$SYS.REQ.USER.AUTH`
   - Sends JWT auth request with client info
   - Waits for response with timeout
   - Decodes and validates response JWT
   - Maps result to internal user registration

2. **Resolver Pattern** (`server/accounts.go:4045-4089`):
   - Interface-based: `Fetch()`, `Store()`, `Start()`, `Close()`
   - Default implementations via `resolverDefaultsOpsImpl` for optional methods
   - Three implementations: `MemAccResolver`, `URLAccResolver`, `DirAccResolver`

3. **TLS Verification Plugging** (`server/ocsp_peer.go:137-201`):
   - Wraps `tls.Config.VerifyConnection` callback
   - Validates OCSP status post-handshake
   - Uses `certidp.OCSPPeerConfig` for settings

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Simplicity vs Extensibility | No plugin system means simpler code and faster execution, but no runtime customization |
| Performance vs Isolation | Shared address space enables zero-copy messaging, but misbehaving code can crash the server |
| Type Safety vs Flexibility | Go interfaces provide compile-time safety, but prevent dynamic loading |
| Configuration vs Code | All extensions must be configured at compile-time, no hot-loading |

## Failure Modes / Edge Cases

1. **Auth Callout timeout**: If auth service doesn't respond within `AuthTimeout` (default 2s), connection is rejected — but no circuit-breaker for repeated failures (`server/auth_callout.go:447`)

2. **Resolver network failures**: URL resolver has no retry logic; DirAccResolver syncs via NATS and can fall behind (`server/accounts.go:4133-4149`)

3. **No OCSP responder**: OCSP peer validation can be set to `WarnOnly` mode — connection proceeds with warning (`server/certidp/certidp.go:104`)

4. **JWT validation failures**: Auth callout response decoded and validated — failures result in connection rejection with no fallback (`server/auth_callout.go:250-254`)

5. **Memory pressure**: MemAccResolver stores all JWTs in memory — no eviction policy observed

## Future Considerations

1. **Plugin system**: If extensibility is required, consider adopting a proper plugin architecture with:
   - Process or WASM isolation
   - Versioned plugin APIs with compatibility guarantees
   - Plugin discovery and lifecycle management

2. **Observability**: Current debug logging is ad-hoc — consider structured logging, metrics, and tracing for extension execution

3. **Timeout/crash protection**: Extensions run in-process with no resource limits — consider adding goroutine timeouts, memory limits, and circuit breakers

## Questions / Gaps

1. **No evidence of plugin discovery mechanism** — how would a user even install a plugin?
2. **No evidence of plugin lifecycle management** — init, start, stop, healthcheck?
3. **No evidence of isolation** — what happens when an auth callout service hangs?
4. **No evidence of API versioning** — how do plugin authors maintain compatibility across upgrades?
5. **No evidence of debugging tools** — how do operators troubleshoot plugin behavior?

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `nats-server`.