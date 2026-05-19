# Sprint Reasoning: Health Checks and Configuration Validation

> Target: agentwrap
> Sprint ID: 05-health-config
> Output: `targets/agentwrap/sprints/05-health-config/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/05-health-config/plan.md`

## Overview

**Sprint:** Health Checks and Configuration Validation
**Purpose:** Add SDK-level preflight health checks and effective configuration inspection so invalid runtime/provider/model setup fails before expensive runtime work starts.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 5: Health Checks and Configuration Validation`
**Depends On:** Sprint 2 runtime contract/error/capability types, Sprint 3 OpenCode adapter, and Sprint 4 lifecycle/session/cancellation/cleanup semantics.
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - health/readiness, fail-fast provider/model setup, product-agnostic runtime abstraction, and secret-safe output requirements.
- `targets/agentwrap/sources/TRD.md` - pre-run health checks, configuration precedence, effective configuration inspection, invalid config rejection, typed health/config errors, and secret handling.
- `targets/agentwrap/sources/feature-architecture.md` - state-first ownership, runtime versus logic separation, and minimal abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 5 goal, scope, output, evidence inputs, and quality gate, with executable command scope corrected by user clarification.

## Evidence Basis

**Evidence Status:** Complete enough for Sprint 5 planning, with one explicit omission. The required `targets/agentwrap/reports/evidence/resilience-policies.md` pack exists and was loaded. The roadmap-listed `evidence/cli-design.md` does not exist in `targets/agentwrap/reports/evidence`, and the user clarified on 2026-05-19 that AgentWrap is not a CLI tool. CLI command evidence was not used to justify a product command surface, but local OpenCode command help was used as runtime adapter evidence for health/config probes.
**Context Strategy:** Staged loading used. Planning loaded PRD/TRD/feature protocol/roadmap sprint section, the resilience and testing evidence packs, targeted final reports for resilience/config/errors/security, current implementation code references, UltraPlan's OpenCode invocation code, and local OpenCode help for relevant subcommands. Per-source reports were not opened because final reports and local runtime help answered the sprint decisions.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/resilience-policies.md` - informs fail-fast health/config validation, typed health states, classification boundaries, and policy-readable errors.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - informs fake-runtime-first health/config tests and explicit real-runtime smoke gating.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md` - supports typed error classification, preflight validation as an observed gap, rate-limit distinction, and keeping retry/fallback composition out of adapter internals.
- `studies/go-cli-study/reports/final/04-configuration-management.md` - supports explicit precedence, merged effective config, post-merge validation, immutable run config, env-prefix discipline, and avoiding direct env reads outside a config layer.
- `studies/go-cli-study/reports/final/05-error-handling.md` - supports errors as first-class domain values, user-facing versus diagnostic separation, wrapping, typed errors, and behavioral classification.
- `studies/go-cli-study/reports/final/13-security.md` - supports secret redaction, credential scrubbing, trust-boundary visibility, and permission/sandbox-related config validation.

### Per-Source Reports Used

- None. Final reports, current code references, UltraPlan usage, and local OpenCode help were sufficient for planning. If implementation needs exact output schemas for `opencode debug config`, `opencode providers list`, `opencode models`, or `opencode session list`, inspect command output narrowly and cite the added evidence in execution notes.

### Code References Used

- `/home/antonioborgerees/coding/ultraplan/cli/src/index.ts` - existing UltraPlan OpenCode integration locates the binary, loads `config.json`, uses `opencode-config.json`, selects provider/model, and invokes `opencode run` with structured output and run/session flags.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - current `Runtime` exposes `StartRun` and `Capabilities`, while `RunRequest` already carries runtime/provider/model/permission/sandbox/timeout/session inputs.
- `/home/antonioborgerees/coding/agentwrap/errors.go` - current `SDKError` includes health, configuration, runtime unavailable, provider unavailable, model unavailable, authentication, permission, timeout, rate-limit, and unknown categories.
- `/home/antonioborgerees/coding/agentwrap/lifecycle.go` - current lifecycle vocabulary already includes `health_checking` and `ready`.
- `/home/antonioborgerees/coding/agentwrap/metadata.go` - current `RunMetadata.Context` and session/cleanup fields provide a place to carry effective runtime/provider/model facts later.
- `/home/antonioborgerees/coding/agentwrap/opencode/options.go` - OpenCode adapter has executable/env/extra-args options and runtime capabilities but no health/config probe yet.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go` - OpenCode start path currently classifies process start failure only when starting a run; Sprint 5 should move detectable setup failure earlier.
- `/home/antonioborgerees/coding/agentwrap/internal/testkit/fake_runtime.go` - fake runtime can be extended or paralleled with fake health/config behavior without launching OpenCode.

### Local OpenCode Help Used

- `opencode --help` - root command exposes `providers`, `models`, `debug`, `session`, `db`, `stats`, `run`, and root-level `--model`, `--continue`, `--session`, `--fork`, `--prompt`, `--agent`, and `--pure` flags.
- `opencode run --help` - confirms `--format json`, `--dir`, `--model`, `--variant`, `--agent`, `--session`, `--continue`, `--fork`, `--share`, `--attach`, `--username`, `--password`, `--file`, `--title`, `--interactive`, and `--dangerously-skip-permissions`.
- `opencode providers --help` - exposes `providers list`, `providers login`, and `providers logout`; this is the primary non-run credential/configuration surface.
- `opencode models --help` - exposes `models [provider]`, `--verbose`, and `--refresh`; this is the primary non-run provider/model discovery surface.
- `opencode debug --help` - exposes `debug config`, `debug info`, `debug paths`, `debug startup`, `debug agent <name>`, and related debugging tools; this is the primary resolved-configuration surface.
- `opencode session --help` - exposes `session list` and `session delete`; this supports retained-session verification and follow-up to Sprint 4.
- `opencode db --help` - exposes `db path`, `db migrate`, and SQL query output with `--format json|tsv`; useful for diagnostics but likely too internal for the SDK common path.
- `opencode stats --help` - exposes usage/cost statistics by days/tools/models/project; relevant to Sprint 8 observability rather than Sprint 5 health.

### Evidence Rejected Or Not Used

- **`targets/agentwrap/reports/evidence/cli-design.md`:** Not found. Also not applicable after user clarification that AgentWrap is not a CLI tool.
- **Roadmap item "Add executable commands for health and effective config inspection":** Rejected for this sprint as a roadmap correction. The SDK should expose health/config APIs and tests, not executable commands.
- **`studies/go-cli-study/reports/final/02-command-architecture.md`:** Not used for scope because command architecture is CLI-specific. Thin-wrapper lessons may remain internal engineering evidence only, but they do not justify a command surface.
- **`opencode db` as a normal health/config dependency:** Not used for the common path because it couples the SDK to OpenCode's database internals. It may be used in diagnostics or gated tests only if command-level probes are insufficient.
- **`opencode stats` for Sprint 5:** Not used for health/config because it is usage/cost metadata and belongs in Sprint 8.
- **Retry/backoff/fallback execution guidance:** Not used for implementation scope because Sprint 6 owns policy composition.
- **Validation/repair evidence:** Not used because Sprint 7 owns output validation and repair.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Runtime health checks before starting a run | PRD Health and Readiness; TRD Health Checks and Preflight | Health | Applicable | This sprint must let callers check installed/reachable/authenticated/model-ready setup independently from a run. |
| Missing provider/model setup fails before expensive work begins | PRD Success Metrics; TRD Configuration Requirements | Config validation | Applicable | The SDK should reject detectable unrecoverable setup failures before launching agent work. |
| Health checks distinguish unrecoverable, transient, degraded, and unknown | TRD Health Checks and Preflight | Health state | Applicable | Sprint 5 must define a typed health result that later policy code can consume. |
| Effective configuration can be inspected | TRD Configuration Requirements | Config model | Applicable | Callers need to audit runtime/provider/model/permission/sandbox/timeouts and their sources. |
| Sensitive configuration values must not be logged or printed | PRD Output Safety; TRD Security and Secrets | Security | Applicable | Health/config diagnostics must redact secrets by default. |
| Runtime-specific capabilities discoverable | TRD Runtime Interface | Capability | Applicable | Health checks should expose unsupported or degraded probes without forcing OpenCode details into common callers. |
| Add executable commands | Roadmap Sprint 5 Scope | Executable surface | Not applicable | User clarified this target is not a CLI tool; scope should be SDK API only. |

### Applicable Requirements

- **Pre-run health checks:** The SDK must expose health checks that can run independently and can be required before `StartRun`.
- **Runtime/provider/model readiness:** Health should check runtime availability and validate authentication/provider/model readiness where the runtime exposes a safe, deterministic probe.
- **Effective config inspection:** The SDK must make the merged runtime/provider/model/permission/sandbox/timeout/metadata config inspectable with source information.
- **Typed health/config errors:** Failures must use `SDKError` categories that later policy code can read without string matching.
- **Secret-safe diagnostics:** Health/config output must include user-safe detail and separate debug detail, redacting env values, tokens, and authorization-like strings.
- **Runtime neutrality:** Common callers should use SDK health/config types. OpenCode-specific probe details may exist only as structured metadata or adapter options.

### Non-Applicable Requirements

- **Executable health/config commands:** Not part of this target after user clarification.
- **Retry, fallback, backoff, and rate-limit policy execution:** Sprint 6 owns policy orchestration. Sprint 5 may classify transient/rate-limit-like health results but must not schedule retries.
- **Output validation and repair:** Sprint 7 owns validators and repair flows.
- **Persistence, active-run stores, dashboards, and historical inspection:** Sprint 8 owns storage and inspection surfaces.
- **UltraPlan-specific workflow configuration:** Product workflows, study dimensions, report templates, and sprint logic stay outside the SDK.
- **Config file format selection:** TRD explicitly does not choose a serialization format; Sprint 5 should define precedence semantics and source tracking without committing to a file format.

### Ambiguous Or Conflicting Requirements

- **Health as part of `Runtime` versus separate interface:** TRD requires health checks, while current `Runtime` only has `StartRun` and `Capabilities`. The sprint should choose the smallest public surface that makes health independently runnable without over-abstracting.
- **Provider/model readiness depth:** Requirements say validate where detectable. Local OpenCode help shows `providers list` and `models [provider] --verbose --refresh`, which should be tried before returning unknown. The sprint should still distinguish "not checked", "degraded", and "unknown" where command output cannot prove readiness.
- **Configuration precedence sources:** Requirements require precedence semantics but not a file format. The sprint should model defaults, adapter options, environment, and caller overrides now; optional config file sources can remain abstract until there is implementation pressure.
- **Fail-fast strictness:** Unrecoverable setup must fail before a run starts, but transient/degraded states may be policy-dependent. Sprint 5 should expose required checks and health severity rather than always blocking degraded states.

### Open Questions

- What exact output shape do `opencode debug config`, `opencode providers list`, and `opencode models --verbose` produce, and can the SDK parse it structurally enough without relying on fragile terminal text?
- Should `Runtime` gain `CheckHealth`, or should health live in a separate optional `HealthChecker` interface implemented by runtime adapters?
- Which config sources exist in Sprint 5: runtime defaults, adapter constructor options, environment, caller overrides, and optional in-memory config only, or also config files?
- Should degraded health block `StartRun` by default, or only when the caller marks that check as required?

## Sprint Decision Analysis

### Decision Area 1: SDK Health API And Health States

**Problem:** Callers need a preflight health surface that can run without starting agent work and that can classify setup failures in a policy-readable way.

**Requirements Applied**
- PRD and TRD require runtime health checks before runs and failure classification as unrecoverable, transient, degraded, or unknown.
- TRD requires health checks to be independently runnable and required by callers before work starts.

**Evidence Applied**
- `resilience-policies.md` says fail fast on unrecoverable health/config failures and classify failures before policy decisions.
- The resilience final report identifies preflight provider/auth validation as a gap in studied systems and recommends startup probes for API key validity, reachability, and provider availability before billable work.
- Current `errors.go` already has health/config/provider/model/auth/runtime-unavailable categories.
- Local OpenCode help identifies non-run command surfaces for health/config: `debug config`, `providers list`, `models [provider] --verbose --refresh`, `debug paths`, `debug info`, and `debug startup`.

**Options Considered**
- **Option A:** Add a runtime-neutral `HealthChecker` surface with `HealthCheckRequest`, `HealthReport`, per-check results, severity/status, safe details, diagnostics, and classified `SDKError` values.
- **Option B:** Add `CheckHealth` directly to the existing `Runtime` interface.
- **Option C:** Keep health as OpenCode-only helper functions outside the SDK contract.

**Chosen Approach**
- Use Option A unless implementation shows a strong reason to extend `Runtime` directly. A separate health interface lets existing runtime execution stay small while giving adapters a common preflight contract. Runtimes that support health can implement it; test fakes can implement it deterministically.

**Decision Justification**
- Option A satisfies the roadmap's "health check interface" without forcing every future runtime to implement all probes immediately.
- Option B is simpler for callers but breaks the existing contract and may overstate that every runtime has meaningful health probes.
- Option C fails the runtime-neutral requirement and would push OpenCode details into callers.
- The accepted tradeoff is one additional public interface before a second runtime exists, justified by a volatile external boundary and a hard TRD requirement.

**Execution Notes**
- Health states should distinguish at least healthy/ready, degraded, transient failure, unrecoverable failure, unknown, and skipped/not supported.
- Include check identity, runtime context, provider, model, severity, safe user detail, optional debug detail, and optional native metadata.
- Do not implement retry scheduling from health results; Sprint 6 owns policies.

**Expected Evidence**
- **Tests:** Unit tests for report aggregation, required-check failure, health severity mapping, and fake health checker behavior.
- **Runtime Evidence:** OpenCode fake probe tests for available executable, missing executable, auth/provider/model unavailable where detectable, degraded, unknown, and unsupported checks.
- **Review Checks:** Health is independently runnable and common callers do not need OpenCode command knowledge.

---

### Decision Area 2: Effective Configuration Model And Precedence

**Problem:** The SDK needs inspectable effective configuration without choosing a config file format or turning AgentWrap into a CLI.

**Requirements Applied**
- TRD requires accepting runtime/provider/model/permission/sandbox/retry/fallback/timeout/validation/metadata config, defining precedence semantics, distinguishing defaults from caller-provided values, and inspecting effective config.
- PRD requires fail-fast missing provider/model setup and product-agnostic configuration semantics.

**Evidence Applied**
- Configuration-management final report says elite Go tools use explicit precedence, centralized config structs, post-merge validation, immutable config after initialization, and avoiding direct env reads that bypass the config layer.
- Security final report supports secret redaction types and credential scrubbing.
- Current `RunRequest` already carries provider/model/permissions/sandbox/timeout/metadata inputs.

**Options Considered**
- **Option A:** Define a runtime-neutral `EffectiveConfig` with field-level source metadata and fixed precedence for SDK inputs: runtime defaults < adapter options < environment/config provider < caller request overrides. Keep file parsing out of scope.
- **Option B:** Choose a concrete config file format and loader in Sprint 5.
- **Option C:** Treat `RunRequest` as the only config surface and rely on callers to merge everything themselves.

**Chosen Approach**
- Use Option A. Define source-aware effective config and validation logic, but do not parse or prescribe config files.

**Decision Justification**
- Option A satisfies inspectability and precedence requirements while respecting the TRD's no-format constraint.
- Option B overfits to a file format and contradicts product-agnostic SDK direction.
- Option C fails effective config inspection and makes provenance of defaults versus caller values invisible.
- The accepted tradeoff is that optional config file integration remains a later adapter/product concern.

**Execution Notes**
- Source names should be generic: default, adapter option, environment, config provider, caller request, runtime discovered.
- Effective config should redact sensitive values by default and expose secret presence/source without values.
- Validation should run after sources merge, not during source collection.
- Run config should be immutable after `StartRun`/preflight begins.

**Expected Evidence**
- **Tests:** Precedence table tests, source-tracking tests, post-merge validation tests, redaction tests, and invalid-provider/model/timeout/permission/sandbox tests.
- **Runtime Evidence:** Effective config report for OpenCode includes executable, workdir, provider, model, permissions, sandbox, timeout, env-derived presence flags, and unsupported/degraded fields without secrets.
- **Review Checks:** No direct `os.Getenv` reads outside the config/probe layer and no config file format commitment.

---

### Decision Area 3: OpenCode Health And Config Probes

**Problem:** The first real runtime needs a health implementation that validates what can be known cheaply and reports uncertainty honestly.

**Requirements Applied**
- PRD requires OpenCode-first runtime execution and health checks before starting a run.
- TRD requires runtime availability, auth/provider/model setup where detectable, and model/provider availability where detectable.
- Roadmap Sprint 5 requires OpenCode health check implementation.

**Evidence Applied**
- Resilience final report says no studied repo has strong preflight validation and recommends startup probes for API key validity, network reachability, and provider availability before billable requests.
- Configuration report highlights provider auto-detection from credentials as useful but warns against direct env bypasses.
- UltraPlan's current CLI integration writes/uses `opencode-config.json` and passes model/session/run flags directly to OpenCode, proving the adapter can configure OpenCode through process arguments and config files without inventing an SDK-owned file format.
- Local OpenCode help confirms concrete non-run probes: `opencode debug config` for resolved config, `opencode providers list` for credentials/provider setup, `opencode models [provider] --verbose --refresh` for model discovery, `opencode debug paths` for config/state/cache paths, and `opencode session list` for retained-session evidence.
- Current OpenCode adapter has `WithExecutable`, `WithEnv`, `WithExtraArgs`, provider/model request mapping, and process start failure classification but no non-run probe.

**Options Considered**
- **Option A:** Implement layered OpenCode probes: executable resolution/version/help, `run --help` structured-output support, `debug config`, `providers list`, `models [provider] --verbose` with optional `--refresh`, `debug paths`, workdir validity, option/config validation, credential/provider/model readiness where the command output supports it, and unknown/degraded results otherwise.
- **Option B:** Start a tiny real OpenCode run as the health check.
- **Option C:** Only check that the executable exists.

**Chosen Approach**
- Use Option A. Health must be useful but not billable by default. If provider/model readiness cannot be proven cheaply, return unknown or degraded with a classified, safe explanation rather than launching real work.

**Decision Justification**
- Option A gives callers meaningful fail-fast behavior without crossing into expensive runtime work.
- Option B violates the sprint goal of failing before expensive runtime work.
- Option C is too weak for the PRD success metric about missing provider/model setup.
- The accepted tradeoff is partial readiness coverage until exact OpenCode probe capabilities are verified.

**Execution Notes**
- Use fake process runners for probe tests. A real OpenCode health smoke may be gated by an env var and should not run by default.
- Prefer command surfaces that do not start agent work: `opencode --version`, `opencode run --help`, `opencode debug config`, `opencode providers list`, `opencode models [provider] --verbose`, `opencode debug paths`, and optionally `opencode session list`.
- Treat `opencode db` as diagnostic-only unless command probes cannot answer a concrete decision, because DB queries depend on OpenCode internals.
- Runtime availability failures should classify as `ErrorRuntimeUnavailable`.
- Auth/provider/model failures should classify as `ErrorAuthentication`, `ErrorProviderUnavailable`, or `ErrorModelUnavailable` where evidence supports the classification; otherwise use `ErrorHealth` or `ErrorUnknown`.
- Preserve unsafe native diagnostics only in debug/native metadata, not normal output.

**Expected Evidence**
- **Tests:** Missing executable, version/help failure, unsupported structured output, invalid workdir, `debug config` failure, provider-list failure, missing provider credentials where simulated, missing model from models output where simulated, authentication failure where simulated, degraded/unknown probe cases.
- **Runtime Evidence:** Optional gated OpenCode health smoke records exactly which non-run probes were run, which were parsed structurally, which were treated as diagnostic-only, and which were skipped.
- **Review Checks:** Health does not start a real agent run by default and does not leak env secrets.

---

### Decision Area 4: Fail-Fast StartRun Integration

**Problem:** Health checks are only useful for run safety if required unrecoverable setup failures can block `StartRun` before process launch.

**Requirements Applied**
- PRD success metric says missing provider/model setup fails before expensive work begins.
- TRD says callers can require specific health checks before starting work and runs must fail fast when required health checks fail unrecoverably.

**Evidence Applied**
- Resilience pack says fail fast on unrecoverable health/config failures and preserve failed attempts as evidence.
- Error-handling final report supports first-class typed errors and user/operational detail separation.
- Sprint 4 established primary run outcome and cleanup separation; Sprint 5 should not start cleanup paths for runs that fail preflight before launch.

**Options Considered**
- **Option A:** Add run request preflight requirements that call health/config validation before process start and return classified errors without creating a run when required unrecoverable checks fail.
- **Option B:** Always let callers invoke health explicitly and never integrate with `StartRun`.
- **Option C:** Run health after process start and emit health events.

**Chosen Approach**
- Use Option A in the smallest form: caller-selected required checks, pre-start validation, classified errors, and no process launch on unrecoverable required failure. Explicit health-only calls remain available.

**Decision Justification**
- Option A directly satisfies fail-fast requirements.
- Option B leaves correctness to each caller and weakens the SDK guarantee.
- Option C defeats fail-fast and complicates lifecycle semantics.
- The accepted tradeoff is adding preflight behavior to the run start path before full policy composition exists.

**Execution Notes**
- Do not make all health checks mandatory by default if provider/model readiness is unknown or potentially expensive.
- Record failed preflight as a `StartRun` error rather than a `RunResult`, because no run was started.
- Keep health result types policy-readable for Sprint 6.

**Expected Evidence**
- **Tests:** Required-check failure prevents fake/OpenCode process launch; optional degraded/unknown checks do not block unless required; errors preserve category and safe detail.
- **Runtime Evidence:** Fake process runner records no start attempt when preflight fails.
- **Review Checks:** No cleanup semantics are invoked for runs that never start.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Roadmap Sprint 5 executable health/config commands | Omit executable commands | User clarified AgentWrap is not a CLI tool; CLI line came from reused CLI study material | Roadmap and tracker could appear inconsistent | Temporary roadmap correction recorded in reasoning and tracker | Update roadmap later if desired to remove executable command scope |
| Roadmap-listed `evidence/cli-design.md` | Not loaded | File does not exist and is not applicable after user clarification | Missing evidence citation for command shape | Accepted omission | Do not recreate CLI evidence unless target scope changes |
| Provider/model readiness | May return unknown/degraded instead of proven ready | OpenCode has useful command probes, but output shape and credential semantics still need verification | Some failures still occur at run time | Planned explicit limitation | First try `providers list` and `models [provider] --verbose`; document skipped/unknown probes |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Health is an SDK preflight interface, not a command:** Required by PRD/TRD and corrected by user clarification.
- **Effective config is source-aware and format-neutral:** Required by TRD configuration requirements and supported by config-management evidence.
- **OpenCode probes are layered and command-grounded:** Required by OpenCode-first MVP, supported by resilience evidence identifying preflight as a gap, and grounded in local `opencode` help for `debug config`, `providers list`, `models`, `debug paths`, and `session list`.
- **Unrecoverable required checks fail before process launch:** Required by PRD success metrics and TRD preflight requirements.

### Tradeoffs

- A separate health interface adds public surface area but avoids forcing all runtime implementations to claim equal probe support.
- Source-aware effective config adds model complexity but prevents hidden precedence and secret leakage.
- Provider/model readiness may be incomplete until `providers list` and `models --verbose` output shapes are verified against configured and unconfigured environments.
- No executable commands means less immediate manual UX, but it keeps the SDK aligned with target scope.

### Assumptions

- AgentWrap remains an SDK/library, not a CLI product.
- Health checks should be cheap and non-billable by default.
- Environment-derived secrets may exist, but normal health/config reports must never reveal secret values.
- Config file parsing is product/adapter-specific until a real need appears.

### Dependencies

- Sprint 2 `SDKError`, capabilities, runtime context, and `RunRequest` fields are available.
- Sprint 3 OpenCode process runner seam can be reused or extended for fake health probes.
- Sprint 4 cleanup/lifecycle semantics must remain unchanged for preflight failures because no process is launched.

### Risks

- **OpenCode probe ambiguity:** Provider/model/auth readiness may require interpreting command output or a real request. Mitigation: prefer `providers list`, `models --verbose`, and `debug config`; classify as unknown/degraded when output cannot prove readiness; keep real smoke gated.
- **Over-abstracted config model:** Too many future config fields could bloat the public API. Mitigation: implement only fields present in `RunRequest` plus adapter executable/env/probe metadata.
- **Secret leakage:** Effective config and native diagnostics could expose tokens. Mitigation: default redaction, source-only secret reporting, and tests for known secret-like values.
- **StartRun preflight surprise:** Automatic health checks could block callers unexpectedly. Mitigation: make blocking checks caller-required or clearly documented.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/05-health-config/plan.md`.

The tracker must include:

- SDK-only scope; no executable command tasks
- health API and OpenCode health implementation tasks
- OpenCode command probes: `debug config`, `providers list`, `models [provider] --verbose`, `run --help`, `debug paths`, and `session list`
- effective config and precedence tasks
- fail-fast preflight integration tasks
- secret redaction and typed error tests
- risks and open questions carried forward
- success criteria proving missing unrecoverable setup fails before process launch

## Evidence Review Checklist

- [x] Review can trace every sprint decision back to PRD/TRD requirements.
- [x] Review can trace every meaningful design choice back to evolved study evidence or an explicit open question.
- [x] Review can identify which evidence was loaded, omitted, rejected, or explored directly.
- [x] Review can see credible alternatives and why they were rejected.
- [x] Review can verify the planned tests and runtime evidence.
- [x] Review can identify planned or unplanned deviations.

## Phase Exit Criteria

- [x] Sprint scope is fully covered.
- [x] Target PRD and TRD requirements are mapped.
- [x] Evidence packs were read or staged according to the context strategy.
- [x] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [x] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [x] Important decisions are explicitly justified.
- [x] Non-trivial alternatives are discussed.
- [x] Deviations, assumptions, risks, and unknowns are documented.
- [x] Expected execution and review evidence is defined.
- [x] The sprint tracker can be written from this reasoning without reopening every study report.

## Documentation Updates

- `targets/agentwrap/sprints/05-health-config/plan.md` - must carry forward the CLI-scope correction, decisions, risks, tests, and success criteria.
- `targets/agentwrap/DECISIONS.md` - implementation should add accepted decisions only after code confirms the health/config public API and OpenCode probe behavior.
- `targets/agentwrap/roadmap.md` - optional later correction to remove executable command wording from Sprint 5.
