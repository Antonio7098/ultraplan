# Sprint Tracker: Health Checks and Configuration Validation

> Target: agentwrap
> Sprint ID: 05-health-config
> Created: 2026-05-19
> Reasoning: `targets/agentwrap/sprints/05-health-config/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 5: Health Checks and Configuration Validation`

## Sprint Overview

- **Sprint Name:** Health Checks and Configuration Validation
- **Sprint Focus:** Add SDK-only health checks, OpenCode preflight probes, source-aware effective configuration, post-merge validation, secret-safe reporting, and fail-fast pre-run behavior for required unrecoverable setup failures.
- **Depends On:** Sprint 2 runtime contract/error/capability types; Sprint 3 OpenCode adapter/process runner; Sprint 4 lifecycle/session/cancellation/cleanup semantics.
- **Status:** Complete

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - health/readiness, fail-fast provider/model setup, product-agnostic SDK boundary, and output safety.
- `targets/agentwrap/sources/TRD.md` - health checks/preflight, configuration requirements, error model, security/secrets, runtime capabilities, and extensibility.
- `targets/agentwrap/sources/feature-architecture.md` - state ownership, runtime/logic/infra separation, and minimal abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 5 health/config goal, scope, output, and quality gate, with executable command wording intentionally corrected out of scope.
- `targets/agentwrap/sprints/05-health-config/reasoning.md` - reasoning decisions, deviations, assumptions, risks, open questions, and expected evidence this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/evidence/resilience-policies.md` - fail-fast unrecoverable health/config failures, typed classification, and policy-readable errors.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - fake-runtime-first tests and explicit integration/smoke gates.
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md` - preflight validation gap, startup probe guidance, typed failure classes, and avoiding baked-in retry/fallback flows.
- `studies/go-cli-study/reports/final/04-configuration-management.md` - explicit precedence, effective config, post-merge validation, immutable config, and avoiding direct env bypasses.
- `studies/go-cli-study/reports/final/05-error-handling.md` - typed errors, safe user detail versus diagnostics, wrapping, and behavioral classification.
- `studies/go-cli-study/reports/final/13-security.md` - secret redaction, credential scrubbing, and trust-boundary visibility.
- Local OpenCode help output - runtime adapter evidence for non-run probes: `debug config`, `providers list`, `models [provider] --verbose --refresh`, `debug paths`, `debug info`, `debug startup`, `session list`, `db path`, and `stats`.
- `/home/antonioborgerees/coding/ultraplan/cli/src/index.ts` - current UltraPlan OpenCode integration that locates the binary, uses `opencode-config.json`, selects provider/model, and invokes `opencode run` with structured output and session flags.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - current runtime/run request/capability contract to extend or compose with.
- `/home/antonioborgerees/coding/agentwrap/errors.go` - existing categories for health/config/provider/model/auth/runtime errors.
- `/home/antonioborgerees/coding/agentwrap/opencode/options.go` - existing OpenCode adapter options and capabilities to include in health/effective config.

## Sprint Goals

- **Primary Goal:** A caller can inspect effective runtime configuration and run required health checks before starting work, with unrecoverable required setup failures rejected before any runtime process launches.
- **Secondary Goals:**
  - Define runtime-neutral health result states for ready, degraded, transient failure, unrecoverable failure, unknown, skipped, and unsupported checks.
  - Add an OpenCode health implementation that checks runtime availability and safely reports provider/model/auth readiness where detectable.
  - Define source-aware effective config and validation without choosing a config file format.
  - Ensure health/config diagnostics are secret-safe by default.
  - Add deterministic fake/OpenCode probe tests without requiring a real OpenCode install by default.

## Scope

- Add public SDK types for health check requests, check IDs, check results, health status/severity, required checks, health reports, and health/config diagnostics.
- Add a runtime-neutral health interface or optional health-check surface that adapters can implement independently from a full run.
- Add source-aware effective configuration types for runtime kind/name, executable path or adapter runtime handle, provider, model, working directory, permissions, sandbox, timeout, metadata, and secret presence/source indicators.
- Define and test precedence semantics for effective configuration: runtime defaults < adapter options < environment/config provider < caller request overrides, unless implementation evidence justifies a narrower first increment.
- Add post-merge config validation that rejects invalid required runtime/provider/model/workdir/permission/sandbox/timeout values before process launch when validation is possible.
- Implement OpenCode health checks for executable availability, version/help/structured-output capability where cheap, working directory validity, adapter option validity, and provider/model/auth readiness where safely detectable.
- Use OpenCode's non-run command surfaces for probes before returning unknown: `opencode debug config`, `opencode providers list`, `opencode models [provider] --verbose`, `opencode run --help`, and `opencode debug paths`.
- Return unknown/degraded/skipped health results when OpenCode cannot prove provider/model/auth readiness without expensive work.
- Integrate required preflight checks into `StartRun` so unrecoverable required failures return classified errors and do not start a process.
- Add secret redaction helpers/tests for effective config, health diagnostics, environment-derived values, and native metadata.
- Add optional gated real OpenCode health smoke only if it can run without starting expensive agent work; otherwise record a deferral.

## Non-Scope

- Do not add executable health, config, status, inspect, or run commands. AgentWrap is not a CLI tool.
- Do not create or parse a required config file format.
- Do not add Cobra, command frameworks, command routing, help output, or CLI UX.
- Do not implement retry, fallback, backoff, rate-limit hooks, circuit breakers, or policy orchestration; Sprint 6 owns this.
- Do not implement output validation, schema validation for generated artifacts, repair prompts, or validation-informed retry; Sprint 7 owns this.
- Do not implement persistence, active-run stores, dashboards, historical inspection, or cost estimation; Sprint 8 owns this.
- Do not make provider/model readiness checks billable or start a real agent run by default.
- Do not add UltraPlan workflow, study, synthesis, planning, scoring, or report-template configuration.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Keep root `agentwrap` as the runtime-neutral public contract. Put common health/config types in the root only when they are SDK-wide. Keep OpenCode probing mechanics and native metadata in `agentwrap/opencode`. Keep fake health behavior in tests or `internal/testkit`.
- **Public Surface:** Prefer a small `HealthChecker`-style interface and source-aware health/config result types. If implementation instead extends `Runtime`, document why the broader contract is justified. Add no executable command surface.
- **State And Lifecycle:** Health checks are synchronous preflight operations that may emit no run lifecycle because no run exists. A required preflight failure before process launch returns a classified `SDKError` and does not create cleanup work.
- **Error And Failure Behavior:** Use existing `SDKError` categories: configuration, health, runtime unavailable, provider unavailable, model unavailable, authentication, permission, timeout, rate limit, and unknown. Map health status to retryable/fallbackable/user-actionable/unrecoverable flags conservatively.
- **Observability:** Health reports and effective config summaries are structured data. Normal summaries redact secrets and keep unsafe/native probe output in debug/native metadata only.
- **Testing Surface:** Use table-driven unit tests, fake health checkers, fake OpenCode process/probe runners, and redaction tests by default. Gate real OpenCode health smoke with an explicit environment variable if it is added.

## Decisions

- [x] **Decision 1: Use SDK Health Preflight Instead Of Executable Commands**
  > **Requirement:** PRD/TRD health checks and product-agnostic SDK boundary.
  > **Evidence:** `reasoning.md` Decision Area 1; `resilience-policies.md`; user clarification on 2026-05-19 that AgentWrap is not a CLI tool.
  > **Tradeoff:** No manual command UX is added in this sprint.
  > **Rejected Alternative:** Add health/config executable commands from the roadmap; rejected because CLI scope was a study-material confusion.
  > **Risk / Follow-up:** Roadmap text may need later cleanup to remove executable command wording.

- [x] **Decision 2: Define Source-Aware Effective Config Without A File Format**
  > **Requirement:** TRD configuration precedence, effective config inspection, and no prescribed file format.
  > **Evidence:** `reasoning.md` Decision Area 2; configuration-management final report.
  > **Tradeoff:** Config file loading remains outside this sprint.
  > **Rejected Alternative:** Choose JSON/YAML/TOML config now; rejected as overfitting and contrary to TRD.
  > **Risk / Follow-up:** Future product integrations may need a config provider adapter, but the SDK should not own product config files yet.

- [x] **Decision 3: Probe OpenCode Cheaply And Report Unknowns Honestly**
  > **Requirement:** PRD/TRD runtime/provider/model readiness where detectable.
  > **Evidence:** `reasoning.md` Decision Area 3; resilience final report identifying preflight validation as a gap; local OpenCode help for `debug config`, `providers list`, `models`, `debug paths`, and `run --help`.
  > **Tradeoff:** Some provider/model/auth readiness may remain unknown until a real run.
  > **Rejected Alternative:** Start a tiny real OpenCode run as health; rejected because health must avoid expensive runtime work.
  > **Risk / Follow-up:** Implementation must verify command output shape before treating provider/model/auth checks as proven.

- [x] **Decision 4: Required Unrecoverable Preflight Fails Before Process Launch**
  > **Requirement:** PRD success metric for missing provider/model setup; TRD required health checks before starting work.
  > **Evidence:** `reasoning.md` Decision Area 4; resilience and error-handling evidence.
  > **Tradeoff:** `StartRun` gains preflight branching before process creation.
  > **Rejected Alternative:** Make health-only explicit and never enforce in `StartRun`; rejected because it weakens fail-fast guarantees.
  > **Risk / Follow-up:** Keep blocking checks caller-required or clearly documented so degraded/unknown states do not unexpectedly block all runs.

## Execution Checklist

- [x] **Task 1: Define Health Result Contract**
  > *Description: Establish the smallest runtime-neutral health model that callers and later policies can inspect without runtime-specific code.*
  - [x] **Sub-task 1.1:** Add health check identifiers and status/severity values for ready, degraded, transient failure, unrecoverable failure, unknown, skipped, and unsupported.
  - [x] **Sub-task 1.2:** Add health request/report/result types with runtime context, provider/model, check detail, safe user detail, debug detail, native metadata, and classified `SDKError`.
  - [x] **Sub-task 1.3:** Add aggregation helpers for overall health and required-check failure.
  - [x] **Sub-task 1.4:** Add tests for aggregation, required checks, unknown/skipped handling, and status-to-error classification.

- [x] **Task 2: Define Effective Config And Precedence**
  > *Description: Make run setup inspectable and deterministic without choosing a config file format.*
  - [x] **Sub-task 2.1:** Add `EffectiveConfig` and field-source metadata for runtime, executable/adapter settings, provider, model, workdir, permissions, sandbox, timeout, session-related values, and metadata.
  - [x] **Sub-task 2.2:** Define source labels for default, adapter option, environment/config provider, caller request, and runtime discovered values.
  - [x] **Sub-task 2.3:** Implement merge/inspection helpers using explicit precedence and immutable post-merge results.
  - [x] **Sub-task 2.4:** Add validation for invalid required fields and impossible combinations.
  - [x] **Sub-task 2.5:** Add table tests proving precedence, source tracking, validation after merge, and no direct env bypass outside the config/probe layer.

- [x] **Task 3: Add Secret Redaction And Safe Diagnostics**
  > *Description: Ensure health/config inspection is useful without leaking credentials or sensitive environment values.*
  - [x] **Sub-task 3.1:** Define a redacted/sensitive value representation that reports presence and source but not secret content.
  - [x] **Sub-task 3.2:** Redact known secret-like fields and env names in effective config, health debug output, and native metadata summaries.
  - [x] **Sub-task 3.3:** Add tests with API keys, bearer tokens, authorization headers, and secret-looking env values.
  - [x] **Sub-task 3.4:** Keep `SDKError.UserDetail` safe and place unsafe probe output only in debug detail after redaction or truncation.

- [x] **Task 4: Implement OpenCode Health Checks**
  > *Description: Add practical OpenCode probes that fail fast where possible and report uncertainty where not possible.*
  - [x] **Sub-task 4.1:** Add an OpenCode health implementation using the adapter executable/env/options and fakeable process/probe seam.
  - [x] **Sub-task 4.2:** Probe executable availability with path lookup/`--version` and structured-output support with `opencode run --help`.
  - [x] **Sub-task 4.3:** Probe resolved configuration with `opencode debug config` and global paths with `opencode debug paths`; treat output as adapter-native metadata until its shape is proven stable.
  - [x] **Sub-task 4.4:** Probe provider/auth setup with `opencode providers list` and classify missing/unconfigured credentials where output supports it.
  - [x] **Sub-task 4.5:** Probe model availability with `opencode models [provider] --verbose`; use `--refresh` only in gated or explicitly requested checks because it may hit the network/cache.
  - [x] **Sub-task 4.6:** Validate workdir and adapter option consistency before process launch.
  - [x] **Sub-task 4.7:** Preserve runtime-specific diagnostics in native metadata with redaction and truncation.

- [x] **Task 5: Integrate Required Preflight With StartRun**
  > *Description: Prevent required unrecoverable setup failures from launching runtime work.*
  - [x] **Sub-task 5.1:** Add a caller-facing way to require specific health/config checks before start.
  - [x] **Sub-task 5.2:** Execute required preflight before OpenCode process start.
  - [x] **Sub-task 5.3:** Return classified errors for required unrecoverable failures without creating a run or cleanup path.
  - [x] **Sub-task 5.4:** Allow optional degraded/unknown checks to be reported without blocking unless required.
  - [x] **Sub-task 5.5:** Add fake process assertions proving no process start occurs after required preflight failure.

- [x] **Task 6: Test Matrix And Documentation**
  > *Description: Close the sprint with deterministic evidence and implementation-confirmed decisions only.*
  - [x] **Sub-task 6.1:** Add tests for invalid config, missing runtime, `debug config` failure, `providers list` failure, unavailable provider/model simulations, authentication failure simulations, degraded state, unknown state, skipped/unsupported checks, and redaction.
  - [x] **Sub-task 6.2:** Keep default `go test ./...` independent of real OpenCode/provider credentials.
  - [x] **Sub-task 6.3:** Add a gated real OpenCode health smoke only if it is non-billable and reliable; otherwise record a justified deferral.
  - [x] **Sub-task 6.4:** Update root package docs/README for SDK health/config semantics and no CLI command scope.
  - [x] **Sub-task 6.5:** Update `targets/agentwrap/DECISIONS.md` only for implementation-confirmed public health/config decisions.

## Previous Sprint Follow-Ups

- [x] **Sprint 2 Follow-Up: Recheck Config And Capability Vocabulary Against OpenCode Commands**
  > *Description: Use newly discovered OpenCode command evidence to refine, not rewrite, the existing runtime-neutral contract where implementation shows a real mismatch.*
  - [x] **Check 2.1:** Compare `RunRequest.Provider`, `RunRequest.Model`, `PermissionMode`, `SandboxMode`, and capabilities with `opencode run --help`, `opencode debug config`, and `opencode models`.
  - [x] **Check 2.2:** Confirm whether `--variant`, `--agent`, `--file`, `--share`, `--attach`, `--username`, and `--password` should remain OpenCode-native metadata/options or require runtime-neutral fields later.
  - [x] **Check 2.3:** Record any public contract adjustment as a decision only if a Sprint 5 implementation or test exposes a concrete gap.

- [x] **Sprint 3 Follow-Up: Strengthen OpenCode Adapter Evidence With Command Surfaces**
  > *Description: Use command help and non-run probes to verify adapter assumptions from the structured event sprint.*
  - [x] **Check 3.1:** Confirm `--session` is same-session continuation and `--fork` is forked-session continuation; update tests or metadata if current best-effort session wording is too weak.
  - [x] **Check 3.2:** Verify `--format json` remains the structured-output path through `opencode run --help`.
  - [x] **Check 3.3:** Use `opencode debug paths` and `opencode session list` as optional diagnostic evidence for retained-session behavior without coupling the common path to OpenCode storage.
  - [x] **Check 3.4:** Keep `opencode db` out of default adapter behavior unless a concrete diagnostic test needs database path/query evidence.

- [x] **Sprint 8 Forward Note: Preserve Stats Evidence For Observability**
  > *Description: Do not implement observability now, but keep the discovered command available for later planning.*
  - [x] **Check 8.1:** Carry `opencode stats --models --project --days` into Sprint 8 as a candidate source for usage/cost metadata.

## Testing And Documentation Checklist

- [x] **Unit Tests:** health report aggregation, required-check blocking, error classification, effective config precedence, validation, immutable merged config, and redaction.
- [x] **Fixture Tests:** fake OpenCode probe outputs for missing executable, bad version/help output, unsupported structured output, `debug config`, `providers list`, `models --verbose`, auth/provider/model failures where simulated, degraded, unknown, and skipped checks.
- [x] **Integration Tests:** process/probe seam tests proving preflight blocks process start on required unrecoverable failure.
- [x] **Real Runtime Smoke:** added and ran gated Sprint 5 OpenCode health smoke with the default free smoke model.
- [x] **Documentation Updates:** SDK package docs/README plus `DECISIONS.md` for confirmed API/config choices; optionally later update roadmap wording to remove executable commands.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| OpenCode command output shape may be unstable or human-oriented | High | Real smoke found `opencode run --help` writes help to stderr with exit 0; probe now inspects stdout and stderr and keeps output redacted native metadata | Mitigated |
| OpenCode cannot validate provider/model/auth without a real run | High | `providers list` and `models --verbose` passed in the real health smoke for the default free smoke model; authentication still remains unknown unless output can prove readiness | Mitigated |
| Health API over-abstracts before a second runtime exists | Medium | Implemented as optional `HealthChecker`, not a new required `Runtime` method | Closed |
| Effective config becomes a file-format decision | Medium | Implemented merge/source primitives only; no file parsing added | Closed |
| Secret values leak through health/config diagnostics | High | Added redaction helpers and tests for env/API key/bearer/token diagnostics | Mitigated |
| StartRun preflight blocks too much by default | Medium | Blocking only happens when caller sets `RunRequest.RequireHealth`; optional checks remain inspectable through `CheckHealth` | Closed |
| Roadmap still mentions executable commands | Low | Sprint plan and DEC entries record SDK-only scope; roadmap cleanup remains optional later documentation work | Carried Forward |

## Open Questions

- Which OpenCode command outputs are structured enough to parse safely? - Implementation parses only minimal textual presence for help/provider/model checks and preserves probe output as redacted native metadata. Real smoke confirmed `run --help` may write usable help text to stderr.
- Can `providers list` distinguish "provider exists" from "authenticated and usable"? - Not reliably proven by fake evidence; authentication readiness returns unknown unless output includes auth/login/key-like evidence.
- Should `models --refresh` be default, optional, or gated? - Implemented as opt-in via `HealthCheckRequest.IncludeRefresh`.
- Should health be an optional `HealthChecker` interface or a new method on `Runtime`? - Implemented optional `HealthChecker`; accepted in `DEC-014`.
- Which config source set is implemented first: defaults, adapter options, environment/config provider, caller request, runtime discovered? - Implemented source labels and merge support for the full set; OpenCode currently uses defaults, adapter options, caller request, and secret presence from adapter env.
- Should degraded health block `StartRun` by default? - No; blocking requires caller-provided `RunRequest.RequireHealth`.

## Success Criteria

- [x] **Success Criteria 1:** A caller can run SDK health checks independently from a runtime run.
- [x] **Success Criteria 2:** Missing runtime availability or invalid required configuration returns a classified error before any OpenCode process starts.
- [x] **Success Criteria 3:** Effective configuration can be inspected with field-level source information and without exposing secrets.
- [x] **Success Criteria 4:** Health results distinguish ready, degraded, transient failure, unrecoverable failure, unknown, skipped, and unsupported states.
- [x] **Success Criteria 5:** OpenCode health checks validate executable/workdir/structured-output support and use `debug config`, `providers list`, and `models --verbose` for provider/model/auth readiness where safely detectable.
- [x] **Success Criteria 6:** Provider/model/auth readiness that cannot be safely detected is reported as unknown/degraded/skipped, not as ready.
- [x] **Success Criteria 7:** Health/config errors use typed `SDKError` categories and policy-readable retryable/fallbackable/user-actionable/unrecoverable flags.
- [x] **Success Criteria 8:** Default tests pass without OpenCode installed, provider credentials, network access, or executable commands.
- [x] **Success Criteria 9:** No CLI command surface, retry/fallback policy, validation/repair flow, persistence store, dashboard, or UltraPlan workflow logic is added.

## Study Evaluation

- [x] **Patterns Followed:** fail-fast unrecoverable setup validation, typed health/config errors, explicit precedence, post-merge validation, immutable effective config, source-aware fields, secret redaction, fake-first tests, gated external runtime smoke.
- [x] **Anti-Patterns Avoided:** CLI command scope, direct env reads bypassing config, silent config errors, leaking secrets in normal output, pretending unknown provider/model readiness is healthy, starting real work for health checks, hard-coded retry/fallback behavior.
- [x] **Comparison Needed:** Compare completed implementation against resilience, configuration-management, error-handling, security, and testing evidence cited in `reasoning.md`.
- [x] **Proceed / Iterate:** Proceed to Sprint 6 only if required unrecoverable health/config failures fail before process launch and health/config reports are typed, inspectable, and secret-safe.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-19

## Execution Evidence

- Planning artifacts created on 2026-05-19:
  - `targets/agentwrap/sprints/05-health-config/reasoning.md`
  - `targets/agentwrap/sprints/05-health-config/plan.md`
- Planning correction recorded: executable health/config commands are out of scope because AgentWrap is not a CLI tool.
- Evidence omission recorded: `targets/agentwrap/reports/evidence/cli-design.md` was roadmap-listed but absent and not applicable.
- Implemented SDK health/config/redaction surface in `/home/antonioborgerees/coding/agentwrap`:
  - `health.go` adds `HealthChecker`, typed checks/statuses, reports, aggregation, required-check failure, and status-to-error classification.
  - `config.go` adds source-aware effective config, merge layers, caller config conversion, and post-merge validation.
  - `redact.go` adds secret-name, bearer-token, assignment, env, and metadata redaction helpers.
- Implemented OpenCode health/preflight in `/home/antonioborgerees/coding/agentwrap/opencode/health.go` and `runtime.go`:
  - cheap probes use the existing fakeable process runner for `--version`, `run --help`, `debug config`, `debug paths`, `providers list`, and `models [provider] --verbose`;
  - `HealthCheckRequest.IncludeRefresh` is required before adding `--refresh`;
  - `StartRun` runs required checks only when `RunRequest.RequireHealth` is set and returns classified errors before launching `opencode run`.
- Added deterministic tests:
  - root health aggregation, required checks, status classification, effective config precedence/validation, and redaction tests;
  - OpenCode fake probe tests for ready checks, secret redaction, required preflight blocking, unknown authentication, `debug config` failure, missing provider/model, and unsupported structured output.
- Verification command: `env GOCACHE=/tmp/agentwrap-gocache go test ./...` passed on 2026-05-19.
- Initial `go test ./...` could not use the default Go cache because `/home/antonioborgerees/.cache/go-build` is read-only in the sandbox; rerun used `/tmp/agentwrap-gocache`.
- Added gated real Sprint 5 health smoke in `/home/antonioborgerees/coding/agentwrap/opencode/integration_test.go`:
  - `TestRealOpenCodeHealthSmoke/health probes` runs real `CheckHealth` for runtime availability, structured output, workdir, config, paths, provider, auth, and model checks using `AGENTWRAP_OPENCODE_HEALTH_SMOKE=1`;
  - `required preflight allows run` starts a real OpenCode run only after required health preflight passes, using the default free smoke model `opencode/deepseek-v4-flash-free`;
  - `required preflight blocks invalid model` verifies a missing model is rejected as `ErrorModelUnavailable` before `opencode run`.
- Real smoke command outside sandbox: `env GOCACHE=/tmp/agentwrap-gocache AGENTWRAP_OPENCODE_HEALTH_SMOKE=1 go test ./opencode -run TestRealOpenCodeHealthSmoke -count=1 -timeout 8m -v` passed on 2026-05-19.
- Real smoke implementation finding: `opencode run --help` returned exit 0 with help text on stderr, so the structured-output health probe now inspects both stdout and stderr.
- Updated `/home/antonioborgerees/coding/agentwrap/README.md`, `/home/antonioborgerees/coding/agentwrap/doc.go`, and `targets/agentwrap/DECISIONS.md` (`DEC-014`, `DEC-015`).
