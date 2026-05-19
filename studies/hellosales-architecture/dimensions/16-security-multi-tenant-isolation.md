# Dimension: Security & Multi-Tenant Isolation

## Purpose

Studies security architecture — authentication and authorization models, RBAC implementation, tenant isolation strategies, secret management, audit trail generation, and permission propagation across service boundaries. Essential for HelloSales given it handles customer sales data across organisational boundaries.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the authN/authZ model and enforcement points.
3. Examine tenant isolation mechanisms (data, compute, configuration).
4. Look for audit trail generation and retention.
5. Evaluate secret handling, encryption, and key management.

## Evidence

- Auth middleware and permission-checking patterns
- Role/permission data model and enforcement
- Tenant context propagation through service calls
- Data isolation at the query/storage layer
- Audit event emission and storage

## Questions

1. How is authentication performed and how are sessions managed?
2. How are authorization decisions made and enforced across API boundaries?
3. How is tenant A prevented from accessing tenant B's data?
4. What audit events are captured and how long are they retained?
5. How are secrets encrypted at rest and in transit?

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
