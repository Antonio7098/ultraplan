# Repo Analysis: dive

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `dive` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

dive is a Docker image analysis tool with a rigid, monolithic architecture. Commands are hardcoded via spf13/cobra with no plugin system. Extension is possible through internal interfaces (`image.Resolver`, `OrderStrategy`, `Rule`) but the codebase shows no evidence of third-party extension support. The project uses a layered approach (CLI → adapter → dive package) but internal packages are not intended for external consumption.

## Rating

**3 / 10** — Hardcoded and rigid. Extension is possible through internal interfaces but not designed for third-party use.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command registration | `rootCmd.AddCommand()` hardcodes all subcommands | `cmd/dive/cli/cli.go:46-50` |
| Image resolver interface | `image.Resolver` interface with `Fetch`, `Build`, `ContentReader` | `dive/image/resolver.go:5-14` |
| Image source resolvers | Hardcoded switch in `GetImageResolver()` for Docker/Podman/archive | `dive/get_image_resolver.go:62-72` |
| File tree ordering | `OrderStrategy` interface enables pluggable sorting | `dive/filetree/order_strategy.go:16-28` |
| CI rule interface | `Rule` interface for CI evaluation | `cmd/dive/cli/internal/command/ci/rule.go:17-21` |
| Adapter pattern | `Analyzer`, `Exporter`, `Evaluator` interfaces wrap internal impls | `cmd/dive/cli/internal/command/adapter/analyzer.go:13-15` |
| UI module boundary | `v1.Config` and `v1.Preferences` pass configuration in | `cmd/dive/cli/internal/ui/v1/config.go:1-65` |
| Bus publisher | Global `partybus.Publisher` set via `bus.Set()` | `internal/bus/bus.go:7-13` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**No.** New commands require modifying `cmd/dive/cli/cli.go:46-50` and adding a new `command.*` package. There is no registry or plugin mechanism. Commands are hardcoded in the `create()` function:

```go
rootCmd.AddCommand(
    clio.VersionCommand(id),
    clio.ConfigCommand(app, nil),
    command.Build(app),
)
```

Adding a new command requires code changes and a PR to the main repo.

### 2. Is extension anticipated?

**No.** While some interfaces exist (`image.Resolver`, `OrderStrategy`, `Rule`), they are internal implementation details. The `.data/.dive-ci` file references a `plugins:` key, but this is test data, not a functioning plugin system. No evidence of external plugin loading, dynamic module loading, or public extension APIs.

Evidence: `.gitignore:32` mentions "Binaries for programs and plugins" but no plugin implementation exists.

### 3. Are interfaces stable?

**No.** Interfaces are internal (unexported or in `internal/` packages). The `image.Resolver` interface at `dive/image/resolver.go:5-14` is the most stable but lives in a non-plugin-friendly package. The `Rule` interface at `cmd/dive/cli/internal/command/ci/rule.go:17-21` is internal. No semver or versioning guarantees exist.

### 4. Are internal APIs modular?

**Partially.** The codebase uses a layered architecture:

- `cmd/dive/cli/` — CLI entry point and command wiring
- `cmd/dive/cli/internal/command/adapter/` — Wrapper/adapter pattern
- `dive/` — Core domain logic (image, filetree)
- `internal/bus/` — Event bus (partybus)

However, `internal/` packages (enforced by Go's `internal/` path convention) prevent external import. The adapter pattern isolates CLI from core logic, but no public API boundary exists for extension.

## Architectural Decisions

1. **Cobra-based command structure** — Uses `spf13/cobra` for CLI, with commands registered in `cli.go:46-50`. Commands are singletons passed via `clio.Application`.

2. **Adapter pattern for domain isolation** — `adapter.Resolver`, `adapter.Analyzer`, `adapter.Exporter`, `adapter.Evaluator` wrap core implementations at `cmd/dive/cli/internal/command/adapter/*.go`. This provides a stable CLI-facing API over internal implementation.

3. **Image resolver dispatch** — `GetImageResolver()` at `dive/get_image_resolver.go:62-72` uses a hardcoded switch to dispatch to Docker, Podman, or archive resolvers. Adding a new resolver requires code changes.

4. **File tree pluggable ordering** — `OrderStrategy` interface at `dive/filetree/order_strategy.go:16-18` allows pluggable sort strategies (`ByName`, `BySizeDesc`), demonstrating a deliberate extension point.

5. **Event bus via partybus** — Global publisher at `internal/bus/bus.go:5-18` using `github.com/wagoodman/go-partybus`. Set during app initialization at `cmd/dive/cli/cli.go:29-36`.

6. **CI rules as first-class interface** — `Rule` interface at `cmd/dive/cli/internal/command/ci/rule.go:17-21` allows rule-based evaluation, but rules are loaded from config, not from external plugins.

## Notable Patterns

- **Adapter/wrapper pattern**: All CLI adapters (analyzer, resolver, exporter, evaluator) wrap internal implementations and add cross-cutting concerns (logging, progress monitoring).

- **Hardcoded resolver dispatch**: `GetImageResolver()` at `dive/get_image_resolver.go:62-72` switch statement cannot be extended without modifying source.

- **Static command wiring**: All commands created in `cli.go:46-50` via `rootCmd.AddCommand()` with no dynamic registration.

- **Internal package enforcement**: Go's `internal/` path convention prevents external packages from importing internal code, reinforcing that extension is not supported.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No plugin system | Simple codebase, no external attack surface. Cannot extend without modifying source. |
| Internal package isolation | Clear boundary, but precludes third-party extensions entirely. |
| Hardcoded image resolvers | Simple dispatch logic, but requires code changes for new container runtimes. |
| Adapter pattern | Stable CLI API over internal code, but layers add indirection. |

## Failure Modes / Edge Cases

- **No dynamic loading**: If a user wants to add support for a new container runtime (e.g., containerd), they must fork and modify `dive/get_image_resolver.go:62-72`.
- **Command extensibility**: Cannot add a new top-level command (e.g., `dive diff`) without modifying `cmd/dive/cli/cli.go`.
- **Internal API changes**: Any refactor of `internal/` packages can break adapter implementations without notice.
- **CI rule loading**: Rules are loaded from config files (YAML) but the `Rule` interface implementation must be compiled into the binary.

## Future Considerations

1. **Plugin system**: A proper plugin interface (e.g., hashicorp/go-plugin or programmatic interface registration) would enable third-party image resolver and CI rule extensions.
2. **Public API boundary**: If extension is desired, a public package boundary with semver guarantees would be needed.
3. **Image resolver registration**: Rather than hardcoded switch, a resolver registry could be populated at build time or via configuration.

## Questions / Gaps

- **No evidence of dynamic loading**: No use of `plugin`, `go-plugin`, or bytecode loading mechanisms.
- **No third-party extension documentation**: No docs or guides for extending dive beyond source code modification.
- **Internal package convention**: Go's `internal/` path enforcement suggests extension was never a design goal.
- **Test data confusion**: `.data/.dive-ci` contains `plugins:` key but appears to be test data, not a functioning feature.

---

Generated by `study-areas/12-extensibility.md` against `dive`.