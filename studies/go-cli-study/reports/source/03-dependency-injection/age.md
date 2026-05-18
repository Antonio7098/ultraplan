# Repo Analysis: age

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The age project uses a lightweight, functional DI approach with no framework. Dependencies are constructed inline within command execution paths. The library (`filippo.io/age`) exposes clean interfaces (`Identity`, `Recipient`) that enable testability, and the CLI commands pass dependencies as function parameters rather than storing them in structs. Wiring is decentralized — each command constructs and wires its own dependencies. Global state is minimal and limited to specific justified cases (test hooks, terminal handling).

## Rating

**7/10** — Clear composition root and explicit wiring with minor decentralization

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Identity interface | `Identity` interface with `Unwrap()` method | `age.go:65-73` |
| Recipient interface | `Recipient` interface with `Wrap()` method | `age.go:82-86` |
| Scrypt recipient constructor | `age.NewScryptRecipient(pass)` returns `*age.ScryptRecipient` | `cmd/age/age.go:401` |
| X25519 identity generation | `age.GenerateX25519Identity()` returns `age.Identity` | `cmd/age-keygen/keygen.go:140-146` |
| Plugin client UI injection | `ClientUI` struct passed to `NewIdentity()` and `NewRecipient()` | `plugin/client.go:40-48`, `plugin/client.go:180-188` |
| Terminal UI factory | `plugin.NewTerminalUI(printf, warningf)` creates UI | `cmd/age/age.go:385` |
| Encryption with explicit recipients | `encrypt(recipients []age.Recipient, in io.Reader, out io.Writer, withArmor bool)` | `cmd/age/age.go:411-435` |
| Decryption with explicit identities | `decrypt(identities []age.Identity, in io.Reader, out io.Writer)` | `cmd/age/age.go:486-519` |
| Recipients to identities conversion | `identitiesToRecipients(ids []age.Identity)` returns `[]age.Recipient` | `cmd/age/age.go:531-558` |
| Stanza reader in plugin protocol | `format.NewStanzaReader()` used for stanza parsing | `plugin/plugin.go:192` |
| Test hook for scrypt identity | `testOnlyConfigureScryptIdentity = func(*age.ScryptRecipient) {}` | `cmd/age/age.go:409` |
| Test-only plugin path | `var testOnlyPluginPath string` for plugin testing | `plugin/client.go:424` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

Dependencies are constructed inline within command execution paths, not in a centralized factory or main composition root.

- **age library**: Constructor functions in `age.go` create recipients and identities:
  - `age.GenerateX25519Identity()` at `age.go:??` (line numbers for generation functions not shown but pattern is clear from `cmd/age-keygen/keygen.go:140-146`)
  - `age.NewScryptRecipient(pass)` at `cmd/age/age.go:401`
  - `age.GenerateHybridIdentity()` at `cmd/age-keygen/keygen.go:133`

- **CLI commands**: Each command constructs its own dependencies within `main()` or helper functions:
  - `cmd/age/age.go:351-393` (`encryptNotPass`) constructs recipients from flags and files
  - `cmd/age/age.go:454-473` (`decryptNotPass`) constructs identities from flags
  - `plugin/client.go:40-48` (`NewRecipient`) accepts a `*ClientUI` parameter for dependency injection

### 2. How are services passed around?

Services are passed as function parameters and interface values, not stored in struct fields or singletons.

- **Function parameters**: Encryption/decryption operations receive `[]age.Recipient` and `[]age.Identity` as parameters (e.g., `cmd/age/age.go:411`, `cmd/age/age.go:486`)
- **Interface composition**: The `ClientUI` struct (`plugin/client.go:319-337`) bundles UI callbacks and is passed to plugin client constructors
- **Direct instantiation**: Commands instantiate services directly rather than receiving pre-constructed services

### 3. Is wiring centralized?

**No** — wiring is decentralized. Each command (`age`, `age-keygen`, `age-inspect`) independently constructs and wires its dependencies.

- `cmd/age/age.go` wires together: flag parsing, file handling, recipient/identity parsing, encryption/decryption logic, plugin initialization, terminal UI
- `cmd/age-keygen/keygen.go` has simpler wiring: flag parsing → key generation → output
- `cmd/age-inspect/inspect.go` wires: flag parsing → file opening → `inspect.Inspect()`

There is no composition root, factory registry, or DI container. The design appears deliberate — age is a focused tool where the complexity doesn't warrant centralized wiring.

### 4. Are globals avoided?

**Mostly yes**, with limited justified exceptions:

| Global | Location | Justification |
|--------|----------|---------------|
| `stdinInUse bool` | `cmd/age/age.go:72` | Singleton tracking to prevent double-reading stdin |
| `testOnlyConfigureScryptIdentity` | `cmd/age/age.go:409` | Test hook for scrypt identity configuration |
| `testOnlyPluginPath` | `plugin/client.go:424` | Test hook for plugin path override |
| `enableVirtualTerminalProcessing` | `internal/term/term.go:14` | Platform-specific function pointer for Windows terminal processing |
| Version variable | `cmd/age/age.go:103`, `cmd/age-keygen/keygen.go:61` | Link-time version override (documented pattern) |

The codebase demonstrates discipline in avoiding global service registries or hidden dependency stores.

### 5. Is initialization explicit?

**Yes** — initialization is explicit throughout:

- `age.Encrypt(dst io.Writer, recipients ...Recipient)` — explicit call with clear preconditions
- `age.Decrypt(src io.Reader, identities ...Identity)` — explicit call with clear preconditions
- `plugin.NewRecipient(s string, ui *ClientUI)` — explicit construction with UI dependency
- `plugin.NewIdentity(s string, ui *ClientUI)` — explicit construction with UI dependency
- `term.WithTerminal(f func(in, out *os.File) error)` — explicit terminal session handling

No hidden initialization, no init() functions, no lazy loading magic.

## Architectural Decisions

1. **No DI framework** — The project uses plain Go patterns: constructors, interfaces, function parameters. This reduces complexity and aligns with Go idiom.

2. **Interface-based abstraction** — `Identity` and `Recipient` interfaces (`age.go:65-86`) allow multiple implementations (X25519, Scrypt, SSH, Plugin) to be used uniformly.

3. **Decentralized wiring** — Each CLI command owns its dependency construction. This is appropriate for focused, single-purpose tools where shared composition isn't needed.

4. **Plugin system uses struct injection** — `ClientUI` struct (`plugin/client.go:319-337`) is explicitly constructed and passed, enabling testable UI callback injection.

5. **No context.Context** — The project doesn't use `context.Context` for request-scoped values. This is appropriate for short-lived CLI operations with no async/cancelation requirements.

## Notable Patterns

1. **Recipient/Identity duality** — Many types implement both `Recipient` and `Identity` (e.g., `X25519Identity.Recipient()` returns `*X25519Recipient`), allowing bidirectional encryption/decryption with the same key pair.

2. **Lazy identity for passphrase** — `cmd/age/age.go:521` uses `&LazyScryptIdentity{passphrasePromptForDecryption}` to defer passphrase prompting until needed.

3. **Test hooks via package-level vars** — `testOnlyConfigureScryptIdentity` and `testOnlyPluginPath` allow tests to inject behavior without breaking production logic.

4. **Multi-identity sorting** — `decryptHdr` at `age.go:324-341` sorts identities to try native types (X25519, Hybrid, Scrypt) before plugin types.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No centralized wiring | Commands must each understand how to construct dependencies; harder to enforce consistency |
| Decentralized DI | Simple for small codebase, but scaling would require extraction of composition logic |
| No context.Context | Cannot pass request-scoped values through the call stack; not an issue for synchronous CLI |
| Test hooks as globals | Provides test flexibility but could be misused; however, naming convention (`testOnly*`) mitigates |

## Failure Modes / Edge Cases

1. **Missing plugin binary** — `plugin/client.go:426-473` returns `NotFoundError` when plugin binary not found; CLI handles this gracefully with user hint (`cmd/age/age.go:422-425`).

2. **Duplicate recipients/identities** — `cmd/age/age.go:594-603` warns on duplicates but doesn't fail; may cause confusion.

3. **Stdin conflicts** — `stdinInUse` global (`cmd/age/age.go:72`) tracks whether stdin is consumed; failure to properly track could cause hard-to-debug input issues.

4. **Identity ordering dependency** — `decryptHdr` at `age.go:349-365` relies on identity sorting; wrong order could cause performance issues (non-native tried before native).

## Future Considerations

1. If the CLI grows more commands or shared functionality, extracting a `Command` struct with injected dependencies would improve consistency.

2. The `ClientUI` injection pattern in the plugin system could serve as a model for other cross-cutting concerns (e.g., logging, metering).

3. No evidence of structured logging integration; adding a `Logger` interface to `ClientUI` or command context could improve observability.

## Questions / Gaps

- **No evidence of integration tests** that exercise full CLI workflows with real plugin binaries; `plugin/client.go:424` test hook suggests unit-level testing only.
- **No evidence of config file parsing** — all configuration comes from flags; future feature additions may need to consider how to inject configuration.
- **Unclear how passphrase retry logic works** — `decryptPass` at `cmd/age/age.go:476-484` uses a single `lazyScryptIdentity`; no visible retry counter or retry limit.

---

Generated by `study-areas/03-dependency-injection.md` against `age`.