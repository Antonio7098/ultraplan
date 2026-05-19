# Source Analysis: nats-server

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

The nats-server project uses a **single-module Go project** with a flat top-level structure. The main implementation lives in the `server/` package, with a separate `logger/` package for logging concerns and a minimal `internal/` package for internal utilities. The project exhibits a **layer-based organization** where core server types live in large monolithic files within `server/`, while specialized subsystems (JetStream, MQTT, WebSocket, etc.) are organized as flat files rather than nested packages. Subpackages under `server/` (e.g., `pse/`, `stree/`, `gsl/`, `sysmem/`, `elastic/`, `tpm/`, `certstore/`, `certidp/`, `avl/`, `thw/`) are small, focused utilities. The module path is `github.com/nats-io/nats-server/v2` (`go.mod:1`).

## Rating

**6/10** — Basic implementation with gaps. The project uses a single large module with minimal internal package separation. The `server/` directory contains files exceeding 100K lines (e.g., `client.go:1-6917`, `filestore.go:366K`, `jetstream_cluster.go:339K`) which indicates difficulty in boundary maintenance. Subpackages exist but are not consistently applied — features like JetStream and MQTT are flat files rather than packages. The `internal/` directory is underutilized and contains only 5 small packages.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Module definition | `module github.com/nats-io/nats-server/v2` | `go.mod:1` |
| Single module strategy | Only one `go.mod` at repo root; no multi-module setup | `go.mod:1-16` |
| Main package | `package main` imports `"github.com/nats-io/nats-server/v2/server"` | `main.go:14,23` |
| Server struct | `type Server struct` — central 300+ line struct | `server/server.go:167-299` |
| Large file — client | 6917 lines in single file | `server/client.go:1-6917` |
| Large file — filestore | 366K bytes, 200K+ lines | `server/filestore.go` |
| Large file — jetstream_cluster | 339K bytes | `server/jetstream_cluster.go` |
| Subpackage — gsl | Generic sublist library | `server/gsl/gsl.go:14` |
| Subpackage — stree | Radix tree for subjects | `server/stree/stree.go` |
| Subpackage — pse | Platform-specific system calls | `server/pse/` |
| Subpackage — sysmem | System memory allocator | `server/sysmem/` |
| Subpackage — tpm | TPM key enrollment | `server/tpm/js_ek_tpm_other.go:1` |
| Internal package — fastrand | Lock-free random via `go:linkname` | `internal/fastrand/fastrand.go:11-12` |
| Internal package — ldap | LDAP authenticator | `internal/ldap` |
| Logger package | Separate logging package | `logger/log.go:1` |
| Package import — gsl used by stree | `import "github.com/nats-io/nats-server/v2/server/gsl"` | `server/stree/stree.go:21` |
| Package import — internal/fastrand | Used by `client.go`, `raft.go`, `accounts.go` | `server/client.go:41` |
| Boundary — internal hidden | `internal/` packages not importable from outside | `internal/fastrand/fastrand.go:1-23` |
| Boundary — no `internal/` subdivision | No `internal/server/` or `internal/core/` separation | `internal/` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

**No clear evidence of systematic boundary enforcement.** There is no `go.mod` versioning strategy for internal packages, no `internal/` subdirectory structure to enforce visibility boundaries beyond Go's standard `internal/` rules, and no linter configuration enforcing dependency direction. The project relies on Go's flat package structure within `server/`. Large feature files like `jetstream_cluster.go` (339K), `mqtt.go` (181K), `gateway.go` (103K) are flat files, not packages, which means boundary erosion is addressed by keeping features in single files rather than subdividing them into packages.

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid, weighted toward layer-based grouping within a single package.** The top-level `server/` package contains all core server code without domain-based subpackages. Subpackages under `server/` (e.g., `pse/`, `stree/`, `gsl/`, `sysmem/`) are utility libraries, not domain modules. Domain features (JetStream, MQTT, WebSocket, LeafNodes, Routes, Accounts) are implemented as large flat files within `server/`, not as subpackages. For example, JetStream spans `jetstream.go`, `jetstream_cluster.go`, `jetstream_api.go`, `jetstream_batching.go`, `consumer.go`, `stream.go` — all flat files in the same package.

### 3. Where does internal API surface end and public SDK begin?

**Single module — no explicit boundary.** The entire `github.com/nats-io/nats-server/v2` module is public. `main.go:23` imports `"github.com/nats-io/nats-server/v2/server"`. There is no separate `sdk/` or `client/` package — the server IS the public API. The `logger/` package (`logger/log.go:1`) is a separate top-level package but still within the same module. No explicit `internal/`-to-public boundary enforcement exists beyond Go's standard `internal/` visibility rules (which only apply to `internal/` directories).

### 4. What conventions prevent circular dependencies?

**Minimal convention enforcement.** No evidence of `depguard`, `go-cyclic`, or similar tools in `.golangci.yml`. Dependencies flow: `server/` imports from `logger/`, `internal/fastrand`, `internal/ldap`, and subpackages (`gsl`, `stree`, `pse`, `sysmem`, `tpm`, etc.). The `server/` package is the root; no package imports `server/` back (except `main.go` which is the entry point). `internal/` packages have no dependencies on `server/` or each other (verified: `internal/fastrand/fastrand.go:1-23` is self-contained, `internal/ldap` is auth-only).

### 5. How does the project structure support multiple contributors with isolated work areas?

**Limited isolation.** Large files (6917-line `client.go`, 366K-line `filestore.go`) create merge conflicts. No domain-based subpackage boundaries to limit scope. `server/` package has no internal namespace protection — any file in `server/` can import any other. Contributors working on e.g. MQTT and JetStream will both modify `server/` package directly. The `server/` directory itself acts as the "module" boundary, not a package boundary.

## Architectural Decisions

1. **Single-module Go project**: One `go.mod` at root (`go.mod:1`), no multi-module strategy. All packages live under `github.com/nats-io/nats-server/v2`.
2. **Flat `server/` package**: Core implementation in a single large package rather than nested domain packages. Files are named by feature (e.g., `consumer.go`, `stream.go`, `leafnode.go`, `mqtt.go`) rather than organized into subpackages.
3. **Subpackages as utility libraries**: Subpackages (`gsl/`, `stree/`, `pse/`, `sysmem/`, `tpm/`, `elastic/`, `thw/`, `certstore/`, `certidp/`, `avl/`) are small focused utilities, not domain modules. Each is 1-15 files.
4. **Separate `logger/` package**: Logging is a standalone package at top level, imported as `github.com/nats-io/nats-server/v2/logger`.
5. **Minimal `internal/` use**: Only 5 packages (`antithesis`, `fastrand`, `ldap`, `ocsp`, `testhelper`) — mostly utilities. Not used for domain boundary enforcement.
6. **Feature files vs. feature packages**: JetStream spans 8+ large files all in `server/` package; MQTT is a single 181K-line file `mqtt.go`; WebSocket is a single 47K-line file `websocket.go`.

## Notable Patterns

- **Go:linkname for fastrand**: `internal/fastrand/fastrand.go:11-12` uses `//go:linkname` to call `runtime.fastrand` directly, bypassing Go's crypto/rand for performance.
- **Platform-specific subdirectories**: `server/pse/` contains per-OS files (pse_linux.go, pse_windows.go, pse_darwin.go, etc.) with build tags. `server/sysmem/` similarly has platform variants.
- **No internal package nesting**: `internal/` contains flat packages, not `internal/server/` or similar hierarchy.
- **Generated error code**: `main.go:16` runs `go generate` on `server/errors_gen.go`. Errors are defined in `server/errors.json` and generated into `server/errors_gen.go`.
- **Test files co-located**: Tests are in the same package as implementation (e.g., `client_test.go`, `jetstream_test.go`), not in a separate `*_test` package.

## Tradeoffs

| Tradeoff | Consequence |
|----------|-------------|
| Single large `server/` package | Simple dependency graph; no import cycles; but 100+ files in one package means no namespace isolation |
| Flat files for features (MQTT 181K, JetStream 366K) | Easy to find all related code; but prevents independent versioning and forces entire package rebuild on any change |
| Minimal `internal/` usage | Straightforward module structure; but no enforced boundary between "public" server API and internal helpers |
| No domain subpackages | Avoids over-engineering; but large feature areas like JetStream have no clear package boundary |
| Subpackages as utilities only | Clean separation for low-level libs (gsl, stree, pse); but domain features lack the same treatment |

## Failure Modes / Edge Cases

1. **Merge conflicts**: 6917-line `client.go` and 366K-line `filestore.go` will cause frequent merge conflicts in collaborative work.
2. **Long compile times**: The entire `server/` package must compile together; no incremental domain package compilation.
3. **Boundary erosion in `server/`**: With 100+ files in a single package, nothing prevents a developer from creating an import cycle or breaking encapsulation.
4. **No versioned sub-modules**: Cannot independently release or version JetStream vs. core server — all versioned together as `v2.15.0-dev` (`server/const.go:69`).
5. **Hidden internal packages**: `internal/` visibility only works for `internal/` directory; there is no equivalent protection for `server/` subpackages.

## Future Considerations

- Consider splitting `server/` into domain subpackages (e.g., `server/core/`, `server/jetstream/`, `server/mqtt/`) with independent `go.mod` files if the codebase continues to grow.
- Evaluate `golangci-lint` rules like `depguard` or custom analyzers to enforce layer boundaries within `server/`.
- Consider extracting stable subpackages (`gsl/`, `stree/`) into their own versioned modules if external consumption grows.

## Questions / Gaps

1. **Why are features like JetStream and MQTT flat files rather than packages?** No evidence found explaining this decision. Could be historical (evolved from single-file into large file) or deliberate simplicity.
2. **Is there a plan for multi-module decomposition?** No evidence found in README, CONTRIBUTING, or docs about modularization strategy.
3. **How is API stability maintained for external consumers?** No evidence of versioned API contracts or deprecation policies within the single module.
4. **Why is `internal/` so underutilized?** Only 5 small packages when `internal/` could house implementation details of JetStream, accounts, or clustering.

---

Generated by `dimensions/01-project-structure-boundaries.md` against `nats-server`.