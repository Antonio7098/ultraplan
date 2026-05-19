# Source Analysis: cli

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-19 |

## Summary

The CLI is a command-line tool wrapping the GitHub API. It uses Cobra for command dispatch, delegates HTTP transport to the shared `go-gh` library, and exposes both a user-facing generic `api` command (`gh api`) and typed high-level commands (`gh issue list`, `gh pr status`, etc.). Routes are organized by GitHub resource domain rather than by API version, since the CLI does not host its own HTTP server — it acts exclusively as an API client. Pagination uses cursor-based Link header parsing for REST and endCursor for GraphQL. Auth is enforced via a `PersistentPreRunE` hook on the root command rather than middleware chaining. No streaming endpoints exist (SSE/WebSocket/chunked), and API versioning is delegated entirely to the GitHub API via the `X-GitHub-Api-Version` header set to `2022-11-28`.

## Rating

**5/10 — Basic implementation with gaps**

The CLI has no HTTP server of its own, so it scores against the dimension's questions from the vantage point of an API client rather than an API server. Its client-side design is functional and well-structured, but the absence of a server surface means several dimension criteria (middleware layering, per-route middleware, API versioning) are inapplicable or delegated to external infrastructure. The generic `gh api` command provides raw API access, but there is no consistent error contract beyond what `go-gh` provides, pagination defaults vary by context, and there is no streaming.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP framework | Uses `go-gh` (`github.com/cli/go-gh/v2`) for GraphQL and REST client transport | `go.mod:21` |
| Route registration | Cobra `cmd.AddCommand(...)` in `root.go` — commands register themselves | `pkg/cmd/root/root.go:133-177` |
| Auth enforcement | `PersistentPreRunE` on root checks auth before most commands | `pkg/cmd/root/root.go:82-95` |
| Auth annotation | `skipAuthCheck` annotation disables auth per-command or per-flag | `pkg/cmdutil/auth_check.go:11-27` |
| Error types | `FlagError`, `SilentError`, `CancelError`, `PendingError`, `NoResultsError` | `pkg/cmdutil/errors.go:12-70` |
| HTTPError wrapper | Wraps `go-gh` errors, adds scopes suggestion | `api/client.go:46-53` |
| GraphQL error wrapper | `GraphQLError` wraps `go-gh` GraphQL errors | `api/client.go:42-44` |
| Pagination — REST | `Link` header parsing via `linkRE` regex, `findNextPage()` | `api/client.go:27`, `pkg/cmd/api/pagination.go:17-24` |
| Pagination — GraphQL | `findEndCursor()` parses `pageInfo.endCursor` from JSON | `pkg/cmd/api/pagination.go:26-92` |
| Default page size | Default `per_page=100` for REST paginate mode | `pkg/cmd/api/pagination.go:94-110` |
| Issue list default limit | `30` issues default for `gh issue list` | `pkg/cmd/issue/list/list.go:110` |
| Generic API command | `gh api <endpoint>` supports `--paginate`, `--slurp`, `--input`, `--preview` | `pkg/cmd/api/api.go:64-302` |
| API versioning | `X-GitHub-Api-Version: 2022-11-28` constant | `api/client.go:18-19` |
| Auth token header | `AddAuthTokenHeader` round tripper inserts `Authorization: token <token>` | `api/http_client.go:108-127` |
| JSON export | `AddJSONFlags` supports `--json`, `--jq`, `--template` on list commands | `pkg/cmdutil/json_flags.go:26-33` |
| Preview headers | `previewNamesToMIMETypes` builds `application/vnd.github.<name>-preview+json` | `pkg/cmd/api/api.go:702-708` |
| Error response parsing | `parseErrorResponse` extracts `message` and `errors` from JSON body | `pkg/cmd/api/api.go:629-700` |
| Scopes suggestion | `generateScopesSuggestion` generates auth refresh hint | `api/client.go:209-259` |
| HTTP mock registry | `httpmock.Registry` for test stubbing | `pkg/httpmock/registry.go:18-113` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized by **resource domain** (issue, pr, repo, release, workflow, etc.) in `pkg/cmd/<resource>/`. Each subcommand lives in its own directory (e.g., `pkg/cmd/issue/list/`). Registration happens in `pkg/cmd/root/root.go` via explicit `cmd.AddCommand(...)` calls grouped by functional area (`Core commands`, `GitHub Actions commands`, `Extension commands`). There is **no API versioning** at the CLI level — versioning is delegated to the GitHub API via the `X-GitHub-Api-Version` header (`api/client.go:19`), hardcoded to `2022-11-28`. The CLI does not host its own HTTP server, so routing structure is purely command-line argument parsing, not network routing.

### 2. Is there a consistent error contract clients can depend on?

**Partially.** The CLI defines local error sentinel types (`FlagError`, `SilentError`, `CancelError`, `PendingError`, `NoResultsError`) in `pkg/cmdutil/errors.go:12-70` for its own command-layer errors, but these are not serialized as HTTP response contracts. API errors are wrapped through `go-gh` and surfaced with scope-suggestion hints (`api/client.go:46-53`). The `gh api` command's `parseErrorResponse` (`pkg/cmd/api/api.go:629-700`) extracts `message` and `errors` fields from JSON bodies, but the format varies — sometimes a top-level `message`, sometimes an array of `errors` objects, sometimes plain strings. There is **no shared `ErrorResponse` schema** that all errors conform to; callers must handle multiple shapes. This is a gap relative to a well-designed HTTP API surface.

### 3. How does the API handle pagination at scale without performance cliffs?

The CLI uses **cursor-based pagination** via the standard `Link` header for REST (`pkg/cmd/api/pagination.go:17-24`), parsing `rel="next"` URLs. For GraphQL, it extracts `pageInfo.endCursor` from response JSON (`pkg/cmd/api/pagination.go:26-92`). The generic `gh api --paginate` command adds `per_page=100` by default (`pkg/cmd/api/pagination.go:109`). Individual commands have their own defaults — `gh issue list` defaults to `30` (`pkg/cmd/issue/list/list.go:110`). The CLI has no explicit mechanism to guard against performance cliffs at scale; it relies on the underlying GitHub API's behavior. The `paginatedArrayReader` (`pkg/cmd/api/pagination.go:112-150`) handles incremental JSON array rendering across pages, and `jsonArrayWriter` (`pkg/cmd/api/pagination.go:152-208`) supports `--slurp` mode to aggregate pages into a single JSON array. No evidence of request batching, parallel page fetching, or rate-limit handling beyond what `go-gh` provides.

### 4. What middleware is global vs per-route, and how is layering managed?

Since the CLI is not an HTTP server, "middleware" takes a different meaning. **Auth check** is the primary global enforcement, implemented as a `PersistentPreRunE` hook on the root Cobra command (`pkg/cmd/root/root.go:82-95`) that runs before every command unless marked with `DisableAuthCheck`. This is the only true global "pre-hook." There is **no middleware chain** in the server-side sense. HTTP-level concerns are handled via transport wrappers: `AddAuthTokenHeader` (`api/http_client.go:108-127`) injects auth, `AddCacheTTLHeader` (`api/http_client.go:97-105`) controls caching, and `telemetryDisablerTransport` (`api/http_client.go:160-169`) disables telemetry for Enterprise. These are composed in `NewHTTPClient` (`api/http_client.go:33-87`) but there is no per-route middleware registration. The auth check annotation system (`pkg/cmdutil/auth_check.go`) allows fine-grained disabling but there is no middleware ordering/layering model.

### 5. How is API versioning handled without duplicating handlers?

**Not applicable in the traditional sense.** The CLI does not maintain multiple API versions — it sends a fixed `X-GitHub-Api-Version: 2022-11-28` header (`api/client.go:19`) and relies on GitHub's API stability. There is no handler duplication because there is no handler versioning: the CLI calls GitHub's API directly, and feature detection (`internal/featuredetection/`) is used to probe for capabilities (e.g., advanced issue search) at runtime rather than maintaining separate code paths for API versions. This is a pragmatic client-side approach but differs from server-side API versioning strategies.

## Architectural Decisions

1. **HTTP transport delegation to go-gh**: The CLI does not implement its own low-level HTTP transport; it wraps `github.com/cli/go-gh/v2` (`go.mod:21`). This defers pagination, error handling, and transport configuration to a shared library. The trade-off is reduced control over HTTP semantics and difficulty debugging transport-level issues.

2. **No HTTP server**: The CLI is purely a client. This eliminates concerns about server-side routing, middleware, and versioning but means the dimension's criteria must be evaluated from a client perspective.

3. **Auth as pre-run hook vs transport layer**: Auth is enforced at the command level (`PersistentPreRunE` in `pkg/cmd/root/root.go:82-95`) rather than as a transport-layer concern. This means unauthenticated commands can still create an HTTP client, but most commands will fail fast without auth.

4. **Feature detection over API versioning**: Rather than versioning handlers, the CLI uses `internal/featuredetection/` to detect server capabilities at runtime. This avoids handler duplication but adds complexity in commands that must branch on features.

5. **Error contract delegation**: The CLI does not define its own HTTP error response schema. It wraps `go-gh` errors and adds scope suggestions, but the underlying error format varies by endpoint.

## Notable Patterns

- **Generic API command** (`gh api <endpoint>`): A power-user feature that exposes raw GitHub API access with support for pagination, GraphQL, preview headers, and field filtering (`pkg/cmd/api/api.go:64-302`). This is a pattern worth studying as it provides API surface extensibility without adding typed commands.

- **Pagination readers/writers**: `paginatedArrayReader` and `jsonArrayWriter` (`pkg/cmd/api/pagination.go:112-241`) enable streaming JSON aggregation across paginated requests, handling edge cases like empty arrays and delimiter insertion. This is a well-crafted pattern for CLI output.

- **Options + Factory pattern**: Every command follows `NewCmdXxx(f *cmdutil.Factory, runF func(*XxxOptions) error)` with a separate `xxxRun(opts)` function (`AGENTS.md:47-55`). This enables test injection and lazy initialization of dependencies like `BaseRepo` and `Remotes`.

- **Transport wrapper composition**: HTTP client transport is built by composing `AddAuthTokenHeader`, `AddCacheTTLHeader`, `telemetryDisablerTransport`, and `ExtractHeader` in `NewHTTPClient` (`api/http_client.go:33-87`). This is a clean composition pattern.

- **ExportData interface**: The `exportable` interface (`pkg/cmdutil/json_flags.go:292-294`) and `ExportData` method on API types (`api/export_pr.go`) allow commands to define field subsets for JSON output, decoupled from the full data model.

## Tradeoffs

- **No streaming**: The CLI has no SSE, WebSocket, or chunked response handling. For long-running operations (e.g., log streaming), it likely relies on polling or一次性 HTTP requests rather than true push streams.

- **Inconsistent pagination defaults**: `gh issue list` defaults to 30 results (`pkg/cmd/issue/list/list.go:110`), while `gh api --paginate` uses 100 (`pkg/cmd/api/pagination.go:109`). This inconsistency could surprise users.

- **Error contract variety**: API error responses are parsed in multiple shapes (`pkg/cmd/api/api.go:629-700`), making it hard for callers to have a single error-handling strategy.

- **Feature detection complexity**: Runtime capability detection adds branching logic to commands and requires ongoing maintenance as GitHub deprecates old API versions.

- **Auth as hook vs transport**: Enforcing auth at the command layer rather than transport layer means HTTP clients can be created without auth, potentially leaking auth attempts before the check fires.

## Failure Modes / Edge Cases

- **Auth token refresh not automatic**: The CLI does not auto-refresh tokens; it surfaces a suggestion to run `gh auth refresh` when scopes are insufficient (`api/client.go:251-255`).

- **Pagination with `--slurp` requires `--paginate`**: Mutually exclusive flags in the generic `api` command prevent misuse (`pkg/cmd/api/api.go:264-266`).

- **Concurrent stub matching in httpmock**: The TODO comment at `pkg/httpmock/registry.go:91-95` notes that the legacy layer allows multiple stubs to match, indicating an area of technical debt in test infrastructure.

- **GraphQL pagination endCursor extraction**: The `findEndCursor` function (`pkg/cmd/api/pagination.go:26-92`) uses a custom JSON parser rather than full unmarshaling, which could be fragile if response structure varies.

- **Silent auth failures**: `SilentError` exits with code 1 but no message (`pkg/cmdutil/errors.go:35`), which can make debugging auth issues difficult.

## Future Considerations

1. **Standardized error contract**: A shared `ErrorResponse` type that normalizes GitHub API error shapes would improve client reliability and make error handling more predictable.

2. **Streaming endpoints**: If GitHub adds SSE or streaming endpoints for long-running operations, the CLI would benefit from native streaming support rather than polling.

3. **Per-command pagination defaults**: A shared `PaginationOptions` struct with consistent defaults across commands would reduce user confusion.

4. **Middleware abstraction**: If the CLI ever gains HTTP server capabilities (e.g., a local dev server), the transport-layer composition pattern in `NewHTTPClient` could be extended into a proper middleware chain.

5. **Transport-level auth enforcement**: Moving the auth check from `PersistentPreRunE` to the transport layer would prevent HTTP clients from being created without valid auth context.

## Questions / Gaps

- **No evidence of rate-limit handling**: No code found that reads or respects `X-RateLimit-*` headers. This could cause aggressive clients to hit rate limits without backoff.

- **No evidence of circuit breakers**: No evidence of bulkhead/circuit-breaker patterns in HTTP transport.

- **No evidence of request tracing**: No structured tracing (e.g., OpenTelemetry) hooks in the HTTP transport.

- **No evidence of retry policies**: Retry logic, if any, is delegated entirely to `go-gh`.

- **No evidence of WebSocket/SSE**: The CLI has no streaming endpoint support; all long operations use polling or一次性 requests.

---

Generated by `dimensions/04-http-api-surface.md` against `cli`.