# Source Analysis: cli

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (golang) |
| Analyzed | 2026-05-19 |

## Summary

The GitHub CLI (`gh`) is a single Go module (`github.com/cli/cli/v2`) organized around three top-level package zones: `cmd/` (entry point), `internal/` (private implementation), and `pkg/` (public command library). The project uses a hybrid domain/layer organization in `pkg/cmd/` with command packages named by noun (e.g., `pr/`, `issue/`, `repo/`), while `internal/` packages are organized by architectural concern (e.g., `config/`, `gh/`, `telemetry/`). The module path convention with `/v2` suffix signals API stability intent. Go's `internal/` package convention provides compile-enforced encapsulation; no `pkg/` package imports `internal/` except through defined interfaces in `internal/gh/` and `pkg/cmdutil/`.

## Rating

**7 / 10** — Good implementation with minor issues. The project demonstrates clear zone separation and consistent naming conventions that scale to ~40 command packages. However, the single-module structure means `internal/` is accessible to `pkg/cmd/` commands (not truly walled off), and there is no mechanical enforcement (e.g., `golangci-lint` rules) preventing `internal/` imports into `pkg/cmd/` command implementations.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Module definition | Single Go module `github.com/cli/cli/v2` with Go 1.26 toolchain | `go.mod:1-5` |
| Entry point | `cmd/gh/main.go` delegates to `internal/ghcmd.Main()` | `cmd/gh/main.go:9-10` |
| Root command registration | All 30+ commands registered via `NewCmdRoot()` in `pkg/cmd/root/root.go` | `pkg/cmd/root/root.go:133-177` |
| Command package layout | `gh issue list` implemented in `pkg/cmd/issue/list/` with `list.go`, `list_test.go`, `http.go` | `pkg/cmd/issue/list/list.go:1` |
| Factory pattern | `cmdutil.Factory` struct wires all dependencies (HttpClient, Config, IOStreams, etc.) | `pkg/cmdutil/factory.go:16-43` |
| Domain interfaces | `internal/gh.Config` interface defines domain contract; implementation in `internal/config/` | `internal/gh/gh.go:29-80` |
| Command options struct | Every command uses `Options` struct injected via `NewCmdFoo(f *cmdutil.Factory, runF func(*FooOptions) error)` | `pkg/cmd/issue/list/list.go:25-45` |
| Internal zone | `internal/` packages: `agents`, `authflow`, `barista`, `browser`, `build`, `ci`, `codespaces`, `config`, `docs`, `featuredetection`, `flock`, `gh`, `ghcmd`, `ghinstance`, `ghrepo`, `keyring`, `licenses`, `prompter`, `run`, `safepaths`, `skills`, `tableprinter`, `telemetry`, `text`, `update`, `zip` | `ls internal/` |
| Shared command utilities | `pkg/cmdutil/` contains `errors.go`, `flags.go`, `json_flags.go`, `factory.go`, `auth_check.go` | `pkg/cmdutil/factory.go:1-43` |
| Public extension API | `pkg/extensions.ExtensionManager` interface exposed for extension management | `pkg/extensions/extension.go:32-42` |
| Command group organization | Commands added to `cobra.Group{ID, Title}` for help display grouping | `pkg/cmd/root/root.go:120-131` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

The project uses two mechanisms:

**Go's `internal/` package convention** (`internal/gh/`, `internal/config/`, `internal/telemetry/`, etc.) provides compiler-enforced encapsulation. Code outside `internal/` cannot import `internal/` packages from other modules, but within a single module this is advisory only — `pkg/cmd/` packages CAN import `internal/` packages because they are in the same module.

**Naming conventions** enforced through code review: command packages follow the pattern `pkg/cmd/<noun>/<verb>/` (e.g., `pkg/cmd/issue/list/`, `pkg/cmd/pr/checkout/`). Each package contains `foo.go`, `foo_test.go`, and optionally `http.go`/`http_test.go` (`pkg/cmd/issue/list/list.go:1-23`).

The `golangci-lint` configuration (run via `make lint`) provides linting enforcement, but there is no specific linter rule identified that blocks `internal` → `pkg/cmd` imports.

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid**: `pkg/cmd/` is organized by **domain noun** (issue, pr, repo, action, codespace), while `internal/` is organized by **architectural layer** (config, telemetry, gh, prompter, browser). This is a deliberate split: domain concepts live in `pkg/cmd/` and infrastructure concerns live in `internal/`.

Command sub-packages within `pkg/cmd/<noun>/` are organized by **verb** (list, create, view, edit). Shared utilities for a domain live in `pkg/cmd/<noun>/shared/` (e.g., `pkg/cmd/pr/shared/`, `pkg/cmd/issue/shared/`).

### 3. Where does internal API surface end and public SDK begin?

The **public SDK boundary** is the `pkg/` subtree. The module path `github.com/cli/cli/v2` with `/v2` signals that `pkg/` is the stable surface. Specifically:
- `pkg/cmd/` — command implementations (public to the CLI itself, though not intended for external use)
- `pkg/cmdutil/` — factory, error types, flag helpers (`pkg/cmdutil/errors.go`, `pkg/cmdutil/flags.go`)
- `pkg/extensions/` — `Extension` and `ExtensionManager` interfaces exposed for extension authoring (`pkg/extensions/extension.go:18-42`)
- `pkg/iostreams/` — I/O abstraction with TTY detection and color control
- `pkg/httpmock/` — HTTP mocking for tests

The **internal boundary** is `internal/` which contains implementation details (config, auth, telemetry, git operations, codespaces, feature detection). These are not intended to be imported by `pkg/cmd/` command implementations, though technically allowed.

### 4. What conventions prevent circular dependencies?

Go's single-module structure with `go.mod` means there are no module-level cycles — Go's import graph must be acyclic at the package level within a module, and the compiler enforces this.

**Architectural layering convention** (not mechanically enforced):
- `cmd/` → `internal/ghcmd` → `pkg/cmd/root` → `pkg/cmd/<command>` → `pkg/cmdutil/` → `internal/` → `pkg/`
- `api/` (top-level) → `internal/gh`, `internal/ghrepo`, `internal/ghinstance` — domain interfaces in `internal/gh/`

The `internal/gh/` package defines interfaces (`Config`, `AuthConfig`, `AliasConfig`) that `internal/config/` implements and `pkg/cmdutil/Factory` consumes. This creates a stable interface boundary. However, circular imports between `internal/` packages were not observed in the import graph.

### 5. How does the project structure support multiple contributors with isolated work areas?

**Command packages are self-contained**: each `pkg/cmd/<noun>/<verb>/` package contains its own `.go`, `_test.go`, and optionally `http.go`/`http_test.go`. Contributors working on `issue list` largely do not touch `issue create` or `pr checkout`.

**Factory injection**: all commands receive dependencies via `*cmdutil.Factory` injection (`pkg/cmd/factory/default.go:26-46`), avoiding global state and enabling testing with mock factories.

**Shared packages for cross-cutting concerns**: `pkg/cmd/pr/shared/` and `pkg/cmd/issue/shared/` consolidate shared logic for PR and issue commands respectively, reducing duplication while centralizing domain logic.

**Extension manager**: `pkg/extensions/` provides a plugin architecture allowing external contributors to extend `gh` without modifying core packages.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Single Go module `github.com/cli/cli/v2` | Simpler dependency management; `v2` signals API stability | `internal/` packages are technically accessible from `pkg/cmd/` within the same module |
| `internal/` zone for infrastructure | Go compiler enforces that external modules cannot import `internal/` | Within the module, `pkg/cmd/` can still import `internal/` — convention only |
| `pkg/cmd/<noun>/<verb>/` pattern | Natural CLI syntax mapping; each subcommand is its own package | Deep nesting (e.g., `pkg/cmd/attestation/artifact/oci/`) can be unwieldy |
| `cmdutil.Factory` as dependency hub | Centralizes wiring of HttpClient, Config, IOStreams, Prompter, Browser | Factory becomes a "god object" with many responsibilities |
| Domain interfaces in `internal/gh/` | `Config`, `AuthConfig`, `Migration` defined as interfaces in domain package | Requires `internal/config` to implement; adds indirection |
| `shared/` subpackages per domain | Avoids duplication in related commands (pr, issue) | Can become a dumping ground for shared logic over time |

## Notable Patterns

**Options + Factory pattern** (`pkg/cmd/issue/list/list.go:25-45`):
```go
type ListOptions struct {
    HttpClient func() (*http.Client, error)
    Config     func() (gh.Config, error)
    IO         *iostreams.IOStreams
    BaseRepo   func() (ghrepo.Interface, error)
    Browser    browser.Browser
    // ... flags
}
func NewCmdList(f *cmdutil.Factory, runF func(*ListOptions) error) *cobra.Command
```

**Generated mocks via `moq`**: Interfaces use `//go:generate moq -rm -out prompter_mock.go . Prompter` comments; mocks live alongside source files (e.g., `pkg/extensions/extension_mock.go`, `internal/gh/mock/config.go`).

**Command group organization**: Commands register into Cobra groups (`core`, `actions`, `extension`) for help display grouping (`pkg/cmd/root/root.go:120-131`).

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Single module vs multi-module | Single `go.mod` simplifies builds but makes `internal/` a soft boundary; a multi-module repo (e.g., `internal/` as a separate module) would provide stronger enforcement |
| Factory as god object | `cmdutil.Factory` holds ~10 responsibilities; changes ripple widely, but avoids passing 10 parameters to every command constructor |
| Domain interfaces in `internal/` | `internal/gh.Config` interface separation adds indirection but enables testing with `internal/gh/mock.Config` |
| Command-per-subcommand packages | Scales well for CLI with many subcommands, but some users may expect `gh issue create` structure to be `pkg/cmd/issue/create/` rather than `pkg/cmd/issue/create/create.go` |

## Failure Modes / Edge Cases

1. **`internal/` boundary erosion**: Because all code is in a single module, `pkg/cmd/` command implementations CAN import `internal/` packages directly, bypassing intended layering. No linter rule was identified to prevent this.

2. **Factory coupling**: The `cmdutil.Factory` struct accumulates dependencies over time. Commands that need new capabilities (e.g., a new HTTP client variant) require Factory changes that affect all commands.

3. **Deep nesting**: Some command paths are 4+ levels deep (e.g., `pkg/cmd/attestation/artifact/oci/`) making file navigation less intuitive.

4. **Shared package bloat**: `pkg/cmd/pr/shared/` and `pkg/cmd/issue/shared/` contain many files; without discipline these can become catch-all packages.

## Future Considerations

- **Mechanical boundary enforcement**: Consider adding `golangci-lint` rules or a separate `internal/` Go module to enforce that `pkg/cmd/` does not import `internal/` directly, only through defined interfaces in `pkg/cmdutil/`.
- **Factory interface extraction**: `cmdutil.Factory` could be split into focused interfaces (e.g., `RepoResolver`, `HttpClientProvider`) to reduce coupling and improve testability.
- **Domain package growth**: `internal/gh/` currently holds interfaces; if domain concepts expand (e.g., Git operations), this package could grow to need subpackage splitting.

## Questions / Gaps

1. **No evidence found** of a formal deprecation policy for `pkg/cmd/` command APIs — the `/v2` module path suggests stability but no documented policy was found.
2. **No evidence found** of automated checks preventing `internal/` imports into `pkg/cmd/` beyond Go's single-module constraint.
3. **No evidence found** of a documented rule that `pkg/cmd/<noun>/shared/` packages must not import each other (potential coupling risk).
