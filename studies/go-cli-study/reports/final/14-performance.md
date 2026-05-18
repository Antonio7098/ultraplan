# Performance & Resource Management - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/14-performance.md` |
| Groups | All groups |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `repos/age` | age |
| 2 | chezmoi | `repos/chezmoi` | chezmoi |
| 3 | dive | `repos/dive` | dive |
| 4 | fzf | `repos/fzf` | fzf |
| 5 | gdu | `repos/gdu` | gdu |
| 6 | gh-cli | `repos/gh-cli` | gh-cli |
| 7 | go-task | `repos/go-task` | go-task |
| 8 | helm | `repos/helm` | helm |
| 9 | k9s | `repos/k9s` | k9s |
| 10 | lazygit | `repos/lazygit` | lazygit |
| 11 | mitchellh-cli | `repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `repos/opencode` | opencode |
| 13 | rclone | `repos/rclone` | rclone |
| 14 | restic | `repos/restic` | restic |
| 15 | urfave-cli | `repos/urfave-cli` | urfave-cli |
| 16 | yq | `repos/yq` | yq |

## Executive Summary

Elite Go CLI projects manage performance through four converging strategies: deferred initialization of expensive components, buffer pooling for hot paths, streaming architectures that avoid loading full datasets into memory, and incremental processing with bounded concurrency. Projects that score 8/10 consistently implement all four; those at 6-7/10 implement two to three with gaps in memory discipline or incremental operation design. No project achieves top marks without explicit profiling hooks, yet fewer than half expose them. GC tuning is rare outside of specialized tools (restic, rclone).

## Core Thesis

Go CLI performance is dominated by three costs: startup initialization, memory allocation patterns, and I/O handling strategy. The best-performing CLIs treat startup as a liability — they defer everything possible past the point of argument parsing and only pay for what the specific command invocation requires. Memory discipline comes not from avoiding allocation but from reusing buffers via `sync.Pool` or custom pools, and from bounded data structures that prevent unbounded growth. Streaming is the third pillar: tools that can process data incrementally (chunk-by-chunk, line-by-line, document-by-document) remain responsive at scales where buffered tools OOM or become unresponsive.

The divergence in scores across this cohort is not primarily language or framework choice — all are Go — but rather the degree to which architects internalized these principles and the product constraints that forced or prevented their application.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 8 | Chunked STREAM encryption | O(1) memory via 64KB chunked streaming | No profiling hooks |
| chezmoi | 7 | sync.OnceValues + lazy writer | Deferred computation with concurrent walk | Archive buffering in memory |
| dive | 6 | Lazy node sizing + streaming tar | Incremental tree building per layer | Full tree stacking for efficiency |
| fzf | 8 | Slab allocators + chunked storage | Object pooling with per-chunk cache bitmap | No mmap for large files |
| gdu | 8 | Bounded goroutine pool + PGO | Concurrency limits with profile-guided optimization | Goroutine leak risk on error |
| gh-cli | 8 | Factory pattern with func() fields | Deferred HTTP/client init, streaming table printer | Eager config blocks `gh version` |
| go-task | 8 | Buffer reuse + streaming output | 128KB reused checksum buffer, sync.Once init | No profiling hooks |
| helm | 7 | Lazy client + buffer reuse | Deferred kubeconfig loading | Full manifest buffering |
| k9s | 6 | Informer caching + sliding log window | Per-namespace factory scoping | Synchronous K8s connection blocks startup |
| lazygit | 7 | Streaming via bufio.Scanner + background refresh | Line-by-line command output streaming | Pipe set cache unbounded growth |
| mitchellh-cli | 6 | sync.Once deferred init + radix tree | O(k) command lookup, lazy factory pattern | No pooling, no streaming for data ops |
| opencode | 8 | SQLite-backed persistence + pub/sub streaming | Message offload to disk, async LSP init | Slow consumer drops events |
| rclone | 8 | Global buffer pool + async read-ahead | Weighted semaphore memory cap, pprof exposed | Global pool mutex contention |
| restic | 8 | Custom bufferPool + explicit GC tuning | sync.Pool wrapper with size limits, GOGC=50 | sync.Pool GC unpredictability |
| urfave-cli | 6 | Deferred flag value creation | Lazy PreParse, rune-by-rune stdin parsing | Defensive slice copies, no pooling |
| yq | 6 | Dual evaluator (stream + all-at-once) | Stream mode bounded memory | All-at-once mode linear growth |

## Approach Models

### 1. Library-First with Thin CLI Shell

**Repos**: age, rclone, restic, gh-cli

The core logic lives in a library package; the CLI wrapper is minimal. This pattern defers initialization to library calls and makes the binary naturally lean. age encrypts files with a library that implements STREAM-mode chunked encryption; the `cmd/age` wrapper is thin. rclone's backends are imported for side effects; `cmd/cmd.go` wires flags but defers backend creation.

**Evidence**: `age/internal/stream/stream.go:20` (chunk size constant), `rclone/fs/cache/cache.go:25-37` (sync.Once backend creation), `gh-cli/pkg/cmdutil/factory.go:27-42` (func() fields for lazy ops).

### 2. Factory Pattern with func() Fields

**Repos**: gh-cli, go-task, mitchellh-cli

Expensive operations (HTTP clients, config, git remotes, Kubernetes client) are stored as `func()` fields on a factory struct. The function is only called when the value is actually needed. gh-cli's factory (`pkg/cmdutil/factory.go:27-42`) is the canonical example: `HttpClient`, `BaseRepo`, `Remotes`, and `Branch` are all `func()` fields that get dereferenced lazily per command.

**Evidence**: `gh-cli/pkg/cmdutil/factory.go:29-35`, `go-task/executor.go:75,93` (sync.Once fuzzy model init).

### 3. Buffer Pooling with sync.Pool or Custom Wrappers

**Repos**: fzf, rclone, restic

These tools treat buffer allocation as a first-class concern. fzf pre-allocates slab arenas of `int16` and `int32` slices per worker thread and reuses them across scans (`src/constants.go:44-45`, `src/matcher.go:183-185`). rclone maintains a global pool of 64 × 1 MiB buffers with weighted semaphore cap (`lib/pool/pool.go:17-24,52-53`). Restic wraps `sync.Pool` in a custom `bufferPool` with size limits and oversize-buffer exclusion (`internal/archiver/buffer.go:24-46`).

**Evidence**: `fzf/src/matcher.go:183-185`, `rclone/lib/pool/pool.go:82-90`, `restic/internal/archiver/buffer.go:44-46`.

### 4. Streaming via Channels and bufio

**Repos**: lazygit, opencode, yq (stream mode), age

Command output streams line-by-line through buffered channels rather than being accumulated in memory. lazygit's `ViewBufferManager` uses `bufio.Scanner` with custom line splitting, sending lines through a channel as they're read (`pkg/tasks/tasks.go:189-217`). opencode streams LLM response events through typed channels (`internal/llm/provider/provider.go:56`). age's `EncryptWriter` and `DecryptReader` process 64KB chunks at a time with no full-file buffering.

**Evidence**: `lazygit/pkg/tasks/tasks.go:189-217`, `opencode/internal/llm/provider/provider.go:56`, `age/internal/stream/stream.go:195-219`.

### 5. Concurrency Bounding via Semaphore Channels

**Repos**: gdu, k9s, helm, restic, go-task

Heavy parallel work is bounded by a semaphore channel initialized to `2*GOMAXPROCS(0)` or similar. gdu's `concurrencyLimit` (`pkg/analyze/parallel.go:13`) prevents goroutine explosion on deep directory trees. restic's `fileWorkers` uses a bounded `ch chan<- saveFileJob` (`internal/archiver/file_saver.go:25,56-58`). go-task creates its semaphore only when `Concurrency > 0` (`setup.go:277-279`).

**Evidence**: `gdu/pkg/analyze/parallel.go:13`, `restic/internal/archiver/file_saver.go:56-58`.

### 6. Incremental Operations with Bounded Data Structures

**Repos**: yq (stream mode), dive, gdu, opencode

Large operations are broken into chunks that can be processed and released before the next chunk is loaded. yq's `StreamEvaluator` processes one document at a time and releases it after output (`pkg/yqlib/stream_evaluator.go:78-113`). gdu's `--top X`, `--depth N`, and `--read-from-storage` flags limit output scope (`cmd/gdu/app/app.go:229-232`). dive builds FileTrees per-layer and stacks them incrementally.

**Evidence**: `yq/pkg/yqlib/stream_evaluator.go:106`, `gdu/pkg/analyze/parallel.go:40-157`.

### 7. GC Tuning and Explicit Memory Management

**Repos**: restic, rclone, lazygit (debug mode)

Beyond passive reliance on Go's GC, some tools explicitly tune or trigger collection. Restic sets `GOGC=50` (`cmd/restic/main.go:128-133`) and calls `runtime.GC()` before prune/index operations (`cmd/restic/cmd_prune.go:233`). Rclone flushes its buffer pool every 5 seconds (`lib/pool/pool.go:23,156-166`). Lazygit logs `runtime.MemStats` every 10 seconds in debug mode (`pkg/gui/background.go:54-75`).

**Evidence**: `restic/cmd/restic/main.go:128-133`, `rclone/lib/pool/pool.go:337-349`, `lazygit/pkg/gui/background.go:70-72`.

## Pattern Catalog

### Lazy Initialization via sync.Once or sync.OnceValues

**What**: Expensive operations deferred to first use via `sync.Once` or `sync.OnceValues`.
**Repos**: age, chezmoi, gh-cli, go-task, helm, lazygit, opencode, rclone, restic, mitchellh-cli
**Why**: Avoids paying for config parsing, HTTP client creation, or crypto setup on commands that don't need them. `gh version` should not trigger git remotes or auth checks.
**When to copy**: Always. Every expensive operation that isn't required for the fastest commands (version, help) should be deferred.
**When overkill**: For operations that are always needed regardless of command (e.g., flag parsing), deferring adds complexity without benefit.
**Evidence**: `gh-cli/pkg/cmdutil/factory.go:27-42`, `chezmoi/internal/chezmoi/chezmoi.go:357-366`, `restic/internal/repository/repository.go:52-53`

### Buffer Pooling with sync.Pool

**What**: Pre-allocated buffers reused across operations to reduce allocation pressure.
**Repos**: fzf, rclone, restic, age (implicit chunk turnover)
**Why**: CLI invocations often do similar work repeatedly (encrypting multiple files, searching multiple times). Reusing buffers eliminates per-invocation allocation.
**When to copy**: When profiling shows allocation pressure in hot paths, or when building tools that process many files in a single run.
**When overkill**: For simple CLIs with one-shot operations, the complexity of pool management exceeds the benefit.
**Evidence**: `fzf/src/matcher.go:183-185`, `rclone/lib/pool/pool.go:17-24`, `restic/internal/archiver/buffer.go:24-46`

### Slab Allocation for Hot Data Structures

**What**: Pre-allocate array slices divided into fixed-size slabs, used to populate structs without per-item heap allocation.
**Repos**: fzf
**Why**: Eliminates heap fragmentation and reduces allocator overhead for fixed-capacity structures. Match slabs of `int16`/`int32` arrays are distributed to workers at search startup.
**When to copy**: When you have high-volume fixed-capacity data structures (indices, lookups, ring buffers) and have profiled that allocation is a bottleneck.
**When overkill**: When data structures vary in size or capacity requirements vary widely.
**Evidence**: `fzf/src/constants.go:44-45`, `fzf/src/chunklist.go:6-9`

### Chunked Streaming with Bounded Memory

**What**: Process data in fixed-size chunks (e.g., 64KB) rather than loading full dataset.
**Repos**: age, yq (stream mode), dive, rclone
**Why**: O(1) memory footprint regardless of input size. Enables processing of inputs larger than available RAM.
**When to copy**: For file processing, encryption, parsing, or any operation on unbounded input.
**When overkill**: For operations that genuinely need random access to the full dataset (e.g., sorting, global analysis).
**Evidence**: `age/internal/stream/stream.go:20`, `yq/pkg/yqlib/stream_evaluator.go:78-113`, `rclone/fs/asyncreader/asyncreader.go:51-64`

### Concurrency Bounding via Semaphore Channel

**What**: A buffered channel of empty structs limits simultaneous goroutines.
**Repos**: gdu, k9s, helm, restic, go-task
**Why**: Prevents goroutine explosion on deep trees or large operations. Keeps the system saturating cores without overwhelming it.
**When to copy**: Whenever you spawn goroutines for parallel sub-tasks. Always combine with bounded channels for work distribution.
**When overkill**: For trivially parallelizable work with very small problem sizes (few sub-tasks).
**Evidence**: `gdu/pkg/analyze/parallel.go:13`, `k9s/internal/pool.go:26-48`

### Profiling via pprof with Build Tags

**What**: pprof endpoints exposed via flags or environment variables, compiled only with debug/profile build tags.
**Repos**: fzf, rclone, restic, lazygit, helm
**Why**: Enables production debugging without a rebuild and without adding overhead in release builds.
**When to copy**: For any tool intended for long-running use or production deployment.
**When overkill**: For one-shot pipeline tools where the invocation is always short and the binary must stay minimal.
**Evidence**: `fzf/src/options_pprof.go:1-2`, `rclone/cmd/cmd.go:47-48`, `restic/internal/global/global_debug.go:19-40`

### Adaptive Height / Deferred Rendering

**What**: UI defers first render until enough data is available to fill the viewport.
**Repos**: fzf, lazygit
**Why**: Avoids flickering or partial renders that feel unpolished. Reduces work for small inputs.
**When to copy**: For TUIs where rendering has non-trivial cost and small inputs are common.
**When overkill**: For CLIs that output to stdout (pipelines) where streaming is preferred.
**Evidence**: `fzf/src/core.go:363-394`, `lazygit/pkg/gui/background.go:29-76`

### Background Refresh with Configurable Intervals

**What**: Periodic work (fetch, refresh, health-check) runs on configurable intervals in background goroutines.
**Repos**: lazygit, gdu, opencode
**Why**: Keeps UI up-to-date without blocking the main loop. Intervals are user-configurable for different workloads.
**When to copy**: For TUIs that display dynamic state (git repos, cluster status, chat messages).
**When overkill**: For batch-oriented tools where the operation starts, completes, and exits.
**Evidence**: `lazygit/pkg/gui/background.go:29-76`, `gdu/pkg/analyze/analyzer.go:84-98`

### Lazy Parser / Evaluator Initialization

**What**: Expression parsers, evaluators, or template engines are initialized on first use, not at startup.
**Repos**: age, yq, opencode, go-task
**Why**: Version, help, and completion commands should not pay for parsing infrastructure.
**When to copy**: For any CLI with expression languages, query engines, or template rendering.
**When overkill**: When the parser is trivial or always needed.
**Evidence**: `yq/pkg/yqlib/lib.go:13-19`, `age/cmd/age/age.go:476-484`, `go-task/executor.go:75`

### SQLite / Disk-Backed Persistence for Long Sessions

**What**: Messages, session state, or cached data stored in SQLite rather than in-memory.
**Repos**: opencode, gdu
**Why**: Keeps memory bounded regardless of session length. Enables resuming sessions. Trades query latency for bounded memory.
**When to copy**: For long-running interactive tools with unbounded data (chat histories, large file caches, session state).
**When overkill**: For short-lived invocations or when latency is critical (every query requires DB round-trip).
**Evidence**: `opencode/internal/message/message.go:37-42`, `opencode/internal/db/connect.go:39-54`

## Key Differences

### Library vs Application Constraint

**age, restic, rclone** are library-first: the core logic lives in packages importable without the CLI. This inherently forces lean initialization because the CLI wrapper must be thin. **k9s, lazygit, helm** are application-first: the CLI *is* the product, so initialization includes full Kubernetes client wiring or TUI framework setup, which is inherently expensive. This is not a quality difference but a product shape difference — a Kubernetes UI tool that deferred all client initialization would be architecturally strange.

### Streaming vs Buffered for Large Data

**age, yq (stream mode), lazygit, rclone (async reader)** stream large operations. **helm, dive, k9s** buffer manifest or image data in memory. The streaming tools handle 100x inputs gracefully; the buffered tools risk OOM on very large charts, images, or clusters. This is often a tradeoff between code simplicity (buffering is easier to write correctly) and scalability (streaming requires careful chunking and boundary handling).

### Profiling Exposure

**fzf, rclone, restic, lazygit, helm** expose pprof hooks or profiling flags. **age, chezmoi, dive, go-task, mitchellh-cli, opencode, urfave-cli, yq** do not. The tools with profiling are generally more mature or have higher operational stakes (rclone syncs production data; restic manages backups; helm runs in CI). The absence of profiling in age and yq reflects their simpler operational model — they are single-invocation processors, not long-running daemons.

### GC Tuning Sophistication

**restic** is the only tool that explicitly sets `GOGC=50` and calls `runtime.GC()` before memory-intensive operations. **rclone** flushes its buffer pool periodically to return memory to the OS. Most tools rely on Go's default GC implicitly. This is partly domain-driven: restic processes large blobs where GC pauses are noticeable; simple CLIs don't trigger enough allocation for GC to matter.

### Config Loading Strategy

**gh-cli** loads config eagerly in `Main()` before command dispatch, blocking even `gh version`. **helm** defers kubeconfig loading until a command actually needs the cluster. **rclone** defers backend creation entirely. The gh-cli approach surfaces config errors early but penalizes every invocation. The helm/rclone approach is faster for commands that don't need the cluster but defers failures.

## Tradeoffs

| Tradeoff | Benefit | Cost | Best-fit Context | Failure Mode |
|----------|---------|------|------------------|--------------|
| Lazy init via sync.Once | Fast startup for non-critical commands | First-use latency; complexity in error handling | Any CLI with commands that don't need all components | Error cached and repeated; no recovery |
| Buffer pooling | Reduces GC pressure; faster repeated operations | Pool management complexity; mutex contention | High-volume file processing; long-running tools | Pool starvation under memory pressure; unbounded growth without limits |
| Streaming architecture | O(1) memory; handles inputs > RAM | Boundary handling complexity; no random access | File processing; data pipeline tools | Corrupt output if chunk boundaries mishandled |
| Concurrency bounding | Prevents resource exhaustion; keeps system responsive | Limits parallelism; requires tuning | Deep directory trees; large parallel operations | Unbounded work queue if limit too high |
| Full manifest buffering | Simple code; no stream ordering concerns | Memory proportional to manifest size | Small to medium charts; simple deployments | OOM on large charts with many resources |
| Per-namespace informer factories | Scales with cluster size; isolation | Memory grows with watched namespaces | Production cluster monitoring | Namespace explosion exhausts memory |
| SQLite persistence | Bounded memory; session resumable | Query latency; DB write overhead | Long-running interactive sessions | DB locked; migration failures |
| pprof via build tags | Zero cost in release; debuggable in special builds | Requires rebuild to enable profiling | Production debugging of long-running tools | Profiling changes behavior slightly |

## Decision Guide

**Choose library-first architecture if**: Your core logic could be reused without the CLI. This forces lean CLI initialization automatically.

**Choose factory func() fields if**: You have multiple expensive operations (HTTP, config, git, cluster) that not every command needs. This is the standard Go lazy-init pattern and works at any scale.

**Choose buffer pooling if**: Profiling shows allocation pressure in hot paths. Don't add pooling speculatively — measure first. Custom wrappers (like restic's `bufferPool`) give more control than raw `sync.Pool`.

**Choose streaming if**: Your tool processes unbounded input (files, streams, documents). Chunked streaming with bounded memory is the only way to handle 100x scale without OOM.

**Choose concurrency bounding always**: Always. Unbounded goroutines on deep directory trees will exhaust resources. Semaphore channels with `2*GOMAXPROCS(0)` is a good starting point.

**Choose explicit profiling hooks if**: Your tool runs in production, handles valuable data, or is mission-critical. Build-tag gating keeps release binaries lean.

**Choose GC tuning (GOGC, runtime.GC) if**: You're building a tool like restic that processes large blobs and has observable GC pauses. For typical CLI invocations under 10 seconds, default GC is fine.

## Practical Tips

1. **Profile before optimizing**. Add pprof hooks early so you can diagnose without rebuilding. Build-tag gate them for zero cost in release.

2. **Defer everything possible past argument parsing**. `sync.Once`, `sync.OnceValues`, or plain nil-checks on `func()` fields are the standard patterns. The only things that should happen before `Run()` are flag registration and minimal struct creation.

3. **Reuse buffers in hot paths**. Even a simple `make([]byte, 64*1024)` reused across a loop eliminates per-iteration allocation. `sync.Pool` for more complex structures.

4. **Stream large file operations**. 64KB chunk size is a proven default (age, and common in Go stdlib). Process chunks incrementally rather than loading full files.

5. **Bound goroutines with semaphore channels**. `make(chan struct{}, 2*runtime.GOMAXPROCS(0))` and acquire before spawning a goroutine, release when done.

6. **Use `bytes.Buffer` with pre-allocation** when buffering is unavoidable. `bytes.NewBufferSize(capacity)` avoids early reallocation.

7. **Set `GOGC` lower for memory-intensive operations**. restic uses 50 instead of default 100. This trades CPU for memory, appropriate when you know your working set.

8. **Make concurrency configurable**. `--checkers`, `--transfers`, `--threads` flags let users tune for their hardware. Defaults should saturate a modern SSD without overwhelming CPUs.

## Anti-Patterns / Caution Signs

1. **Eager initialization of rarely-needed components**. If `gh version` triggers config file reading and HTTP client creation, that's a smell. Version and help should be nearly instant.

2. **Unbounded in-memory accumulation**. Loading all documents, all layers, or all releases into memory before processing. Use streaming or chunking.

3. **No concurrency limits on goroutine-per-subdir patterns**. Without semaphore bounding, a directory tree with 100,000 subdirs creates 100,000 goroutines.

4. **Global mutex on hot paths**. Buffer pools, caches, or accumulators that require a mutex on every access become bottlenecks under parallelism.

5. **No cleanup on error paths**. Deferred `RemoveAll` on temp files, `Close()` on handles, and `cancel()` on contexts must cover error paths, not just happy paths.

6. **Table cloning on every read** (`k9s/internal/model/table.go:200`). Doubling memory pressure on every refresh cycle when a pointer would suffice for read-only access.

7. **Per-command HTTP client creation without connection reuse** (`gh-cli`). Fine for scripts (each `gh` is a new process) but means no pooling within a single session running multiple commands.

## Notable Absences

### No sync.Pool in most repos

Only fzf, rclone, and restic use `sync.Pool` or custom buffer pools. Most tools allocate per-operation and rely on Go's GC. This is acceptable for single-invocation CLIs but would become a problem for long-running tools processing many files.

### No benchmark infrastructure in most repos

Only restic (96 benchmark tests) and fzf (implicit via pprof) have systematic performance regression detection. Most tools rely on manual testing or user reports.

### No mmap usage

Despite mmap being the traditional way to process large files with bounded memory, none of the studied repos use it. rclone's optional mmap is for buffer pool pages, not file content.

### No NUMA awareness

For a study of performance-focused tools, none showed evidence of NUMA-aware allocation or huge page configuration. Relevant only for very large working sets.

## Per-Repo Notes

| Repo | Key Performance Insight |
|------|-------------------------|
| age | STREAM encryption with 64KB chunks is the clearest example of O(1) memory in the cohort. `lazyOpener` and `lazyScryptIdentity` are textbook lazy init patterns. |
| chezmoi | `sync.OnceValues` pervades the source state walking. Concurrent directory traversal via `errgroup` is well-implemented. Archive buffering in `WalkArchive` is the main memory concern. |
| dive | Streaming tar parsing per layer is good. Tree stacking for efficiency analysis undoes some of the streaming benefit — large images will stress memory. |
| fzf | The most sophisticated memory architecture: slab allocation, chunk lists, bitmap cache, query cache with selectivity filtering. SIMD `indexByte` is a targeted optimization. |
| gdu | PGO build (`default.pgo`) indicates production optimization discipline. Bounded goroutine pool and iterator pattern for file traversal are well-designed. Goroutine leak risk on error paths is a reliability concern. |
| gh-cli | Factory pattern is the correct approach for a large CLI with 60+ subcommands. Eager config loading is the one sour spot. Streaming table printer is underappreciated. |
| go-task | 128KB buffer reuse in checksum is simple and effective. Watch mode debouncing and task deduplication are solid incremental operation patterns. |
| helm | Lazy Kubernetes client is well-implemented but client-go import at startup adds overhead. Manifest buffering is the main scalability concern. Profiling via env vars is a good model. |
| k9s | Synchronous K8s connectivity check at startup is a deliberate tradeoff (correctness over speed). Sliding log window is a good bounded-memory pattern. Table cloning is wasteful. |
| lazygit | Line-by-line streaming via bufio.Scanner and channels is the most explicit streaming architecture. String pooling and background refresh intervals show attention to memory. Pipe set cache lacks eviction. |
| mitchellh-cli | The framework itself is minimal and fast. Performance is largely determined by the application built on it. The radix tree lookup is efficient. |
| opencode | SQLite-backed message persistence is the most distinctive pattern — a coding assistant that doesn't load conversation history into memory. Event streaming via pub/sub with slow-consumer drops is pragmatic. |
| rclone | Global buffer pool with semaphore cap is the most sophisticated memory management in the cohort. Async read-ahead is well-implemented. Profiling is first-class. |
| restic | GC tuning (GOGC=50, runtime.GC calls) and custom bufferPool wrapper show the deepest performance engineering. 96 benchmark tests validate the approach. |
| urfave-cli | The framework is lightweight and startup is fast. Defensive slice copies add allocation overhead. No profiling is a gap for production debugging. |
| yq | Dual evaluator architecture (stream vs all-at-once) is the right answer for supporting both memory-efficient and format-requiring modes. All-at-once memory growth is the main concern. |

## Open Questions

1. **Why does no library-first tool use `sync.Pool`?** age, rclone (for non-buffer-pool paths), and restic all have hot paths that could benefit from pooling, yet only restic implements a custom wrapper. Is the Go GC good enough for single-invocation CLIs?

2. **Should CLI frameworks expose pooling primitives?** urfave-cli and mitchellh-cli could offer optional `sync.Pool`-backed flag value reuse, but they don't. The ecosystem may be undervaluing framework-level pooling support.

3. **Is adaptive height worth the complexity?** fzf's deferred terminal start (`src/core.go:363-394`) is a nuanced optimization that trades instant-on for better fullscreen utilization. Does data support that users prefer this?

4. **Should config loading be lazy or eager?** gh-cli loads config eagerly and this is acknowledged as a tradeoff. Is there a pattern that gets early error surfacing *and* fast `version`/`help`?

5. **Why does k9s not expose pprof?** A Kubernetes UI tool running against production clusters would benefit enormously from profiling hooks. The absence suggests either oversight or deliberate omission for security/complexity reasons.

## Evidence Index

Every evidence citation from the per-repo reports, consolidated by area:

### Lazy Initialization

- `gh-cli/pkg/cmdutil/factory.go:27-42` (func() fields)
- `chezmoi/internal/chezmoi/chezmoi.go:357-366` (sync.OnceValues)
- `restic/internal/repository/repository.go:52-53` (sync.Once for encoder/decoder)
- `helm/pkg/action/lazyclient.go:35-53` (lazyClient sync.Once)
- `opencode/cmd/root.go:195-207` (MCP tools async fetch)
- `age/cmd/age/age.go:476-484` (lazyScryptIdentity)

### Buffer Pooling / Memory Management

- `fzf/src/constants.go:44-45` (slab sizes)
- `fzf/src/matcher.go:183-185` (slab reuse per worker)
- `rclone/lib/pool/pool.go:17-24,52-53` (global buffer pool with semaphore cap)
- `restic/internal/archiver/buffer.go:24-46` (custom bufferPool wrapper)
- `restic/cmd/restic/main.go:128-133` (GOGC=50)
- `rclone/lib/pool/pool.go:337-349` (pool flusher every 5s)
- `lazygit/pkg/gui/background.go:54-75` (runtime.MemStats logging)

### Streaming Patterns

- `age/internal/stream/stream.go:20` (64KB chunk size)
- `age/internal/stream/stream.go:195-219` (EncryptWriter streams)
- `lazygit/pkg/tasks/tasks.go:189-217` (bufio.Scanner line streaming)
- `opencode/internal/llm/provider/provider.go:56` (LLM event channel streaming)
- `yq/pkg/yqlib/stream_evaluator.go:78-113` (document-by-document)
- `rclone/fs/asyncreader/asyncreader.go:51-64` (async read-ahead)

### Concurrency Bounding

- `gdu/pkg/analyze/parallel.go:13` (concurrencyLimit = 2*GOMAXPROCS)
- `k9s/internal/pool.go:26-48` (WorkerPool semaphore)
- `restic/internal/archiver/file_saver.go:56-58` (bounded ch chan saveFileJob)
- `go-task/setup.go:277-279` (semaphore only when Concurrency > 0)

### Profiling Hooks

- `fzf/src/options_pprof.go:1-2,15-73` (build-tagged pprof)
- `rclone/cmd/cmd.go:47-48,438-481` (CPU/memory profile flags)
- `rclone/fs/rc/rcserver/rcserver.go:128` (RC server pprof endpoint)
- `restic/internal/global/global_debug.go:19-40,58-64` (profile flags)
- `lazygit/pkg/app/entry_point.go:8,167-172` (--profile flag)
- `helm/pkg/cmd/profiling.go:34-36,41-54,60-91` (HELM_PPROF_* env vars)
- `gdu/cmd/gdu/app/app.go:75,577-586` (Profiling flag for pprof HTTP server)

---

Generated by protocol `study-areas/14-performance.md`.