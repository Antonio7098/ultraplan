# Repo Analysis: dive

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `06-io-abstraction` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Dive demonstrates moderate IO abstraction with a mix of hardcoded and abstracted patterns. The UI layer uses `io.Writer` interfaces, enabling test output capture. Filesystem access is well-abstracted via `afero`. Network access relies on Docker client library with swappable resolvers (Docker, Podman, Archive) but lacks injectable HTTP client interfaces.

## Rating

**6/10** — Some abstractions for core IO, but significant hardcoded cases in Docker/Podman CLI execution.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| stdout abstraction | `V1UI` accepts `io.Writer` for stdout | `cmd/dive/cli/internal/ui/v1.go:25` |
| stdout abstraction | Test capturer uses `os.Pipe()` | `cmd/dive/cli/cli_test.go:133` |
| Filesystem abstraction | `Exporter` uses `afero.Fs` interface | `cmd/dive/cli/internal/command/adapter/exporter.go:20` |
| Filesystem abstraction | `buildImageFromCli` uses `afero.Fs` | `dive/image/docker/build.go:17` |
| Filesystem test | MemMapFs used in tests | `dive/image/docker/build_test.go:204` |
| Network abstraction | `Resolver` interface for image fetching | `dive/image/resolver.go:5-10` |
| NoUI mode | `NoUI` implements `clio.UI` for headless | `cmd/dive/cli/internal/ui/no_ui.go:9` |
| Hardcoded stderr | V1UI fallback uses `os.Stderr` | `cmd/dive/cli/internal/ui/v1.go:44` |
| Hardcoded CLI | Docker/Podman CLI sets `cmd.Stdout = os.Stdout` | `dive/image/docker/cli.go:27` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Partially.** The V1UI type accepts `io.Writer` parameters for stdout (`cmd/dive/cli/internal/ui/v1.go:25`), and the constructor accepts an `out io.Writer` parameter. However, `err` falls back to `os.Stderr` hardcoded (`cmd/dive/cli/internal/ui/v1.go:44`). The Docker/Podman CLI execution directly assigns `cmd.Stdout = os.Stdout` and `cmd.Stderr = os.Stderr` (`dive/image/docker/cli.go:27-29`, `dive/image/podman/cli.go:29-31`), bypassing any abstraction.

### 2. Can commands be tested without a real terminal?

**Yes.** The `NoUI` type (`cmd/dive/cli/internal/ui/no_ui.go:9-30`) implements the `clio.UI` interface with no-op `Handle()` methods, allowing command execution without terminal UI. Test helpers in `cli_test.go:108-175` use `os.Pipe()` to capture stdout/stderr. CI mode tests (`cli_ci_test.go:11-25`) use the `--ci` flag which activates NoUI. Build tests (`cli_build_test.go:10-27`) verify output via captured stdout.

### 3. Is filesystem access abstracted?

**Yes, well.** The codebase uses `afero` for filesystem abstraction. The `Exporter` interface accepts `afero.Fs` (`cmd/dive/cli/internal/command/adapter/exporter.go:20`), and `NewExporter(afero.NewOsFs())` is called in `root.go:81`. `buildImageFromCli` in `dive/image/docker/build.go:17` accepts `afero.Fs` and uses it for temp files and reading. Tests use `afero.NewMemMapFs()` for in-memory filesystem (`dive/image/docker/build_test.go:204`).

### 4. Is network access mockable?

**Partially.** The `Resolver` interface (`dive/image/resolver.go:5-10`) provides swappable implementations: `docker/engine_resolver.go`, `docker/archive_resolver.go`, and `podman/resolver.go`. However, the Docker engine resolver connects directly to the Docker daemon via Unix socket using `docker/client` library without an injectable HTTP client interface. HTTP transport customization is limited (`engine_resolver.go:87-92`). Archive resolver enables testing without network access.

## Architectural Decisions

- **V1UI as primary UI**: The terminal UI uses `gocui` library wrapped in `V1UI` with abstracted `io.Writer` for stdout. This allows tests to capture output but couples production code to terminal library.
- **afero for filesystem**: Chosen for filesystem abstraction, enabling test use of MemMapFs and providing a consistent API across file operations.
- **Resolver interface for images**: Three implementations (Docker, Podman, Archive) allow different image sources to be swapped, though the interface is tied to Docker ecosystem concepts.
- **CI mode via NoUI**: The `--ci` flag activates a NoUI mode for non-interactive execution, serving as both production CI mode and test harness.

## Notable Patterns

1. **Constructor injection for UI**: `NewV1UI(cfg, out io.Writer, quiet, verbosity)` accepts writer as parameter (`cmd/dive/cli/internal/ui/v1.go:41-45`)
2. **Test capturer via os.Pipe**: `Capture().WithStdout().WithStderr().Run()` pattern in `cli_test.go:108-175`
3. **afero.Fs in constructors**: `buildImageFromCli(fs afero.Fs, ...)` pattern enables dependency injection
4. **Snapshot testing with go-snaps**: `go-snaps` library used for UI output verification (`cli_test.go:37-40`)
5. **Swappable resolver implementations**: Interface-based design allows Docker, Podman, or archive-based image resolution

## Tradeoffs

- **gocui coupling**: The V1UI uses `gocui` terminal library directly, which requires special handling in tests (NoUI mode, snapshot testing)
- **Docker CLI hardcoding**: `cmd.Stdout = os.Stdout` in Docker/Podman execution bypasses abstraction, making those code paths harder to test
- **Resolver tied to Docker concepts**: The `ContentReader` interface and `ImageSave`/`ImageLoad` methods are Docker-specific, limiting true abstraction
- **No injectable HTTP client**: Network customization is limited to transport-level; the Docker client is created with direct opts rather than injected

## Failure Modes / Edge Cases

- **Terminal-required operations**: V1UI's Handle() calls gocui which requires a real terminal; tests must use NoUI or snapshot testing
- **Docker daemon dependency**: Engine resolver requires running Docker daemon; archive resolver provides offline fallback but not used by default
- **os.Stderr hardcoding**: Error output goes directly to os.Stderr in V1UI fallback path, bypassing test capture
- **Unix socket connectivity**: Docker client connects via Unix socket; network issues are opaque to callers

## Future Considerations

- Inject `io.Writer` for stderr in V1UI constructor (currently only stdout is injected, err falls back to os.Stderr)
- Extract Docker/Podman CLI execution behind interfaces to enable mock CLI responses
- Add `http.RoundTripper` interface to EngineResolver for customizable HTTP transport in tests
- Consider Podman CLI abstraction similar to Docker resolver to enable testing without Docker daemon

## Questions / Gaps

- No clear evidence found of abstraction for stdin input (e.g., interactive prompts)
- No evidence found of `os.Stdin` abstraction in UI layer
- Archive resolver could be better utilized for testing but no documentation found on when to use it vs Docker resolver

---

Generated by `study-areas/06-io-abstraction.md` against `dive`.