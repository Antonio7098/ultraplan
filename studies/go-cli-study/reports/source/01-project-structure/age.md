# Source Analysis: age

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/go-cli-study/sources/age` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

age uses an unconventional but effective structure where the core library IS the root module (`filippo.io/age`), CLI binaries are in `cmd/`, and private implementation details are in `internal/`. There is no `pkg/` directory — the public API surface is the root package plus well-defined sub-packages (`agessh/`, `armor/`, `plugin/`). The CLI layer is moderately thin: `cmd/age/age.go` handles flag parsing and I/O orchestration, then delegates to `age.Encrypt()` or `age.Decrypt()` for actual crypto. The `internal/` packages enforce Go's compiler-level import protection for wire format, stream cipher, terminal I/O, and bech32 encoding, preventing external consumers from depending on unstable internals.

## Rating

**7/10** — Clean layering with strong boundary enforcement via `internal/`. The root-as-library pattern is elegant for a crypto library. Minor deduction because the CLI `cmd/age/` package contains substantive parsing logic (recipient/identity file parsing, key type dispatch) that couples it to the library's type hierarchy, and the `EncryptedIdentity` type in `cmd/age/` blurs the line between CLI and business logic.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point (age encrypt/decrypt) | `cmd/age/age.go` package main with `flag`-based CLI | `cmd/age/age.go:5` |
| Entry point (keygen) | `cmd/age-keygen/keygen.go` package main | `cmd/age-keygen/keygen.go:5` |
| Entry point (inspect) | `cmd/age-inspect/inspect.go` package main | `cmd/age-inspect/inspect.go:5` |
| Core library | Root package `age` defining `Encrypt()`, `Decrypt()`, `Recipient`, `Identity` interfaces | `age.go:46` |
| CLI → library bridge | `cmd/age/age.go:421` calls `age.Encrypt(out, recipients...)` | `cmd/age/age.go:421` |
| CLI → library bridge | `cmd/age/age.go:503` calls `age.Decrypt(in, identities...)` | `cmd/age/age.go:503` |
| internal/format | Wire format parsing under `internal/` compiler barrier | `internal/format/format.go:5` |
| internal/stream | STREAM chunked encryption under `internal/` compiler barrier | `internal/stream/stream.go:5` |
| internal/bech32 | Bech32 encoding (key serialization) under `internal/` barrier | `internal/bech32/bech32.go` |
| internal/term | Terminal I/O (password prompts) under `internal/` barrier | `internal/term/term.go:1` |
| internal/inspect | File inspection logic used by `age-inspect` CLI | `internal/inspect/inspect.go:1` |
| agessh public package | SSH key support as public sub-package | `agessh/agessh.go:1` |
| armor public package | PEM-like ASCII armor encoding | `armor/armor.go:1` |
| plugin public package | Plugin protocol client + framework | `plugin/plugin.go:1` |
| Root-level library files | `x25519.go`, `pq.go`, `scrypt.go`, `parse.go` all in package `age` | `x25519.go:5` |
| Dependency: root → internal | `age.go:59` imports `internal/format` and `internal/stream` | `age.go:58-59` |
| Dependency: plugin → internal | `plugin/plugin.go:21` imports `internal/format` | `plugin/plugin.go:21` |
| Dependency: inspect → internal | `internal/inspect/inspect.go:11-12` imports `internal/format` and `internal/stream` | `internal/inspect/inspect.go:11-12` |
| Dependency: cmd/age → core | `cmd/age/age.go:23-27` imports `age`, `agessh`, `armor`, `internal/term`, `plugin` | `cmd/age/age.go:23-27` |

## Answers to Dimension Questions

### 1. Why are folders organized this way?

The root of the module IS the library API (`package age`). This allows `go get filippo.io/age` to give you the crypto library directly. CLI tools are in `cmd/` subdirectories (each a `package main`). Internal implementation details (wire format, stream cipher, bech32 encoding, terminal I/O, file inspection) are in `internal/` to prevent external import. Public sub-packages (`agessh/`, `armor/`, `plugin/`) extend the library for specific use cases. This structure communicates: "the value of this module is the library; the CLIs are just consumers."

Evidence: The module path is `filippo.io/age` and the root package is `package age` (`age.go:46`). All four CLI binaries live under `cmd/` as `package main` (`cmd/age/age.go:5`, `cmd/age-keygen/keygen.go:5`, etc.).

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

- **`cmd/`**: Binary entry points only. Each subdirectory is a standalone `package main` with its own `main()` function. These parse flags, set up I/O, and call into the library.
- **`internal/`**: Private implementation details that external consumers must not depend on. Go's `internal/` package mechanism enforces this at compile time. Contains `format/` (wire format), `stream/` (STREAM encryption), `bech32/` (key encoding), `term/` (terminal interaction), `inspect/` (file metadata parsing).
- **No `pkg/` directory**: age uses the root package as its public SDK surface instead of a `pkg/` directory. Public sub-packages (`agessh/`, `armor/`, `plugin/`, `tag/`) live at the top level as peers of the root package.

Evidence: `internal/format/format.go:5-6`: "Package format implements the age file format." `internal/stream/stream.go:5-6`: "Package stream implements a variant of the STREAM chunked encryption scheme."

### 3. Is the CLI layer thin?

**Moderately thin.** The `cmd/age/age.go` file is ~600 lines, but most of that is flag parsing, validation, I/O setup, error formatting, and the `tui.go` helper file handles output formatting. The actual crypto operations are single-line calls: `age.Encrypt(out, recipients...)` (`cmd/age/age.go:421`) and `age.Decrypt(in, identities...)` (`cmd/age/age.go:503`). However, `cmd/age/` also contains significant parsing logic: `parse.go` (~310 lines) handles recipient and identity file parsing with SSH key support, type-switching over identity types (`*age.X25519Identity`, `*age.HybridIdentity`, `*agessh.RSAIdentity`, etc. at `cmd/age/age.go:531-557`), and encrypted identity handling (`encrypted_keys.go`). The `cmd/age-keygen/keygen.go` is thinner at ~185 lines.

Evidence: `cmd/age/age.go:411-435` shows `encrypt()` function — ~24 lines that just wrap output in armor if needed, call `age.Encrypt()`, and copy data. `cmd/age/age.go:486-519` shows `decrypt()` — ~33 lines handling armor detection and calling `age.Decrypt()`.

### 4. Where does business logic actually live?

Business logic lives in the root `age` package and its public sub-packages:

- **Root `age` package**: Core encryption/decryption (`age.go:154-173`, `age.go:249-266`), X25519 key exchange (`x25519.go`), hybrid ML-KEM+X25519 (`pq.go`), scrypt passphrase (`scrypt.go`), identity parsing (`parse.go`).
- **`agessh/` package**: SSH key support wrapping `golang.org/x/crypto/ssh` (`agessh/agessh.go`).
- **`armor/` package**: ASCII armor encoding/decoding (`armor/armor.go`).
- **`plugin/` package**: Plugin protocol implementation — both client (running external plugin binaries) and framework (exposing Go implementations as plugins) (`plugin/plugin.go`).
- **`internal/` packages**: Low-level crypto primitives — wire format serialization (`internal/format/format.go`), STREAM cipher (`internal/stream/stream.go`), bech32 encoding (`internal/bech32/bech32.go`).

Evidence: `age.go:154-173` defines `Encrypt()`, `age.go:249-266` defines `Decrypt()`. `x25519.go:24-26` defines `X25519Recipient` — "The standard age pre-quantum public key."

### 5. How do they prevent package coupling?

1. **`internal/` compiler barrier**: Go's `internal/` package mechanism prevents external modules from importing `internal/format`, `internal/stream`, `internal/bech32`, `internal/term`. This is the primary coupling prevention mechanism. Evidence: `internal/format/format.go:5`, `internal/stream/stream.go:5`.
2. **Unidirectional dependency flow**: CLI (`cmd/age/`) imports `age`, `agessh`, `armor`, `internal/term`, `plugin`. The library packages (`age`, `agessh`, `plugin`) never import CLI packages. Imports flow one way: CLI → library → internal.
3. **Interface-based APIs**: `age.Recipient` and `age.Identity` are interfaces (`age.go:65-86`), allowing plugins and custom implementations without coupling to concrete types.
4. **No global state in library**: The `age` package has no global configuration or state — all state is passed through function parameters (`Encrypt(dst, recipients...)`, `Decrypt(src, identities...)`).
5. **Public sub-packages as peers**: `agessh/`, `armor/`, `plugin/` are top-level sub-packages that import the root `age` package but have no dependencies on each other, preventing cross-coupling.

Evidence: `age.go:65-73` defines `Identity` interface, `age.go:82-86` defines `Recipient` interface. `cmd/age/age.go:23-27` shows CLI imports; `age.go:58-59` shows library imports only `internal/format` and `internal/stream`.

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Root package as library | `go get filippo.io/age` gives the library directly; the module identity IS the library identity |
| No `pkg/` directory | The root package IS the public API surface; public sub-packages are peers at top level |
| `internal/` for format/stream/bech32 | Wire format, stream cipher, and key encoding are implementation details that should never become public API commitments |
| `internal/term` for terminal I/O | Terminal interaction is a CLI concern; marking it `internal/` prevents library consumers from accidentally depending on it |
| `plugin/` as public package | Plugin protocol (both client and framework) is a stable public API that external plugin authors need to depend on |
| `agessh/` as public sub-package | SSH key compatibility is an optional feature; keeping it separate avoids pulling in SSH crypto dependencies for users who only need native keys |
| `armor/` as public sub-package | ASCII armor encoding is useful independently (e.g., for users who want PEM-like output separate from encryption) |
| `cmd/` per binary | Each CLI tool (`age`, `age-keygen`, `age-inspect`, `age-plugin-batchpass`) is independently buildable with its own `package main` |
| `age.Stanza` ↔ `format.Stanza` assignability | Defined in comment at `internal/format/format.go:23-24`: "Stanza is assignable to age.Stanza, and if this package is made public, age.Stanza can be made a type alias of this type." This is a deliberate escape hatch for future API expansion. |
| No framework CLI library | Uses standard library `flag` instead of cobra/urfave/cli; age's CLI surface is small enough that flag suffices |

## Notable Patterns

- **Library-first module design**: The Go module IS the library. This is the opposite of many Go CLI projects where `cmd/` contains a thin wrapper around `pkg/`. age's root is the library, and CLIs are consumers.
- **`internal/` as API firewall**: Five distinct internal packages protect five distinct concerns (format, stream, bech32, term, inspect), each isolated from external consumption.
- **Interface-based plugin system**: `plugin.Plugin` (`plugin/plugin.go:29`) implements both `age.Recipient` and `age.Identity` interfaces, enabling external binaries to participate in the encryption/decryption workflow without the library knowing about them.
- **CLI error formatting in separate file**: `cmd/age/tui.go` isolates all terminal output formatting (`printf`, `errorf`, `warningf`, `errorWithHint`) from flag parsing and orchestration logic.
- **Test-only hooks**: `cmd/age/age.go:409` uses a function variable `testOnlyConfigureScryptIdentity` that tests can override, enabling test-specific configuration without exposing test APIs.
- **Lazy I/O initialization**: `cmd/age/age.go:560-585` implements a `lazyOpener` that defers file creation until the first `Write()` call, meaning empty output doesn't create files.
- **Version injection**: Both `cmd/age/age.go:103` and `cmd/age-keygen/keygen.go:61` use a `var Version string` that can be set at link time, with a fallback to `debug.ReadBuildInfo()`.

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Root package as library means `go install filippo.io/age/cmd/age@latest` | Users must specify the full import path to install CLI tools, not just the module path |
| No `pkg/` directory means no clear SDK boundary | Unlike projects with `pkg/` + `internal/`, age has no explicit "public SDK" directory — the API surface is implicit (root + select sub-packages) |
| CLI contains non-trivial parsing logic | `cmd/age/parse.go` (~310 lines) handles recipient parsing, SSH key parsing, and plugin identity initialization — this logic lives in the CLI layer rather than the library |
| Type switch in CLI couples to library types | `cmd/age/age.go:531-557` switches over concrete identity types (`*age.X25519Identity`, `*agessh.RSAIdentity`, etc.) — adding a new key type requires updating both the library AND the CLI |
| `cmd/age/encrypted_keys.go` in CLI | Encrypted identity file handling lives in the CLI layer rather than the library, limiting programmatic reuse |
| Inspect logic in `internal/` | `internal/inspect/` is under the compiler barrier, so external tools can't programmatically inspect age files without reimplementing the logic |
| Standard `flag` vs. comprehensive CLI framework | Works fine for age's small command surface but lacks subcommands, autocomplete, and help formatting |
| `term` package wraps `golang.org/x/term` | `internal/term/term.go` re-exports terminal functionality with age-specific behaviors (ephemeral prompts, Windows CONIN$/CONOUT$ handling), adding an abstraction layer over the upstream library |

## Failure Modes / Edge Cases

| Mode | Evidence |
|------|----------|
| PowerShell line-ending corruption | `cmd/age/age.go:440-441` detects CRLF-mangled and UTF-16-mangled header intros with specific error hints |
| Binary output to terminal | `cmd/age/age.go:289-294` refuses to output binary to terminal when decrypting; `cmd/age/age.go:297-302` refuses for non-armored encryption output |
| TTY input buffering | `cmd/age/age.go:253-262` buffers terminal input on decrypt to avoid password prompts interfering with typed input |
| Input/output file conflict | `cmd/age/age.go:265-269` detects when input and output paths resolve to the same file |
| Plugin not found | `cmd/age/age.go:422-428` handles `plugin.NotFoundError` with a hint to install the missing plugin |
| Scrypt identity with passphrase file | `cmd/age/age.go:445-452` provides a clear error when identities are specified for a passphrase-encrypted file |
| Non-printable decrypted output | `cmd/age/age.go:289-294` checks for control characters and refuses to print binary to terminal |
| File permission warning | `cmd/age-keygen/keygen.go:122-124` warns when writing secret key to a world-readable file |

## Future Considerations

- **Stanze type unification**: The comment at `internal/format/format.go:23-24` explicitly notes that `age.Stanza` and `format.Stanza` could be unified as type aliases if `internal/format` were ever made public.
- **Plugin test framework**: `plugin/plugin.go:24` has a TODO: "add plugin test framework."
- **Encrypted identity promotion**: `cmd/age/encrypted_keys.go` contains encrypted identity logic that arguably belongs in the library itself for programmatic reuse.
- **`internal/inspect` promotion**: The file inspection API could be promoted to a public package if external tooling needs arise.
- **Post-quantum key types**: As PQ becomes default (as hinted at in `cmd/age-keygen/keygen.go:26`), the type switch pattern in `cmd/age/age.go:531-557` will need extension.

## Questions / Gaps

- No evidence of explicit linter or CI gates preventing reverse imports (e.g., `agessh/` importing `cmd/age/`), though the architecture makes such imports unlikely.
- The `tag/` top-level package purpose is unclear from the explored files — seems involved in git tag signing/verification but its relationship to the core encryption flow is unexplored.
- `extra/` directory contents were not explored — may contain migration tools or supplementary scripts.
- No `AGENTS.md` or `CONTRIBUTING.md` describing the architectural conventions formally.

---

Generated by `01-project-structure.md` against `age`.
