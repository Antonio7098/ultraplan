# hellosales-architecture

Comparative architecture study for HelloSales — a large-scale data ingestion, AI orchestration, multi-tenant workflow platform serving sales intelligence. Studies backend API architecture, workflow orchestration, data pipelines, observability, concurrency, and operational governance across elite open-source systems.

## Repositories Studied

| Name | URL | Description |
|------|-----|-------------|
| grafana | `https://github.com/grafana/grafana` | Large-scale Go backend — observability-first architecture, plugin systems, API layering, RBAC/auth, background jobs, config system, enterprise operational maturity |
| temporal | `https://github.com/temporalio/temporal` | Elite workflow infrastructure — durable execution, retry semantics, worker architecture, task routing, state persistence, queue processing, orchestration engine |
| openfga | `https://github.com/openfga/openfga` | Clean modern Go backend — disciplined layering, package boundaries, transport vs domain logic, interface ownership, storage abstractions, testing organization |
| pocketbase | `https://github.com/pocketbase/pocketbase` | Masterpiece of simplicity and extensibility — plugin/hooks architecture, event handling, config ergonomics, admin APIs, extension surfaces, embedded runtime |
| victoriametrics | `https://github.com/VictoriaMetrics/VictoriaMetrics` | Elite ingestion + storage + query architecture — ingestion pipelines, memory efficiency, batching, concurrency, indexing, performance discipline at scale |
| milvus | `https://github.com/milvus-io/milvus` | Vector infrastructure platform — indexing systems, retrieval architecture, distributed query execution, storage orchestration, hybrid search |
| nats-server | `https://github.com/nats-io/nats-server` | Distributed systems masterclass — concurrency model, event architecture, async processing, operational simplicity, message routing, cluster management |
| cli | `https://github.com/cli/cli` | GitHub official CLI — command layering, API clients, pagination, auth handling, caching, HTTP architecture, API-consumer patterns |
| kubernetes | `https://github.com/kubernetes/kubernetes` | Orchestration system — controller pattern, reconciliation loops, declarative APIs, resource lifecycle, event-driven convergence, operator model |

## Study Dimensions

| # | Dimension | Description |
|---|-----------|-------------|
| 01 | Project Structure & Boundaries | How projects organise code — package boundaries, module layout, separation of concerns at scale |
| 02 | Dependency Injection & Composition | How services are wired, lifecycle management, initialization order, interface composition |
| 03 | Configuration & Environment Management | Env vars, config layering, runtime overrides, secrets, feature flags, validation |
| 04 | HTTP/API Surface Design | Routing, handlers, versioning, pagination, streaming, error contracts, middleware |
| 05 | Background Jobs & Async Workflows | Queues, retries, workers, orchestration, cancellation, scheduling, durable execution |
| 06 | Concurrency Model | Goroutines, channels, worker pools, cancellation, backpressure, bounded concurrency |
| 07 | Data Ingestion & Processing Pipelines | Ingestion stages, transforms, batching, validation, normalization, enrichment, ETL flow |
| 08 | State Management & Persistence | Repositories, transactions, caching, consistency, snapshots, workflow state, event persistence |
| 09 | Observability & Operational Visibility | Logging, tracing, metrics, correlation IDs, event models, debugging ergonomics |
| 10 | Error Taxonomy & Failure Handling | Retries, typed errors, propagation, wrapping, partial failure, degradation strategies |
| 11 | AI Runtime & Model Abstraction | Provider abstraction, prompt execution, model routing, context management, retries, streaming, token accounting |
| 12 | Workflow / Agent Orchestration | Graph execution, state transitions, resumability, checkpoints, DAGs, task routing |
| 13 | Extensibility & Plugin Architecture | Hooks, plugin loading, extension APIs, contracts, SDK design |
| 14 | Testing Strategy & Reliability Engineering | Integration testing, end-to-end testing, harnesses, mocks, fixtures, determinism |
| 15 | Performance & Resource Discipline | Memory allocation, pooling, streaming, batching, lazy loading, query optimization |
| 16 | Security & Multi-Tenant Isolation | RBAC, auth, tenant isolation, secrets, audit trails, permission propagation |
| 17 | Developer Experience & Operational Ergonomics | Local development, tooling, migrations, scripts, onboarding, dev observability |
| 18 | Governance & Evolution Strategy | ADRs, migration strategy, deprecation, schema evolution, compatibility, rollout patterns |

## Usage

```bash
# List sources and dimensions
study hellosales-architecture list

# Run all dimension × source analyses
study hellosales-architecture run-all --parallel 3

# Stateful batch runner with retry/backoff
study hellosales-architecture run-loop --batch-size 2

# Show run-loop status
study hellosales-architecture status
```
