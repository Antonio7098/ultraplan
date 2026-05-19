# Dimension: HTTP/API Surface Design

## Purpose

Analyzes HTTP API design — routing structure, handler organisation, versioning strategy, pagination conventions, streaming support, error contract consistency, and middleware layering. For HelloSales this covers the public and internal API surface at scale.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify route registration pattern and handler organisation.
3. Examine error response format and consistency across endpoints.
4. Look for versioning, pagination, filtering, and streaming patterns.
5. Evaluate middleware layering, auth enforcement, and request validation.

## Evidence

- Route registration files and HTTP framework choice
- Error response schema and error type hierarchy
- Pagination implementation (cursor vs offset, default limits)
- Streaming endpoints (SSE, WebSocket, chunked responses)
- Middleware chain organisation (auth, rate-limit, logging, recovery)

## Questions

1. How are routes organised and registered — by resource, version, or domain?
2. Is there a consistent error contract clients can depend on?
3. How does the API handle pagination at scale without performance cliffs?
4. What middleware is global vs per-route, and how is layering managed?
5. How is API versioning handled without duplicating handlers?

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
