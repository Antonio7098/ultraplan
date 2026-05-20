# Security & Multi-Tenant Isolation - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `16-security-multi-tenant-isolation.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Security architecture across these nine projects reveals three distinct maturity tiers. The top tier (kubernetes 8/10, grafana 8/10, nats-server 8/10) demonstrates mature layered authN/authZ with audit trails and envelope encryption. The middle tier (milvus 7/10, openfga 7/10) provides strong RBAC and store-based isolation but lack formal audit systems. The lower tier (cli 5/10, pocketbase 5/10, temporal 5/10, victoriametrics 5/10) have basic implementations with significant gaps — no audit trails, weak tenant isolation, or no encryption at rest. The most critical finding: **no project achieves true multi-tenant isolation at the storage layer**. All rely on application-level enforcement that could be bypassed by a single code bug.

## Core Thesis

Security architecture in Go projects splits into two philosophies: **defense-in-depth** (kubernetes, grafana) with layered enforcement at auth middleware, SQL query filter, and storage abstraction — and **trust-delegation** (pocketbase, temporal, victoriametrics) where auth is delegated to an external system and tenant isolation relies on application code correctly passing tenant IDs. The gap between these philosophies is not just score difference — it is the presence or absence of a single point of failure that could leak all tenant data. HelloSales requires the former approach given it handles customer sales data across organisational boundaries.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| kubernetes | 8/10 | RBAC with namespace-scoped ServiceAccounts | Industry-standard OIDC/JWT auth, KMS envelope encryption, full audit event structure | Soft multi-tenancy (namespace isolation relies on RBAC correctness); no storage-layer enforcement |
| grafana | 8/10 | Pluggable authN + RBAC + Zanzana (OpenFGA) | Layered auth with SQL permission filter, dual legacy/modern authz, audit policy middleware | No native audit retention; OrgID limitations for true multi-tenant SaaS |
| nats-server | 8/10 | Account-based multi-tenancy with subject namespace isolation | Strong default-deny between accounts; JWT identity propagation; JetStream AES-GCM encryption | Fire-and-forget audit (no built-in retention); OCSP revocation has known limitations |
| milvus | 7/10 | Casbin RBAC with gRPC interceptor chain | Database-scoped tenant isolation; privilege cache with root coord sync; disk encryption support | No row-level security; audit retention unclear; API key in metadata only base64-encoded |
| openfga | 7/10 | ReBAC via OpenFGA with store-based tenant isolation | Self-referential auth (uses itself to authorize); store ID as hard tenant boundary; TLS and AES-GCM available | No dedicated security audit trail; no native session revocation; encryption is no-op by default |
| cli | 5/10 | OAuth to GitHub with OS keyring token storage | OAuth flow, keyring precedence, token masking, telemetry with privacy design | No internal authZ (delegated to GitHub); plaintext config fallback; no audit trail |
| pocketbase | 5/10 | JWT auth with per-collection filter rules | bcrypt password hashing; AES-256-GCM settings encryption; MFA/OTP support | No built-in tenant isolation; access rules are application-level only; no data-level audit trail |
| temporal | 5/10 | JWT claim mapper + RBAC with namespace-level isolation | gRPC auth interceptor; role-based default authorizer; cross-namespace command authorization | No audit trail; no encryption at rest; namespace isolation only (no row-level security) |
| victoriametrics | 5/10 | vmauth proxy with AccountID/ProjectID tenant tokens | TLS comprehensive; per-user rate limiting; JWT claim routing | No storage-layer tenant enforcement; no dedicated audit trail; no built-in encryption at rest |

## Approach Models

### Model 1: Defense-in-Depth with Layered Enforcement
**Represented by: kubernetes, grafana, nats-server**

These projects implement authN/authZ at multiple layers — authentication middleware, authorization interceptor, and data access filter. kubernetes uses OIDC JWT verification → RBAC authorization → namespace-scoped ServiceAccount tokens → KMS envelope encryption → full Kubernetes audit event structure. Grafana stacks pluggable auth clients (session, API key, JWT, SAML, LDAP) → access control middleware → SQL permission filter with OrgID → Zanzana (OpenFGA) for fine-grained auth. nats-server uses NKeys/JWT/bcrypt auth → per-account permissions with subject allow/deny → default-deny isolation → JetStream AES-GCM encryption.

**What converges**: Auth is not a single middleware — it is a pipeline. Each layer enforces a different aspect of the security model. If one layer fails, the others still hold.

**Why they diverge**: kubernetes targets infrastructure operators who need industry-standard compliance (OIDC, KMS, audit policy). Grafana targets application developers who need flexible authN pluggability. nats-server targets message brokers who need account isolation at the subject namespace level.

### Model 2: RBAC with External Enforcement
**Represented by: milvus, openfga, temporal**

These projects implement formal RBAC (Casbin in milvus, OpenFGA's ReBAC in openfga, role-based default in temporal) but rely on external systems for the actual tenant isolation. milvus uses Casbin with `dbMatch` function for database-scope enforcement, but the isolation is only as strong as the application code passing correct DB names. openfga uses store ID as the tenant boundary, but all API calls require the store_id parameter — if a bug passes the wrong store_id, no storage-layer enforcement catches it. temporal relies on namespace ID in persistence schemas, but application code must correctly pass namespace IDs — there is no row-level security.

**What converges**: Authorization is well-implemented with formal models, but tenant isolation is application-level, not database-enforced.

**Why they diverge**: milvus chose Casbin for expressiveness with glob matching. openfga built its own ReBAC engine using the Zanzibar model. temporal uses a simple role hierarchy (Worker/Reader/Writer/Admin).

### Model 3: Delegated Auth with Single-Point Enforcement
**Represented by: cli, pocketbase, victoriametrics**

cli delegates all authZ to GitHub's API — it only handles authentication token management. pocketbase uses filter rules that are only as correct as the developer who wrote them. victoriametrics trusts the caller to pass correct tenant IDs — its storage layer doesn't validate cross-tenant access. These projects score 5/10 because the security boundary depends entirely on a single enforcement point that, if misconfigured, exposes all data.

**What converges**: Auth is simple (JWT, bcrypt, API keys) but isolation is weak — a single bug can bypass all tenant separation.

**Why they diverge**: cli is a client tool, not a multi-tenant service, so it doesn't need internal authZ. pocketbase targets single-tenant self-hosted deployments. victoriametrics is a metrics database where tenant isolation is an afterthought.

## Pattern Catalog

### Pattern 1: Envelope Encryption with KMS
**Problem solved**: Secrets are encrypted at rest using per-secret Data Encryption Keys (DEK) that are themselves encrypted by Key Encryption Keys (KEK) from an external KMS.
**Sources**: kubernetes (`staging/src/k8s.io/kms/pkg/service/interface.go:22-50`), grafana (`pkg/services/secrets/manager/manager.go:38-61`)
**Why it works**: Key rotation doesn't require re-encrypting all data — only the DEKs need re-encryption. KMS plugin abstraction allows cloud-native (AWS KMS, GCP KMS) or on-prem (HashiCorp Vault) key management.
**When to copy**: When you need encryption at rest with key rotation support. Essential for compliance requirements.
**When overkill**: For single-tenant self-hosted deployments where filesystem-level encryption suffices.
**Evidence**: `staging/src/k8s.io/apiserver/pkg/storage/value/encrypt/secretbox/secretbox.go:30` (secretbox XSalsa20/Poly1305); `pkg/services/encryption/encryption.go:12-13` (AES-GCM)

### Pattern 2: Pluggable Auth Architecture
**Problem solved**: Authentication methods must be swappable without changing authorization logic.
**Sources**: grafana (`pkg/services/authn/authn.go:21-34`), nats-server (NKeys/JWT/bcrypt/LDAP)
**Why it works**: The `Client` interface with `Authenticate(ctx, credentials)` method allows new methods to be added by implementing the interface. Priority ordering lets the system try multiple methods.
**When to copy**: When you need to support multiple auth methods (password, SSO, API keys, OIDC) and expect them to evolve.
**When overkill**: For single-method auth systems (e.g., API-only service with static keys).
**Evidence**: `pkg/services/authn/authn.go:152-158` (Client interface); `server/auth.go:604-1188` (processClientOrLeafAuthentication)

### Pattern 3: SQL Permission Filter at Query Layer
**Problem solved**: Tenant isolation must be enforced at the data access layer, not just at the API layer.
**Sources**: grafana (`pkg/services/accesscontrol/filter.go:38-89`), milvus (database interceptor)
**Why it works**: The `Filter()` function injects `WHERE org_id = ?` or `WHERE db_name = ?` into every query. This is defense-in-depth — even if a bug bypasses API authZ, the database query returns empty results.
**When to copy**: When using SQL databases with multi-tenant data. The filter must be applied at query construction time, not as a post-query filter.
**When overkill**: For non-SQL datastores (object storage, time-series DBs) where different isolation models apply.
**Evidence**: `pkg/services/accesscontrol/filter.go:12-23` (accept-list for SQL column names prevents injection)

### Pattern 4: JWT-Based Stateless Auth with Claim Mapping
**Problem solved**: Auth tokens must carry tenant context and permissions without server-side session state.
**Sources**: temporal (`common/authorization/default_jwt_claim_mapper.go:76-110`), victoriametrics (`lib/jwt/jwt.go:373-401`), nats-server (`server/auth.go:814-1124`)
**Why it works**: JWTs are validated on each request; claims contain subject identity, tenant ID, and permissions. This enables horizontal scaling without session affinity.
**When to copy**: For microservices or distributed systems where services need to validate auth without calling a central session store.
**When overkill**: For monoliths where session state is cheap and token revocation is required.
**Evidence**: `lib/jwt/jwt.go:613-635` (CanRead/CanWrite mode checking); `server/jwt.go:204-247` (validateTimes for expiration)

### Pattern 5: Default-Deny Tenant Isolation
**Problem solved**: Cross-tenant data access should be impossible by default, requiring explicit configuration for any sharing.
**Sources**: nats-server (`server/accounts.go:42-44`), openfga (store-based isolation), kubernetes (RBAC default deny)
**Why it works**: nats-server's comment states "By default no messages are shared between accounts." openfga requires explicit import/export configuration. kubernetes requires explicit RoleBinding.
**When to copy**: For multi-tenant systems where data isolation is a hard requirement, not a soft convention.
**When overkill**: For single-tenant systems or trusted multi-user systems where default-deny creates friction.
**Evidence**: `server/accounts.go:1081-1104` (setExportAuth validates bilateral agreement)

### Pattern 6: gRPC Interceptor Chain for Auth/AuthZ
**Problem solved**: Auth logic should be centralized, running on every request without per-handler boilerplate.
**Sources**: milvus (`internal/proxy/authentication_interceptor.go:56-106`), openfga (`internal/middleware/authn/authn.go:12-20`), temporal (`common/authorization/interceptor.go:129-185`)
**Why it works**: gRPC interceptors run before handler execution. Auth → Database → Privilege interceptors chain together, each adding context or validating permissions.
**When to copy**: For gRPC-based services where every API call needs consistent authN/authZ enforcement.
**When overkill**: For HTTP REST APIs where middleware frameworks (Echo, Gin) provide similar functionality.
**Evidence**: `internal/proxy/privilege_interceptor.go:45-181` (PrivilegeInterceptor with Casbin enforcement)

### Pattern 7: Access Rule Filter-Based Authorization
**Problem solved**: Authorization rules must be expressive enough for common patterns (owner-only, role-only, tenant-only) without a full RBAC system.
**Sources**: pocketbase (`core/record_query.go:599-634`), grafana (RBAC with scope resolvers)
**Why it works**: Filter expressions (`@request.auth.id != ''`) become WHERE conditions in the query builder. This couples authZ to data access — you cannot read data you don't have permission to see.
**When to copy**: For REST APIs backed by relational databases where row-level filtering is natural.
**When overkill**: For non-relational data stores or complex hierarchical permissions where filter expressions become unmaintainable.
**Evidence**: `core/record_query.go:66-74` (rule applied as SQL WHERE condition)

## Key Differences

### Storage-Enforced vs. Application-Enforced Isolation

The critical divide is whether tenant isolation is enforced at the storage layer or only at the application layer. kubernetes enforces at namespace + RBAC + etcd access patterns. grafana enforces at SQL query filter (`WHERE org_id = ?`). nats-server enforces at the subject namespace level with no cross-account routing.

The other six projects rely on application code to pass correct tenant IDs. milvus's `DatabaseInterceptor` fills `DbName` from metadata, but if a bug passes the wrong DB name, no layer rejects it. openfga requires `store_id` on every API call — if a handler passes wrong store_id, the store doesn't validate. victoriametrics's storage layer receives tenant IDs from callers and doesn't validate them. temporal's namespace isolation is only as strong as the application code correctly passing namespace IDs.

**This is the single most important architectural gap in the lower-scoring projects.**

### AuthZ Model: RBAC vs. ReBAC vs. Filter Rules

RBAC (kubernetes, temporal, milvus) uses roles with permissions assigned to subjects. ReBAC (openfga) uses relationship-based checks where authorization is computed by traversing a relationship graph. Filter rules (pocketbase) are where conditions attached to collections.

RBAC is simpler to implement and audit; ReBAC is more expressive for complex organizational hierarchies; filter rules are the most flexible but hardest to reason about correctly.

### Audit Trail: Structured Events vs. Access Logs vs. Changelog

kubernetes has a full Kubernetes-style audit event structure with Level (None/Metadata/Request/RequestResponse), Stage (RequestReceived/ResponseComplete), and configurable policy rules. nats-server emits connect/disconnect/auth error advisories as internal messages. grafana has Kubernetes-style audit policy evaluation.

The middle and lower tier either have no dedicated audit trail (pocketbase has HTTP access logs, not data access logs; temporal has none; victoriametrics has access logs but not audit events) or have changelogs for cache invalidation that are not security audit trails (openfga).

### Encryption: Envelope KMS vs. File-Level vs. None

kubernetes uses KMS envelope encryption (DEK encrypted by KEK from external plugin). nats-server uses JetStream file-level AES-GCM or ChaCha20-Poly1305 with TPM sealed keys on Windows. grafana has envelope encryption service (deprecated in favor of Grafana Secrets Manager). openfga has AES-GCM with NoopEncrypter as default.

milvus has disk encryption via KMS, but only when `EnableDiskEncryption` is configured. temporal has no encryption at rest in persistence. victoriametrics has no built-in encryption at rest (relies on filesystem encryption).

## Tradeoffs

| Tradeoff | Benefit | Cost | Best-Fit Context | Failure Mode |
|----------|---------|------|------------------|--------------|
| Envelope encryption with KMS | Key rotation without data re-encryption; external key management | External dependency; KMS plugin complexity; KMS unavailability blocks secret ops | Compliance-heavy deployments; multi-cloud setups | KMS plugin failure renders cluster inoperable for secrets |
| Pluggable authN clients | Supports many auth methods; easy to add new ones | Multiple clients can conflict; priority ordering is subtle | Enterprises with SSO/SAML/OIDC requirements | Anonymous access if all clients fail to match |
| SQL permission filter | Database-enforced isolation; defense in depth | Per-query overhead; complex for non-SQL stores | Multi-tenant SQL-backed services | Accept-list SQL injection prevention must be correct |
| JWT stateless auth | Horizontal scaling; no session store | No token revocation; clock skew issues | Microservices; short-lived operations | Compromised token valid until expiry |
| Default-deny tenant isolation | Impossible to accidentally share data | Explicit configuration for any cross-tenant sharing | Multi-tenant SaaS | Overly permissive RoleBindings defeat isolation |
| Filter rule authorization | Flexible; couples authZ to data access | String-based expressions; no compile-time safety | REST APIs with row-level visibility | Misconfigured rules expose all data |
| Store-based tenant isolation | Hard boundary; no cross-store queries possible | Cannot query across tenants for reporting | Authorization engines; isolated workloads | Store ID passed incorrectly bypasses isolation |
| Fire-and-forget audit | Simple core; no storage management | Events lost if no subscriber; no retention | High-throughput systems willing to externalize | Audit events invisible if collector not configured |

## Decision Guide

**Is multi-tenant isolation a hard requirement for your deployment model?**
Yes → Use storage-layer enforcement (SQL permission filter, namespace-scoped keys, account-based subject isolation). Do not rely on application code passing correct tenant IDs.
No → Application-level enforcement may suffice, but consider the risk of a single bug exposing all tenant data.

**Do you need compliance-grade audit trails?**
Yes → Look at kubernetes or grafana for full audit event structures with configurable policy. nats-server's advisory system is close but lacks retention.
No → Access logs (pocketbase, victoriametrics) may suffice, or changelog-based tracking (openfga) for data synchronization.

**Do you need encryption at rest with key rotation?**
Yes → Implement envelope encryption with KMS integration (kubernetes pattern). This is the only pattern that supports key rotation without data re-encryption.
No → File-level encryption (nats-server JetStream) or database-level encryption may suffice. Consider operational complexity vs. security need.

**Do you need multiple authentication methods (password, OIDC, API keys, SAML)?**
Yes → Use pluggable auth client architecture (grafana pattern). Implement the `Client` interface with priority ordering.
No → Simpler single-method auth (JWT, bcrypt) may be appropriate. Complexity should match requirements.

**How critical is token revocation?**
Critical → Avoid JWT stateless auth. Use server-side sessions with revocation store, or short-lived tokens with refresh mechanism.
Not critical → JWT-based auth is appropriate. Token expiry is the only revocation mechanism in most projects studied.

## Practical Tips

1. **Always use SQL permission filters at the query layer** — grafana's `Filter()` function (`pkg/services/accesscontrol/filter.go:38-89`) shows that adding `WHERE org_id = ?` to every query provides defense-in-depth even if API authZ is bypassed.

2. **Use OIDC for identity when integrating with enterprise IdPs** — kubernetes's OIDC authenticator (`staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/oidc/oidc.go:860-972`) with CEL-based claim mapping provides flexible identity transformation without code changes.

3. **Implement envelope encryption for secrets at rest** — kubernetes's KMS plugin interface (`staging/src/k8s.io/kms/pkg/service/interface.go:22-50`) enables key rotation without data re-encryption. This is the gold standard for compliance.

4. **Default-deny for cross-tenant access** — nats-server's comment (`server/accounts.go:42-44`) makes the default explicit. Any sharing must be explicitly configured via imports/exports.

5. **Audit events should be emitted early in request lifecycle** — kubernetes's `LogRequestMetadata` at `request.go:43` runs before authorization, enabling audit of auth failures. Grafana's audit policy (`pkg/apiserver/auditing/policy.go:29`) similarly evaluates at API server level.

6. **Use gRPC interceptors for centralized auth chain** — milvus's auth → database → privilege interceptor chain (`internal/proxy/authentication_interceptor.go:56-106`) shows how to compose multiple concerns without per-handler boilerplate.

7. **Token masking in logs** — cli shows token masking (`pkg/cmd/auth/status/status.go:332-338`) preventing accidental exposure. Always mask tokens except for prefix in any logging.

8. **Store passwords as bcrypt hashes** — milvus (`pkg/util/crypto/crypto.go:22-28`) and pocketbase (`core/field_password.go:292-303`) both use bcrypt. Never store plaintext passwords.

## Anti-Patterns / Caution Signs

1. **No storage-layer tenant enforcement** — victoriametrics's storage layer trusts callers to pass correct `AccountID`. If vmauth misroutes, no layer catches it. This is the most dangerous pattern for multi-tenant deployments.

2. **Plaintext config fallback for tokens** — cli falls back to plaintext config (`internal/config/config.go:353-390`) when keyring unavailable. Tokens stored in `~/.config/gh/` are unencrypted. This is acceptable for dev but dangerous in production.

3. **No dedicated audit trail** — temporal, pocketbase, and victoriametrics have no structured audit event system. temporal's search for "audit" returned no results. pocketbase has HTTP access logs but no data-level event logging. openfga's changelog is for cache invalidation, not security auditing.

4. **No encryption at rest by default** — openfga's `NoopEncrypter` means data is unencrypted unless explicitly configured. grafana's deprecated envelope encryption and milvus's `EnableDiskEncryption` flag are off by default. Production deployments must explicitly enable.

5. **No token revocation mechanism** — cli, openfga, pocketbase, and victoriametrics all rely on JWT expiration for token invalidation. If a token is compromised, the server cannot revoke it. The only mitigation is short token duration.

6. **Privilege cache staleness** — milvus's `privilegeCache` syncs from root coord via `ListPolicy` (`internal/proxy/privilege/cache.go:97-122`). If sync fails, stale permissions could allow access after revocation. grafana's permission cache (`pkg/services/accesscontrol/accesscontrol.go:44-45`) has similar concerns.

7. **Default NoopAuthorizer allowing all access** — temporal's `NoopAuthorizer` (`common/authorization/noop_authorizer.go:12`) returns `DecisionAllow` for all requests. If no authorizer is configured, all access is permitted. kubernetes similarly has no default authz mode.

8. **Authorization bypass when master switch disabled** — milvus's `AuthorizationEnabled` param (`pkg/util/paramtable/component_param.go:265`) disables entire RBAC stack when false. This is useful for dev but dangerous if misconfigured in production.

9. **Wildcard permission templates** — nats-server's template expansion (`server/auth.go:425`) can generate up to 4096 subjects. Misconfigured templates could enable broader access than intended.

10. **SQL injection in filter construction** — grafana's accept-list approach (`pkg/services/accesscontrol/filter.go:12-23`) prevents SQL injection. Projects using string concatenation for filters are vulnerable.

## Notable Absences

1. **No evidence of rate limiting on auth endpoints** — grafana, nats-server, openfga, and others show no evidence of brute-force protection or login attempt throttling. Rate limiting is only visible in victoriametrics (per-user concurrency limiting).

2. **No evidence of mTLS for internal service communication** — only nats-server explicitly mentions inter-cluster encryption (`server/server.go:706-712`) via XKey. kubernetes supports mTLS for kubelet→APIserver. Most other projects do not show service-to-service TLS in the studied code.

3. **No evidence of secret scanning or redaction** — only cli shows token masking. milvus has `secretExtfsKeys` marking extfs secrets for redaction. Most projects do not systematically scan logs or outputs for secrets.

4. **No evidence of penetration testing or bug bounty** — none of the nine projects show evidence of security audits, responsible disclosure policies, or third-party penetration testing in the studied code.

5. **No evidence of encryption key escrow** — if encryption keys are lost, data is irrecoverable in all projects. kubernetes specifically notes this (`staging/src/k8s.io/apiserver/pkg/storage/value/encrypt/secretbox/secretbox.go:30`) as a failure mode.

6. **No evidence of tenant-specific audit filtering** — kubernetes's audit policy filters by user/resource but has no tenant-scoped audit event isolation for multi-tenant clusters.

7. **No evidence of row-level security** — even the highest-scoring projects (kubernetes, grafana, nats-server) do not implement row-level security in databases. Tenant isolation is at namespace/database/account level, not row level.

8. **No evidence of column-level encryption** — encryption is at file/secret level, not at record attribute level. Sensitive fields in database records are visible if encryption is bypassed.

9. **No evidence of automated key rotation enforcement** — while configs mention rotation periods (milvus's `RotationPeriodInHours`), no project shows automated enforcement that re-encrypts data with new keys.

10. **No evidence of confidential computing or enclave-based isolation** — all projects studied use traditional process isolation. No project uses hardware-backed confidential computing (AMD SEV, Intel SGX) for tenant workload isolation.

## Per-Source Notes

**kubernetes** — The gold standard for security architecture in this study. OIDC JWT auth with CEL-based claim mapping, RBAC with namespace-scoped ServiceAccounts, full Kubernetes audit event structure, and KMS envelope encryption. The main gap is soft multi-tenancy — namespace isolation relies on RBAC correctness. A misconfigured ClusterRoleBinding can expose all namespaces.

**grafana** — Demonstrates layered auth with pluggable clients (session, API key, JWT, SAML, LDAP) and SQL permission filter for OrgID isolation. The migration path to Zanzana (OpenFGA) for fine-grained auth is the right direction. Main gaps are no native audit retention and deprecated envelope encryption without clear replacement.

**nats-server** — Account-based multi-tenancy with subject namespace isolation is elegant. Default-deny between accounts means explicit import/export configuration is required for any cross-account data sharing. JWT identity propagation enables stateless auth across clusters. The fire-and-forget audit advisory system lacks retention — external collector required.

**milvus** — Casbin RBAC with gRPC interceptor chain is a solid pattern. The `dbMatch` function in Casbin matcher enforces database scope. Privilege cache with root coord sync reduces latency but introduces staleness risk. Main gaps are no row-level security, unclear audit retention, and `AuthorizationEnabled` master switch that bypasses all RBAC.

**openfga** — Store-based isolation provides hard tenant boundaries. The self-referential auth model (using OpenFGA to authorize OpenFGA operations) is elegant but creates bootstrapping complexity. No dedicated security audit trail — the changelog is for cache invalidation, not security auditing. AES-GCM encryption available but NoopEncrypter is default.

**cli** — OAuth delegation to GitHub is the right model for a client tool. Token storage has secure keyring with plaintext fallback. Multi-account support via per-host token storage is well-implemented. Main gaps are no internal authZ (delegated to GitHub), plaintext config fallback, and no audit trail.

**pocketbase** — JWT auth with filter-based access rules is flexible. bcrypt password hashing and AES-256-GCM settings encryption are solid. MFA/OTP support is comprehensive. Main gaps are no built-in tenant isolation (all data in single SQLite), access rules are application-level only, and no data-level audit trail.

**temporal** — gRPC auth interceptor with role-based default authorizer and cross-namespace command authorization is well-designed. JWT claim mapping is configurable for different IdPs. Main gaps are no audit trail, no encryption at rest, and namespace isolation only (no row-level security).

**victoriametrics** — vmauth proxy handles authN with multiple methods (bearer, basic, JWT/OIDC). Tenant ID in auth token (AccountID/ProjectID) enables multi-tenant routing. Main gaps are no storage-layer tenant enforcement (storage trusts callers), no dedicated audit trail, and no built-in encryption at rest.

## Open Questions

1. **What is the right model for audit trail retention in cloud-native deployments?** kubernetes emits to backends with no retention enforcement. nats-server's fire-and-forget advisory requires external collector. grafana has no native retention. The industry lacks consensus on built-in vs. externalized retention.

2. **How should multi-tenant SaaS implement true tenant isolation at the storage layer?** Current approaches (namespace, database, account) are all soft boundaries that rely on application code correctness. What would a hard storage-layer tenant boundary look like?

3. **When does the security benefit of envelope encryption outweigh its operational complexity?** KMS plugins add failure modes (KMS unavailability blocks secret operations). Smaller teams may prefer simpler encryption-at-rest that doesn't require external key management.

4. **What is the minimal audit trail that satisfies compliance requirements?** The projects studied show different interpretations — from full Kubernetes-style audit events (kubernetes) to HTTP access logs (pocketbase) to no audit (temporal). What should HelloSales implement?

5. **How should token revocation work in JWT-based stateless auth?** None of the studied projects implement true revocation — all rely on token expiry. Is there a pattern that provides revocation without sacrificing horizontal scaling?

## Evidence Index

Every evidence reference in this report follows the `path/to/file.ts:NN` format. Below is a consolidated index.

| Source | Area | Evidence | Reference |
|--------|------|----------|-----------|
| cli | OAuth flow | OAuth client credentials and device/web flow initiation | `internal/authflow/flow.go:20-25` |
| cli | Token storage | Secure storage via `zalando/go-keyring` with 3-second timeout | `internal/keyring/keyring.go:22-34` |
| cli | Token precedence | Env var > Config file > Keyring | `internal/config/config.go:237-260` |
| cli | Plaintext fallback | Config fallback when keyring unavailable | `internal/config/config.go:353-390` |
| cli | Host isolation | Per-host, per-user token storage | `internal/config/config.go:392-424` |
| cli | Token masking | Tokens masked in output | `pkg/cmd/auth/status/status.go:332-338` |
| grafana | AuthN clients | Session, API Key, Basic, JWT, OAuth, SAML, LDAP clients | `pkg/services/authn/authn.go:21-34` |
| grafana | Session management | Cookie-based session with token lookup and rotation | `pkg/services/authn/clients/session.go:62` |
| grafana | API key auth | API key validation with org membership check | `pkg/services/authn/clients/api_key.go:221` |
| grafana | AuthZ middleware | Access control middleware for permission evaluation | `pkg/services/accesscontrol/middleware.go:30` |
| grafana | SQL permission filter | Org-based SQL filtering for data access restriction | `pkg/services/accesscontrol/filter.go:38` |
| grafana | Zanzana AuthZ | OpenFGA-based fine-grained authorization | `pkg/services/authz/zanzana.go:45` |
| grafana | Audit policy | Kubernetes-style audit policy rule evaluator | `pkg/apiserver/auditing/policy.go:29` |
| grafana | Envelope encryption | Legacy envelope encryption service (deprecated) | `pkg/services/secrets/manager/manager.go:38` |
| kubernetes | OIDC auth | OIDC JWT authenticator with CEL-based claim mapping | `staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/oidc/oidc.go:860-972` |
| kubernetes | Webhook auth | TokenReview-based webhook authenticator with retry | `staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/webhook/webhook.go:98-195` |
| kubernetes | ServiceAccount auth | Namespace-scoped username format | `staging/src/k8s.io/apiserver/pkg/authentication/serviceaccount/util.go:53-57` |
| kubernetes | RBAC authorizer | RBAC authorizer with RuleResolver | `plugin/pkg/auth/authorizer/rbac/rbac.go:50-169` |
| kubernetes | Audit event types | Audit event struct with Level, Stage, User, ObjectRef | `staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:79-152` |
| kubernetes | Audit policy | Policy rules with users, userGroups, verbs, resources | `staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:214-272` |
| kubernetes | KMS encryption | gRPC service interface for Encrypt/Decrypt/Status | `staging/src/k8s.io/kms/pkg/service/interface.go:22-50` |
| kubernetes | Secret encryption | secretbox (XSalsa20/Poly1305) for at-rest encryption | `staging/src/k8s.io/apiserver/pkg/storage/value/encrypt/secretbox/secretbox.go:30` |
| milvus | Auth interceptor | AuthenticationInterceptor verifies tokens | `internal/proxy/authentication_interceptor.go:56-106` |
| milvus | Password encryption | bcrypt PasswordEncrypt | `pkg/util/crypto/crypto.go:22-28` |
| milvus | AuthZ interceptor | PrivilegeInterceptor enforces RBAC via Casbin | `internal/proxy/privilege_interceptor.go:45-181` |
| milvus | RBAC model | Casbin model with sub/obj/act matcher | `internal/proxy/privilege/model.go:23-35` |
| milvus | Privilege cache | privilegeCache maintains user→roles mapping | `internal/proxy/privilege/cache.go:60-68` |
| milvus | Tenant context | WithTenantID/TenantID propagate via context values | `pkg/util/contextutil/context_util.go:36-51` |
| milvus | Database interceptor | DatabaseInterceptor fills DbName from metadata | `internal/proxy/database_interceptor.go:12-17` |
| milvus | Etcd tenant prefix | HandleTenantForEtcdPrefix builds tenant-scoped keys | `pkg/util/funcutil/func.go:714-727` |
| milvus | Audit access log | AccessInfo interface for audit events | `internal/proxy/accesslog/info/info.go:62-91` |
| nats-server | AuthN model | NKeys, JWT, password, TLS, LDAP authentication | `server/auth.go:866-1159` |
| nats-server | AuthZ model | Per-account Permissions with pub/sub allow/deny | `server/auth.go:139-153` |
| nats-server | Tenant isolation | Account struct with Name, Issuer, imports, exports | `server/accounts.go:50-119` |
| nats-server | Default deny | No messages shared between accounts by default | `server/accounts.go:42-44` |
| nats-server | Cycle detection | Prevents recursive import chains | `server/accounts.go:1601-1633` |
| nats-server | User revocation | UsersRevoked map by issued time | `server/accounts.go:3873-3909` |
| nats-server | Audit events | ConnectEventMsg, DisconnectEventMsg, authErrorEventSubj | `server/events.go:155-177` |
| nats-server | JSAPIAudit | JetStream admin action audit events | `server/jetstream_events.go:49-60` |
| nats-server | TLS config | GenTLSConfig generating TLS configs | `server/opts.go:346-368` |
| nats-server | FileStore encryption | AES-GCM and ChaCha20-Poly1305 support | `server/filestore.go:87-106` |
| nats-server | TPM seal/unseal | Windows TPM integration for encryption keys | `server/tpm/js_ek_tpm_windows.go:38-275` |
| openfga | AuthN interface | Authenticator interface with Authenticate/Close | `internal/authn/authn.go:20-26` |
| openfga | OIDC authenticator | JWT validation with JWKS fetching | `internal/authn/oidc/oidc.go:27-77` |
| openfga | PSK authenticator | Preshared key exact match | `internal/authn/presharedkey/presharedkey.go:13-44` |
| openfga | Auth middleware | gRPC interceptor populating AuthClaims into context | `internal/middleware/authn/authn.go:12-20` |
| openfga | Authorizer interface | Authorize, AuthorizeCreateStore, ListAuthorizedStores | `internal/authz/authz.go:86-93` |
| openfga | Store-based authZ | Checks relation on store object | `internal/authz/authz.go:185-190` |
| openfga | Store ID middleware | gRPC interceptor extracting store_id from request | `pkg/middleware/storeid/storeid.go:60-105` |
| openfga | TLS config | TLS configuration for gRPC and HTTP servers | `pkg/server/config/config.go:204-209` |
| openfga | GCM encrypter | AES-256-GCM encryption implementation | `pkg/encrypter/gcm_encrypter.go:15-64` |
| openfga | Noop encrypter | Pass-through default (no encryption) | `pkg/encrypter/encrypter.go:12-28` |
| openfga | Changelog backend | Interface for tracking tuple writes/deletes | `pkg/storage/storage.go:395-405` |
| pocketbase | Auth middleware | RequireAuth, RequireSuperuserAuth | `apis/middlewares.go:84,106` |
| pocketbase | JWT generation | NewAuthToken using HS256 | `core/record_tokens.go:46-72` |
| pocketbase | Password hashing | bcrypt with configurable cost | `core/field_password.go:292-303` |
| pocketbase | Access rules | ListRule, ViewRule, UpdateRule, DeleteRule | `core/collection_model.go:358-362` |
| pocketbase | Rule enforcement | CanAccessRecord applies filter rules | `core/record_query.go:599-634` |
| pocketbase | Superuser model | _superusers collection | `core/record_model_superusers.go:12` |
| pocketbase | MFA support | MFA model and flow | `core/mfa_model.go` |
| pocketbase | Settings encryption | AES-256-GCM encryption for settings | `core/settings_model.go:271-278` |
| pocketbase | Activity logging | activityLogger middleware with configurable retention | `apis/middlewares.go:349-463` |
| pocketbase | Rate limiting | Rate limit middleware | `apis/middlewares_rate_limit.go` |
| temporal | JWT claim mapper | Extracts permissions from Bearer tokens | `common/authorization/default_jwt_claim_mapper.go:76-110` |
| temporal | Authorizer interface | DecisionAllow/Deny | `common/authorization/authorizer.go:14-19` |
| temporal | Default authorizer | Role-based rules | `common/authorization/default_authorizer.go:25-65` |
| temporal | Auth interceptor | Enforces auth on gRPC calls | `common/authorization/interceptor.go:129-185` |
| temporal | Role enum | Worker, Reader, Writer, Admin | `common/authorization/roles.go:8-13` |
| temporal | Namespace isolation | Namespace ID in persistence schemas | `schema/sqlite/v3/temporal/schema.sql:32,48,65` |
| temporal | TLS config provider | Interface for cert management | `common/rpc/encryption/tls_factory.go:17-24` |
| temporal | Secrets masking | Password masking in YAML logs | `common/masker/masker.go:9-37` |
| temporal | Noop authorizer | Always returns DecisionAllow | `common/authorization/noop_authorizer.go:12` |
| victoriametrics | Token struct | AccountID and ProjectID fields | `lib/auth/auth.go:10-13` |
| victoriametrics | JWT claims | VMAccessClaim with tenant fields | `lib/jwt/jwt.go:373-401` |
| victoriametrics | JWT read/write mode | CanRead/CanWrite based on Mode bitfield | `lib/jwt/jwt.go:613-635` |
| victoriametrics | vmauth main flow | requestHandler extracts auth tokens and routes | `app/vmauth/main.go:171-216` |
| victoriametrics | vmauth JWT auth | getJWTUserInfo parses JWT | `app/vmauth/jwt.go:215-252` |
| victoriametrics | vmauth OIDC | OIDC discovery and JWK key fetching | `app/vmauth/oidc.go:50-128` |
| victoriametrics | Tenant storage | encodeTenantID for storage key encoding | `lib/storage/metricsmetadata/storage.go:88` |
| victoriametrics | Per-tenant storage | perTenantStorage map | `lib/storage/metricsmetadata/storage.go:97` |
| victoriametrics | Secret masking | Secret.MarshalYAML returns `"<secret>"` | `lib/promauth/config.go:45-50` |
| victoriametrics | TLS config | TLSConfig struct with CA, Cert, Key | `lib/promauth/config.go:70-85` |

---

Generated by dimension `16-security-multi-tenant-isolation.md`.