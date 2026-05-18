# Sprint Reasoning: Project Skeleton and Test Harness

> Target: agentwrap
> Sprint ID: 01-project-skeleton
> Output: `targets/agentwrap/sprints/01-project-skeleton/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/01-project-skeleton/plan.md`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`

## Overview

**Sprint:** Project Skeleton and Test Harness
**Purpose:** Establish a buildable Go project shape, SDK/internal boundary, injectable IO, and fake structured-event test harness before implementing the public runtime contract or real OpenCode adapter behavior. The reused Go CLI study material informs internals and principles only; it is not a CLI product direction.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 1: Project Skeleton and Test Harness`
**Depends On:** Sprint 0 target brief and decision scaffold.
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - product goals, runtime abstraction, structured output, output safety, product-agnostic SDK boundary, and non-goals used to constrain the skeleton.
- `targets/agentwrap/sources/TRD.md` - system boundary, runtime interface direction, structured runtime events, cancellation/cleanup future requirements, configuration future requirements, testable event decoding needs, and acceptance criteria used to avoid premature behavior.
- `targets/agentwrap/sources/feature-architecture.md` - state-first modular flow, runtime/logic/infra separation, earned-abstraction rule, and collapse check used to keep the skeleton small.
- `targets/agentwrap/roadmap.md` - Sprint 1 goal, scope, evidence inputs, output, and quality gate.

## Evidence Basis

**Evidence Bundle:** `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`
**Evidence Status:** Complete and used with staged loading plus one roadmap-listed direct report.
**Context Strategy:** Staged loading used. The bundle summary reports 38,486 lines and about 407,212 estimated tokens, so planning loaded required PRD/TRD/feature protocol/roadmap/template sources, both evidence pack sections, relevant final report sections, selected code references, and the roadmap-listed IO abstraction final report opened directly because Sprint 1 roadmap evidence lists it but the generated bundle does not include it.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/cli-design.md` - reused from a different project as internal evidence about boundaries, injection, and testability; not a CLI product directive.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - informs fake-runtime-first verification, fixture layout, fixture decoding, and sprint quality gates.

### Final Reports Used

- `studies/go-cli-study/reports/final/01-project-structure.md` - supports a strict CLI-to-library dependency direction, `cmd/` entrypoint, public library boundary for SDK use, and avoiding package cycles.
- `studies/go-cli-study/reports/final/02-command-architecture.md` - supports thin command wrappers, command factories, explicit dependency passing, and avoiding large `RunE`/handler functions.
- `studies/go-cli-study/reports/final/03-dependency-injection.md` - supports a visible composition root, manual constructor injection, minimal globals, and avoiding package-level config/service singletons.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - opened directly; supports injected `io.Reader`/`io.Writer` streams, test constructors or buffers, and avoiding direct `os.Stdout`/`os.Stderr` outside the composition root.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports table-driven tests, fixtures, fake implementations, behavior-focused assertions, and explicit integration deferral.
- `studies/go-cli-study/reports/final/12-extensibility.md` - supports delaying plugin/extension complexity while keeping public/private boundaries clear.
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - supports keeping the public runtime contract for Sprint 2, while Sprint 1 only prepares a fakeable and structured-event-friendly project surface.

### Per-Source Reports Used

- None in full. The sprint decisions were adequately supported by evidence packs, final reports, selected resolved code references, and the directly opened IO final report.

### Code References Used

- `chezmoi / main.go:16-34` - thin entrypoint delegates to internal command package and exits with the returned code.
- `gh-cli / pkg/cmdutil/factory.go:16-43` - factory object pattern shows explicit command dependencies instead of globals.
- `helm / pkg/cmd/install.go:132-145` - command factory accepts dependencies and an output writer.
- `go-task / executor.go:553-577` - functional IO options show ergonomic stream injection for tests.
- `gh-cli / pkg/iostreams/iostreams.go:551-568` - test IO constructor pattern provides in-memory stdin/stdout/stderr buffers.
- `chezmoi / internal/cmd/main_test.go:64-174` - fixture/script-style CLI tests demonstrate executable documentation for command behavior.
- `lazygit / pkg/commands/oscommands/fake_cmd_obj_runner.go:17-26` - fake command runner pattern supports deterministic tests without side effects.
- `opencode / packages/sdk/js/src/gen/types.gen.ts:704-736` - native OpenCode events are structured and varied, supporting a fixture loader that starts with structured records rather than terminal text.

### Evidence Rejected Or Not Used

- **Configuration management and terminal UX final reports in the bundle:** Not used for major decisions because Sprint 1 does not implement configuration precedence, terminal UX, health commands, status commands, color, prompts, or product CLI output.
- **Most per-source reports and resolved code references:** Omitted because project skeleton decisions were answered by final reports and selected code references; source-specific details are not needed until implementation hits a concrete blocker.
- **Workflow composition and observability per-source material:** Not used for decisions because Sprint 1 must not introduce workflow/DAG or dashboard behavior.
- **Real repository code exploration:** Not performed beyond generated bundle/direct report reads because the planning question is adequately answered by the bundle and roadmap-listed reports.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| SDK should be reusable by UltraPlan and future tools without product code knowing runtime process/event details | PRD Product Summary lines 3-7 | SDK boundary | Applicable | Requires a library surface separate from CLI entrypoint, even before the contract is implemented. |
| Do not build UltraPlan workflows or product-specific planning logic in the SDK | PRD Non-Goals lines 38-45; TRD System Boundary lines 7-12 | Scope control | Applicable | Prevents skeleton packages from encoding UltraPlan study/sprint concepts. |
| Use OpenCode structured output rather than parsing free-form terminal text | PRD Non-Goals line 45; TRD Structured Runtime Events lines 39-48 | Structured fixtures | Applicable | Fixture loader should operate on structured records, not terminal transcript text. |
| Runtime-neutral interface for starting, monitoring, cancelling, inspecting runtime work | TRD Runtime Interface lines 15-22 | Future public contract | Applicable as future constraint only | Skeleton must leave room for Sprint 2 public contract without deciding it in Sprint 1. |
| Process/session cleanup and cancellation future requirements | TRD Run and Session Lifecycle lines 23-38 | Future lifecycle behavior | Applicable as non-scope constraint | Fake lifecycle tests should be harness-level only and not imply real cancellation/cleanup behavior. |
| Invalid config must be rejected before execution and sensitive values must not be logged | TRD Configuration Requirements lines 80-88 | Future config | Non-Applicable for implementation | No config precedence or secrets handling belongs in Sprint 1; skeleton should not add globals that make later validation harder. |
| Multiple concurrent runs and isolated state | TRD Concurrency lines 222-230 | Future isolation | Applicable as design constraint | Avoid global mutable run state in fake harness and CLI wiring. |
| Sprint 1 scope: minimal Go module and CLI skeleton, SDK/CLI separation, fake runtime fixtures, event fixture loading, tests, no real OpenCode integration | Roadmap Sprint 1 lines 141-178 | Sprint scope | Applicable | Defines the sprint output and quality gate. |
| State-first protocol: identify state, assign owner, write runtime flow first, avoid speculative abstractions | Feature architecture phases 1-8 | Design discipline | Applicable | Keeps directories and helpers limited to current behavior and test needs. |

### Applicable Requirements

- **Reusable SDK boundary:** Sprint 1 must create a package/module shape where future public SDK code is importable independently from the CLI binary.
- **Thin CLI boundary:** Sprint 1 must ensure CLI code delegates to library/testable code and can be constructed without performing runtime side effects.
- **Structured fixture handling:** Sprint 1 must add structured event fixture loading so later event work starts from durable fixture files, not free-form stdout parsing.
- **Fake-first testing:** Sprint 1 must establish fake runtime fixtures and fake lifecycle tests so Sprint 2 can add the public contract without needing OpenCode.
- **No product-specific workflow logic:** Sprint 1 must avoid UltraPlan concepts, workflow/DAG abstractions, validation/repair flows, persistence, dashboards, and cost estimation.

### Non-Applicable Requirements

- **Public runtime contract:** Belongs to Sprint 2. Sprint 1 should not define durable public runtime/session/run/turn/event/error APIs beyond any minimal package placeholder needed for compilation.
- **Real OpenCode adapter:** Belongs to Sprint 3. Sprint 1 should not invoke OpenCode, depend on OpenCode being installed, or parse OpenCode-native event schemas.
- **Cancellation, cleanup, retained sessions:** Belongs to Sprint 4. Sprint 1 fake lifecycle tests can use local harness states only.
- **Health checks and configuration validation:** Belongs to Sprint 5. Sprint 1 should avoid configuration globals and not define precedence semantics.
- **Retry/fallback/rate limits, validation/repair, persistence, observability, and CLI product commands:** Later sprints own these behaviors; Sprint 1 should only create a structure that does not block them.

### Ambiguous Or Conflicting Requirements

- **CLI framework choice:** Evidence supports Cobra or comparable frameworks for multi-command CLIs, but Sprint 1 only needs a minimal skeleton and Sprint 9 owns the product CLI surface. Choosing a full framework now would be premature unless implementation discovers the skeleton cannot meet the quality gate without it.
- **Public SDK package location:** Evidence supports both root public libraries and `pkg/` public package layouts. Because this target is an SDK first and a CLI second, the skeleton should use a short public module-root SDK package with `cmd/agentwrap` as the binary and `internal/` for private wiring, unless an existing implementation repository convention already dictates otherwise.
- **Fake runtime versus future runtime contract:** Sprint 1 needs a fake harness, but Sprint 2 must define the public contract. The fake harness should be clearly test infrastructure, not a public API promise.

### Open Questions

- What module path should the implementation repository use if it is not already initialized?
- Should Sprint 9 adopt Cobra, another command framework, or keep the lightweight command runner once real commands exist?
- Should fixture files be JSONL, JSON arrays, or another structured format once Sprint 3 captures representative OpenCode output?
- Which fake harness pieces become public contract tests in Sprint 2 and which remain private test helpers?
- Should accepted package-layout decisions be added to `DECISIONS.md` during implementation after the skeleton is validated?

## Sprint Decision Analysis

### Decision Area 1: Package And Module Boundary

**Problem:** Sprint 1 must create a buildable Go project structure that separates SDK/library code from the CLI entrypoint without prematurely designing the runtime contract.

**Requirements Applied**
- PRD product goals require a reusable SDK usable by multiple products.
- TRD system boundary says the SDK owns runtime supervision primitives and products own product workflows.
- Roadmap Sprint 1 requires a minimal Go module, CLI skeleton, SDK/library surface separation, and no real OpenCode integration.

**Evidence Applied**
- Project-structure final report says elite Go CLI projects keep a thin CLI at `cmd/` or equivalent and substantive logic in a library/interior layer with unidirectional imports.
- The same report says `internal/` enforces private implementation boundaries, while public library code should be importable when external consumers are intended.
- Feature architecture protocol requires ownership clarity and earned abstractions; empty layers or speculative ports should be collapsed.

**Options Considered**
- **Option A:** Use one Go module with a public SDK package at module root, `cmd/agentwrap` for the binary entrypoint, and `internal/` for private CLI/test harness implementation.
- **Option B:** Put public SDK code under `pkg/agentwrap` with the CLI under `cmd/agentwrap`.
- **Option C:** Put all code under `internal/` and expose only the CLI until the SDK contract exists.

**Chosen Approach**
- Use Option A unless an existing implementation repository convention already forces a different module layout. The module root is reserved for the public SDK package, `cmd/agentwrap` owns the executable entrypoint, and `internal/` owns private CLI wiring and test harness code.

**Decision Justification**
- Option A best satisfies the reusable SDK goal while avoiding an import path that stutters through `pkg/agentwrap`.
- Option B is evidence-supported for some public libraries, but it adds an extra namespace before any need for multiple public packages exists.
- Option C would contradict the SDK-first product direction and make future callers import private packages or wait for a layout migration.
- The accepted tradeoff is that the root package exists before the public runtime contract is implemented; Sprint 1 should keep it minimal and avoid public API promises beyond package existence.

**Execution Notes**
- The root public package should contain only a package doc or minimal compile-safe placeholder until Sprint 2 defines the runtime contract.
- `cmd/agentwrap/main.go` should be a composition root only: wire `os.Args`, stdin/stdout/stderr, call internal CLI runner, and exit with the returned code.
- Private implementation packages must not import `cmd/agentwrap`.

**Expected Evidence**
- **Tests:** `go test ./...` passes and package imports are acyclic.
- **Runtime Evidence:** None; no runtime behavior is implemented.
- **Review Checks:** Review confirms dependency flow is `cmd/agentwrap -> internal/cli -> public SDK or internal helpers`, never the reverse.

---

### Decision Area 2: CLI Skeleton Shape

**Problem:** The CLI skeleton must be constructible and testable without side effects, while avoiding a premature product command hierarchy or command framework decision.

**Requirements Applied**
- Roadmap Sprint 1 quality gate says CLI commands can be constructed without side effects.
- Roadmap non-negotiable rules say CLI code should remain thin and runtime behavior belongs behind SDK primitives.
- PRD/TRD keep product-specific workflows and runtime behavior out of the CLI layer.

**Evidence Applied**
- Command-architecture final report says high-scoring Go CLIs use thin command wrappers, factory functions, explicit dependencies, and separate business logic.
- Command-architecture final report says frameworks and subcommand hierarchies pay off for tools with several commands, but are overkill for single-command or skeletal tools.
- Project-structure and IO reports show command constructors should accept output streams or dependency bundles rather than hardcoding process-global IO.

**Options Considered**
- **Option A:** Implement a lightweight internal CLI runner with injected args and IO, returning an exit code, and defer command framework choice.
- **Option B:** Adopt Cobra now and create a root command even though Sprint 1 has no real product commands.
- **Option C:** Put argument handling directly in `main.go`.

**Chosen Approach**
- Use Option A. Sprint 1 should provide a lightweight CLI construction path that can be tested in-process, with no runtime side effects and no external command framework unless implementation discovers a concrete need.

**Decision Justification**
- Option A satisfies the quality gate and keeps the skeleton small.
- Option B may be appropriate by Sprint 9, but adopting it now would decide the CLI product surface before evidence from SDK primitives exists.
- Option C violates thin-entrypoint and testability evidence by mixing wiring and command behavior in `main.go`.
- The accepted tradeoff is a possible later CLI refactor if Sprint 9 chooses Cobra; that is lower risk than carrying unnecessary framework structure from Sprint 1.

**Execution Notes**
- The internal CLI runner may support only `--help` and `--version` or a no-op root invocation, as long as it is testable and side-effect-free.
- CLI tests should pass buffers for stdout/stderr and avoid `os.Exit` except in `main.go`.
- No health/run/status/cancel/inspect/validate commands should be added in Sprint 1.

**Expected Evidence**
- **Tests:** In-process CLI construction tests with injected args and buffers; no call to `os.Exit` in testable code.
- **Runtime Evidence:** None.
- **Review Checks:** Review confirms CLI code contains no runtime business logic, no OpenCode invocation, and no product workflow branching.

---

### Decision Area 3: IO And Dependency Injection

**Problem:** The skeleton must be testable without a real terminal, process, provider, filesystem side effects, or global configuration state.

**Requirements Applied**
- PRD target users include products embedding runtime work, so the SDK and CLI must be testable outside a human terminal session.
- TRD configuration and security requirements will later need inspectable effective configuration and secret-safe diagnostics; global config would make this harder.
- TRD concurrency requirements require run state to stay isolated and avoid leaked shared workers or streams.

**Evidence Applied**
- Dependency-injection final report says high-scoring Go CLIs use visible composition roots, manual DI, factory functions, minimal globals, and explicit construction.
- IO abstraction final report says testability hinges on injecting `io.Reader`/`io.Writer` streams and avoiding direct `os.Stdout`/`os.Stderr` outside the composition root.
- Testing final report says centralized fakes and buffers enable deterministic behavior assertions.

**Options Considered**
- **Option A:** Define a small internal IO/dependency bundle for CLI construction with stdin/stdout/stderr and build metadata, created by `main.go` for production and tests with buffers.
- **Option B:** Let packages read `os.Args`, `os.Stdout`, `os.Stderr`, environment, and globals directly.
- **Option C:** Add a full application container or DI framework.

**Chosen Approach**
- Use Option A. Sprint 1 should centralize process-global access in the executable entrypoint and pass explicit dependencies into testable internal code.

**Decision Justification**
- Option A satisfies testability, future secret-safety, and concurrency isolation pressure with minimal machinery.
- Option B repeats evidence-backed anti-patterns around hidden globals and untestable IO.
- Option C is unsupported by the evidence; no studied Go CLI uses a DI framework, and Sprint 1 does not need one.
- The accepted tradeoff is a small amount of explicit wiring boilerplate.

**Execution Notes**
- Build/version variables may remain in `main.go` or a small internal build info struct as immutable link-time values.
- Avoid package-level mutable config, service singletons, or registries.
- Tests should use `bytes.Buffer` or a small synchronized buffer only if concurrency is introduced.

**Expected Evidence**
- **Tests:** CLI tests capture stdout/stderr via buffers and can pass different args in the same test process.
- **Runtime Evidence:** None.
- **Review Checks:** Review finds no direct `os.Stdout`/`os.Stderr`/`os.Exit` in packages meant to be unit tested.

---

### Decision Area 4: Fake Runtime And Structured Fixture Harness

**Problem:** Sprint 1 must establish fake runtime fixtures and structured event loading, but Sprint 2 owns the public runtime contract and Sprint 3 owns real OpenCode event mapping.

**Requirements Applied**
- PRD/TRD require structured event handling and warn against parsing free-form terminal text when structured runtime output exists.
- Roadmap Sprint 1 scope requires fake runtime fixtures, structured event fixture loading, fake event decoding tests, and fake run lifecycle tests.
- Roadmap non-negotiable rules say to use fake runtimes and fixtures before trusting real OpenCode runs.

**Evidence Applied**
- Testing-strategy pack says to use structured event fixtures for normal, malformed, partial, and unknown event streams.
- Testing final report supports fake/stub command runners and fixture extraction to make side-effectful behavior deterministic.
- Runtime-contract final report and OpenCode code references show real OpenCode has structured event variants, but Sprint 1 should not expose them as the public contract.

**Options Considered**
- **Option A:** Create a private test harness with JSONL structured event fixtures, a fixture loader preserving raw records and decode errors, and a deterministic fake lifecycle script used only by tests.
- **Option B:** Use plain text terminal transcripts as fixtures.
- **Option C:** Implement the public runtime contract and fake runtime in Sprint 1.

**Chosen Approach**
- Use Option A. Sprint 1 should add structured fixture infrastructure and a fake lifecycle harness under private/test-only packages, clearly labeled as non-public test support.

**Decision Justification**
- Option A satisfies roadmap output without stealing Sprint 2 contract design.
- Option B conflicts with PRD/TRD and evidence warning against terminal text parsing.
- Option C pulls Sprint 2 work forward and risks defining public primitives before runtime-contract evidence is applied in that sprint.
- The accepted tradeoff is that the fake harness may be adapted or replaced in Sprint 2; its purpose is to establish fixture discipline and test execution, not public API permanence.

**Execution Notes**
- Prefer JSONL fixtures because event streams are naturally ordered records and malformed-line tests are straightforward.
- Include at least normal, unknown-event, malformed-record, partial-stream, and lifecycle-failure fixtures or planned test cases.
- Fixture records should preserve raw bytes/line and structured fields enough for later canonical mapping tests.

**Expected Evidence**
- **Tests:** Table-driven fixture loader tests for normal, unknown, malformed, and partial streams; fake lifecycle tests for queued/starting/running/completed or failed states using harness-local names.
- **Runtime Evidence:** Fake transcripts only; no OpenCode process.
- **Review Checks:** Review confirms fake types are private/test support and do not become the public SDK contract.

---

### Decision Area 5: Test And Quality Gate Baseline

**Problem:** Sprint 1 must leave the repository in a state where later sprints can add contract and adapter behavior with fast, deterministic tests.

**Requirements Applied**
- Roadmap Sprint 1 quality gate requires tests to exercise SDK behavior without OpenCode, CLI commands to construct without side effects, no package cycles, and a clear CLI -> SDK runtime primitive -> fake runtime explanation.
- TRD acceptance criteria later require cancellation, validation, metadata, and OpenCode behavior, but those must not be implemented in Sprint 1.
- Feature architecture protocol requires every file and abstraction to justify its existence.

**Evidence Applied**
- Testing final report says table-driven subtests, centralized fakes, golden/fixture data where useful, and behavior assertions are high-confidence patterns.
- IO abstraction final report says buffers and test constructors are enough for CLI output capture.
- Project-structure final report warns against monolithic packages, bidirectional imports, and unnecessary layers.

**Options Considered**
- **Option A:** Establish `go test ./...` as the baseline quality command, with table-driven unit/fixture tests and no external runtime dependency.
- **Option B:** Add integration tests that try to launch OpenCode when available.
- **Option C:** Create skeleton files only and defer tests to Sprint 2.

**Chosen Approach**
- Use Option A. Sprint 1 is complete only when the minimal module builds and tests prove CLI construction, fixture loading, and fake lifecycle behavior without external binaries.

**Decision Justification**
- Option A directly satisfies the Sprint 1 quality gate and testing evidence.
- Option B belongs to Sprint 3 and would introduce environment flakiness too early.
- Option C fails the roadmap requirement to add first tests and would leave Sprint 2 without a harness foundation.
- The accepted tradeoff is that tests cover fake/harness behavior only, not real runtime correctness.

**Execution Notes**
- Keep tests behavior-focused: outputs, exit codes, event records, decode results, and fake lifecycle transitions.
- Avoid testing private implementation details such as exact helper call counts unless they are part of the harness contract.
- Record real-runtime smoke deferral explicitly in the tracker.

**Expected Evidence**
- **Tests:** `go test ./...` passes in the implementation repository; fixture tests and CLI construction tests included.
- **Runtime Evidence:** None beyond fake fixture transcripts.
- **Review Checks:** Review confirms no real OpenCode dependency and no test requiring network, provider credentials, or terminal interactivity.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Sprint planning should use generated bundle as source of truth | Opened `studies/go-cli-study/reports/final/06-io-abstraction.md` directly outside the Sprint 1 bundle | Roadmap Sprint 1 lists IO abstraction evidence, but the generated bundle command includes only `cli-design.md` and `testing-strategy.md` and did not include the IO final report | Direct evidence could diverge from bundle selector discipline | Temporary, documented | If IO decisions expand during implementation, regenerate or supplement sprint evidence explicitly |
| Sprint 1 should produce a fake runtime harness but not public runtime contract | The fake harness may resemble later runtime concepts | Roadmap requires fake event decoding and fake run lifecycle before Sprint 2 defines the contract | Future agents could mistake harness types for public API | Mitigated by private/test-only placement and tracker warnings | Sprint 2 decides public contract and may adapt or replace harness types |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Use a single Go module with root public SDK package, `cmd/agentwrap` entrypoint, and `internal/` private implementation/test support:** Required by SDK reuse and supported by Go project-structure evidence.
- **Keep the CLI skeleton framework-neutral and side-effect-free:** Required by roadmap quality gate and supported by command-architecture evidence; product command hierarchy is deferred.
- **Use explicit IO/dependency injection through the composition root:** Supported by DI and IO evidence; avoids hidden globals before config/security/concurrency sprints.
- **Create private structured fixture and fake lifecycle harness:** Required by roadmap and testing evidence; public runtime contract remains Sprint 2 scope.
- **Use `go test ./...` with table-driven fixture/CLI tests as the quality baseline:** Required by Sprint 1 quality gate and testing evidence.

### Tradeoffs

- The root public SDK package exists before public runtime types are defined, accepted because the SDK boundary must be visible but Sprint 1 should keep it nearly empty.
- Deferring Cobra or another command framework may require a Sprint 9 refactor, accepted because a framework now would be premature for a skeleton with no product commands.
- Explicit IO wiring adds small boilerplate, accepted because it enables buffer-based tests and keeps globals out of future runtime work.
- JSONL fixture choice may need adjustment when real OpenCode fixtures are captured, accepted because ordered structured records are the smallest useful fixture format now.
- Fake harness tests cannot prove OpenCode compatibility, accepted because Sprint 3 owns real adapter evidence.

### Assumptions

- The implementation repository for code work is `/home/antonioborgerees/coding/agentwrap` as recorded in `targets/agentwrap/brief.md`, unless implementation agents confirm a different path.
- No existing Go module or package convention in the implementation repository conflicts with the planned skeleton.
- No persisted runtime records or public consumers exist yet, so the skeleton does not need backward-compatibility migrations.
- Sprint 2 may revise fake harness details when it defines the public runtime contract.

### Dependencies

- `targets/agentwrap/brief.md` and `targets/agentwrap/DECISIONS.md`: Provide target guardrails and decision logging policy.
- `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`: Planning source of truth for Sprint 1 evidence.
- Implementation repository availability: Sprint 1 code work must occur in the agentwrap implementation repository, not in target planning docs.
- Future Sprint 2: Depends on this sprint's buildable module, test command, private fake harness, and fixture conventions.

### Risks

- **Framework decision made too early:** Mitigate by keeping CLI skeleton framework-neutral unless implementation proves a concrete need.
- **Root package accumulates placeholder API:** Mitigate by limiting Sprint 1 public package content to documentation/minimal compile placeholder and leaving public runtime contract to Sprint 2.
- **Fake harness becomes accidental public API:** Mitigate by placing it under private/test-only packages and documenting that Sprint 2 owns public contract design.
- **Fixture format underfits real OpenCode output:** Mitigate by preserving raw fixture lines and expecting Sprint 3 to add representative OpenCode fixtures.
- **Global IO/config leaks into early code:** Mitigate with explicit CLI dependency bundle and tests that run multiple invocations in one process.
- **Large bundle evidence omitted from active context hides a source-specific caveat:** Mitigate by reopening per-source reports only for concrete implementation blockers.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/01-project-skeleton/plan.md`.

The tracker must include:

- scope limited to minimal Go module, root public SDK package, thin CLI entrypoint, internal CLI runner, injected IO, private fake fixture harness, and first tests
- non-scope blocking public runtime contract, real OpenCode adapter, health/config, retry/fallback, validation/repair, persistence, dashboards, workflow/DAG logic, and product CLI commands
- execution tasks derived from the five decision areas above
- test and evidence expectations including `go test ./...`, fixture loader tests, CLI construction tests, and fake lifecycle tests
- risks, assumptions, open questions, omitted evidence, and the direct IO report deviation carried forward
- success criteria proving the skeleton can be explained as CLI boundary -> SDK boundary -> private fake harness without side effects

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
- [x] Evidence bundle was read or staged according to the context strategy.
- [x] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [x] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [x] Important decisions are explicitly justified.
- [x] Non-trivial alternatives are discussed.
- [x] Deviations, assumptions, risks, and unknowns are documented.
- [x] Expected execution and review evidence is defined.
- [x] The sprint tracker can be written from this reasoning without reopening every study report.

## Documentation Updates

- `targets/agentwrap/sprints/01-project-skeleton/plan.md`: Must be created from this reasoning before implementation starts.
- `targets/agentwrap/DECISIONS.md`: Implementation may add accepted decisions only after the skeleton and tests validate package layout, CLI boundary, fixture harness, or framework deferral choices.
- `targets/agentwrap/brief.md`: No change required during planning; update only if implementation discovers a target-level requirement correction.
