# Dimension: Developer Experience & Operational Ergonomics

## Purpose

Examines developer experience and operational ergonomics — local development setup, tooling quality, migration tooling, build scripts, onboarding documentation, and debugging ergonomics during development. Underrated but determines how fast engineers can safely evolve the system.

## Steps

1. Read prompts/base.md for execution instructions.
2. Evaluate the local development setup (docker-compose, dev containers, tooling).
3. Examine migration tooling for schema, config, and data.
4. Look for build scripts, Makefiles, and CI/CD pipeline quality.
5. Assess onboarding documentation and contribution guides.

## Evidence

- Local development environment setup (Docker, devcontainer, scripts)
- Database and schema migration tooling
- Makefile or task runner organisation
- CI/CD pipeline configuration
- CONTRIBUTING.md, README, and onboarding documentation

## Questions

1. How quickly can a new engineer go from clone to running the full system?
2. How are database schema changes tested and deployed?
3. What tooling exists for local debugging of async/workflow code?
4. How consistent is the build across different developer machines?
5. How does the project balance developer velocity with production safety?

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
