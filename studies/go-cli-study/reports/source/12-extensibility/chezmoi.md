# Repo Analysis: chezmoi

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `12-extensibility` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

chezmoi has a deliberate extensibility model centered on **external plugins** via `PATH` lookup and **template functions** for secret manager integration. The core is closed and monolithic; extension is achieved through subprocess execution (`chezmoi-<name>`) and configurable template functions. The architecture is clean but limited—extension requires modifying the PATH and writing standalone executables, not importing packages.

## Rating

**5/10** — Some extension points, but not designed for plugin ecosystem

chezmoi has well-designed internal modularity (encryption interface, interpreter abstraction, source state) but extension is a secondary concern. The plugin mechanism is a fallback for unknown commands via PATH lookup, not a first-class plugin system. Template functions provide secret manager integration but require recompilation to add new ones.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin loader | External command lookup via `exec.LookPath("chezmoi-" + args[0])` | `internal/cmd/cmd.go:224` |
| Plugin execution | Runs plugin as subprocess with stdin/stdout/stderr passthrough | `internal/cmd/cmd.go:241-245` |
| Encryption interface | `Encryption` interface with `Encrypt`/`Decrypt` methods | `internal/chezmoi/encryption.go:4-10` |
| Interpreter abstraction | `Interpreter` struct for script execution | `internal/chezmoi/interpreter.go:9-20` |
| Template functions | ~80 template functions registered in `newConfig` | `internal/cmd/config.go:493-592` |
| Command registry | All commands created via `new*Cmd()` methods on `Config` | `internal/cmd/config.go:1949-2006` |
| Command groups | Cobra `Group` definitions for UI organization | `internal/cmd/config.go:81-90` |
| Config structure | `ConfigFile` struct with mapstructure tags for config parsing | `internal/cmd/config.go:120-191` |
| Hooks config | `hookConfig` struct for pre/post hooks | `internal/cmd/config.go:107-110` |
| External sources | `External` struct for archive/git-repo/file sources | `internal/chezmoi/sourcestate.go:94-118` |
| Source state options | Functional options pattern for `SourceState` | `internal/chezmoi/sourcestate.go:157-200` |
| Age encryption implementation | Pluggable age encryption with builtin fallback | `internal/chezmoi/ageencryption.go:19-32` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**Partially.** New commands can be added as external executables named `chezmoi-<name>` in PATH (`internal/cmd/cmd.go:224`). However, this is a fallback mechanism, not a designed extension point. Adding commands requires:
- Creating a standalone executable
- Ensuring it's in PATH
- The plugin runs as a subprocess with no shared state or API

The built-in commands are all registered in `newRootCmd()` (`internal/cmd/config.go:1949-2006`) and each lives in its own file with a `new*Cmd()` method. There's no public registry or factory—commands are hardcoded into the root command list.

### 2. Is extension anticipated?

**Somewhat.** The external plugin fallback suggests extension was considered, but it's not a first-class concern. Evidence:
- Template functions provide extensibility for secrets and external data (`config.go:493-592`)
- Interpreters allow script execution customization (`interpreter.go:9-20`)
- Encryption is a clean interface allowing alternative implementations (`encryption.go:4-10`)

However, the main binary is monolithic. Template functions cannot be added at runtime; they are compiled into `c.templateFuncs` in `newConfig()` (`config.go:493-592`). The template function map is locked after initialization.

### 3. Are interfaces stable?

**Yes, for what exists.** The key interfaces are:
- `Encryption` interface (`encryption.go:4-10`) — stable, implemented by `AgeEncryption` and `GPGEncryption`
- `Interpreter` struct (`interpreter.go:9-20`) — simple, stable
- `SourceState` options pattern (`sourcestate.go:157-200`) — well-structured functional options

However, there is no semantic versioning of interfaces, no deprecation policy documented in code, and no public API guarantees for internal packages. The `internal/chezmoi` package is used by `internal/cmd` but not exported.

### 4. Are internal APIs modular?

**Yes.** Evidence of good modularity:
- `Config` struct (`config.go:194-291`) separates concerns: config fields, command configs, system abstractions, computed state
- `SourceState` is constructed via functional options (`sourcestate.go:157-200`)
- Encryption implementations are isolated (`internal/chezmoi/ageencryption.go`, `gpgencryption.go`)
- Template functions are method receivers on `Config`, cleanly separated by domain (aws, bitwarden, git, etc.)

The `Config` struct uses a composition pattern: `Config struct { ConfigFile ... }` where `ConfigFile` holds all user-facing config (`config.go:120-191`). This separates user config from internal state.

## Architectural Decisions

### Plugin System via PATH Fallback

When an unknown command is encountered, chezmoi looks for `chezmoi-<name>` in PATH (`cmd/cmd.go:224-249`). If found, it:
1. Creates a fake cobra command for setup
2. Runs pre-run hooks (environment setup)
3. Executes the plugin as a subprocess
4. Runs post-run hooks

This is a pragmatic solution but lacks:
- Shared state between host and plugin
- Plugin manifest/API versioning
- Plugin lifecycle management
- Conflict resolution if multiple `chezmoi-foo` exist

### Template Function Registry

Template functions are registered in `newConfig()` (`config.go:493-592`) as a map `c.templateFuncs`. The map is immutable after creation (panics on duplicate key at `config.go:641`). This is efficient but not extensible at runtime.

### Encryption as Interface

The `Encryption` interface (`encryption.go:4-10`) is clean and minimal:
```go
type Encryption interface {
    Decrypt(ciphertext []byte) ([]byte, error)
    DecryptToFile(plaintextAbsPath AbsPath, ciphertext []byte) error
    Encrypt(plaintext []byte) ([]byte, error)
    EncryptFile(plaintextAbsPath AbsPath) ([]byte, error)
    EncryptedSuffix() string
}
```

Implementations: `AgeEncryption` (builtin or external age command), `GPGEncryption` (external gpg), `NoEncryption` (passthrough). This is a well-designed extension point.

### Command Configuration Pattern

Each command has a `*CmdConfig` struct (e.g., `addCmdConfig` at `addcmd.go:29-43`) embedded in `Config`. This gives a consistent pattern but the configs are private to `Config` and not public API.

## Notable Patterns

### Functional Options for SourceState

`SourceState` uses functional options (`sourcestate.go:157-200`) with `With*` functions like `WithEncryption`, `WithTemplateFuncs`. This allows flexible construction without large constructors.

### Config Composition

`Config` embeds `ConfigFile` (`config.go:194`) which contains all user-settable fields. This separation allows the same config parsing logic to work for file-based config and programmatic config.

### Annotation-Based Command Metadata

Commands use `annotations` (defined in `annotation.go`) to declare their behavior:
- `persistentStateMode` — determines how persistent state is opened
- `modifiesSourceDirectory`, `modifiesDestinationDirectory` — for git auto-commit decisions
- `doesNotRequireValidConfig`, `runsCommands` — for plugin integration

This metadata drives runtime behavior without switch statements.

### Pre/Post Hooks

The `hookConfig` struct (`config.go:107-110`) allows configurable pre/post command hooks:
```go
type hookConfig struct {
    Pre  commandConfig `json:"pre"  mapstructure:"pre"  yaml:"pre"`
    Post commandConfig `json:"post" mapstructure:"post" yaml:"post"`
}
```

Hooks are executed via `config.runHookPre`/`runHookPost` in source state reading and command execution.

## Tradeoffs

### Monolithic Core vs Extension

**Tradeoff:** chezmoi prioritizes a cohesive, debuggable core over an open plugin ecosystem.

**Pros:**
- Simpler codebase
- Strong guarantees on behavior
- Easy to test internal interactions

**Cons:**
- Third parties cannot add commands via package import
- Template functions require recompilation
- No runtime extension beyond PATH executables

### Subprocess Plugin Model

**Tradeoff:** Using subprocess execution for plugins provides isolation but no API sharing.

**Pros:**
- Plugins are language-agnostic
- Crashes don't corrupt host state
- Simple implementation

**Cons:**
- No shared data structures
- No complex integration scenarios
- Plugin must re-implement basic chezmoi concepts (source dir, encryption)

### Interpreter Abstraction

The `Interpreter` struct (`interpreter.go:9-20`) allows customizing script execution. This is good for supporting multiple shells (bash, zsh, sh). However, it's limited to running external commands, not for dynamic loading of bytecode or plugins.

## Failure Modes / Edge Cases

### PATH Conflicts

If multiple `chezmoi-foo` executables exist in PATH, `exec.LookPath` returns the first one. No conflict detection or warning.

### Unknown Command with Plugin Fallback Loop

If `chezmoi-foo` exists but fails with "unknown command", chezmoi won't re-attempt plugin lookup. This could cause confusion if the plugin command also uses cobra and has similar error messages.

### Template Function Collisions

The code panics if a template function is registered twice (`config.go:641`). This is safer than silent shadowing but could break upgrades if new template functions conflict with user-defined ones (though user-defined ones aren't supported).

### Encryption Interface Backwards Compatibility

If a new encryption method is added that requires additional configuration, existing configs won't fail gracefully—they'll just use defaults.

## Future Considerations

### Plugin Manifest

A `chezmoi-plugin.yaml` or similar could declare:
- Plugin version compatibility
- Commands offered
- Configuration schema

This would enable conflict detection and version checking.

### Shared State Protocol

If plugins need access to source state or encryption, a wire protocol (stdin/stdout JSON-RPC) could enable structured communication without shared memory.

### Package-Based Extension

The current design uses executable lookup. A future version could support Go package imports for in-process extension, but this would require significant API stabilization.

## Questions / Gaps

1. **No evidence of plugin API versioning.** How should plugins declare compatibility with different chezmoi versions?

2. **No evidence of plugin lifecycle hooks.** When does a plugin get initialized vs executed per-command?

3. **No evidence of internal package stability guarantee.** `internal/chezmoi` is used by `internal/cmd` but not exported. Is there an intention to ever export it?

4. **Template functions are compile-time only.** Could a configuration-driven template function registry enable runtime extension without recompilation?

---

Generated by `study-areas/12-extensibility.md` against `chezmoi`.