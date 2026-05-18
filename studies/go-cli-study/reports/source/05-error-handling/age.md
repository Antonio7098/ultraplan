# Repo Analysis: age

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Age implements a comprehensive error handling philosophy centered on wrapping with context, sentinel errors for programmatic checking, and distinct user-facing vs operational error rendering. The library layer uses structured typed errors (`NoIdentityMatchError`, `NotFoundError`, `ParseError`) while the CLI layer separates fatal errors (exits with code 1) from warnings. Error chains preserve context through `%w` wrapping throughout.

## Rating

**8/10** — Excellent operational vs user-facing error separation with consistent contextual wrapping. The library provides typed errors for programmatic handling while the CLI provides actionable hints for user-facing errors. Minor deduction for some wrapping that could include more context.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Sentinel error | `ErrIncorrectIdentity` exported for programmatic checking | `age.go:77` |
| Error wrapping | `fmt.Errorf("%w: file is not passphrase-encrypted", ErrIncorrectIdentity)` | `scrypt.go:159` |
| Error wrapping | `fmt.Errorf("failed to wrap key for recipient #%d: %w", i, err)` | `age.go:128` |
| Error wrapping | `fmt.Errorf("%s plugin: %w", r.name, err)` | `plugin/client.go:74` |
| Typed error | `NoIdentityMatchError` struct with Errors slice and Unwrap | `age.go:222-240` |
| Typed error | `NotFoundError` struct with Name and Err fields | `plugin/client.go:408-422` |
| Typed error | `ParseError` struct for format parsing failures | `internal/format/format.go:217-227` |
| Typed error | `Error` struct for armor parsing failures | `armor/armor.go:172-182` |
| Custom error type | `gitHubRecipientError` for invalid recipient hints | `cmd/age/parse.go:26-32` |
| errors.Is usage | `errors.Is(err, ErrIncorrectIdentity)` for comparison | `age.go:353`, `age.go:381` |
| errors.As usage | `errors.As(err, &e)` for plugin.NotFoundError handling | `cmd/age/age.go:422` |
| errors.As usage | `errors.As(err, new(*age.NoIdentityMatchError))` | `cmd/age/age.go:508` |
| CLI error rendering | `errorf()` prints to stderr with "age: error:" prefix, exits 1 | `cmd/age/tui.go:37-41` |
| CLI error hints | `errorWithHint()` provides actionable hints after errors | `cmd/age/tui.go:47-54` |
| Plugin error wrapping | All plugin errors wrapped with plugin name prefix | `plugin/client.go:74`, `plugin/client.go:227` |
| Passphrase error | Distinct "file is not passphrase-encrypted" vs "incorrect passphrase" | `scrypt.go:159`, `scrypt.go:211` |
| Operation errors | "failed to read header", "failed to write nonce" include operation context | `age.go:252`, `age.go:169` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** Age consistently wraps errors with actionable context using `%w`. Examples:
- `fmt.Errorf("failed to wrap key for recipient #%d: %w", i, err)` (`age.go:128`) includes the recipient index
- `fmt.Errorf("failed to read header: %w", err)` (`age.go:252`) includes the operation
- `fmt.Errorf("%s plugin: %w", r.name, err)` (`plugin/client.go:74`) includes the plugin name

The scrypt module demonstrates nuanced wrapping:
- `fmt.Errorf("%w: file is not passphrase-encrypted", ErrIncorrectIdentity)` (`scrypt.go:159`) — distinguishes file type
- `fmt.Errorf("%w: incorrect passphrase", ErrIncorrectIdentity)` (`scrypt.go:211`) — distinguishes failure reason

### 2. Which errors are user-facing vs operational?

**User-facing errors** (CLI layer, `cmd/age/tui.go`):
- `errorf()` outputs to stderr with "age: error:" prefix, provides a report link
- `errorWithHint()` provides actionable hints (e.g., "did you mean to use -i/--identity?")
- Passphrase prompts and validation messages
- File permission/open errors include the filename

**Operational errors** (library layer):
- Errors returned from `Encrypt`/`Decrypt` are wrapped but not printed directly
- `NoIdentityMatchError` contains all failure errors for programmatic inspection
- `NotFoundError` includes the plugin name and underlying error for debugging
- Format parsing errors include specific failure reasons (e.g., "malformed stanza")

The separation is clean: library errors carry structured information for clients; CLI errors present user-friendly messages with hints.

### 3. How are fatal vs recoverable failures handled?

**Fatal failures** (CLI `cmd/age/tui.go:37-41`):
- `errorf()` calls `os.Exit(1)` after printing the error
- Used for: missing files, permission errors, invalid arguments, plugin not found

**Recoverable failures** (library layer):
- `ErrIncorrectIdentity` is returned when no recipient matches — not fatal, allows trying other identities
- In `decryptHdr()` (`age.go:350-364`), mismatched identities are collected into `NoIdentityMatchError.Errors` rather than failing immediately
- Plugin protocol errors (`plugin/plugin.go:462`) continue to next identity when `ErrIncorrectIdentity` is detected

**Exit codes** (`plugin/plugin.go`):
- `fatalf()` returns exit code 1 for errors
- `recipientError()` returns exit code 3 for recipient errors
- `identityError()` returns exit code 3 for identity errors

### 4. Are sentinel errors used for programmatic checking?

**Yes.** `ErrIncorrectIdentity` is the primary sentinel:
- Exported at `age.go:77` as `var ErrIncorrectIdentity = errors.New("incorrect identity for recipient block")`
- Used in `decryptHdr()` (`age.go:353`) with `errors.Is()` to check identity matches
- Wrapped with context in scrypt (`scrypt.go:159`, `scrypt.go:211`) but still detectable via `errors.Is()`
- Custom error types like `NoIdentityMatchError` implement `Unwrap()` to expose underlying errors (`age.go:238-240`)

## Architectural Decisions

1. **Two-layer error design**: Library errors are structured and typed for programmatic use; CLI errors are rendered for users with hints
2. **Sentinel + wrapping pattern**: `ErrIncorrectIdentity` as sentinel allows detection after context wrapping
3. **NoIdentityMatchError aggregation**: Collects all identity failures instead of failing on first, enabling better UX and debugging
4. **Plugin error namespacing**: Plugin errors prefixed with plugin name to identify source
5. **Format parse errors use internal errorf**: `internal/format/format.go:229-231` uses local `errorf` that returns `*ParseError`

## Notable Patterns

1. **Deferred error wrapping** (`plugin/client.go:72-76`):
   ```go
   defer func() {
       if err != nil {
           err = fmt.Errorf("%s plugin: %w", r.name, err)
       }
   }()
   ```

2. **Hint-based error messages** (`cmd/age/age.go:176`):
   ```go
   errorWithHint("too many INPUT arguments: "+quotedArgs, hints...)
   ```

3. **Identity sorting for native-first retry** (`age.go:324-341`):
   Native identities (X25519, Hybrid, Scrypt) sorted before plugins to try them first

4. **Error collection in NoIdentityMatchError** (`age.go:344-354`):
   All non-matching errors collected for later inspection

## Tradeoffs

1. **Context vs simplicity**: Every error is wrapped with context, making debugging easier but adding verbosity
2. **Plugin error isolation**: Each plugin error is namespaced, preventing confusion about which plugin failed, but breaking `errors.Is()` chains across plugin boundaries
3. **Hint system complexity**: `errorWithHint` adds code complexity but significantly improves user experience for common mistakes

## Failure Modes / Edge Cases

1. **PowerShell redirection mangling** (`cmd/age/age.go:488-493`): Detects corrupted file intros and suggests `-o` or `-a`
2. **Terminal binary output** (`cmd/age/age.go:285-303`): Refuses to output binary to terminal, suggests `-a` or `-o -`
3. **Duplicate recipients warning** (`cmd/age/age.go:220-228`): Warns but doesn't fail on duplicate flags
4. **Empty passphrase handling** (`scrypt.go:41`, `scrypt.go:125`): Returns error rather than proceeding
5. **Scrypt work factor bounds** (`scrypt.go:185-190`): Rejects work factors above maxWorkFactor to prevent DoS

## Future Considerations

1. **Error documentation**: Public-facing error documentation could help library users understand error hierarchies
2. **Structured error metadata**: NoIdentityMatchError could include timestamps or operation context for logging

## Questions / Gaps

1. **No evidence found** for error logging infrastructure (structured logging, log levels). Age appears to use simple `log` package in CLI (`cmd/age/tui.go:31`). This is appropriate for a focused encryption tool but worth noting.
2. **No evidence found** for panic-driven error handling. Age never panics on user input, using errors exclusively.
3. **No evidence found** for error recovery mechanisms beyond identity retry. Once an operation fails, it does not retry.

---

Generated by `study-areas/05-error-handling.md` against `age`.