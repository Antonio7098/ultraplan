# Repo Analysis: age

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Age is an encryption tool that separates concerns cleanly: the core cryptographic logic lives in the root package (`age.go`, `x25519.go`, `scrypt.go`, etc.), while CLI entry points are organized under `cmd/` and internal format/streaming utilities reside in `internal/`. The `pkg/` directory is not used. The CLI layer is intentionally thin, delegating all business logic to the root package.

## Rating

**7/10** — Clear stream-oriented pipeline model with bounded loops and structured failure handling, but no pause/resume, compaction, or recovery mechanisms.

**Execution Model**: Step-based, stream-oriented pipeline. Encryption proceeds in three phases: (1) key wrapping via `encryptHdr()` (`age.go:118`) iterates over recipients (bounded by input count) and produces an age header, (2) header and random nonce are written to the output, (3) plaintext is chunked and encrypted through `stream.NewEncryptWriter()` (`stream/stream.go:187`), which processes 64 KB chunks in a `for len(p) > 0` loop (`stream.go:204`). Decryption mirrors this: `format.Parse()` (`internal/format/format.go:250`) reads the header through a bounded `for { break }` loop keyed on the `---` footer prefix, then `decryptHdr()` (`age.go:320`) iterates over identities (bounded, with native-first sorting at `age.go:324`), and finally chunked decryption via `stream.DecryptReader.Read()` (`stream.go:71`). All loops are bounded by input size, file structure, or argument count. Failure is structured via sentinel errors (`ErrIncorrectIdentity` at `age.go:77`), aggregated error types (`NoIdentityMatchError` at `age.go:222`), and consistent `fmt.Errorf("...: %w")` wrapping. The plugin protocol (`plugin/plugin.go:183`) uses explicit state-machine loops with a `broken` flag (`plugin.go:44`) for crash-out on protocol violation. No pause/resume or execution compaction exists. The streaming chunk counter uses an 88-bit nonce whose wrap-around would panic (`stream.go:162`), but this is unreachable in practice.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Main entry point | `main()` in `cmd/age/age.go:105` | `cmd/age/age.go:105` |
| Keygen entry point | `main()` in `cmd/age-keygen/keygen.go:63` | `cmd/age-keygen/keygen.go:63` |
| Inspect entry point | `main()` in `cmd/age-inspect/inspect.go:31` | `cmd/age-inspect/inspect.go:31` |
| Core API (Encrypt/Decrypt) | `Encrypt()`, `Decrypt()` in root `age.go` | `age.go:154,249` |
| Internal format parsing | `format.Parse()` in `internal/format/format.go` | `internal/format/format.go:250` |
| Internal stream encryption | `stream.NewEncryptWriter()` in `internal/stream/stream.go` | `internal/stream/stream.go:118` |
| Plugin interface | `plugin.Plugin` and `plugin.Client` in `plugin/plugin.go` | `plugin/plugin.go:44,89` |
| No `pkg/` directory | Confirmed absent | - |
| `internal/` packages | `bech32`, `format`, `inspect`, `stream`, `term` | `internal/*/` |
| `cmd/` subdirectories | `age`, `age-keygen`, `age-inspect`, `age-plugin-batchpass` | `cmd/*/` |

## Answers to Protocol Questions

**1. Why are folders organized this way?**

The root-level Go files (`age.go`, `x25519.go`, `scrypt.go`, `pq.go`, `armor/`) form the public library API. The `cmd/` directory contains separate binaries (`age`, `age-keygen`, `age-inspect`, `age-plugin-batchpass`) that import and use the root package. The `internal/` directory holds implementation details that the public API depends on but are not intended for external use.

**2. What belongs in `cmd/` vs `internal/` vs `pkg/`?**

- `cmd/`: Executable entry points only. Each subdirectory is its own `main` package.
- `internal/`: Private implementation details shared by the root package (format parsing, streaming, terminal UI, bech32 encoding). Go's `internal` path restriction prevents external imports.
- `pkg/`: Not used — all public library code lives at the root.
- Root-level Go files: The public library API (`age.go:154` for `Encrypt`, `age.go:249` for `Decrypt`).

**3. Is the CLI layer thin?**

Yes. `cmd/age/age.go:105` shows the CLI is a thin wrapper around `filippo.io/age` (`age.go:154,249`). It handles flag parsing and file I/O but delegates all cryptographic operations to the library.

**4. Where does business logic actually live?**

In the root package files: `age.go` (core Encrypt/Decrypt), `x25519.go` (X25519 key operations), `scrypt.go` (passphrase-based encryption), `pq.go` (post-quantum hybrid keys), and `armor/` (PEM armor encoding).

**5. How do they prevent package coupling?**

- Go's `internal/` path restriction prevents external packages from importing `internal/*` (`internal/format/format.go:6`, `internal/stream/stream.go`).
- The `cmd/` binaries only import the root `filippo.io/age` package, not `internal/` directly.
- Dependency direction is strictly inward: `cmd/` → root `age` package → `internal/` packages.

## Architectural Decisions

1. **No `pkg/`** — All public API lives at module root, following Go's recommended practice for libraries.
2. **`internal/` for implementation details** — Format encoding, stream encryption, and terminal UI are in `internal/` to enforce non-export via Go's import rules.
3. **Separate binaries per concern** — `age` (encryption), `age-keygen` (key generation), `age-inspect` (file inspection) are separate `cmd/` entries, allowing independent distribution.
4. **Plugin architecture** — `plugin/plugin.go` defines a `Plugin` interface and `Client` that external plugin processes implement, keeping the plugin protocol out of the main binary.

## Notable Patterns

- **`main()` packages in `cmd/` are thin** — They import `filippo.io/age` and call high-level APIs like `age.Encrypt()` and `age.Decrypt()`.
- **Version injection via linker flags** — `cmd/age/age.go:102` defines `Version` string set at link time, avoiding a runtime import.
- **Identity/Recipient interface segregation** — `age.go:65` defines `Identity` and `age.go:82` defines `Recipient` as separate interfaces, following the principle of least authority.

## Tradeoffs

1. **Root-level files could be split further** — `pq.go`, `primitives.go`, and `parse.go` at root contain related logic. Moving them to `internal/` would reduce root surface area but increase import depth.
2. **`internal/` is flat, not nested** — All internal packages are at `internal/*` rather than `internal/age/*`, which works for a small number of packages but may not scale.

## Failure Modes / Edge Cases

- **Plugin protocol breakage** — If `plugin/plugin.go:44` changes the `Plugin` interface, plugins compiled against older versions will break silently at runtime.
- **No `internal/` access from `cmd/` is enforced by Go** — External packages cannot import `internal/`, so the boundary is compiler-enforced.

## Future Considerations

- Consider moving format-specific parsing (`parse.go`) into `internal/format/` if the public API stabilizes.
- The plugin architecture (`plugin/plugin.go`) could benefit from version negotiation to support graceful upgrades.

## Questions / Gaps

- **Why no `pkg/`?** The project appears to follow a "library at root" pattern but doesn't document this decision. No evidence found explaining the choice.
- **`armor/` at root vs `internal/armor/`?** The `armor/` package is at root (`armor`) rather than `internal/armor`, indicating it is considered part of the public API. This is intentional per `age.go:14`.

---

Generated by `study-areas/01-project-structure.md` against `age`.