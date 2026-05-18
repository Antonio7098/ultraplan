# go-cli-study

A structured comparative study of elite Go CLI architectures. Each source is studied independently per dimension, then synthesized into a combined report.

## Source Categories

### Compact & Focused

Small, readable codebases with high engineering discipline. Good starting points.

| Source | What to Study |
|--------|---------------|
| `age` | Minimalism, API design, security engineering |
| `chezmoi` | Config management, filesystem abstraction, cross-platform |
| `fzf` | Performance, terminal interaction, event loops, memory efficiency |
| `gdu` | Filesystem traversal, concurrency, focused architecture |
| `go-task` | Execution graphs, config parsing, task orchestration |
| `mitchellh-cli` | Minimal CLI framework — clean surfaces, great for fundamentals |
| `urfave-cli` | Lightweight CLI framework, inline command definitions |
| `yq` | Parser architecture, command pipelines, cross-format processing |

### Enterprise & Platform

Production-grade, large-scale CLI engineering. Patterns for extensibility and robustness.

| Source | What to Study |
|--------|---------------|
| `gh-cli` (GitHub CLI) | Clean architecture, DI, testability, mature release engineering |
| `helm` | Large-scale command architecture, plugins, API abstraction |
| `rclone` | Plugin/backend architecture, cloud abstraction, interfaces at scale |
| `restic` | Security-sensitive design, repository abstraction, crypto boundaries |

### Interactive & TUI

Terminal-native applications with rich rendering, event-driven architectures.

| Source | What to Study |
|--------|---------------|
| `dive` | TUI architecture, domain modeling, layered rendering |
| `k9s` | Event-driven, state management, terminal rendering, async updates |
| `lazygit` | Interactive UX, state machines, keybinding systems, controller patterns |
| `opencode` | Agentic CLI loop, tool execution, streaming |

## Study Dimensions (15 Areas)

1. **Project Structure & Boundaries**: `cmd/` vs `internal/` vs `pkg/`, dependency direction
2. **Command Architecture**: subcommand registration, composition, lifecycle hooks
3. **Dependency Injection & Wiring**: centralization, explicit initialization
4. **Configuration Management**: flags, env vars, config precedence
5. **Error Handling Philosophy**: wrapping, user-facing vs debug errors
6. **IO Abstraction & Testability**: stream abstraction, mockability
7. **State & Context Management**: `Context` propagation, cancellation, sessions
8. **Concurrency & Async Patterns**: goroutines, coordination, cleanup
9. **Terminal UX & Interaction Design**: rendering, prompts, streaming
10. **Logging & Observability**: structured logging, verbosity, tracing
11. **Testing Strategy**: integration tests, golden tests, fixture organization
12. **Extensibility & Plugin Design**: interfaces, command registration
13. **Security & Trust Boundaries**: sandboxing, input validation
14. **Performance & Resource Management**: startup time, buffering, lazy init
15. **Engineering Philosophy & Tradeoffs**: simplicity vs scalability vs extensibility
