# Repo Analysis: go-task

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `go-task` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task is a task runner/build tool similar to Make, defined by Taskfile YAML configuration. It demonstrates **moderate extensibility** through a well-designed inclusion/merging system for taskfiles, functional options for executor configuration, and a templating system. However, it lacks traditional plugin architecture (no dynamic loading, no external plugin API), instead pursuing extensibility through file-based composition (includes), YAML schema extensibility (tasks, vars, includes), and a functional options pattern for the executor. The primary extension points are: taskfile includes (`includes` in `taskfile/ast/include.go:14-28`), functional options on the Executor (`executor.go:20-24, 91-113`), and template functions injected via the templater (`internal/templater/funcs.go`).

## Rating

**6/10** — Some extension points; well-designed taskfile composition but no true plugin system.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Executor functional options pattern | `ExecutorOption` interface and `WithDir`, `WithEntrypoint`, `WithTempDir`, etc. | `executor.go:20-24, 126-619` |
| Taskfile Include struct | `Include` struct with Namespace, Taskfile, Dir, Optional, Vars, etc. | `taskfile/ast/include.go:16-28` |
| Includes ordered map | `Includes` struct using `orderedmap.OrderedMap` with thread-safe access | `taskfile/ast/include.go:29-33` |
| Taskfile merging | `Taskfile.Merge` merges vars, env, tasks from included taskfiles | `taskfile/ast/taskfile.go:40-73` |
| Tasks merging with namespacing | `Tasks.Merge` applies namespace prefixes, handles exclude lists | `taskfile/ast/tasks.go:121-209` |
| Template system | `templater.Cache` with `ReplaceWithExtra` for variables | `internal/templater/templater.go:65-112` |
| Template functions | Built-in funcs registered in `internal/templater/funcs.go` | `internal/templater/templater.go:1-161` |
| Task aliasing | `Aliases` field on Task struct, wildcard matching | `taskfile/ast/task.go:24, 78-103` |
| Node interface for taskfile sources | `Node` interface abstracts file/http/git sources | `taskfile/node.go:15-24` |
| RemoteNode interface | Extends Node with `ReadContext` for remote fetching | `taskfile/node.go:26-30` |
| Experiments/feature flags | `experiments.go` defines toggleable experiments via env vars | `experiments/experiments.go:17-29` |
| Version stability checks | `doVersionChecks` enforces schema version bounds | `setup.go:282-316` |
| Shell completion | Embedded completion scripts for bash/fish/zsh/powershell | `completion.go:8-18, 20-34` |
| Taskfile initialization | `InitTaskfile` creates new Taskfiles from template | `init.go:17-41` |
| Internal packages | `internal/` packages are clearly separated (env, fingerprint, output, etc.) | `internal/` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

Yes. Tasks are defined in YAML Taskfiles. Adding a new task requires only adding a new YAML entry to any included Taskfile. The `Task` struct (`taskfile/ast/task.go:15-53`) supports commands (`Cmds`), dependencies (`Deps`), variables (`Vars`), and many other fields. Tasks can invoke other tasks via `cmd.Task` field (see `task.go:378`), enabling reusable task composition. Aliases allow multiple names for the same task (`taskfile/ast/task.go:24`). No code changes or recompilation needed — extension is purely declarative.

### 2. Is extension anticipated?

Partially. The design anticipates extension via:
- **Taskfile includes**: Other YAML files can be included with namespace isolation (`taskfile/ast/include.go:14-28`, `taskfile/reader.go:292-405`)
- **Functional options**: The `ExecutorOption` interface (`executor.go:20-24`) allows callers to configure theexecutor programmatically with composable options
- **Template functions**: Custom functions can be added to the templater
- **Experiments**: Feature flags allow progressive enablement (`experiments/experiments.go:17-29`)

However, there is **no plugin API, no dynamic loading, no external Go module/plugin interface**. Extension is limited to YAML composition and programmatic Go usage. Third parties cannot build standalone plugins.

### 3. Are interfaces stable?

The Executor API uses functional options pattern which is stable — options are additive and backward-compatible. The `Executor` struct fields are mostly private; access goes through options. However, the `Executor` struct itself is exposed (`executor.go:27-84`) with many public fields. The `Node` interface (`taskfile/node.go:15-24`) and `RemoteNode` interface are small, focused contracts. No versioning scheme is applied to these interfaces.

The Taskfile schema (v3) is versioned via semver (`taskfile/ast/taskfile.go:16`), with `doVersionChecks` (`setup.go:282-316`) enforcing that loaded Taskfiles use v3 or above and not exceed the current binary's version.

### 4. Are internal APIs modular?

**Good**: The `internal/` directory contains clearly separated packages (`fingerprint/`, `output/`, `templater/`, `logger/`, `sort/`, etc.) with focused responsibilities. The `taskfile/` directory has a clean split between `ast/` (data structures), `taskfile.go` (graph), and `reader.go` (parsing). Thread-safe collections in `ast/` use mutexes correctly.

**Poor**: Many `internal/` packages lack exported interfaces — they are accessed by name. For example, `fingerprint.IsTaskUpToDate` is a function, not an interface. The `Compiler` struct (`compiler.go:21-33`) has public fields accessed directly. There is no documented "public API surface" distinction between `internal/` and the main `task` package. The `taskfile.Node` interface is implemented by types in the same package (`node_file.go`, `node_git.go`, etc.), so implementations cannot be swapped without modifying the repo.

## Architectural Decisions

1. **Functional Options Pattern**: The `ExecutorOption` interface (`executor.go:20-24`) with implementations like `dirOption`, `entrypointOption`, etc. is a deliberate extensibility choice. It allows adding new configuration options without changing the `Executor` constructor signature. This is a well-known Go idiom for API stability.

2. **Taskfile Inclusion via DAG**: Taskfiles form a directed acyclic graph via includes. The `Reader` builds this graph (`taskfile/reader.go:249-405`) and merges tasks from multiple taskfiles with namespace isolation. This allows large projects to split tasks across files while maintaining clear ownership boundaries.

3. **Thread-Safe Ordered Maps**: Tasks, Vars, Includes all use `orderedmap.OrderedMap` with `sync.RWMutex` protection (`taskfile/ast/tasks.go:18-23`). This allows concurrent reads during task execution.

4. **No Dynamic Loading**: go-task deliberately does not use `plugin.Open`, `os/exec` for plugin loading, or similar mechanisms. Extensions are file-based (includes) or programmatic (executor options).

5. **Versioned Schema**: Taskfiles have a mandatory `version:` field (semver). The executor checks version compatibility at setup time (`setup.go:282-316`). This gives schema stability guarantees — users know which version range works with which binary.

## Notable Patterns

- **Functional Options**: Every `With*` function (e.g., `WithDir`, `WithForce`, `WithWatch`) returns an `ExecutorOption` that is applied via `Options()` method (`executor.go:91-122`)
- **YAML-Only Extension**: All task definitions, includes, and configuration are in YAML. No external plugin files.
- **Template-Driven Variable Resolution**: Variables are resolved lazily via the `Compiler` and `templater` packages. Dynamic variables (`{{ sh "cmd" }}`) are cached per-variable.
- **Fuzzy Matching for Task Names**: `Executor.fuzzyModel` provides spell-checking suggestions for misspelled task names (`executor.go:74-75`, `setup.go:110-129`)
- **Experiments as Feature Flags**: New features are gated via experiments toggled by environment variables (`experiments/experiments.go:17-29`)

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| No dynamic plugin loading | Cannot extend at runtime with compiled plugins; only static/included behavior |
| YAML-based tasks only | Tasks cannot be defined in Go code directly; no programmatic task creation API |
| Internal packages accessible | `internal/` packages are package-level visible but not formally exported API |
| Includes are static | Included taskfiles are resolved at read time; no late binding or dynamic include paths |
| Version coupling | Schema version checks can break old taskfiles when binary is upgraded |

## Failure Modes / Edge Cases

1. **Cyclic includes**: The graph package detects cycles and returns `TaskfileCycleError` (`taskfile/reader.go:393-398`). Tests confirm behavior in `taskfile/node_git_test.go`.
2. **Missing version field**: Taskfiles without `version:` cause `TaskfileVersionCheckError` during setup (`setup.go:291-297`).
3. **Checksum mismatch for remote taskfiles**: If a remote taskfile's content doesn't match the pinned checksum, `TaskfileDoesNotMatchChecksum` error is returned (`taskfile/reader.go:538-544`).
4. **Trust prompt for remote taskfiles**: Untrusted remote taskfiles prompt for user confirmation unless host is in `TrustedHosts` (`taskfile/reader.go:548-558`).
5. **Internal tasks not listed**: `FilterOutInternal` removes `Internal: true` tasks from listings (`task.go:601-604`).
6. **Maximum task call count**: Cyclic dependencies are limited by `MaximumTaskCall = 1000` (`task.go:28-32`).

## Future Considerations

1. **Formal Plugin API**: A `Plugin` interface with `Register`, `Execute` methods could allow third-party Go modules to extend behavior at runtime.
2. **Internal API Documentation**: Marking `internal/` packages as "do not import directly" with tooling enforcement.
3. **Version Stability Guarantee**: Publishing the Executor API as a v1 module with compatibility guarantees.
4. **Taskfile Include Callbacks**: Hooks before/after taskfile merges for custom processing.

## Questions / Gaps

1. **No evidence of external plugin documentation**: The README and docs do not mention plugin development. No `docs/plugins.md` or similar found.
2. **No evidence of third-party extension ecosystem**: No examples of community plugins, no plugin registry, no `awesome-task` list.
3. **No evidence of versioned API for Executor**: The `Executor` struct fields change without notice; no `CHANGELOG` entry for internal API changes.
4. **Experiments are not documented for end users**: `experiments/experiments.go:17-22` defines experiments but documentation for users is minimal.
5. **No evidence of stable public interface for taskfile/ast types**: Types like `Task`, `Vars`, `Includes` are public but have no stability guarantees. External code that imports them risks breakage.

---

Generated by `study-areas/12-extensibility.md` against `go-task`.