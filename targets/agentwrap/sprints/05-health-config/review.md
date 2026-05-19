# Sprint Review: Health Checks and Configuration Validation

> Sprint: `05-health-config`
> Target: agentwrap
> Review Date: 2026-05-19

## Summary

- **Sprint reviewed:** Health Checks and Configuration Validation
- **Files and packages examined:**
  - `agentwrap/health.go`, `agentwrap/health_test.go` (SDK health contract, aggregation, required checks)
  - `agentwrap/config.go`, `agentwrap/config_test.go` (effective config, precedence, validation)
  - `agentwrap/redact.go`, `agentwrap/redact_test.go` (secret redaction helpers)
  - `agentwrap/runtime.go` (RunRequest.RequireHealth)
  - `agentwrap/errors.go` (error categories and default classification)
  - `agentwrap/doc.go` (updated package docs)
  - `agentwrap/opencode/health.go`, `agentwrap/opencode/health_test.go` (OpenCode health probes)
  - `agentwrap/opencode/runtime.go` (requiredPreflight in StartRun)
  - `agentwrap/opencode/options.go` (Runtime struct, NewRuntime, Capabilities)
  - `agentwrap/opencode/integration_test.go` (gated real health smoke)
  - `agentwrap/opencode/runtime_test.go` (adapter tests with fake runners)
  - `targets/agentwrap/DECISIONS.md` (DEC-014, DEC-015)
- **Review date:** 2026-05-19

## Findings By Decision Area

### Decision Area 1: SDK Health API And Health States

- **Decision:** Add runtime-neutral `HealthChecker` interface with typed check IDs, health states, per-check results, aggregate reports, and classified `SDKError` values, rather than extending `Runtime` or keeping health as OpenCode-only helpers.
- **Status:** Matches
- **Evidence Check:** Implementation reflects resilience-policies evidence (fail-fast on unrecoverable failures, typed health states) and resilience final report (preflight validation gap, startup probe guidance). Avoids baked-in retry/fallback.
- **Code Evidence:**
  - `health.go:9-11` — `HealthChecker` interface with `CheckHealth(context.Context, HealthCheckRequest) (HealthReport, error)`
  - `health.go:14-25` — Health check ID constants (runtime_available, structured_output, workdir, config, provider, model, authentication, runtime_paths)
  - `health.go:30-38` — Health status values (ready, degraded, transient_failure, unrecoverable_failure, unknown, skipped, unsupported)
  - `health.go:43-47` — Health severity (info, warn, error)
  - `health.go:50-62` — `HealthCheckRequest` with CheckIDs and RequiredChecks
  - `health.go:64-72` — `HealthReport` with EffectiveConfig, Results, OverallStatus, NativeMetadata
  - `health.go:74-85` — `HealthResult` with status, severity, safe detail, debug detail, native metadata, and optional SDKError
  - `health.go:88-117` — `AggregateHealth` and `OverallHealthStatus` with correct status ordering (unrecoverable > transient > degraded > unknown > skipped/unsupported > ready)
  - `health.go:121-156` — `RequiredHealthFailure` returning classified errors for non-ready/non-skipped required checks
  - `health.go:159-176` — `ErrorForHealthStatus` constructing categorized errors with policy-readable flags
- **Issue:** None. The health contract is clean, properly typed, and runtime-neutral.
- **Recommendation:** None.

### Decision Area 2: Effective Configuration Model And Precedence

- **Decision:** Define source-aware effective config with explicit precedence (runtime defaults < adapter options < environment/config provider < caller request overrides) without choosing a config file format. Use field-level source metadata and immutable post-merge results.
- **Status:** Matches
- **Evidence Check:** Reflects configuration-management final report (explicit precedence, centralized config struct, post-merge validation, immutable config, avoiding direct env bypasses outside config/probe layer). TRD's no-format constraint respected.
- **Code Evidence:**
  - `config.go:10-19` — `ConfigSource` labels: default, adapter_option, environment, config_provider, caller_request, runtime_discovered
  - `config.go:22-26` — `ConfigValue[T]` with generic value type, source provenance, and set indication
  - `config.go:29-33` — `SecretValue` reporting presence and source without exposing content
  - `config.go:36-49` — `EffectiveConfig` with all expected fields plus Secrets array
  - `config.go:52-65` — `ConfigLayer` for source-specific input
  - `config.go:68-107` — `MergeEffectiveConfig` applying layers low-to-high precedence, with correct field-level override
  - `config.go:110-130` — `ValidateEffectiveConfig` for post-merge validation of empty required fields, negative timeout, etc.
  - `config.go:133-157` — `CallerConfigLayer` converting RunRequest to highest-precedence ConfigLayer
- **Issue:** None. The config model is source-aware, format-neutral, and properly tested.
- **Recommendation:** None.

### Decision Area 3: OpenCode Health And Config Probes

- **Decision:** Implement layered OpenCode probes: executable resolution/version, run --help structured-output detection, debug config, debug paths, providers list, models --verbose with optional --refresh, workdir validity, and unknown/degraded results when readiness cannot be proven cheaply.
- **Status:** Matches
- **Evidence Check:** Implements resilience report recommendations (preflight without billable work). Uses local OpenCode help evidence for command surfaces. Classifies probe failures appropriately.
- **Code Evidence:**
  - `opencode/health.go:14` — Compile-time `HealthChecker` interface satisfaction
  - `opencode/health.go:17-71` — `CheckHealth` building report with effective config, native metadata (redacted env), config validation, and per-check loop with context timeout
  - `opencode/health.go:73-146` — `runHealthCheck` dispatch for all check IDs
  - `opencode/health.go:76` — `--version` probe → `ErrorRuntimeUnavailable`
  - `opencode/health.go:78-87` — `run --help` probe checking for `--format` and `json` in output → `ErrorHealth` unrecoverable if missing
  - `opencode/health.go:88-100` — Workdir validation via `os.Stat` → `ErrorConfiguration` unrecoverable
  - `opencode/health.go:101-104` — `debug config` → `ErrorHealth`
  - `opencode/health.go:105-106` — `debug paths` → `ErrorHealth`
  - `opencode/health.go:107-122` — `providers list` probe with provider name matching → `ErrorProviderUnavailable` unrecoverable, authentication unknown if no auth/login/key evidence
  - `opencode/health.go:123-141` — `models [provider] --verbose` with optional `--refresh` → `ErrorModelUnavailable` unrecoverable if model not found
  - `opencode/health.go:142-145` — Default: unsupported check
  - `opencode/health.go:148-178` — `probeCommand` with process runner, stdout/stderr collection, exit code checking → `HealthTransientFail` for non-zero exit
  - `opencode/health.go:180-189` — `readProbeOutput` with bounded stderr limit
  - `opencode/health.go:206-238` — `effectiveConfig` building from default → adapter option → caller layers
  - Native metadata redacted via `RedactMetadata` and `RedactString` throughout
- **Issue:** `HealthCheckID` constants do not include a `session_list` probe that reasoning mentioned as optionally available. This is acceptable — `session list` is not in the plan's core probe surface and belongs to Sprint 4 follow-up diagnostics.
- **Recommendation:** None.

### Decision Area 4: Fail-Fast StartRun Integration

- **Decision:** Add caller-selected required health checks before process start in `StartRun`, returning classified errors without creating a run or cleanup path when required unrecoverable checks fail.
- **Status:** Matches
- **Evidence Check:** Implements PRD success metrics (missing provider/model fails before expensive work) and TRD preflight requirements (required checks block, classified errors). Follows Sprint 4 separation: no cleanup needed because no process launched.
- **Code Evidence:**
  - `runtime.go:37` — `RunRequest.RequireHealth []HealthCheckID`
  - `opencode/runtime.go:24-26` — `requiredPreflight` called before process start in `StartRun`
  - `opencode/runtime.go:69-97` — `requiredPreflight` calling `CheckHealth` with required checks and mapping through `RequiredHealthFailure`
  - `opencode/health_test.go:46-63` — `TestStartRunRequiredPreflightBlocksProcessStart` verifying preflight error and zero process starts for failing check
  - `opencode/health_test.go:80-145` — Table-driven test covering debug config failure, missing provider, missing model, unsupported structured output
  - `opencode/integration_test.go:282-322` — Real health smoke testing preflight allows run and preflight blocks invalid model
- **Issue:** None. Required preflight correctly blocked before process launch.
- **Recommendation:** None.

## Pattern And Anti-Pattern Check

### Patterns Followed

| Pattern | File Reference |
| --- | --- |
| Fail-fast unrecoverable setup validation | `health.go` `RequiredHealthFailure`, `opencode/runtime.go` `requiredPreflight` |
| Typed health/config errors | `health.go` `ErrorForHealthStatus`, `errors.go` error categories |
| Explicit precedence | `config.go` `MergeEffectiveConfig` with ordered layers |
| Post-merge validation | `config.go` `ValidateEffectiveConfig` |
| Immutable effective config | `config.go` `EffectiveConfig` — no mutators after `MergeEffectiveConfig` |
| Source-aware fields | `config.go` `ConfigValue.Source`, `ConfigSource` labels |
| Secret redaction | `redact.go` `RedactString`, `RedactMetadata`, `SecretFromEnv`, `RedactEnv` |
| Fake-first tests | `opencode/health_test.go` `fakeRunner`/`fakeProcess`, `opencode/runtime_test.go` same |
| Gated external runtime smoke | `opencode/integration_test.go` `AGENTWRAP_OPENCODE_HEALTH_SMOKE=1` |
| User detail vs diagnostic separation | `health.go` `HealthResult.UserDetail` vs `DebugDetail`, redacted by default |

### Anti-Patterns Avoided

| Anti-Pattern | Status |
| --- | --- |
| CLI command scope | Not added — SDK-only health/config API |
| Direct env reads bypassing config layer | Not present — env enters through adapter options or `SecretFromEnv` |
| Silent config errors | Not present — validation returns classified errors |
| Secret leaks in normal output | Not present — redaction applied in `healthResult`, `probeCommand`, metadata |
| Pretending unknown readiness is healthy | Not present — auth unknown when unproven, model/provider unrecoverable when missing |
| Starting real work for health checks | Not present — probes use non-run commands |
| Hard-coded retry/fallback in adapter | Not present — health returns policy-readable flags only |

### Patterns Missed

None. All patterns from the evidence are followed.

## Test And Quality Gate Assessment

### Tests Examined

All `go test ./...` pass (cached), covering:
- **Unit tests:** Health report aggregation, required-check blocking, error classification, effective config precedence, post-merge validation, redaction (API keys, bearer tokens, authorization headers, env values)
- **Fixture tests:** Fake OpenCode probes for ready, missing executable, unsupported structured output, missing provider, missing model, failed `debug config`, unknown authentication, secret redaction in native metadata
- **Integration tests:** Process/probe seam tests proving preflight blocks process start on required unrecoverable failure, no process start after required preflight failure
- **Real runtime smoke (gated):** `AGENTWRAP_OPENCODE_HEALTH_SMOKE=1` runs full probe suite and required-preflight allow/block scenarios; confirmed passing on 2026-05-19

### Quality Gates

| Gate | Status |
| --- | --- |
| Missing unrecoverable setup fails before a run starts | Met — `requiredPreflight` returns classified error before `opencode run` |
| Effective configuration can be inspected | Met — `EffectiveConfig` with field-level source metadata and `SecretValue` redaction |
| Sensitive values are not printed in normal output | Met — redaction applied in health results, metadata, and env diagnostics |
| Health errors are typed and policy-readable | Met — `HealthResult.Err` is `*SDKError`, `ErrorForHealthStatus` sets retryable/fallbackable/user-actionable/unrecoverable flags |

### Deferrals

- **Real OpenCode health smoke:** Gated behind `AGENTWRAP_OPENCODE_HEALTH_SMOKE=1` — justified because default tests must be deterministic and independent of real OpenCode. Smoke was run and passed manually.
- **Provider/auth readiness completeness:** Authentication readiness returns `HealthUnknown` when `providers list` output lacks auth/login/key evidence — justified by sprint's documented limitation that output shape cannot prove readiness.

## Decisions Needing Log Update

All durable decisions are already recorded:
- **DEC-014** (SDK Health Checker With Required Preflight Blocking) — already in `DECISIONS.md`
- **DEC-015** (Source-Aware Effective Config Without SDK-Owned File Parsing) — already in `DECISIONS.md`

No new decisions need recording.

## Overall Assessment

- **Verdict:** Approve
- **Blocking issues:** None.
- **Follow-ups:** None for this sprint. Sprint 6 should consume health classifications without adding hidden retry/fallback in adapters.
- **Risk carry-forward:** Provider/model/auth readiness may still require live-runtime verification in production configurations where `providers list` and `models --verbose` cannot prove credential validity. This is documented as an intentional limitation.
