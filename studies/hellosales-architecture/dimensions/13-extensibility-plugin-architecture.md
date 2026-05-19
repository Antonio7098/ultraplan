# Dimension: Extensibility & Plugin Architecture

## Purpose

Analyzes extensibility mechanisms — hook systems, plugin loading and lifecycle, extension API contracts, SDK design patterns, and how the system stays extensible without becoming unmaintainable. Critical for HelloSales as it evolves toward integrations, custom sales workflows, and customer plugins.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the plugin/extension model and how plugins are discovered and loaded.
3. Examine the extension contract (interface, lifecycle hooks, permissions).
4. Look for hook points in critical paths (auth, data processing, workflow steps).
5. Evaluate how plugin failures are isolated from the core system.

## Evidence

- Plugin registration/discovery mechanism
- Extension interface definitions and contract versioning
- Lifecycle hooks (init, start, stop, health)
- Plugin isolation model (process, WASM, goroutine)
- Examples of built-in or first-party plugins

## Questions

1. How are plugins discovered, loaded, and verified?
2. What extension points exist for custom business logic?
3. How does the system prevent a misbehaving plugin from bringing down the host?
4. How are plugin APIs versioned to prevent breakage on upgrade?
5. What debugging and observability exists for plugin execution?

## Rating

Assign a score from 1-10 based on the analysis findings.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Poor implementation or absent |
| 4-6 | Basic implementation with gaps |
| 7-8 | Good implementation with minor issues |
| 9-10 | Excellent, exemplar implementation |

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
