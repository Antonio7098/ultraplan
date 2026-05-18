# Repo Analysis: opencode

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go 1.24.0 |
| Analyzed | 2026-05-15 |

## Summary

opencode is a terminal-based AI coding assistant built in Go. It demonstrates careful attention to startup performance through deferred initialization of heavy components (LSP clients, MCP tools), efficient memory management via SQLite-backed storage rather than in-memory caches, and streaming architectures for both LLM responses and UI updates. The application uses structured concurrency patterns (WaitGroups, context cancellation) and pub/sub for decoupled component communication.

## Rating

**8/10** — Efficient and scalable

Rationale: opencode achieves good performance through lazy initialization of expensive components (LSP, MCP), streaming-based response handling, and SQLite-backed persistence instead of in-memory caching. The main startup cost comes from database connection and migrations, which are unavoidable but reasonable. Memory usage is controlled through message offloading to disk. Some missed opportunities: no profiling hooks, no incremental file processing for very large workspaces.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Startup timing | LSP clients initialized in background goroutine | `internal/app/lsp.go:13-22` |
| Startup timing | MCP tools fetched asynchronously with 30s timeout | `cmd/root.go:195-207` |
| Startup timing | DB connection + WAL pragmas + migrations run synchronously | `internal/db/connect.go:18-67` |
| Buffer handling | TUI message channel buffer size 100 | `cmd/root.go:250` |
| Buffer handling | Pub/sub broker default buffer 64 | `internal/pubsub/broker.go:8` |
| Buffer handling | TUI message handler drops slow consumers after 2s | `cmd/root.go:234-236` |
| Memory management | Messages stored in SQLite, not memory | `internal/message/message.go:37-42` |
| Memory management | Session service reuses db.Querier | `internal/session/session.go` |
| Memory management | sync.Map for concurrent activeRequests tracking | `internal/llm/agent/agent.go:70` |
| Streaming | LLM response streamed via channel | `internal/llm/provider/provider.go:56` |
| Streaming | Diff generation uses strings.Seq for line-by-line processing | `internal/diff/diff.go:863-870` |
| GC/cleanup | Deferred shutdown with WaitGroup tracking | `internal/app/app.go:163-186` |
| GC/cleanup | 5s timeout for LSP client graceful shutdown | `internal/app/app.go:180-185` |
| Incremental ops | Session summarization for long conversations | `internal/llm/agent/agent.go:535-704` |
| Incremental ops | Title generation runs async, doesn't block response | `internal/llm/agent/agent.go:240-249` |

## Answers to Protocol Questions

### 1. Is startup fast?

**Moderate** — Startup cost is dominated by:
- Database connection and migration execution (`internal/db/connect.go:63-66`)
- Config loading with Viper (`internal/config/config.go:128-216`)

Positive: LSP clients are deferred to background goroutines (`internal/app/lsp.go:13-22`). MCP tools are fetched asynchronously with a 30s timeout (`cmd/root.go:195-207`). Non-interactive mode (`-p` flag) skips TUI initialization entirely.

Evidence: `cmd/root.go:100-114` shows non-interactive path bypasses TUI setup.

### 2. Is memory usage controlled?

**Yes** — Message content is persisted to SQLite, not held in memory. The service pattern keeps only a db.Querier reference (`internal/message/message.go:37-42`). Session summaries truncate conversation history by storing a summary message ID and replacing history with a condensed version (`internal/llm/agent/agent.go:535-704`).

Evidence: `internal/message/message.go:132-145` shows `List()` loads messages from DB on demand.

### 3. Is streaming used instead of buffering?

**Yes** — LLM responses stream events via channels (`internal/llm/provider/provider.go:56`). The TUI receives messages through a buffered channel (size 100 at `cmd/root.go:250`), with explicit handling for slow consumers that drops after 2 seconds (`cmd/root.go:234-236`). Diff generation processes lines lazily via `strings.SplitSeq` (`internal/diff/diff.go:863`).

Evidence: `internal/llm/agent/agent.go:339-348` shows event-by-event processing loop.

### 4. Are large operations incremental?

**Partial** — Session summarization (`internal/llm/agent/agent.go:535-704`) allows truncation of long conversations. Title generation runs asynchronously without blocking the main response path (`internal/llm/agent/agent.go:240-249`). However, file search operations use `doublestar.GlobWalk` which returns all matches before filtering, and no chunked processing was found for very large codebases.

Evidence: `internal/llm/agent/agent.go:241-249` shows title generation in `go func()` with background context.

## Architectural Decisions

### Deferred Initialization
LSP clients and MCP tools initialize after the main application loop starts. This keeps CLI startup responsive at the cost of first-use latency for these features. The pattern is consistent: background goroutines with proper panic recovery (`internal/app/lsp.go:88-92`, `cmd/root.go:136-138`).

### SQLite-Backed Persistence
Messages are stored in SQLite rather than in-memory. This keeps memory bounded but introduces DB latency for message retrieval. The tradeoff favors long sessions over startup performance. Pragmas optimize for read-heavy workloads: WAL mode, -8000 cache size, normal sync (`internal/db/connect.go:39-54`).

### Pub/Sub Decoupling
The application uses a broker pattern (`internal/pubsub/broker.go`) to decouple components. TUI, agent, session, and logging events all flow through typed channels. This allows independent scaling but introduces queueing overhead. Buffer sizes are small (64 default, 100 for TUI) to prevent memory bloat.

### Streaming Response Architecture
LLM responses flow through typed event channels (`internal/llm/provider/provider.go:44-52`). The agent processes events incrementally, updating messages in the DB as content arrives. This allows progressive UI updates without buffering entire responses.

## Notable Patterns

1. **Global config singleton** — `config.Get()` returns a cached config, avoiding repeated parsing (`internal/config/config.go:129-131`).

2. **Goroutine lifecycle management** — `sync.WaitGroup` tracks LSP watchers (`internal/app/app.go:39`), with explicit cancel functions stored for shutdown (`internal/app/app.go:37`).

3. **Timeout-based resource cleanup** — LSP shutdown uses 5s timeout (`internal/app/app.go:180`), subscription cleanup uses 5s timeout (`cmd/root.go:276`).

4. **Context propagation** — Session ID and message ID passed via context values (`internal/llm/agent/agent.go:165`, `internal/llm/agent/agent.go:336`).

5. **Graceful degradation** — If ripgrep or fzf are missing, file operations continue without those tools (`internal/fileutil/fileutil.go:22-33`).

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| DB vs Memory | SQLite persistence keeps memory bounded but adds latency for message retrieval compared to in-memory caches |
| Lazy vs Eager | Deferred LSP/MCP initialization speeds startup but causes first-use latency when those features are first needed |
| Streaming vs Batching | Event streaming provides progressive updates but complicates error recovery and retry logic |
| Decoupling vs Overhead | Pub/sub allows component independence but adds queueing overhead and potential message drops |

## Failure Modes / Edge Cases

1. **DB migration failure** — If migrations fail, the application exits. No retry mechanism (`internal/db/connect.go:63-66`).

2. **LSP server timeout** — Initialization has 30s timeout; failures are logged but don't prevent app startup (`internal/app/lsp.go:37`).

3. **Slow TUI consumer** — Messages are dropped after 2 seconds if TUI can't keep up (`cmd/root.go:234-236`). This loses events silently.

4. **MCP tool initialization** — 30s timeout for fetching MCP tools; failures are logged and retried on next invocation (`cmd/root.go:200-201`).

5. **Subscription cleanup timeout** — If subscription goroutines don't exit within 5s, channels are forcibly closed (`cmd/root.go:276-279`).

## Future Considerations

1. **Profiling hooks** — No profiling endpoints or flags exist. Adding `pprof` endpoints would help diagnose production issues.

2. **Incremental workspace loading** — For very large repos, the current glob-based file discovery could be chunked or made incremental.

3. **Message batch retrieval** — Currently messages are fetched one-by-one from SQLite. Batch retrieval could reduce DB round-trips for complex queries.

4. **Connection pooling** — SQLite is single-connection; for high-concurrency scenarios, a pool or WAL-based reader could improve throughput.

## Questions / Gaps

1. **No profiling hooks found** — No evidence of `net/http/pprof`, `-profile` flags, or benchmark tests. Diagnostic capability is limited to log-based debugging.

2. **Memory limit for message history** — No evidence of enforcement for maximum messages per session. Very long sessions could accumulate many messages before summarization.

3. **LSP client retry logic** — While restart logic exists (`internal/app/app.go:99-125`), there's no exponential backoff. Rapid failure cycles could cause CPU spinning.

---

Generated by `study-areas/14-performance.md` against `opencode`.