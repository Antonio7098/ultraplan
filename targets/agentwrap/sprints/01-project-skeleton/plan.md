# Sprint Tracker: Project Skeleton and Test Harness

> Target: agentwrap
> Sprint ID: 01-project-skeleton
> Created: 2026-05-18
> Reasoning: `targets/agentwrap/sprints/01-project-skeleton/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 1: Project Skeleton and Test Harness`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`

## Sprint Overview

- **Sprint Name:** Project Skeleton and Test Harness
- **Sprint Focus:** Create a buildable Go module with a visible SDK boundary, injectable private helpers, private fake structured-event fixtures, and first tests that run without OpenCode. The reused Go CLI study material is evidence about internals and principles only, not a commitment to ship a CLI surface.
- **Depends On:** Sprint 0 target brief and decision scaffold.
- **Status:** Complete

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - reusable SDK boundary, product-agnostic runtime wrapper direction, structured output requirement, output safety, and non-goals excluding UltraPlan workflow logic.
- `targets/agentwrap/sources/TRD.md` - SDK/product boundary, future runtime interface constraints, structured runtime event requirements, configuration/security future constraints, concurrency isolation, and acceptance criteria.
- `targets/agentwrap/sources/feature-architecture.md` - state-first modular flow, explicit ownership, runtime/logic/infra separation, minimal-abstraction rule, and collapse check.
- `targets/agentwrap/roadmap.md` - Sprint 1 goal, scope, output, evidence inputs, and quality gate.
- `targets/agentwrap/sprints/01-project-skeleton/reasoning.md` - decisions, tradeoffs, expected evidence, risks, assumptions, and open questions this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt` - generated `study evolve --top-sources 1` bundle used for planning.
- `targets/agentwrap/reports/evidence/cli-design.md` - reused from a different project as internal evidence about boundaries, IO, and testability; not a directive to ship a CLI surface here.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - supports fake-runtime-first verification, structured fixtures, table-driven tests, and real-runtime deferral.
- `studies/go-cli-study/reports/final/01-project-structure.md` - supports `cmd/` entrypoint, public SDK/library boundary, private `internal/` code, and unidirectional imports.
- `studies/go-cli-study/reports/final/02-command-architecture.md` - supports side-effect-free command construction, thin wrappers, and deferring complex command hierarchy.
- `studies/go-cli-study/reports/final/03-dependency-injection.md` - supports visible composition root, manual DI, factory functions, and minimal globals.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - direct roadmap-listed evidence for injected stdin/stdout/stderr and buffer-based tests.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports table-driven tests, fixture/golden data where useful, fake implementations, and behavior-focused assertions.
- `studies/go-cli-study/reports/final/12-extensibility.md` - supports delaying plugin and registry complexity while keeping boundaries clear.
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - supports structured event fixture discipline while leaving public runtime/session/turn/event contract decisions to Sprint 2.

## Sprint Goals

- **Primary Goal:** Establish the smallest buildable and testable Go project skeleton that later SDK contract and OpenCode adapter sprints can build on without reworking package ownership.
- **Secondary Goals:**
  - Create a thin CLI entrypoint that delegates to testable code and does not perform runtime work during command construction.
  - Create a visible public SDK package boundary without defining the Sprint 2 runtime contract early.
  - Add private structured event fixture loading and fake lifecycle tests that do not depend on OpenCode or terminal output.
  - Establish `go test ./...` or the repository's equivalent as the first implementation quality command.

## Scope

- Initialize or verify a single Go module in the implementation repository recorded by the target brief.
- Add a root public SDK package reserved for future public SDK contract code, with only minimal package documentation or compile-safe placeholder content in this sprint.
- Add `cmd/agentwrap/main.go` as a thin executable entrypoint that wires process args, stdin/stdout/stderr, build metadata if needed, and delegates to internal CLI code.
- Add an internal CLI runner or command constructor that accepts explicit args and IO streams and returns an exit code or error without calling `os.Exit`.
- Add private/test-only fake structured-event fixtures and fixture loader support, preferably JSONL records that preserve raw lines and structured decode results.
- Add first tests for CLI construction, injected IO behavior, fixture loading, malformed/unknown/partial structured event handling, and fake lifecycle transitions.
- Confirm package imports are acyclic and dependency flow remains `cmd/agentwrap -> internal/cli -> SDK/private helpers`, never the reverse.

## Non-Scope

- Do not define the durable public runtime/session/run/turn/event/error contract; Sprint 2 owns it.
- Do not invoke, parse, smoke-test, or require real OpenCode.
- Do not implement OpenCode structured event adapter behavior; Sprint 3 owns it.
- Do not implement real cancellation, process cleanup, retained-session behavior, timeouts, or cleanup failure handling; Sprint 4 owns it.
- Do not implement health checks, provider/model readiness, authentication checks, effective configuration precedence, or config commands; Sprint 5 owns them.
- Do not implement retry, fallback, backoff, rate-limit hooks, validation, repair, persistence, dashboards, cost estimation, or active-run inspection.
- Do not add UltraPlan-specific study, synthesis, sprint planning, scoring, report validation, or workflow/DAG concepts to the SDK.
- Do not add a dynamic plugin loader, runtime registry, or third-party extension system.
- Do not commit to Cobra or another command framework unless implementation documents a concrete blocker for the lightweight skeleton.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Use one Go module. Reserve the module root package for the public SDK surface. Use `cmd/agentwrap` for the binary entrypoint. Use `internal/cli` for private command construction/running. Use a private test harness location such as `internal/testkit` or package-local `testdata` for fake fixtures.
- **Public Surface:** Package existence and documentation only, unless a tiny compile placeholder is necessary. No runtime contract, event schema, error model, configuration model, or OpenCode-specific public type should be added in Sprint 1.
- **State And Lifecycle:** Keep state harness-local. Fake lifecycle states may exist only inside private tests/testkit to prove fixture-driven behavior; Sprint 2 defines public lifecycle vocabulary.
- **Error And Failure Behavior:** CLI runner can return ordinary errors or exit codes for skeleton/help/version cases. Fixture loader should expose decode errors in tests, but public SDK classified errors are Sprint 2 scope.
- **Observability:** No production observability yet. Preserve structured fixture raw records and decoded fields so later canonical event tests can audit source records.
- **Testing Surface:** `go test ./...`, CLI construction tests with buffers, fixture loader tests for normal/unknown/malformed/partial records, and fake lifecycle tests. No network, provider credentials, terminal interaction, or OpenCode binary required.

## Decisions

- [x] **Decision 1: Use Root SDK Package Plus `cmd/agentwrap` And `internal/` Boundaries**
  > **Requirement:** PRD reusable SDK boundary; TRD system boundary; roadmap Sprint 1 SDK/library and CLI separation.
  > **Evidence:** `reasoning.md` Decision Area 1; project-structure final report supports thin `cmd/` entrypoints, public library packages for SDK use, and `internal/` for private implementation.
  > **Tradeoff:** The root public package exists before the public runtime contract is implemented.
  > **Rejected Alternative:** `pkg/agentwrap` public package; rejected for Sprint 1 because it adds namespace stutter before multiple public packages exist. All code under `internal/`; rejected because the product is an SDK, not just a CLI.
  > **Risk / Follow-up:** Keep root package minimal and record an accepted layout decision in `DECISIONS.md` only after implementation and tests validate the boundary.

- [x] **Decision 2: Keep CLI Skeleton Framework-Neutral And Side-Effect-Free**
  > **Requirement:** Roadmap Sprint 1 quality gate that CLI commands can be constructed without side effects; roadmap rule that CLI code stays thin.
  > **Evidence:** `reasoning.md` Decision Area 2; command-architecture final report supports thin factories and says command frameworks are justified by real command breadth.
  > **Tradeoff:** Sprint 9 may later refactor to Cobra or another command framework.
  > **Rejected Alternative:** Adopt Cobra now; rejected as premature because Sprint 1 has no real product command tree.
  > **Risk / Follow-up:** Reopen CLI framework choice in Sprint 9 when health/run/status/cancel/inspect/validate commands are in scope.

- [x] **Decision 3: Use Explicit IO And Dependency Injection Through The Composition Root**
  > **Requirement:** TRD future configuration/security/concurrency constraints and roadmap testability gate.
  > **Evidence:** `reasoning.md` Decision Area 3; DI final report supports manual composition roots and minimal globals; IO final report supports injected streams and test buffers.
  > **Tradeoff:** More explicit wiring than direct `os.*` access.
  > **Rejected Alternative:** Packages read globals directly; rejected because it makes tests brittle and hides future config/secrets behavior.
  > **Risk / Follow-up:** Review for direct `os.Stdout`, `os.Stderr`, `os.Exit`, package-level mutable config, and service singleton leakage.

- [x] **Decision 4: Keep Fake Runtime And Fixture Harness Private/Test-Only**
  > **Requirement:** Roadmap Sprint 1 fake runtime fixtures, structured event fixture loading, and fake lifecycle tests; PRD/TRD structured event requirements.
  > **Evidence:** `reasoning.md` Decision Area 4; testing-strategy pack requires structured event fixtures for normal, malformed, partial, and unknown streams.
  > **Tradeoff:** Sprint 2 may adapt or replace harness types when it defines the public runtime contract.
  > **Rejected Alternative:** Use terminal transcript fixtures; rejected because requirements prefer structured output. Define public runtime contract now; rejected as Sprint 2 scope.
  > **Risk / Follow-up:** Label harness packages and fixture schemas as test support, not public API.

- [x] **Decision 5: Use Fast Deterministic Tests As The Sprint Gate**
  > **Requirement:** Roadmap Sprint 1 quality gate and non-negotiable fake-runtime-first rule.
  > **Evidence:** `reasoning.md` Decision Area 5; testing final report supports table-driven tests, fixtures, fakes, and behavior assertions.
  > **Tradeoff:** No evidence about real OpenCode behavior in this sprint.
  > **Rejected Alternative:** Add real OpenCode integration smoke; rejected as Sprint 3 scope. Defer tests; rejected because Sprint 1 explicitly includes first tests.
  > **Risk / Follow-up:** Sprint 3 must add real OpenCode pressure once adapter behavior is in scope.

## Execution Checklist

- [x] **Task 1: Verify Implementation Repository And Module Starting Point**
  > *Description: Start from the correct code location and avoid writing implementation code into target planning directories.*
  - [x] **Sub-task 1.1:** Confirm the implementation repository path from `targets/agentwrap/brief.md` or record the corrected path before coding.
  - [x] **Sub-task 1.2:** Inspect whether a Go module already exists; if it does, preserve existing module path and conventions unless they conflict with sprint requirements.
  - [x] **Sub-task 1.3:** If initializing a module, choose the module path explicitly and record it in sprint execution evidence.

- [x] **Task 2: Create Minimal Go Module And Package Boundaries**
  > *Description: Create the smallest package layout that separates public SDK surface, executable entrypoint, and private implementation/test support.*
  - [x] **Sub-task 2.1:** Create or verify `go.mod` and a root public SDK package that compiles without exposing runtime contract types.
  - [x] **Sub-task 2.2:** Create `cmd/agentwrap/main.go` as the only package that directly wires process-global args, streams, and exit behavior.
  - [x] **Sub-task 2.3:** Create private internal package(s) only where they carry real skeleton behavior, such as CLI construction or test fixture loading.
  - [x] **Sub-task 2.4:** Confirm no package cycle and no import from SDK/internal code back into `cmd/agentwrap`.

- [x] **Task 3: Add Thin CLI Runner With Injected IO**
  > *Description: Make the CLI constructible and testable without runtime side effects.*
  - [x] **Sub-task 3.1:** Implement an internal CLI runner or command constructor that accepts args plus stdin/stdout/stderr and returns an exit code or error.
  - [x] **Sub-task 3.2:** Support only skeleton-safe behavior such as help/version/no-op root output; do not add runtime commands.
  - [x] **Sub-task 3.3:** Keep `os.Exit`, `os.Args`, `os.Stdout`, and `os.Stderr` access in `cmd/agentwrap/main.go` only.
  - [x] **Sub-task 3.4:** Add tests proving command construction and repeated invocations work with buffers and no side effects.

- [x] **Task 4: Add Structured Fixture Loader And Fixtures**
  > *Description: Establish durable structured-event fixture discipline before real OpenCode integration exists.*
  - [x] **Sub-task 4.1:** Add fixture directory under `testdata` or private testkit conventions.
  - [x] **Sub-task 4.2:** Add JSONL or equivalent structured fixtures for normal events, unknown event type, malformed record, partial stream, and lifecycle failure.
  - [x] **Sub-task 4.3:** Implement fixture loading that preserves sequence/order, raw record text or bytes, decoded fields, and decode errors.
  - [x] **Sub-task 4.4:** Add table-driven tests for normal, unknown, malformed, and partial fixture cases.

- [x] **Task 5: Add Private Fake Lifecycle Harness**
  > *Description: Prove fake runtime-like behavior without defining the public runtime contract.*
  - [x] **Sub-task 5.1:** Implement a private fake lifecycle script/runner driven by fixtures or deterministic test data.
  - [x] **Sub-task 5.2:** Test a successful fake lifecycle through starting/running/completed or equivalent harness-local states.
  - [x] **Sub-task 5.3:** Test a failure lifecycle for malformed event or explicit fake failure.
  - [x] **Sub-task 5.4:** Document in code comments or test names that these are harness-local states and not the Sprint 2 public lifecycle contract.

- [x] **Task 6: Run Quality Gates And Review Scope**
  > *Description: Close the sprint with executable evidence and explicit deferrals.*
  - [x] **Sub-task 6.1:** Run `go test ./...` or the repository's equivalent and record the result.
  - [x] **Sub-task 6.2:** Review imports and package layout for CLI/library cycles or unclear ownership.
  - [x] **Sub-task 6.3:** Review code for accidental OpenCode invocation, public runtime contract types, product workflow concepts, global mutable config, and direct IO outside the entrypoint.
  - [x] **Sub-task 6.4:** Update `targets/agentwrap/DECISIONS.md` only for implementation-confirmed accepted decisions, if any, with requirement, evidence, tradeoff, rejected alternative, and risk/follow-up.

## Testing And Documentation Checklist

- [x] **Unit Tests:** CLI runner construction, injected IO behavior, repeated in-process invocations, fixture loader decode paths, and fake lifecycle transitions.
- [x] **Fixture Tests:** normal structured event stream, unknown event type, malformed record, partial stream, lifecycle failure, and raw-record preservation.
- [x] **Integration Tests:** limited to in-process CLI/testkit behavior only; no external runtime, provider, network, or terminal dependency.
- [x] **Real Runtime Smoke:** explicitly deferred to Sprint 3 because Sprint 1 has no real OpenCode integration.
- [x] **Documentation Updates:** code comments or package docs should identify public SDK boundary, private CLI/testkit boundaries, real-runtime deferral, and fake harness non-public status. Update `DECISIONS.md` only after implementation evidence exists.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Implementation repository path is missing or differs from the target brief | High | Verified `/home/antonioborgerees/coding/agentwrap` from `brief.md`; created implementation there | Closed |
| CLI framework is chosen before product command scope exists | Medium | Kept skeleton framework-neutral and recorded Sprint 9 follow-up in `DECISIONS.md` | Closed |
| Root package accumulates speculative public API | High | Root package contains package documentation only; Sprint 2 owns public contract | Closed |
| Fake harness types become accidental public API | High | Kept under `internal/testkit` and documented non-public status | Closed |
| Fixture format fails to represent real OpenCode output | Medium | Preserve raw records and let Sprint 3 add representative OpenCode fixtures | Carried Forward |
| Direct `os.*` or global mutable config leaks into internal packages | Medium | `rg` review found process IO/exit only in `cmd/agentwrap/main.go`; test file fixture reads use `os.Open` only for testdata | Closed |
| Omitted per-source evidence hides an implementation-specific caveat | Low | Reopen per-source reports only for concrete blockers and cite added evidence | Open |
| Go toolchain is unavailable in this environment | High | Installed by user; verification rerun with `GOCACHE=/tmp/agentwrap-go-build` because sandbox cannot write default home cache | Closed |

## Open Questions

- What module path should be used if the implementation repository is not already initialized? - Resolved for Sprint 1: `github.com/antonioborgerees/agentwrap`.
- Should Sprint 9 adopt Cobra, another command framework, or keep the lightweight runner? - Needs real command surface pressure.
- Should structured fixtures remain JSONL after Sprint 3 captures real OpenCode output? - Needs adapter evidence.
- Which fake harness components should become public contract tests in Sprint 2? - Sprint 2 owns the public contract decision.
- Should package layout and CLI framework deferral become accepted `DECISIONS.md` entries? - Only after implementation and tests validate the choices.

## Success Criteria

- [x] **Success Criteria 1:** A buildable Go module exists in the implementation repository and `go test ./...` or equivalent passes without OpenCode.
- [x] **Success Criteria 2:** The project has a clear root SDK package, `cmd/agentwrap` entrypoint, and private internal CLI/test harness packages with no package cycles.
- [x] **Success Criteria 3:** CLI construction is side-effect-free in tests, uses injected IO, and keeps `os.Exit`/process-global IO in the executable entrypoint only.
- [x] **Success Criteria 4:** Structured event fixture loader tests cover normal, unknown, malformed, partial, and failure-oriented fixture cases while preserving raw records.
- [x] **Success Criteria 5:** Fake lifecycle tests prove deterministic fake behavior without launching OpenCode or defining the public runtime contract.
- [x] **Success Criteria 6:** Review can explain the skeleton as: CLI boundary -> SDK boundary -> private fake harness, with real runtime behavior deferred.
- [x] **Success Criteria 7:** No UltraPlan workflow logic, real OpenCode adapter, health/config, retry/fallback, validation/repair, persistence, dashboard, or product CLI commands are added.

## Study Evaluation

- [x] **Patterns Followed:** thin CLI entrypoint, unidirectional imports by source inspection, root composition, injected IO, manual DI, private fakes, structured fixtures, table-driven behavior tests, no real-runtime dependency.
- [x] **Anti-Patterns Avoided:** monolithic `main.go`, command handlers with business/runtime logic, package-level mutable config, direct stdout/stderr/exit in testable packages, terminal transcript parsing, premature command framework, public runtime API before Sprint 2.
- [x] **Comparison Needed:** Compared completed skeleton against `reasoning.md` Decision Areas 1-5 and evidence dimensions from project-structure, command-architecture, DI, IO abstraction, and testing-strategy reports.
- [x] **Proceed / Iterate:** Proceed to Sprint 2 after Go toolchain verification confirmed the skeleton builds, tests pass, and package imports are acyclic.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-18

## Execution Evidence

- Planning evidence bundle exists: `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`.
- Sprint reasoning completed before this tracker: `targets/agentwrap/sprints/01-project-skeleton/reasoning.md`.
- Planning used staged evidence loading because the bundle reports 38,486 lines and about 407,212 estimated tokens.
- Direct additional evidence used for Sprint 1 IO/testability decisions: `studies/go-cli-study/reports/final/06-io-abstraction.md`.
- Implementation repository path, module path, tests run, fixture list, explicit deferrals, and any decision-log updates should be appended here during sprint execution.
- Implementation repository path verified from `targets/agentwrap/brief.md`: `/home/antonioborgerees/coding/agentwrap`.
- No existing implementation module was present at `/home/antonioborgerees/coding/agentwrap`; Sprint 1 initialized module path `github.com/antonioborgerees/agentwrap`.
- Implemented root SDK package documentation only in `/home/antonioborgerees/coding/agentwrap/doc.go`.
- Implemented thin executable entrypoint in `/home/antonioborgerees/coding/agentwrap/cmd/agentwrap/main.go`.
- Implemented framework-neutral injected-IO CLI runner and tests in `/home/antonioborgerees/coding/agentwrap/internal/cli`.
- Implemented private structured fixture loader, harness-local fake lifecycle, tests, and JSONL fixtures in `/home/antonioborgerees/coding/agentwrap/internal/testkit`.
- Fixture list: `normal.jsonl`, `unknown.jsonl`, `malformed.jsonl`, `partial.jsonl`, `lifecycle_failure.jsonl`.
- Scope review command: `rg "os\\.|OpenCode|opencode|type (Runtime|Session|Run|Event|Error)" -n .` from implementation repo. Findings: process-global args/stdout/stderr/exit only in `cmd/agentwrap/main.go`; fixture tests use `os.Open` for testdata; no OpenCode invocation; no public runtime/session/run/error contract types.
- Verification blocked: `go test ./...` failed with `bash: go: command not found`.
- Verification blocked: `go list -deps ./...` failed with `bash: go: command not found`.
- Environment check: `which go` reported no Go binary on `PATH`.
- Formatting verification blocked: `which gofmt` reported no `gofmt` binary on `PATH`.
- Decision log updated with `DEC-001`, `DEC-002`, and `DEC-003`.
- User installed Go; `go version` reported `go version go1.26.3-X:nodwarf5 linux/amd64`.
- Added `/home/antonioborgerees/coding/agentwrap/README.md` with scope guardrails and development commands.
- Added `/home/antonioborgerees/coding/agentwrap/.github/workflows/ci.yml` to run formatting and `go test ./...` on pushes to `main` and pull requests.
- Ran `gofmt -w .` successfully from the implementation repository.
- Formatting gate passed: `test -z "$(gofmt -l .)"`.
- Initial `go test ./...` and `go list ./...` failed because the sandbox could not create `/home/antonioborgerees/.cache/go-build`.
- Verification rerun with sandbox-writable cache: `GOCACHE=/tmp/agentwrap-go-build go test ./...` passed for all packages.
- Package layout verification rerun with sandbox-writable cache: `GOCACHE=/tmp/agentwrap-go-build go list ./...` listed root package, `cmd/agentwrap`, `internal/cli`, and `internal/testkit` with no cycles.
