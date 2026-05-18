# Repo Analysis: age

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

age is a file encryption tool that implements a well-designed plugin system for extensibility. Plugins are external binaries invoked via a stanza-based protocol over stdin/stdout. The core provides `Recipient` and `Identity` interfaces that plugins can implement. The `plugin.Plugin` framework simplifies plugin development by handling all protocol details. Extension points are clearly defined and versioned (v1).

## Rating

**8/10** — Well-designed modularity. The plugin system is a first-class feature with a clear protocol, but third-party extension beyond plugins requires modifying core source due to internal package boundaries.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin interface | `Recipient` and `Identity` interfaces in core package | `age.go:65-86` |
| Plugin loader | Client spawns `age-plugin-{name}` binary | `plugin/client.go:426-433` |
| Plugin framework | `Plugin` struct with `HandleRecipient`, `HandleIdentity` callbacks | `plugin/plugin.go:29-118` |
| Plugin protocol | Stanza-based v1 protocol with `recipient-v1` and `identity-v1` states | `plugin/plugin.go:159-167` |
| Command registration | CLI uses standard `flag` package, no dynamic registration | `cmd/age/age.go:122-140` |
| Internal packages | `internal/format`, `internal/stream`, `internal/bech32` | `internal/format/format.go:1`, `internal/stream/stream.go:1` |
| Version stability | Backwards compatibility policy documented | `age.go:37-46` |
| Plugin examples | `extra/age-plugin-pq`, `extra/age-plugin-tag` | `extra/age-plugin-pq/plugin-pq.go:1` |
| UI callbacks | `ClientUI` struct with `DisplayMessage`, `RequestValue`, `Confirm` | `plugin/client.go:314-337` |
| RecipientWithLabels | Optional interface for label-based recipient grouping | `age.go:88-101` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

No. The CLI (`cmd/age/age.go`) is a single monolithic program with hardcoded command handling in `main()` (`cmd/age/age.go:105-321`). There is no command registry or plugin-based command extension. Adding new commands requires modifying the core source.

### 2. Is extension anticipated?

Yes, but only for recipients/identities via the plugin system. The `Recipient` (`age.go:82-86`) and `Identity` (`age.go:65-73`) interfaces are the primary extension points. The plugin protocol is documented and versioned. However, there is no mechanism to extend CLI subcommands.

### 3. Are interfaces stable?

Yes. The plugin protocol uses explicit versioning (`recipient-v1`, `identity-v1` at `plugin/plugin.go:159-164`). The `Plugin.Main()` dispatch is based on `--age-plugin` flag value. Core interfaces like `Recipient` and `Identity` are well-defined and backed by a backwards compatibility policy (`age.go:37-46`).

### 4. Are internal APIs modular?

Partially. Internal packages (`internal/format`, `internal/stream`, `internal/bech32`) are clearly separated. However, they are not exported and plugins cannot access them directly—plugins interact only through the established plugin protocol. The `internal` directory convention prevents external imports (`internal/format/format.go:6`).

## Architectural Decisions

- **Plugin as external process**: Plugins are separate binaries invoked via `exec.Command`, communicating through a stanza-based protocol on stdin/stdout (`plugin/client.go:426-473`). This provides process isolation and language neutrality.
- **Plugin discovery by naming convention**: Plugin binaries must be named `age-plugin-{name}` and found in `$PATH` (`plugin/client.go:427`). No plugin registry or configuration.
- **UI callbacks for interactivity**: Plugins can request user interaction (messages, confirmations, secrets) through structured stanzas handled by `ClientUI` (`plugin/client.go:314-337`).
- **Bech32-encoded identities**: Plugin recipient/identity strings use Bech32 encoding with a plugin-specific prefix (`AGE-PLUGIN-NAME-1...`) (`plugin/encode.go`).

## Notable Patterns

- **Interface-based recipient/identity**: Core encryption accepts any `Recipient` or `Identity` implementation (`age.go:154,249`), enabling built-in (X25519, Scrypt, hybrid) and plugin-based recipients.
- **Stanza protocol**: Both file format and plugin protocol use a line-based stanza format with base64-encoded bodies (`internal/format/format.go:108-132`, `plugin/plugin.go:192-229`).
- **Single-binary plugin framework**: The `plugin.Plugin` type handles all protocol state machines, allowing developers to expose their `Recipient`/`Identity` implementations as plugins with minimal code (`plugin/plugin.go:29-167`).

## Tradeoffs

- **Plugin scope limited to crypto operations**: Plugins can only provide new `Recipient`/`Identity` implementations, not new CLI commands or other functionality.
- **No plugin configuration**: Plugin discovery is solely by binary name in `$PATH`. There is no way to configure plugin paths, versions, or options.
- **Process spawn overhead**: Each `Wrap`/`Unwrap` call spawns a new plugin process (`plugin/client.go:465`), which has overhead for batch operations.
- **Internal packages inaccessible**: Third parties cannot build on internal packages, even for non-plugin extension scenarios.

## Failure Modes / Edge Cases

- **Plugin not found**: `NotFoundError` returned when `age-plugin-{name}` binary is absent (`plugin/client.go:466-467`). CLI provides helpful error message suggesting installation.
- **Plugin protocol mismatch**: If plugin and client disagree on protocol version, the plugin returns exit code 4 (`plugin/plugin.go:165-166`).
- **Plugin error handling**: Errors during `Wrap`/`Unwrap` are returned as stanza payloads, with exit codes 1-3 indicating different error types (`plugin/plugin.go:601-613`).
- **Interactive plugin without TTY**: If a plugin requests user interaction but the client provides no `ClientUI` implementation, the plugin receives a "fail" response (`plugin/client.go:342-348`).

## Future Considerations

- Command/plugin registry configuration file to specify plugin paths and versions.
- Plugin API versioning mechanism to allow graceful fallback between protocol versions.
- Consideration for plugin batch operations to reduce per-file spawn overhead.
- Potential v2 plugin protocol if backwards compatibility requirements constrain future changes.

## Questions / Gaps

- No evidence of a plugin signature/authentication mechanism to verify plugin authenticity.
- No evidence of plugin resource limits (memory, time) to prevent malicious or buggy plugins.
- Internal packages (`internal/inspect`, `internal/term`, `internal/stream`) are not documented as stable even within the same major version.

---

Generated by `12-extensibility.md` against `age`.