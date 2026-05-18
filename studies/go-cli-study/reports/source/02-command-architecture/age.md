# Repo Analysis: age

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

age is a file encryption tool with a multi-binary architecture: `age` (encrypt/decrypt), `age-keygen` (key generation), `age-inspect` (file inspection), and `age-plugin-batchpass` (plugin). Each binary is a standalone program using Go's `flag` package. There is **no shared command framework or subcommand hierarchy** — each binary is independently implemented with its own `main()` function and flag parsing. Commands communicate via file-based interfaces (identity files, recipient files) rather than via parent-child messaging.

## Rating

**4/10** — Commands are somewhat organized but are fully imperative scripts. Each binary is a monolithic `main()` with extensive inline logic. There is no command composition, no lifecycle hooks, and no reusable scaffolding. The lack of a shared command framework means flags like `--version` and `--help` are implemented separately in each binary (`cmd/age/age.go:122-127`, `cmd/age-keygen/keygen.go:70-74`, `cmd/age-inspect/inspect.go:39-48`).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command definition | Each binary is a standalone `main()` package | `cmd/age/age.go:105`, `cmd/age-keygen/keygen.go:63`, `cmd/age-inspect/inspect.go:31` |
| Flag parsing | Uses Go's standard `flag` package | `cmd/age/age.go:106-140`, `cmd/age-keygen/keygen.go:65-75` |
| Subcommand registration | None — no parent/child relationship | N/A |
| Run function | `main()` functions act as both entry point and run logic | `cmd/age/age.go:105-321`, `cmd/age-keygen/keygen.go:63-127` |
| Reusable scaffolding | No shared command base type or helpers | N/A |
| Help generation | Manual `usage` const strings | `cmd/age/age.go:30-68`, `cmd/age-keygen/keygen.go:20-57` |
| Version handling | Per-binary `Version` variable with `debug.ReadBuildInfo()` | `cmd/age/age.go:103`, `cmd/age-keygen/keygen.go:61` |
| Plugin system | Separate plugin package with `HandleIdentityAsRecipient` and `HandleIdentity` callbacks | `cmd/age-plugin-batchpass/plugin-batchpass.go:101-144` |
| Lifecycle hooks | None | N/A |

## Answers to Protocol Questions

### 1. How are subcommands registered?

**No subcommand system exists.** age uses a multi-binary approach where `age`, `age-keygen`, `age-inspect`, and `age-plugin-batchpass` are separate executables. There is no `cobra`, `cli`, or any command framework. Subcommands are not registered — they are distinct entry points.

Evidence: `cmd/age/age.go:105` is `func main()`, not a `RunE` callback. Each binary's `main()` is independent.

### 2. How is command discovery handled?

**No explicit command discovery.** Users invoke specific binaries directly. There is no central registry of commands. Each binary handles its own argument parsing and usage reporting independently.

Evidence: `cmd/age/age.go:108-111` shows a check for `len(os.Args) == 1` that prints usage and exits, but this is per-binary logic, not a shared framework.

### 3. Are commands declarative or imperative?

**Imperative.** Commands are implemented as procedural scripts in `main()`. There is no declarative configuration (no struct tags, no YAML/config-driven commands). Flag definitions are imperative calls to `flag.BoolVar`, `flag.StringVar`, and `flag.Func` at `cmd/age/age.go:122-139`.

Evidence: `cmd/age/age.go:122-139` shows imperative flag registration with no abstraction layer.

### 4. How do parent/child commands communicate?

**They don't — there is no parent/child relationship.** The three main binaries (`age`, `age-keygen`, `age-inspect`) are peers. Communication between them happens through files (identity files, recipient files) rather than in-memory structures. `age-keygen` outputs an identity file, and `age` reads it as input via `-i`/`--identity`.

Evidence: `cmd/age/age.go:375-383` parses identity files with `parseIdentitiesFile()`. No child process or IPC mechanism exists between binaries.

### 5. How much logic exists directly in commands?

**A lot.** The `age` binary's `main()` function spans 604 lines with all logic inline: flag parsing, input/output handling, passphrase prompts, encryption/decryption dispatching, and error handling. The `main()` function directly contains conditional logic (`cmd/age/age.go:179-320`) that branches between `encryptPass`, `decryptPass`, `encryptNotPass`, and `decryptNotPass` based on flag state.

Evidence: `cmd/age/age.go:105-321` contains the entire command flow including input/output, passphrase handling, and encryption routing. Helper functions like `encryptNotPass` (`cmd/age/age.go:351-393`) and `decryptNotPass` (`cmd/age/age.go:454-474`) delegate to `age.Encrypt`/`age.Decrypt`, but the orchestration is all in `main()`.

## Architectural Decisions

1. **Multi-binary architecture over single binary with subcommands.** age ships as separate binaries rather than a single binary with subcommands. This avoids a dependency on a command framework but introduces code duplication (each binary has its own `flag.Usage` setup, `Version` handling, etc.).

2. **Standard `flag` package over third-party CLI framework.** Using `flag` means no abstraction over command definition. `flag.Usage` is set to a `fmt.Fprintf` to a static `usage` string (`cmd/age/age.go:106`). There is no自动 help generation from struct tags.

3. **File-based inter-command communication.** `age-keygen` writes an identity file (`cmd/age-keygen/keygen.go:152-154`) that `age` reads via `parseIdentitiesFile()` (`cmd/age/parse.go:140-210`). No in-process communication exists.

4. **Plugin system is separate binary.** `age-plugin-batchpass` is a separate binary that follows the age plugin protocol (`plugin.New()`, `p.HandleIdentityAsRecipient()`, `p.Main()`) at `cmd/age-plugin-batchpass/plugin-batchpass.go:84-145`. It does not share the same `main()` pattern as the core commands.

## Notable Patterns

- **Monolithic `main()`**: The `age` binary has 604 lines in a single `main()` function. The `age-keygen` binary is smaller (185 lines) but follows the same imperative pattern.

- **Usage strings as constants**: Help text is stored in `const usage = ` at `cmd/age/age.go:30-68` and `cmd/age-keygen/keygen.go:20-57`. These are manually maintained and not generated from code.

- **Version injection via linker**: `var Version string` at `cmd/age/age.go:103` can be set at link time. At runtime, `debug.ReadBuildInfo()` is checked (`cmd/age/age.go:143-145`).

- **No struct embedding for commands**: There are no command structs being embedded or composed. Each `main()` is a flat function.

## Tradeoffs

- **Tradeoff**: Multi-binary design avoids framework dependency but causes code duplication for common operations (version, help, error handling).
- **Tradeoff**: Using `flag` package keeps dependencies minimal but provides no built-in help generation, shell completion, or command hierarchy.
- **Tradeoff**: File-based communication is simple and stateless, but precludes advanced inter-command features like streaming or progress reporting across commands.

## Failure Modes / Edge Cases

1. **Duplicate recipient warnings**: `cmd/age/age.go:220-228` warns about duplicate `-r` flags using a custom iterator-based approach with `warnDuplicates`. This logic is inline in `main()`.

2. **stdin conflict detection**: `stdinInUse` singleton (`cmd/age/age.go:72`) prevents stdin from being used for multiple purposes (input file, recipients file, identities file). This is a global variable approach with no thread safety.

3. **Terminal detection**: `term.IsTerminal()` checks (`cmd/age/age.go:253,277,304`) change behavior based on whether stdin/stdout are terminals (buffering for TTY input, refusing binary output to terminal). This is inline in `main()`.

4. **PowerShell mangling detection**: `cmd/age/age.go:487-493` checks for corrupted file intros caused by PowerShell redirection, using `bufio.Reader.Peek()`.

## Future Considerations

- Extracting a shared `main()` scaffolding (flag parsing, version handling, usage) into a reusable package would reduce duplication across 4 binaries.
- Adding a command composition system (even a simple interface) would allow `age` to support plugin commands via a unified interface rather than via `-j` flag in `main()`.
- The plugin system (`plugin.HandleIdentityAsRecipient` callback at `cmd/age-plugin-batchpass/plugin-batchpass.go:101`) is the closest thing to a lifecycle hook — it registers identity handlers rather than pre/post hooks.

## Questions / Gaps

1. **No evidence of command grouping** — There is no `CommandGroup` or `I deepSubcommand` pattern. Commands are flat binaries.
2. **No pre/post run hooks** — There is no lifecycle hook mechanism like `BeforeAction`/`AfterAction`.
3. **No automatic help generation** — Help text is manually maintained in `const usage` strings. No struct tags or builder pattern for command definitions.
4. **No shared error handling package** — Each binary has its own `errorf()` function (`cmd/age/age.go` uses a local one via closure, `cmd/age-keygen/keygen.go:178-181` defines its own).

---

Generated by `study-areas/02-command-architecture.md` against `age`.