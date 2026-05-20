# Source Analysis: pocketbase

## Developer Experience & Operational Ergonomics

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go (SQLite, Cobra CLI) |
| Analyzed | 2026-05-20 |

## Summary

PocketBase is a self-contained Go backend with an embedded SQLite database. It ships as a single executable with a built-in admin UI and provides a rich plugin/hook system for extension. The project uses standard Go tooling (`go build`, `go test`), a minimal Makefile for lint/test, GoReleaser for multi-platform binaries, and SQL-first migrations with both up/down support and an automigrate feature. Local development requires only Go 1.25+ (no Docker), and the included `examples/base/main.go` serves as the reference application. The admin UI lives in a separate `ui/` Svelte/Vite project. The CONTRIBUTING guide is concise but covers the key workflows.

## Rating

**7/10** — Good implementation with minor issues.

PocketBase scores well on developer velocity: single Go binary, no external database dependencies, standard `go run` workflow, and comprehensive migration tooling. The automigrate feature is particularly strong — it diffs collection schemas and generates migration files automatically on API changes (`plugins/migratecmd/automigrate.go:18-96`). However, there is no Docker-based local environment (users must install Go directly), no devcontainer definition, no live-reload for Go code, and the CI pipeline is minimal (only release automation; no PR checks). The testing infrastructure is solid but requires manual understanding of the `tests/` package helpers.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Local dev setup | `examples/base/main.go` is the reference application; run with `go run main.go serve` | `examples/base/main.go:119` |
| CLI tooling | Cobra-based commands: `serve`, `superuser`, `migrate` | `cmd/serve.go:14-77`, `cmd/superuser.go:16-29` |
| Migrations framework | `MigrationsRunner` with up/down/history-sync; transaction-wrapped; timestamp-based ordering | `core/migrations_runner.go:42-117`, `core/migrations_runner.go:122-173` |
| System migrations | All system migrations run during bootstrap; tracked in `_migrations` table | `core/migrations_runner.go:246-263` |
| Automigrate | Collection create/update/delete triggers snapshot migration file creation | `plugins/migratecmd/automigrate.go:18-96` |
| Migration templates | `migrate create` generates blank Go or JS templates | `plugins/migratecmd/migratecmd.go:146-194` |
| Migration rollback | `migrate down [n]` reverts last n migrations with interactive confirmation | `core/migrations_runner.go:68-106` |
| Makefile targets | `make lint` (golangci-lint), `make test` (verbose with coverage), `make test-report` | `Makefile:1-11` |
| Linter config | golangci-lint with 14 linters enabled; 10min timeout; 4 concurrency | `golangci.yml:1-26` |
| CI/CD pipeline | GoReleaser-based release workflow; builds admin UI, runs tests, produces multi-platform binaries | `.github/workflows/release.yaml:1-56` |
| Release config | 5 architectures, 4 OSes, CGO_ENABLED=0, draft releases, checksum generation | `.goreleaser.yaml:1-67` |
| Testing infrastructure | `tests.NewTestApp()` creates isolated temp dir clones; event call tracking; test mailer mock | `tests/app.go:74-127` |
| Test helpers | `MockMultipartData`, `StubOTPRecords`, `StubLogsData` | `tests/request.go:20-63`, `tests/dynamic_stubs.go:11-147` |
| CONTRIBUTING guide | Covers Go dev (steps 1-4), UI dev (npm run dev), PR checklist | `CONTRIBUTING.md:1-85` |
| README on-boarding | Minimal 4-step example: write main.go, init module, run, build | `README.md:47-100` |
| Bootstrap process | Version check hook, data dir resolution, flag parsing, app initialization | `pocketbase.go:73-162` |
| JS VM plugin | Optional JavaScript hooks with file watching, runtime pool (15 instances) | `examples/base/main.go:89-94` |
| Multi-instance sync | Internal watcher syncs runtime state across multiple PocketBase processes via `pb_data/.notify` | `CHANGELOG.md:31-33` |
| Superuser CLI | Commands: create, upsert, update, delete, otp, ips | `cmd/superuser.go:16-246` |

## Answers to Dimension Questions

### 1. How quickly can a new engineer go from clone to running the full system?

**Fast — 4 steps, ~2 minutes.** The README (`README.md:47-100`) gives explicit steps:

```sh
git clone https://github.com/pocketbase/pocketbase
cd pocketbase/examples/base
go mod init myapp && go mod tidy
go run main.go serve
```

The server starts on `http://127.0.0.1:8090` with the embedded admin UI. No external database setup is required since SQLite is embedded. The `pb_data` directory is created automatically relative to the executable (`pocketbase.go:90-93`).

For the admin UI, `CONTRIBUTING.md:67-76` describes:
```sh
cd ui && npm install && npm run dev
```

Then access `http://localhost:5173`. However, the UI is optional and the backend works standalone.

**Gap**: No devcontainer or Docker Compose for users who prefer containerized development.

### 2. How are database schema changes tested and deployed?

**Via SQL migrations with automigrate support.**

- **Migrations list** is sorted by filename timestamp and stored in `_migrations` table (`core/migrations_runner.go:251-263`, `core/migrations_list.go:51-53`).
- **`migrate up`** applies all unapplied migrations in a transaction (`core/migrations_runner.go:122-173`).
- **`migrate down [n]`** reverts last n applied migrations with confirmation prompt (`core/migrations_runner.go:68-106`).
- **`migrate history-sync`** removes stale entries for deleted migration files (`core/migrations_runner.go:107-113`, `core/migrations_runner.go:229-244`).
- **Reapply conditions**: migrations can define a `ReapplyCondition` function to re-run under specific circumstances (`core/migrations_list.go:13`).
- **Automigrate**: when `Automigrate: true`, collection create/update/delete API requests trigger automatic migration file generation (`plugins/migratecmd/automigrate.go:18-96`). The generated file contains the full collection snapshot diff.
- **Migrate create**: `migrate create <name>` generates a blank template in Go or JS (`plugins/migratecmd/migratecmd.go:146-194`).
- **Migrate collections**: `migrate collections` generates a snapshot of all current collections (`plugins/migratecmd/migratecmd.go:196-217`).

The initial schema is defined in `migrations/1640988000_init.go:29-104` which creates the `_collections`, `_params`, `_mfas`, `_otps`, `_authOrigins`, `_externalAuths`, `_superusers`, and `users` tables with appropriate indexes.

### 3. What tooling exists for local debugging of async/workflow code?

**Limited.** The project does not have a dedicated debugging story:

- **Event hooks**: PocketBase uses an event-hook system (`core/` package has `OnServe`, `OnBootstrap`, `OnTerminate`, etc.) which allows inserting custom logic. The hook priority system (`tests/app.go:144`) lets users control execution order.
- **JS VM plugin**: `examples/base/main.go:89-94` registers a JavaScript runtime with file watching (`hooksWatch: true`) and a pool of 15 prewarmed runtimes (`hooksPool: 15`). This allows writing async hooks in JavaScript but lacks step-through debugging.
- **TestApp event inspector**: The `tests/app.go:26` `EventCalls` map tracks how many times each event fired, useful for verifying event ordering but not for live debugging.
- **Dev mode**: `pocketbase.go:236-239` enables `--dev` flag which prints logs and SQL statements to the console.
- **No delve/gdb integration** documented, no VS Code launch configs, no trace/log aggregation.

### 4. How consistent is the build across different developer machines?

**High consistency through Go's toolchain and CGO-disabled builds.**

- The project uses `CGO_ENABLED=0` (`.goreleaser.yaml:17`) producing statically linked executables with no C dependency.
- Go 1.25+ is required (per `go.mod:3` and `README.md:52`).
- The `Makefile` is minimal — only lint and test — reducing machine-specific variation.
- GoReleaser produces deterministic builds per platform with checksums (`.goreleaser.yaml:56-58`).
- The `examples/base/main.go` is the canonical reference; both prebuilt releases and `go run` use the same entrypoint.
- The admin UI build is run during CI (`.github/workflows/release.yaml:36-37`) and the `ui/dist` directory is pre-generated and committed, so the Go build doesn't require Node.js locally.

**Gap**: No Docker, so developers must have Go installed. No automated Go version manager (like `go.mod` version enforcement beyond documentation).

### 5. How does the project balance developer velocity with production safety?

**Strong on safety mechanisms, moderate on velocity ergonomics.**

**Safety mechanisms:**
- Migration runner uses database transactions (`core/migrations_runner.go:129-167`) — if any migration fails, the entire batch rolls back.
- `_migrations` table tracks applied state; down migrations can revert in order (`core/migrations_runner.go:175-227`).
- `history-sync` detects and removes orphaned migration records if files are deleted (`core/migrations_runner.go:107-113`).
- Reapply conditions allow migrations to re-run selectively if a condition is met (`core/migrations_list.go:13`).
- GoReleaser builds are signed and checksumed (`.goreleaser.yaml:56-58`).
- The `golanci.yml` enables 14 linters including `govet`, `staticcheck`, `ineffassign`, `unused` — catching many issues before CI.

**Velocity choices:**
- Single binary, no external dependencies — deploy is just copying a file.
- Automigrate means schema changes in the API auto-generate migration files, removing manual migration authoring for most cases.
- JS VM hooks allow rapid iteration without recompilation (with file watching enabled).
- The project targets 12 platform combinations (`README.md:104-120`) via CGO-disabled builds, making cross-platform release trivial.

**Tradeoff**: The lack of Docker means no reproducible local environment beyond "install Go". The CI only runs on release (`release.yaml:4-7`), not on every PR, so regressions in test coverage may not be caught until release.

## Architectural Decisions

1. **Single-file Go backend with embedded SQLite**: Avoids external database dependencies, making local development a zero-config experience. The trade-off is that scaling requires running multiple PocketBase instances with a shared file system (or switching to a proper distributed database).

2. **SQL-first migrations with timestamp-based filenames**: Migrations are sorted by filename, not by stored order. This means migration file renames can break the intended sequence. The `history-sync` command mitigates this by removing entries for deleted files.

3. **Plugin architecture for hooks and commands**: The `examples/base/main.go` shows how plugins (`jsvm`, `migratecmd`, `ghupdate`) are registered on the app. Each plugin can add Cobra commands and event listeners. This is opt-in; the core binary is minimal.

4. **Event-hook system for extension**: Instead of subclassing, users bind handler functions to lifecycle events (`OnServe`, `OnRecordCreate`, etc.). This decouples extension from core but makes debugging harder since the call chain is implicit.

5. **Pre-generated admin UI embedded in the binary**: The `ui/dist` directory is built and embedded at compile time. Developers working on the UI must run `npm run build` to regenerate it, but for Go-only work the UI is always present.

## Notable Patterns

- **CLI-first with Cobra**: All commands (`serve`, `superuser`, `migrate`) are Cobra commands registered in `pocketbase.go:167-169`. Flag parsing is done eagerly before command execution (`pocketbase.go:219-249`).

- **Test app with isolation**: `tests.NewTestApp()` creates a temp directory clone of the test data, ensuring each test gets a fresh database. `Cleanup()` removes the temp dir. Event call tracking allows tests to verify event ordering.

- **Transaction-wrapped migrations**: Both up and down migrations run inside a transaction (`core/migrations_runner.go:129-167`). If any step fails, the entire operation rolls back.

- **Automigrate hooks**: The migratecmd plugin binds to `OnCollectionCreateRequest`, `OnCollectionUpdateRequest`, `OnCollectionDeleteRequest` to generate migration files automatically (`plugins/migratecmd/automigrate.go:82-86`).

- **Colored CLI output**: `color` package from `fatih/color` is used for terminal output (green for success, red for errors) — e.g., `cmd/superuser.go:64`, `core/migrations_runner.go:60-64`.

- **GoReleaser snapshot builds for PRs**: The CI uses GoReleaser in snapshot mode for non-tag pushes, ensuring the build process is tested on every push (`.github/workflows/release.yaml:15-16`).

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Embedded SQLite, no Docker | Zero-config local dev, single-file deploy | Not suitable for multi-instance write scaling without shared storage |
| No PR CI workflow | Simpler CI, faster commits | Bugs may reach releases undetected |
| JS VM hooks for extension | Fast iteration without Go recompilation | JavaScript debugging lacks tooling; performance overhead vs. Go |
| Pre-generated UI embedded | Admin UI always available, no runtime Node.js | UI developers need Node.js environment; build step required before Go release |
| CGO_ENABLED=0 static builds | Cross-platform compatibility, no libc dependency | Cannot use C-extension SQLite drivers; pure Go SQLite limits some features |
| Timestamp-based migration sorting | Human-readable order, git-friendly filenames | Renaming files changes execution order; must preserve original timestamps |

## Failure Modes / Edge Cases

1. **Migration file rename breaks sequence**: If a developer renames `1700000000_init.go` to `1700000001_init.go`, the sort order changes. PocketBase handles this via the `_migrations` applied table, but the file-based timestamp sort can cause unexpected execution order if multiple machines have different filesystem timestamp precision.

2. **Automigrate runs on every collection change**: With `Automigrate: true`, every API call that changes a collection generates a migration file. High-frequency collection updates (e.g., in a migration script) could create many migration files. The `automigrate.go:85` uses `txApp.DB().Insert` in a transaction but the file write is inside the transaction, so a crash could leave an orphaned entry.

3. **No down migration for auto-generated snapshots**: The automigrate generates up-only migrations (the collection state). There is no automatic down migration, so reverting a collection creation requires manual migration authoring.

4. **JS VM pool exhaustion**: With `hooksPool: 15` (default in `examples/base/main.go:47`), long-running synchronous JS operations could block the pool, preventing other hooks from executing. No timeout or queue is documented.

5. **Superuser OTP without MFA enabled**: `superuser otp` command (`cmd/superuser.go:177-211`) creates an OTP even if `OTP.Enabled` is false on the `_superusers` collection, potentially bypassing the intended MFA requirement.

6. **Dev mode SQL logging**: `--dev` flag (`pocketbase.go:237-239`) prints all SQL statements to console. In high-throughput scenarios, this can produce massive output and slow down the process.

7. **GoReleaser dry-run only on PR**: The `release.yaml` workflow runs on both `pull_request` and `push` events. For PRs, it only builds a snapshot. Actual releases only happen on tags. This means the release pipeline (tests → build → sign → upload) is not verified on every PR.

## Future Considerations

1. **Add Docker Compose for local development**: A `docker-compose.yml` with PocketBase, a dev SQLite volume, and optionally a Node.js dev server for the UI would improve onboarding for developers who don't have Go installed.

2. **PR CI workflow**: Running `make test && make lint` on every PR (not just releases) would catch regressions earlier. The existing `release.yaml` already has the infrastructure; it just needs to run on PRs without requiring a release build.

3. **Structured logging**: Currently logs are printed to stdout via `color` packages. Structured logging (JSON) would improve production debugging and log aggregation.

4. **Graceful reload without restart**: The multi-instance sync watcher (`CHANGELOG.md:31-33`) could be extended to support config reload via SIGHUP, allowing runtime changes without process restart.

5. **Migration replay for tests**: The `tests/app.go:125` runs `app.RunAllMigrations()` during test setup. For large migration suites, this could slow down test runs. A `migrate test` mode that skips already-applied migrations would help.

## Questions / Gaps

1. **No devcontainer definition**: Developers without Go installed must set it up manually. A `.devcontainer/` with Go, Node.js, and the correct extensions would improve consistency.

2. **No Docker-based production deployment**: The project ships as a standalone binary but provides no Helm chart, Docker image, or docker-compose for production. Users must build their own.

3. **No metrics/observability endpoints**: There is no `/metrics` endpoint (Prometheus format) or tracing (OpenTelemetry). Production deployments have no built-in way to observe request latency, error rates, or migration status.

4. **No health check endpoint**: The serve command starts an HTTP server but has no built-in `/health` endpoint. Load balancers expecting health checks must use the admin UI endpoints or a separate check.

5. **CI only runs on release**: As noted, PRs don't run the test suite through CI. The `release.yaml:46-47` runs `go test ./...` but only during the release pipeline triggered by tags.

6. **No migration rollback integration with automigrate**: If automigrate creates a migration file that is then manually edited, there is no mechanism to track that the file has changed. The migration runner will not re-apply an already-applied file unless a `ReapplyCondition` is defined.

---

Generated by `dimensions/17-developer-experience-operational-ergonomics.md` against `pocketbase`.