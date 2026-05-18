# Error Handling Philosophy - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/05-error-handling.md` |
| Groups | All groups (age, chezmoi, dive, fzf, gdu, gh-cli, go-task, helm, k9s, lazygit, mitchellh-cli, opencode, rclone, restic, urfave-cli, yq) |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | go-cli-study |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | go-cli-study |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | dive |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | study-areas/05-error-handling.md |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | gdu |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | 05-error-handling |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | go-cli-study |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | go-cli-study |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | go-cli-study |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | rclone |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | study-areas/05-error-handling.md |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | urfave-cli |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | study-areas/05-error-handling.md |

## Executive Summary

Elite Go CLI projects share three practices: consistent error wrapping with `%w`, sentinel errors for programmatic checking, and explicit separation between user-facing errors (CLI output) and operational errors (logs). The top-tier projects (age, chezmoi, gh-cli, go-task, helm, opencode, rclone, restic — all rated 8/10) distinguish fatal vs recoverable failures via typed errors or exit code mapping. Lower-rated projects either lack `%w` wrapping entirely (mitchellh-cli), rely on panic for operational errors (dive), or have no sentinel error patterns (fzf, gdu).

## Core Thesis

Error handling quality correlates with whether a project treats errors as **first-class domain values** rather than afterthoughts. Projects that define structured error types (e.g., rclone's `Retrier`/`Fataler` interfaces, restic's `fatalError` type, go-task's `TaskError` interface) and use sentinel errors for control flow (gh-cli's `ErrKeyAlreadyExists`, helm's `ErrReleaseNotFound`) demonstrate mature error handling philosophy. Projects that return exit codes without error values (mitchellh-cli), use panic for parse failures (dive), or lack `%w` wrapping (fzf validation errors) show weaker error handling.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 8 | Typed error + sentinel + hint system | Strong user vs operational separation with `errorWithHint()` | No structured logging infrastructure |
| chezmoi | 8 | ExitCodeError + deDuplicateError | Consistent wrapping (48 matches), `slog`-based operational logging | Panic in template functions inconsistent with rest of codebase |
| dive | 6 | Panic for parse errors, logging for operational | Consistent wrapping at command layer | Panic for manifest unmarshaling; no exported sentinels |
| fzf | 5 | Exit codes as error semantics | Simple Unix-aligned model | No programmatic error checking; validation errors lose context |
| gdu | 5 | Wrapping without typed hierarchy | Consistent `%w` wrapping throughout | No `errors.Is`/`errors.As`; panic for stub methods |
| gh-cli | 8 | Typed errors (HTTPError, GitError) + sentinels | 644+ `%w` wraps; exit code mapping (0/1/2/4/8) | Error type hierarchy ad-hoc; NotFoundError is local to one package |
| go-task | 8 | TaskError interface with Code() method | "Did you mean?" suggestions via `TaskNotFoundError` | No fatal vs recoverable enum |
| helm | 8 | Sentinel errors in storage/driver + custom types | 360+ `%w` wraps; `joinedErrors` for multi-error | No explicit user vs operational type distinction |
| k9s | 7 | Flash notification system + stringly-typed sentinels | Clear UI vs logging separation via Flash model | Stringly-typed `type Error string` limits inspection |
| lazygit | 6 | go-errors for stack traces + DisabledReason pattern | Stack trace wrapping via `go-errors/errors` | Git command errors untyped; silent failure pattern |
| mitchellh-cli | 4 | Run() int + panic for invariants | HelpWriter/ErrorWriter separation | No `%w` wrapping, no sentinels, no `errors.Is`/`errors.As` |
| opencode | 8 | Sentinel errors + event-based error propagation | 172 `%w` wraps; panics caught with stack traces | No custom error types with structured data |
| rclone | 8 | Retrier/Fataler/NoRetrier interfaces | Sophisticated error taxonomy; 1706+ `%w` wraps | No explicit user-facing error rendering layer |
| restic | 8 | fatalError type + sentinel + checker errors | Clear fatal vs operational separation; `fatalError` detected via `errors.IsFatal()` | Some error messages lack structured data |
| urfave-cli | 7 | ExitCoder interface + MultiError | Framework provides good separation; configurable OsExiter/ErrWriter | No exported sentinel errors; internal types unexported |
| yq | 7 | Consistent `%w` wrapping + io.EOF sentinel | All errors wrapped with context | No custom error types; all errors exit 1 |

## Approach Models

### Model 1: "Typed Error Hierarchy" (rclone, go-task, helm, gh-cli)

These projects define custom error types that carry structured data and implement interfaces for behavioral classification.

**rclone** (`fs/fserrors/error.go:22-192`): Defines `Retrier`, `Fataler`, `NoRetrier`, `NoLowLevelRetrier` interfaces. Errors are tagged with behavioral metadata via wrapper types (`RetryError`, `FatalError`) that preserve `Unwrap()` chains.

**go-task** (`errors/errors.go:47-50`): Defines `TaskError interface { error; Code() int }`. All task-specific errors implement this interface, enabling exit code mapping directly from error types.

**helm** (`pkg/storage/driver/driver.go:39-48`): Defines `StorageDriverError` with `ReleaseName` field and `Unwrap()` method. Sentinel errors (`ErrReleaseNotFound`, `ErrReleaseExists`) live in the same package.

**gh-cli** (`api/client.go:42-49`): Defines `HTTPError` and `GraphQLError` wrapping API client errors, `GitError` with exit code and stderr.

This model excels when errors need to carry structured data for programmatic handling and when exit codes map directly from error types.

### Model 2: "User/Operational Separation" (age, restic, k9s, opencode)

These projects explicitly separate what users see from what is logged/handled programmatically.

**age** (`cmd/age/tui.go:37-54`): Uses `errorf()` for fatal CLI errors and `errorWithHint()` for actionable suggestions. Library errors are typed (`NoIdentityMatchError`, `ParseError`) for programmatic inspection.

**restic** (`internal/errors/fatal.go:10-53`): Defines `fatalError` type detected via `errors.IsFatal()`. Fatal errors print to stderr and exit; operational errors are wrapped and handled via `errors.Is`/`errors.As`.

**k9s** (`internal/model/flash.go:58-103`): `Flash` struct routes messages to TUI notifications AND logs them operationally. `Flash.Err()` calls both `slog.Error` and `f.SetMessage()`.

**opencode** (`internal/llm/agent/agent.go:238-401`): TUI displays user-facing error messages; operational errors go through `logging.ErrorPersist`. Permission denial cancels remaining tool calls.

This model excels when CLI tools need to provide actionable feedback while preserving debug information in logs.

### Model 3: "Sentinel-First" (chezmoi, helm, age, gh-cli)

These projects export sentinel error variables that callers check with `errors.Is()`.

**chezmoi** (`internal/chezmoi/attr.go:11-12`): `errEmptyDirName`, `errEmptyFilename`, `errEncryptionNotConfigured`. Used throughout with `errors.Is()` (109 matches).

**helm** (`pkg/storage/driver/driver.go:27-36`): Four core sentinels (`ErrReleaseNotFound`, `ErrReleaseExists`, `ErrInvalidKey`, `ErrNoDeployedReleases`) exported from storage driver.

**age** (`age.go:77`): `ErrIncorrectIdentity` sentinel with `errors.Is` checks at `age.go:353,381`.

**gh-cli** (`pkg/cmdutil/errors.go:35-41`): `SilentError`, `CancelError`, `PendingError` defined; `ErrKeyAlreadyExists` at `pkg/ssh/ssh_keys.go:35`.

This model excels when callers need to programmatically detect specific error conditions for recovery or branching.

### Model 4: "Minimal Framework" (mitchellh-cli, urfave-cli, fzf)

These projects treat errors as exit codes or output strings rather than structured values.

**mitchellh-cli** (`command.go:26`): `Run() int` returns exit codes, not Go errors. No `%w` wrapping, no sentinels, no `errors.Is`/`errors.As`.

**urfave-cli** (`errors.go:95-99`): `ExitCoder` interface allows custom exit codes, but internal error types are unexported. No programmatic error checking for consumers.

**fzf** (`src/constants.go:72-76`): `ExitError=2`, `ExitOk=0`, `ExitNoMatch=1` as constants. Validation errors use `errors.New` without shared sentinels.

This model is simple but limits programmatic error handling by external consumers.

### Model 5: "Panic for Parse Errors" (dive)

Dive uses panic for manifest/config unmarshaling failures rather than returning errors (`dive/image/docker/manifest.go:18`, `dive/image/docker/config.go:31`). This treats malformed input as fatal application errors.

This model provides fail-fast behavior but prevents graceful degradation and partial analysis.

## Pattern Catalog

### Pattern 1: Error Wrapping with `%w` (Best Practice)

**What**: Use `fmt.Errorf("context: %w", err)` to preserve error chains while adding context.

**Evidence**:
- rclone: 1706+ occurrences across codebase (`vfs/zip.go:21`, `lib/rest/rest.go:56`)
- gh-cli: 644+ occurrences (`pkg/ssh/ssh_keys.go:64`)
- helm: 360+ occurrences (`pkg/storage/driver/secrets.go:76`)
- opencode: 172 occurrences (`internal/llm/agent/agent.go:238`)

**When to use**: Every function that propagates an error from a lower layer.

**When overkill**: Internal helper functions that always return the same error type, or in very deep call stacks where context is already present.

### Pattern 2: Sentinel Errors for Programmatic Checking (Best Practice)

**What**: Export `var ErrX = errors.New("...")` variables that callers check with `errors.Is()`.

**Evidence**:
- helm: `ErrReleaseNotFound` at `pkg/storage/driver/driver.go:29`, checked at `pkg/action/upgrade.go:235`
- gh-cli: `ErrKeyAlreadyExists` at `pkg/ssh/ssh_keys.go:35`, checked at `pkg/ssh/ssh_keys.go:74`
- age: `ErrIncorrectIdentity` at `age.go:77`, checked with `errors.Is` at `age.go:353`

**When to use**: For error conditions that callers may need to handle differently (retry, skip, fallback).

**When overkill**: For one-off errors that propagate to the user unchanged.

### Pattern 3: Typed Errors with Structured Data (Best Practice)

**What**: Define struct types that implement `error` interface and carry fields for programmatic inspection.

**Evidence**:
- rclone: `FileTooSmallError{FileName string; Size int64; Minimum int64; Err error}` at `fs/fs.go:61-73`
- go-task: `TaskNotFoundError{TaskName string; DidYouMean string}` at `errors/errors_task.go:13-32`
- restic: `alreadyLockedError{otherLock *Lock}` at `internal/restic/lock.go:47`

**When to use**: When error conditions require structured data beyond a string message, or when `errors.As` checks are needed for type extraction.

**When overkill**: For simple error conditions where a sentinel suffices.

### Pattern 4: User vs Operational Error Separation (Best Practice)

**What**: Route user-facing errors to CLI output; route operational errors to structured logging.

**Evidence**:
- restic: `fatalError` type at `internal/errors/fatal.go:10` detected via `errors.IsFatal()` in `cmd/restic/main.go:205`
- age: `errorf()` at `cmd/age/tui.go:37-41` for user errors; `log` package for operational
- k9s: `Flash.Err()` at `internal/model/flash.go:100-103` calls both `slog.Error` and UI

**When to use**: For CLI tools where users need actionable feedback while operators need debug information.

**When overkill**: For library code where all errors should propagate to callers.

### Pattern 5: Error Wrapping via Deferred Functions (Notable)

**What**: Use `defer func() { if err != nil { err = fmt.Errorf("context: %w", err) } }()` pattern to wrap errors on function exit.

**Evidence**:
- age: `plugin/client.go:72-76` wraps plugin errors with plugin name prefix

**When to use**: When errors need consistent wrapping regardless of which return statement exits the function.

**When overkill**: When wrapping context is better added at specific return points.

### Pattern 6: "Did You Mean?" Error Suggestions (Notable)

**What**: Custom error types carry suggestions for user correction.

**Evidence**:
- go-task: `TaskNotFoundError` at `errors/errors_task.go:13-32` includes `DidYouMean` field populated by fuzzy matching

**When to use**: For CLI tools where typo detection improves user experience.

**When overkill**: For automated/scripted contexts where suggestions are unhelpful.

### Pattern 7: Hint-Based Error Messages (Notable)

**What**: Provide actionable hints after error messages to guide users toward solutions.

**Evidence**:
- age: `errorWithHint()` at `cmd/age/tui.go:47-54` provides suggestions like "did you mean to use -i/--identity?"
- gh-cli: `printError()` at `internal/ghcmd/cmd.go:281-301` provides context-specific suggestions (e.g., "run `gh auth login`")

**When to use**: For user-facing CLI tools where actionable guidance reduces support burden.

**When overkill**: For developer tools where users understand error context.

### Pattern 8: Behavioral Error Interfaces (Notable)

**What**: Define interfaces like `Retrier`, `Fataler` that errors implement to signal behavior.

**Evidence**:
- rclone: `Retrier` at `fs/fserrors/error.go:22-29` with `Retry() bool`; `Fataler` at `fs/fserrors/error.go:92-99` with `Fatal() bool`

**When to use**: For large codebases with complex retry/fatal semantics across multiple backends.

**When overkill**: For simple CLI tools with straightforward error handling.

### Pattern 9: Multi-Error Aggregation (Notable)

**What**: Collect multiple errors before returning, using `errors.Join` or custom multi-error types.

**Evidence**:
- helm: `joinedErrors` at `pkg/action/uninstall.go:232-254` with `Unwrap() []error`
- chezmoi: `chezmoierrors.Combine` at `internal/chezmoierrors/chezmoi errors.go:24` using `errors.Join`
- restic: `Checker.Error` at `internal/checker/checker.go:70-91` collects multiple errors

**When to use**: For operations that can fail partially (e.g., uninstall with multiple delete errors).

**When overkill**: For single-operation CLI tools where partial failure is uncommon.

### Pattern 10: Exit Code Mapping from Error Types (Notable)

**What**: Map error types to specific exit codes, enabling scripts to distinguish failure categories.

**Evidence**:
- gh-cli: `exitOK=0, exitError=1, exitCancel=2, exitAuth=4, exitPending=8` at `internal/ghcmd/cmd.go:44-49`
- rclone: Exit codes 4 (retryable), 10 (fatal) at `cmd/cmd.go:497-516`
- fzf: `ExitError=2`, `ExitNoMatch=1`, `ExitBecome=126`, `ExitInterrupt=130` at `src/constants.go:72-76`

**When to use**: For CLI tools consumed by scripts that need to branch on error categories.

**When overkill**: For interactive tools where exit codes are rarely inspected.

## Key Differences

### Error Type Philosophy

**Typed errors vs sentinels**: rclone, go-task, helm favor typed errors with structured data; age, gh-cli favor sentinels with `errors.Is` checks. Typed errors are more expressive but require `errors.As` knowledge; sentinels are simpler but limited to boolean checks.

**Custom error types vs plain errors**: age, gh-cli, go-task, helm, rclone, restic all define custom error types. dive, fzf, gdu, yq use plain `errors.New` without type hierarchies. Custom types enable programmatic inspection; plain errors are simpler.

### User vs Operational Separation

**Explicit separation** (age, restic, k9s, opencode): Uses distinct error types or mechanisms to route errors to UI vs logs.

**Implicit separation** (chezmoi, helm, go-task): Relies on error message content and log levels rather than type design.

**No separation** (mitchellh-cli, fzf, dive): All errors treated equivalently; user vs operational distinction not implemented.

### Fatal vs Recoverable Handling

**Interface-based** (rclone): `Retrier`, `Fataler` interfaces allow producers to tag errors with behavior without coupling to specific error types.

**Type-based** (restic): `fatalError` dedicated type detected via `errors.IsFatal()`.

**Exit code-based** (gh-cli, go-task): Error types carry exit codes via `ExitCoder` interface or `Code()` method.

**No explicit distinction** (yq, fzf, mitchellh-cli): All errors exit with code 1 or 2; no fatal vs recoverable classification.

### Panic Usage

**Panic for invariants** (mitchellh-cli): `cli.go:618` panics on radix tree invariant violations, treating these as programmer errors.

**Panic for parse errors** (dive): `manifest.go:18` panics on unmarshaling failures, treating malformed data as fatal.

**Panic recovery at startup** (k9s): `cmd/root.go:94-101` catches panics and logs stack trace.

**Panic recovery on goroutines** (opencode): `internal/logging/logger.go:67-94` catches panics and writes stack trace to file.

## Tradeoffs

| Decision | Benefit | Cost | Best Fit | Failure Mode |
|----------|---------|------|----------|--------------|
| Consistent `%w` wrapping | Traceable error chains; debugging easier | Verbosity; requires discipline | All projects | Inconsistent wrapping breaks chain inspection |
| Sentinel errors | Simple `errors.Is` checks; clear intent | Limited to boolean comparison | Public APIs with recoverable conditions | Adding new sentinels requires coordination |
| Custom error types | Structured data; `errors.As` extraction | Complexity; requires knowledge | Complex domains (API errors, lock conflicts) | Type hierarchy maintenance |
| User/operational separation | Actionable feedback vs debug logs | Dual logging; complexity | CLI tools with users AND operators | Operational errors leak to users |
| `fatalError` type | Clean separation; `errors.IsFatal()` detection | New error category to maintain | Tools with clear fatal vs recoverable distinction | Misclassification of recoverable as fatal |
| Behavioral interfaces (Retrier/Fataler) | Orthogonal error behavior; flexible | Complexity; string matching fallback | Large codebases with multiple backends | Interface explosion |
| Panic for parse errors | Fail-fast; simple | No graceful degradation; crashes | Internal invariants; never-hit edge cases | Data corruption aborts entire process |
| `go-errors/errors` package | Stack traces for debugging | External dependency; overhead | Debugging-focused tools | Stack trace pollution |

## Decision Guide

**For a new CLI tool**, prefer:
1. Consistent `%w` wrapping at every layer
2. Sentinel errors for conditions callers may handle
3. User-facing errors via distinct rendering path (not just stderr vs logs)
4. `errors.Is`/`errors.As` for programmatic checking
5. Exit code mapping from error types for scriptability

**For a library**, prefer:
1. Wrapped errors with context preserved
2. Sentinel errors for public API conditions
3. Custom error types for structured data needs
4. Avoid fatal vs recoverable — let callers decide

**For a framework**, prefer:
1. `ExitCoder` interface for exit code determination
2. Configurable `OsExiter`/`ErrWriter` for testing
3. Internal error types unexported (encapsulation)
4. `MultiError` for batch operations

**For a tool with multiple backends** (rclone pattern), prefer:
1. Behavioral error interfaces (`Retrier`, `Fataler`)
2. Wrapper functions (`RetryError`, `FatalError`)
3. Error string matching fallback for stdlib errors
4. Stats-based error classification

## Practical Tips

1. **Wrap early, wrap often**: Every function that propagates an error should add context via `%w`.

2. **Use actionable context**: Include operation name, resource identifier, and relevant values in wrapped errors.

3. **Export sentinels for recovery conditions**: If callers might want to retry, skip, or fallback on an error, export a sentinel.

4. **Separate user vs operational rendering**: Use distinct code paths for errors that users see vs errors that operators debug.

5. **Use `errors.Is` and `errors.As` correctly**: Don't use string matching for error comparison; use the standard library's error chain traversal.

6. **Avoid panic for operational errors**: Reserve panic for truly unrecoverable states (invariant violations, programming errors), not for data parsing failures.

7. **Consider exit code mapping**: If your tool is scriptable, map error types to distinct exit codes.

8. **Add hints for common mistakes**: `errorWithHint()` patterns (age) or actionable suggestions (gh-cli) reduce support burden.

## Anti-Patterns / Caution Signs

1. **`fmt.Errorf` without `%w`**: Breaking error chain inspection. Check: `mitchellh-cli/cli.go:205-206`.

2. **Panic for parse errors**: Prevents graceful degradation. Check: `dive/image/docker/manifest.go:18`.

3. **No sentinel errors**: External callers cannot programmatically detect conditions. Check: `dive`, `fzf`, `gdu`.

4. **Silent failure logging**: `self.Log.Error(err)` without user notification. Check: `lazygit/pkg/commands/git_commands/file_loader.go:52`.

5. **Inconsistent wrapping**: Some errors wrapped, others not. Check: `fzf/src/server.go:68` (no `%w`).

6. **Stringly-typed sentinels**: `type Error string` limits inspection. Check: `k9s/internal/client/errors.go:9-14`.

7. **No error type hierarchy**: All errors are `errors.New` strings. Check: `yq`, `fzf`.

8. **Magic numbers for exit codes**: `RunResultHelp = -18511` is uninspectable. Check: `mitchellh-cli/command.go:10-11`.

## Notable Absences

1. **No retry budgets or circuit breakers**: None of the studied repos implement retry budgets or circuit breakers. Retry logic exists (rclone, opencode, restic) but is ad-hoc.

2. **No error metrics/monitoring integration**: No repo integrates error reporting with monitoring systems.

3. **No i18n for error messages**: All error messages are hardcoded English strings across all repos.

4. **No error code enumeration**: None of the repos use numeric error codes as primary identification.

5. **No error injection/mocking utilities**: Testing error paths uses standard Go error handling without special test utilities.

## Per-Repo Notes

| Repo | Notable Strength | Notable Concern |
|------|------------------|-----------------|
| age | `errorWithHint()` system | No structured logging |
| chezmoi | Consistent wrapping + `slog` logging | Panic in template functions |
| dive | Command-layer wrapping consistency | Panic for parse errors; no sentinels |
| fzf | Simple exit code model | No programmatic error checking |
| gdu | Consistent `%w` wrapping | No `errors.Is`/`errors.As`; panic for stubs |
| gh-cli | 644+ wraps; exit code mapping | Ad-hoc error type hierarchy |
| go-task | "Did you mean?" via `TaskNotFoundError` | No fatal vs recoverable enum |
| helm | `joinedErrors` for multi-error | No explicit user vs operational type |
| k9s | Flash notification system | Stringly-typed sentinels |
| lazygit | `go-errors` stack traces | Git errors untyped; silent failures |
| mitchellh-cli | HelpWriter/ErrorWriter separation | No `%w`, no sentinels, no `errors.Is` |
| opencode | 172 wraps; panic recovery | No custom error types with structured data |
| rclone | Retrier/Fataler interfaces | No explicit user-facing rendering layer |
| restic | `fatalError` separation | Some error messages lack structure |
| urfave-cli | `ExitCoder` + `MultiError` | No exported sentinel errors |
| yq | Consistent wrapping | No custom error types; all exit 1 |

## Open Questions

1. **Is `go-errors/errors` worth the dependency?** lazygit uses it for stack traces, but standard library `%+v` provides similar functionality. What specific debugging scenario motivated this choice?

2. **Why do some repos use panic for parse errors?** Dive uses panic for manifest/config unmarshaling, treating these as fatal. Is this because corrupted data means "cannot continue" or is it simply expedient?

3. **When is `fatalError` better than exit codes?** restic uses `fatalError` type, gh-cli uses exit codes. Both achieve similar goals via different mechanisms. Which is more idiomatic for Go CLI tools?

4. **How should error hierarchies be documented?** Most repos lack documentation for error types. Is there a standard for documenting error taxonomies?

5. **Should CLI frameworks export sentinel errors?** urfave-cli keeps internal error types unexported. Is this encapsulation or limitation?

## Evidence Index

Key evidence references from per-repo analyses:

### Error Wrapping

- `rclone/fs/fs.go:27-55` — 30+ sentinel errors exported
- `rclone/fs/fserrors/error.go:22-29` — `Retrier` interface
- `rclone/vfs/zip.go:21` — `%w` wrapping pattern
- `gh-cli/pkg/ssh/ssh_keys.go:64` — `%w` wrapping example
- `gh-cli/internal/ghcmd/cmd.go:44-49` — exit code constants
- `helm/pkg/storage/driver/driver.go:27-36` — sentinel errors
- `helm/pkg/action/uninstall.go:232-254` — `joinedErrors` type
- `age/age.go:77` — `ErrIncorrectIdentity` sentinel
- `age/cmd/age/tui.go:37-54` — `errorf()` and `errorWithHint()`
- `opencode/internal/llm/agent/agent.go:238` — 172 `%w` occurrences
- `restic/internal/errors/fatal.go:10` — `fatalError` type
- `restic/cmd/restic/main.go:205` — `errors.IsFatal()` handling
- `go-task/errors/errors.go:47-50` — `TaskError` interface
- `go-task/errors/errors_task.go:13-32` — `TaskNotFoundError` with `DidYouMean`
- `chezmoi/internal/chezmoi/attr.go:11-12` — sentinel errors
- `chezmoi/internal/cmd/cmd.go:59-60` — `ExitCodeError` handling
- `k9s/internal/client/errors.go:9-14` — stringly-typed sentinels
- `k9s/internal/model/flash.go:100-103` — `Flash.Err()` logging and UI
- `mitchellh-cli/cli.go:205-206` — `fmt.Errorf` without `%w`
- `dive/image/docker/manifest.go:18` — panic for unmarshal failure
- `urfave-cli/errors.go:95-99` — `ExitCoder` interface

### Error Type Definitions

- `rclone/fs/fs.go:61-73` — `FileTooSmallError` with `Unwrap()`
- `go-task/errors/errors_task.go:36-59` — `TaskRunError` with `Unwrap()`
- `restic/internal/restic/lock.go:47` — `alreadyLockedError`
- `gh-cli/api/client.go:42-49` — `HTTPError`, `GraphQLError`
- `helm/pkg/storage/driver/driver.go:39-48` — `StorageDriverError`
- `helm/pkg/engine/engine.go:332-336` — `TraceableError`
- `lazygit/pkg/gui/types/keybindings.go:81-91` — `ErrKeybindingNotHandled`

### User vs Operational Separation

- `restic/cmd/restic/main.go:199-209` — fatal vs operational handling
- `age/cmd/age/tui.go:37-54` — user-facing error rendering
- `k9s/internal/view/pod.go:154` — `Flash.Err()` for UI
- `opencode/internal/llm/agent/agent.go:397-401` — permission denial rendering
- `gh-cli/internal/ghcmd/cmd.go:281-301` — `printError()` with context-specific messages

### Panic Recovery

- `k9s/cmd/root.go:94-101` — panic recovery at startup
- `opencode/internal/logging/logger.go:67-94` — panic recovery on goroutines
- `mitchellh-cli/cli.go:618` — panic for radix tree invariant

---

Generated by protocol `study-areas/05-error-handling.md`.