# Source Analysis: victoriametrics

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics does not implement a traditional plugin architecture with dynamic loading (e.g., WASM, shared libraries, external plugins). Instead, it provides extensibility through: (1) configuration-driven relabeling pipelines, (2) interface-based component substitution (Querier, Rule, RWClient), (3) stream aggregation with configurable filters, and (4) Prometheus-compatible service discovery and remote write extension points. All "plugins" are actually built-in modules registered at compile time with no lifecycle hooks for external plugin loading.

## Rating

**3/10** — Poor implementation for external extensibility. VictoriaMetrics offers no dynamic plugin loading, no external extension API, and no SDK for third-party plugins. Extensibility is limited to configuration-driven transformations (relabeling) and internal interface substitution. The system cannot be extended with custom business logic at runtime without modifying the codebase.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| RelabelConfig struct | `RelabelConfig` YAML struct with source_labels, target_label, regex, action, replacement | `lib/promrelabel/config.go:20-45` |
| ParsedConfigs | Parsed relabel configurations holding parsed rule list | `lib/promrelabel/config.go:123-125` |
| Relabel apply() | Applies relabel actions to labels - keep, drop, replace, hashmod, labelmap, etc. | `lib/promrelabel/relabel.go:163-431` |
| IfExpression | Conditional expression for filtering | `lib/promrelabel/relabel.go:31` |
| StreamAggr Config | Config for stream aggregation with input/output relabeling | `lib/streamaggr/streamaggr.go:244-250` |
| LoadFromFile | Loads aggregators from config file path | `lib/streamaggr/streamaggr.go:71` |
| Querier interface | Query/QueryRange interface for datasource abstraction | `app/vmalert/datasource/datasource.go:16-26` |
| QuerierBuilder interface | Builds Querier with given params | `app/vmalert/datasource/datasource.go:43-46` |
| Rule interface | Alerting/recording rule interface with exec/execRange | `app/vmalert/rule/rule.go:20-38` |
| RWClient interface | Remote write client interface | `app/vmalert/remotewrite/remotewrite.go:8` |
| Notifier interface | Alert notification interface | `app/vmalert/notifier/notifier.go:10` |
| ScrapeWork | Scrape configuration with RelabelConfigs and MetricRelabelConfigs | `lib/promscrape/scrapework.go:124-127` |
| Relabel debug endpoints | /metric-relabel-debug and /target-relabel-debug HTTP endpoints | `lib/promscrape/relabel_debug.go:11-58` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**No evidence found.** VictoriaMetrics has no plugin discovery or loading mechanism. There is no `RegisterPlugin`, `LoadPlugin`, or equivalent function. Components that appear plugin-like (e.g., `Rule`, `Querier`) are interfaces implemented by internal types compiled into the binary. The only "discovery" is YAML configuration parsing (e.g., `LoadRelabelConfigs` at `lib/promrelabel/config.go:158`, `LoadFromFile` at `lib/streamaggr/streamaggr.go:71`), which reads static config files — not dynamic plugin modules.

### 2. What extension points exist for custom business logic?

- **Relabeling** (`lib/promrelabel/`): Configuration-driven label manipulation (keep, drop, replace, hashmod, labelmap, uppercase, lowercase). Supports conditional `if` expressions.
- **Stream Aggregation** (`lib/streamaggr/`): Configurable aggregation with `input_relabel_configs` and `output_relabel_configs` per aggregator at `lib/streamaggr/streamaggr.go:244-250`.
- **Service Discovery** (`lib/promscrape/config.go:269-294`): Static, consul, dns, eureka, etc. — all built-in, configured via YAML.
- **Remote Write** (`app/vmagent/remotewrite/remotewrite.go`): URL-based output with relabel configs for tenant-level filtering.
- **Alerting** (`app/vmalert/`): Rule interface at `app/vmalert/rule/rule.go:20` allows custom rule types, but all implementations are internal (RecordingRule, AlertingRule).
- **Querier** (`app/vmalert/datasource/datasource.go:16`): Querier interface could theoretically allow alternative backends, but only VictoriaMetrics implementation exists in the codebase.

**No evidence of runtime-extensible business logic hooks.** Custom logic requires implementing Go interfaces and recompiling.

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**No isolation mechanism exists for external plugins** because there are no external plugins. Relabel configs and aggregation configs are parsed and applied within the same Go process. Misbehaving relabel regex could cause catastrophic backtracking, but no sandboxing, process isolation, or resource limits per config are evident. Error handling uses panic recovery in some places but no structured plugin isolation model.

The only isolation observed is goroutine-based concurrency in the Go runtime, which provides no fault isolation between "plugins" (which are just config).

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No evidence found.** There is no plugin API versioning. Interfaces like `Rule` at `app/vmalert/rule/rule.go:20` and `Querier` at `app/vmalert/datasource/datasource.go:16` have no semantic versioning or contract guarantees. They can change between releases without notice. Configuration schemas (relabel_config YAML) have documented stability via Prometheus compatibility claims, but this is documentation, not enforced versioning.

### 5. What debugging and observability exists for plugin execution?

- **`/metric-relabel-debug`** HTTP endpoint at `lib/promscrape/relabel_debug.go:12` — allows testing metric relabeling interactively.
- **`/target-relabel-debug`** HTTP endpoint at `lib/promscrape/relabel_debug.go:37` — allows testing target relabeling.
- **`ApplyDebug`** method at `lib/promrelabel/relabel.go:72` — returns `DebugStep` list showing each rule's input/output.
- **Exposed metrics** via `/metrics` endpoint — internal metrics track relabeling outcomes (`vmagent_rows_relabeled_total`, etc.).
- No dedicated tracing or profiling for "plugin" execution specifically.

## Architectural Decisions

1. **Configuration-driven extensibility over code plugins.** VictoriaMetrics chose to make all extensibility configuration-based (YAML relabeling, stream aggregation configs, service discovery configs) rather than providing a plugin SDK. This sacrifices flexibility for simplicity and deployment predictability.

2. **Prometheus compatibility as extension model.** Relabel configs follow the Prometheus relabel_config specification exactly (`lib/promrelabel/config.go:20` references Prometheus docs). This provides familiarity but limits innovation to Prometheus-defined actions.

3. **No external plugin loading.** There is no `plugin.Load()`, no WASM support, no shared library loading. All "plugins" are Go packages imported at compile time. This eliminates the attack surface of dynamic code loading but prevents community extensibility.

4. **Interface-based internal substitution only.** Components like `Rule` (`app/vmalert/rule/rule.go:20`), `Querier` (`app/vmalert/datasource/datasource.go:16`), and `RWClient` (`app/vmalert/remotewrite/remotewrite.go:8`) are interfaces with internal implementations. This pattern could support替换，但VictoriaMetrics only ships with one implementation each.

## Notable Patterns

1. **ParsedConfigs pattern** (`lib/promrelabel/config.go:123`): Configuration is parsed once into `ParsedConfigs` and cached. The `Apply()` method is called repeatedly on each scrape/push cycle without re-parsing.

2. **Relabel action switch** (`lib/promrelabel/relabel.go:173-430`): Single switch statement handles all ~20 relabel actions (keep, drop, replace, replace_all, hashmod, labelmap, labelmap_all, labeldrop, labelkeep, uppercase, lowercase, graphite, etc.). Each action is a case with inline logic.

3. **DebugStep instrumentation** (`lib/promrelabel/relabel.go:48-62`): Relabeling supports debug mode via `ApplyDebug()` returning per-step input/output for human-readable debug output.

4. **MustStop lifecycle** (`lib/streamaggr/streamaggr.go:328`): Aggregators use `MustStop()` pattern for graceful shutdown with FlushOnShutdown option.

5. **Token-based multitenancy** (`lib/auth/auth.go`): Auth token abstraction supports multitenant routing but is not a plugin mechanism.

## Tradeoffs

- **Pro:** Zero external plugin attack surface — no dynamic code loading means no plugin-based security exploits.
- **Pro:** Simple deployment — single binary, no plugin registry management.
- **Pro:** Configuration is declarative and auditable — relabel configs can be reviewed and tested via debug endpoints.
- **Con:** Cannot extend with custom business logic without modifying source and recompiling.
- **Con:** Relabel regex errors (e.g., catastrophic backtracking) can crash the process — no sandboxing.
- **Con:** Interface evolution between releases can break external implementations of Rule/Querier/RWClient (though in practice no external implementations exist).
- **Con:** No official SDK or API stability guarantees for extensibility consumers.

## Failure Modes / Edge Cases

1. **Regex backtracking** — A malicious or buggy regex in relabel_config could cause catastrophic backtracking, hanging or crashing the scrape/push pipeline. No regex timeout or fuzz testing protection visible in the code.

2. **Config reload race** — If relabel configs are hot-reloaded via `/-/reload`, in-flight requests may see partially-updated config state. The reload uses SIGHUP (`procutil.SelfSIGHUP()`) but no atomic swap is evident.

3. **Relabel action ordering** — Relabel configs are applied in order. If a `keep` action drops all labels before a later `labelmap` action, the second action silently has no effect. This is consistent with Prometheus semantics but can surprise users.

4. **Stream aggregation memory growth** — If `dedup_interval` or aggregation windows are misconfigured, `aggregator` state (`lib/streamaggr/streamaggr.go`) can grow unbounded until `MustStop()`.

5. **Panic propagation** — Misconfigured relabel/regex can trigger `logger.Panicf` at `lib/promrelabel/relabel.go:428`, which would abort the process.

## Future Considerations

1. **Plugin SDK** — If HelloSales needs runtime extensibility, VictoriaMetrics would require a fundamentally different architecture (plugin registry, versioned interfaces, isolation).

2. **Sandboxing for relabel** — Wrap regex execution in timeouts or use RE2 (which is already used in some places) consistently to prevent backtracking.

3. **Interface stability** — If interfaces like `Rule`/`Querier` are to be used externally, they need semantic versioning and deprecation cycles.

4. **Config hot-reload atomicity** — Current SIGHUP-based reload could be made atomic with copy-on-write or double-buffer parsing.

## Questions / Gaps

1. **No external plugin loading mechanism** — Confirmed by searching for `plugin.Load`, `os.Open` with `.so` patterns, and `plugin.Register` — none exist in the codebase. All extensions are compile-time linked.

2. **No lifecycle hooks for plugin init/start/stop/health** — There is no `Plugin` interface with `Init()`, `Start()`, `Stop()`, `Health()` methods. The only lifecycle pattern is `MustStop()` on aggregators.

3. **No WASM or microkernel isolation** — Confirmed no WASM SDK usage, no goroutine-per-request isolation for plugins.

4. **No SDK documentation** — No `docs/plugin-sdk.md` or similar exists. VictoriaMetrics does not intend to be extensible via plugins.

5. **Relabel debugging is limited** — `ApplyDebug` provides step-by-step output, but there is no programmatic API to inject custom relabel actions or intercept results from outside the scrape pipeline.

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `victoriametrics`.