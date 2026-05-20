# Source Analysis: cli

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

The GitHub CLI (`gh`) is a stateless command-line tool that delegates state persistence to external systems. Configuration is stored in YAML files (`config.yml`, `hosts.yml`) via the `go-gh` library, with sensitive tokens optionally encrypted via the system keyring. State management is minimal: no local database, no transaction boundaries, and no caching layer beyond file-based run log caching. Long-running operations (codespaces, workflow runs) are managed by polling remote APIs rather than persisting local workflow state.

## Rating

**5/10** — Basic implementation with significant gaps. The CLI has no local database or repository pattern, making it reliant on API calls for state. Config persistence is file-based with a migration system, but there's no caching of API responses (beyond `go-gh`'s HTTP caching), no invalidation strategy, and no mechanism for resumable workflows. The lockfile in `internal/skills/lockfile/lockfile.go:178` uses file-based locking for concurrent access, which is adequate but primitive.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config abstraction | `gh.Config` interface defines `GetOrDefault`, `Set`, `Write`, `Migrate` | `internal/gh/gh.go:32-80` |
| Config implementation | `cfg` struct wraps `ghConfig.Config` from `go-gh` | `internal/config/config.go:49-51` |
| Auth token storage | `ActiveToken` searches env vars → config → keyring | `internal/config/config.go:237-259` |
| Keyring integration | Wrapper around `zalando/go-keyring` with 3s timeout | `internal/keyring/keyring.go:22-58` |
| Migration system | `Migration` interface with `PreVersion`, `PostVersion`, `Do` | `internal/gh/gh.go:82-100` |
| Config migration | `cfg.Migrate()` checks version before/after, writes on success | `internal/config/config.go:182-209` |
| State directories | `StateDir()`, `DataDir()`, `CacheDir()` delegate to `ghConfig` | `internal/config/config.go:712-718` |
| HTTP client factory | `NewHTTPClient` accepts `CacheTTL`, `EnableCache` options | `api/http_client.go:20-31` |
| Cached HTTP client | `NewCachedHTTPClient` wraps transport with TTL header | `api/http_client.go:89-93` |
| Cache TTL header | `AddCacheTTLHeader` sets `X-GH-CACHE-TTL` on requests | `api/http_client.go:95-105` |
| Auth header injection | `AddAuthTokenHeader` injects `Authorization: token` per request | `api/http_client.go:107-127` |
| Feature detection | `Detector` interface probes API capabilities at runtime | `internal/featuredetection/feature_detection.go:14-23` |
| Codespace state polling | Exponential backoff (1s-10s) with 5min max elapsed | `internal/codespaces/codespaces.go:18-23` |
| Run log caching | `RunLogCache` stores zip files by `runID-timestamp` | `pkg/cmd/run/view/view.go:30-76` |
| Telemetry device ID | UUID persisted atomically via `os.Link` rename | `internal/telemetry/telemetry.go:38-88` |
| Update state file | YAML `StateEntry` with `CheckedForUpdateAt` and `LatestRelease` | `internal/update/update.go:32-35` |
| Skills lockfile | JSON lockfile with file-based `flock` for concurrency | `internal/skills/lockfile/lockfile.go:36-40,151-177` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

**Direct file access via `go-gh`**, not a database or repository pattern. The `Config` interface (`internal/gh/gh.go:32`) provides get/set semantics but wraps raw YAML files:

- `cfg.Set()` writes to `ghConfig.Config` which persists to `$GH_CONFIG_DIR/config.yml` and `$GH_CONFIG_DIR/hosts.yml`
- `cfg.Write()` at `internal/config/config.go:106-108` triggers the `go-gh` write
- No ORM, no DAL, no event sourcing

Auth tokens are stored either:
- In plain text in `hosts.yml` under `oauth_token` key
- In the system keyring via `keyring.Set/Get` at `internal/keyring/keyring.go:22-58`

### 2. What consistency model does the system provide to callers?

**No local consistency guarantee.** The CLI is essentially a thin client — it reads/writes remote GitHub API state and its own config files. For local config:

- Writes are immediate via `ghConfig.Write()` at `internal/config/config.go:107`
- No read-after-write consistency check
- Concurrent writes to the lockfile use `flock.TryLock` at `internal/skills/lockfile/lockfile.go:163`

For API calls, the consistency model is whatever GitHub's API provides (eventual consistency for most resources). The `featuredetection` package (`internal/featuredetection/feature_detection.go:14`) performs runtime API probing to adapt to server capabilities, but this is detection not consistency.

### 3. How is cache invalidation handled without stale reads?

**No cache invalidation strategy.** The CLI does not cache API responses locally (beyond what `go-gh`'s HTTP client does internally). Two patterns are used:

1. **Time-based TTL via header**: `AddCacheTTLHeader` at `api/http_client.go:97` sets `X-GH-CACHE-TTL` on outgoing requests. This tells the server-side cache (GitHub's API) how long to cache responses, but the CLI has no control over invalidation.

2. **Run log cache with no invalidation**: `RunLogCache` at `pkg/cmd/run/view/view.go:30` stores run logs as zip files keyed by `runID-startTime`. There is no TTL or eviction policy — logs persist until manually deleted or the cache directory is cleared.

The `NewCachedHTTPClient` function at `api/http_client.go:89` creates a client that adds TTL headers but does not implement a local cache store. The `go-gh` library handles HTTP caching internally.

### 4. How is long-running workflow state persisted and resumed?

**Not persisted locally — polling remote API.** The `codespaces` package (`internal/codespaces/codespaces.go:58-129`) implements a `waitUntilCodespaceConnectionReady` function that:

- Polls `GetCodespace` with exponential backoff (1s initial, 1.02 multiplier, 10s max, 5min total)
- Returns when `connectionReady()` is true (checks tunnel properties at `codespaces/codespaces.go:25-37`)
- No local state is saved between polls; if the process dies, the workflow must restart from scratch

Workflow runs (`pkg/cmd/workflow/`) and run viewing (`pkg/cmd/run/view/view.go:490-532`) similarly fetch state from the API on demand. The `RunLogCache` at `pkg/cmd/run/view/view.go:30-76` caches downloaded logs but not workflow state.

**No resumable workflow mechanism exists.**

### 5. What happens to in-flight state during schema migrations?

**Migrations are version-gated and atomic.** The `cfg.Migrate()` at `internal/config/config.go:182-209`:

1. Checks `m.PostVersion() == version` — if migration already applied, returns nil (no-op)
2. Checks `m.PreVersion() == version` — if versions don't match, returns error (`failed to migrate as "X" pre migration version did not match config version "Y"`)
3. Runs `m.Do(c.cfg)` to apply changes
4. Sets the new version key: `c.Set("", versionKey, m.PostVersion())`
5. Writes the config: `c.Write()`

If `Do()` fails, the config is not written (tested at `internal/config/migrate_test.go:153-174`). However, the migration itself may have partially modified `c.cfg` in memory before failing — there is no transactional rollback. Example at `internal/config/migration/multi_account.go:86-137` shows a migration that reads host keys, migrates tokens, and calls `ghConfig.Write` only at the end.

## Architectural Decisions

1. **No local database** — All persistent state lives in YAML config files and the system keyring. This simplifies deployment but limits the CLI's ability to track complex local state.

2. **Delegation to `go-gh`** — The `ghConfig` package from `go-gh` handles file I/O, which means the CLI inherits whatever consistency/transaction model `go-gh` provides (which is essentially none — simple file writes).

3. **Feature detection via runtime probing** — Rather than a static capability matrix, the CLI uses `featuredetection.Detector` to query the GitHub API schema at runtime. This is adaptive but adds latency to first-run for certain commands.

4. **Config migration as versioned scripts** — Migrations implement the `Migration` interface with pre/post versions, providing a audit trail and preventing re-execution.

5. **File-based locking for skill installs** — The lockfile at `internal/skills/lockfile/lockfile.go:151-177` uses `flock.TryLock` with 30 retries and 100ms delays, adequate for CLI usage but not a robust distributed lock.

## Notable Patterns

- **`Option[T]` monad** for config values — `pkg/option/option.go` provides `Some`/`None`/`Map`/`Unwrap` for typed config access rather than nil checking
- **Transport wrapper pattern** — Auth tokens and cache TTLs are added via `RoundTripper` wrappers (`api/http_client.go:97-127`)
- **Factory pattern** for commands — `pkg/cmdutil/factory.go` provides a `Factory` struct with `IOStreams`, `HTTPClient`, `Config`, `BaseRepo` that commands receive
- **Mock injection via interface** — `//go:generate moq` is used to generate mocks for `Config`, `ExtensionManager`, `Prompter`, etc.
- **Backoff with context** — `backoff.Retry(..., backoff.WithContext(...))` is used for codespace polling at `internal/codespaces/codespaces.go:89-117`

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No local DB | Simple deployment, no sync issues; cannot track complex local state |
| Config in YAML files | Human-editable; no schema enforcement, no transactions |
| Keyring for secrets | OS-level security; platform-dependent, may timeout (3s at `internal/keyring/keyring.go:31`) |
| API polling for long ops | Simple implementation; wastes bandwidth, adds latency |
| File-based lockfile | Works for single-user CLI; breaks with concurrent installs |
| No local API caching |每一次调用都 hit the network; slower but always fresh |

## Failure Modes / Edge Cases

1. **Keyring timeout** — If the keyring service is slow (e.g., on some Linux desktops), `keyring.Get/Set` times out after 3 seconds (`internal/keyring/keyring.go:31,57,72`), causing auth failures.

2. **Partial migration failure** — If `Do()` in a migration fails after modifying `c.cfg` in memory, the config object may be in an inconsistent state. The error is returned but the in-memory state is not rolled back.

3. **Lockfile race on first install** — `acquireFLock` retries 30 times with 100ms delays (`internal/skills/lockfile/lockfile.go:162-174`). If two processes race for the lock and the OS doesn't release it quickly enough, the install fails with `could not acquire lock after 30 attempts`.

4. **Stale run log cache** — `RunLogCache` at `pkg/cmd/run/view/view.go:490` caches logs by `runID-startTime`. If a run is re-run, the cache key changes (new `StartedTime`) and the old log is orphaned in the cache directory with no eviction.

5. **Config file corruption** — If `config.yml` or `hosts.yml` is corrupted, `ghConfig.Read` may fail silently or return incomplete data. The `readFrom` function in `internal/skills/lockfile/lockfile.go:53-75` handles corrupt lockfiles gracefully by returning `newFile()`, but the config package does not have equivalent protection.

6. **Feature detection race** — `featuredetection` queries the GraphQL schema at startup for certain commands. If the API is slow, commands are delayed; if the API changes mid-session, stale feature flags may be used.

## Future Considerations

1. **Add a local database** — SQLite would enable tracking local state, offline operation, and complex queries without hitting the API.

2. **Implement cache eviction** — The `RunLogCache` should have a maximum size or TTL, and a background cleanup goroutine.

3. **Add migration rollback** — Wrap migration `Do()` in a transaction-like pattern with rollback on failure.

4. **Distributed locking** — For the skills lockfile, consider `flock.FcntlFsetlk` on Unix or a proper distributed lock (e.g., via a lock service) for multi-process scenarios.

5. **API response caching** — A local cache layer (e.g., Badger, BadgerDB) with invalidation on `ETag` or `Last-Modified` headers would reduce API calls and improve performance for repeated queries.

## Questions / Gaps

- **No evidence found** of a mechanism to handle GitHub API rate limit errors with backoff and persistence of retry state.
- **No evidence found** of a local event store or outbox pattern for offline-first operation.
- **No evidence found** of schema migration tooling for the config files beyond the version-key approach.
- **No evidence found** of a health check or status endpoint for the CLI's persistent connections (keyring, config files).
- The `go-gh` library's HTTP caching behavior is not documented in this codebase; it is an external dependency.

---

Generated by `dimensions/08-state-management-persistence.md` against `cli`.