# Source Analysis: grafana

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana implements a layered security architecture with multiple authentication clients, a dedicated RBAC authorization system, and org-based tenant isolation. Authentication supports sessions (cookie-based), API keys, OAuth, LDAP, JWT, and SAML. Authorization is enforced via accesscontrol middleware that evaluates permissions against scopes. Tenant isolation uses orgID-based namespacing in the K8s API layer, with SQL query filtering at the database layer. Secrets use envelope encryption with pluggable KMS providers. Audit logging is implemented via K8s audit backend in the API server.

## Rating

**7/10** — Good implementation with minor issues. Grafana has a mature multi-layered authN/authZ system with strong RBAC. However, the legacy secrets service is marked deprecated for multi-tenant use, and org-based tenant isolation relies heavily on application-level enforcement rather than hard database-level row isolation. Audit logging is partial (K8s API server only).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| AuthN - Session | Session client lookup via cookie + token rotation check | `pkg/services/authn/clients/session.go:62-69` |
| AuthN - API Key | Service account-bound API key validation with orgID check | `pkg/services/authn/clients/api_key.go:212-230` |
| AuthN - Password | Password auth with login attempt tracking and IP blocking | `pkg/services/authn/clients/password.go:40-54` |
| AuthZ - RBAC | AccessControl.Evaluate() interface for permission checking | `pkg/services/accesscontrol/accesscontrol.go:22-34` |
| AuthZ - Filter | SQL WHERE clause injection based on user permissions | `pkg/services/accesscontrol/filter.go:38-89` |
| AuthZ - Middleware | HTTP middleware for authorizing requests with evaluators | `pkg/services/accesscontrol/middleware.go:30-64` |
| AuthZ - gRPC | AuthZ service with RBAC and Zanzana (new authorization engine) | `pkg/services/authz/rbac.go:76-149` |
| Tenant Isolation | Namespace mapping from orgID to K8s namespace | `pkg/services/apiserver/endpoints/request/namespace.go:19-29` |
| Tenant Isolation | K8s client per-namespace operations in user service | `pkg/services/user/userk8s/user.go:109, 227` |
| Secrets | Envelope encryption with data key caching | `pkg/services/secrets/manager/manager.go:150-197` |
| Secrets Deprecation | Legacy secrets service marked deprecated for multi-tenant | `pkg/services/secrets/manager/manager.go:40-42` |
| Audit | K8s audit backend in API server | `pkg/services/apiserver/service.go:113, 378` |
| Audit | Audit policy rule evaluator | `pkg/apiserver/auditing/policy.go:29-62` |
| Roles | Fixed, basic, and managed role definitions | `pkg/services/accesscontrol/roles.go:42-369` |
| Identity | Identity struct with OrgID, OrgRoles, SessionToken, Permissions | `pkg/services/authn/identity.go:24-87` |
| Cookie Security | Secure, SameSite cookie options | `pkg/services/authn/authn.go:356-368` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication is performed through a pluggable `authn.Client` system (`pkg/services/authn/clients/`) with multiple client implementations:
- **Session client** (`session.go:46-92`): Validates `grafana_session` cookie via `sessionService.LookupToken()`, checks token rotation needs
- **API key client** (`api_key.go:58-86`): Validates `Authorization: Bearer <token>` header against service accounts, checks expiry/revocation/org membership
- **Password client** (`password.go:35-83`): Authenticates username/password, enforces login attempt throttling (blocks after failed attempts)
- **OAuth/JWT/LDAP/SAML** clients available as additional auth methods

Sessions are managed via signed HTTP cookies (`grafana_session`) containing a hashed token stored in the `user_token` table. Token rotation occurs automatically if `TokenRotationIntervalMinutes` has passed (`session.go:67-69`). Concurrent session limits can be enforced via `authn.TokenNeedsRotationError` (`authn.go:51-60`).

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization uses an RBAC model with two enforcement layers:

**HTTP API layer** (`pkg/services/accesscontrol/middleware.go:30-64`):
- `Middleware(ac AccessControl)` returns a handler that calls `authorize()` with an `Evaluator`
- `authorize()` calls `ac.Evaluate(ctx, user, evaluator)` which checks permissions
- `EvalPermission()` creates evaluators for specific actions (e.g., `dashboards.ActionSnapshotsCreate`)

**gRPC API layer** (`pkg/services/authz/rbac.go:76-149`):
- `ProvideAuthZClient()` creates an `AuthzService` with RBAC permission store
- Supports Zanzana (new authorization engine) as primary or shadow engine
- Uses `authzlib.NewClient()` for remote or in-proc RBAC authorization
- Permission store combines static (fixed roles) + SQL (managed permissions)

**SQL query layer** (`pkg/services/accesscontrol/filter.go:38-89`):
- `Filter()` generates `WHERE org_id IN (...)` clauses based on user's scoped permissions
- Only allows IDs that appear in all required action scopes (intersection logic)
- Accepts only predefined `sqlIDAcceptList` columns to prevent SQL injection

### 3. How is tenant A prevented from accessing tenant B's data?

Tenant isolation is enforced at three layers:

**K8s namespace layer** (`pkg/services/apiserver/endpoints/request/namespace.go:19-29`):
- `GetNamespaceMapper()` maps `orgID` → namespace string (e.g., `org-1`, `org-2`, or `stack-{StackID}` for Grafana Cloud)
- All K8s resource operations use namespace-scoped clients (`userk8s/user.go:109, 227`)

**SQL query layer** (`pkg/services/accesscontrol/filter.go:38-89`):
- `Filter()` generates SQL WHERE clauses restricting queries to IDs the user has permission to access
- For users without wildcard permissions, only IDs matching all required action scopes are included
- `UserRolesFilter()` joins through `user_role`, `team_role`, `builtin_role` tables with org_id constraints

**Org context** (`pkg/services/authn/identity.go:32`):
- `Identity.OrgID` carries the authenticated org; all operations are org-scoped
- `AuthorizeInOrgMiddleware()` (`middleware.go:235-276`) allows cross-org authorization checks with `ResolveIdentity()`

**Limitation**: This is application-level enforcement. There is no evidence of database-level row-level security or separate database instances per tenant.

### 4. What audit events are captured and how long are they retained?

Audit logging is implemented via **K8s audit backend** (`pkg/services/apiserver/service.go:113, 378`):
- `auditBackend` and `auditPolicyRuleProvider` are wired into the API server config
- `auditing.NewDefaultGrafanaPolicyRuleEvaluator()` (`pkg/apiserver/auditing/policy.go:29-62`) defines audit levels:
  - `LevelNone` for non-resource requests, watch requests, and privileged group members
  - `LevelRequestResponse` for create/update/patch on resources
  - `LevelMetadata` for delete and list operations
  - `LevelMetadata` also omits `RequestReceived`, `ResponseStarted`, and `Panic` stages

**Evidence of retention policy**: No specific retention duration configuration was found in the analyzed code. The standard K8s audit backend is used without custom retention settings.

**Secrets audit** (`pkg/storage/secret/metadata/decrypt_store.go:91, 110`):
- Decrypt operations log "Secrets Audit Log" messages with operation details
- `logging.FromContext(ctx).Info("Secrets Audit Log", args...)` emits structured audit events

### 5. How are secrets encrypted at rest and in transit?

**Encryption at rest** (`pkg/services/secrets/manager/manager.go:150-197, 309-362`):
- Uses **envelope encryption**: data keys (DEK) encrypted by key encryption keys (KEK) from KMS providers
- `Encrypt()` generates a random 16-byte data key, encrypts payload with `enc.Encrypt(ctx, payload, dataKey)`, stores encrypted data key in database
- Supports multiple provider types (kmsproviders) - pluggable architecture
- Data key cache with 15-minute TTL and 10-minute caution period before caching by label
- Legacy `secret_key` fallback for non-envelope encrypted payloads

**Important deprecation note** (`pkg/services/secrets/manager/manager.go:40-42, 65-67`):
> "Deprecated: Multi-tenant APIs should not use imports from pkg/services/secrets/, as it creates a dependency on the legacy database. If you need to encrypt data in a multi-tenant API, use Grafana Secrets Manager (GSM) instead."

**Encryption in transit**:
- Cookie security uses `CookieSecure` (HTTPS-only), `SameSiteMode`, and `Path` settings (`authn.go:362-368`)
- gRPC clients support TLS credentials (`authz/rbac.go:225-231`)
- Remote RBAC client allows insecure credentials fallback when cert not configured (`rbac.go:225`)

**Password storage** (`pkg/services/encryption/encryption.go:44-46`):
- PBKDF2 with SHA256, 10000 iterations for key derivation from secret
- 8-byte salt length

## Architectural Decisions

1. **Pluggable authn clients**: The `Client` interface pattern allows multiple authentication mechanisms (session, API key, password, OAuth, JWT, LDAP, SAML) to coexist and be tried in priority order.

2. **Org-based multitenancy**: Grafana uses "orgs" as the primary tenant construct. All resources are scoped to an `orgID`. The K8s API server maps orgs to namespaces for resource isolation.

3. **RBAC over ABAC**: Permissions are modeled as action+scope pairs assigned to roles, which are assigned to users/teams/built-in roles. The `Evaluator` pattern allows fine-grained permission checks.

4. **Envelope encryption**: Secrets use two-layer encryption (data key + master key) to allow key rotation without re-encrypting all data.

5. **Zanzana authorization engine**: A new authorization engine (feature-flagged) is being rolled out alongside the legacy RBAC service, with shadow comparison mode for gradual migration.

## Notable Patterns

- **Client priority system**: `ContextAwareClient.Priority()` (lower = higher priority) determines auth client trial order (`session.go:116-117`, `api_key.go:154-156`)
- **Post-auth hooks**: `RegisterPostAuthHookFn` allows running logic after successful authentication (e.g., updating last used timestamp)
- **Scope injection**: Template-based scope mutation injects URL params into permission scopes (`middleware.go:408-420`)
- **Permission caching**: Access control permissions are cached per user to reduce DB lookups (`accesscontrol.go:44-45`)
- **Anonymous access with force login**: Anonymous sessions can be force-promoted to authenticated based on `forceLogin` query param or orgId mismatch (`middleware.go:288-296`)

## Tradeoffs

1. **Application-level tenant isolation**: Without database-level row-level security (RLS), a bug in query construction or permission evaluation could allow cross-tenant data access. This is mitigated by the SQLFilter whitelist approach.

2. **Legacy secrets deprecation**: The documented path forward (Grafana Secrets Manager) was not analyzed as it likely runs as a separate service.

3. **Org vs Namespace mapping**: The K8s API server maps orgID → namespace, but this is a soft isolation enforced by client code, not by K8s RBAC at the API server level.

4. **Token rotation race condition**: Token rotation is checked on lookup (`session.go:67-69`) but the rotation itself happens on next use, potentially allowing a window where a rotated token is still accepted.

## Failure Modes / Edge Cases

1. **Expired API key**: Returns `errAPIKeyExpired` but allows reuse of same token hash if key is renewed without rotation
2. **Concurrent login throttling**: Login attempt tracking is in-memory or per-instance; distributed deployments require shared state (Redis, etc.) for effective throttling
3. **Cross-org permission escalation**: `AuthorizeInOrgMiddleware` allows checking permissions in another org but requires careful handling of `NoOrgID` state (`middleware.go:258-261`)
4. **Session fixation**: `WriteSessionCookie` overwrites cookie on each login without regenerating token; token ID is predictable from `grafana_session_expiry` cookie
5. **Anonymous org role confusion**: `Anonymous.OrgRole` can be assigned in config (`authz/rbac.go:90`), potentially granting permissions to unauthenticated users

## Future Considerations

1. **Zanzana migration**: The dual-write/shadow mode for Zanzana (`authz/rbac.go:196-214`) needs full migration to become the primary authorization engine
2. **Grafana Secrets Manager**: Migration from legacy `pkg/services/secrets/` to GSM for multi-tenant APIs
3. **Database-level row security**: Consider PostgreSQL RLS policies or similar for hard tenant isolation
4. **Audit log centralized storage**: Current K8s audit backend logs to configured backend; no evidence of retention policy or centralized SIEM integration in OSS

## Questions / Gaps

1. **No evidence found** for secrets rotation scheduling automation beyond manual `RotateDataKeys()` trigger
2. **No evidence found** for rate limiting on authentication endpoints (brute force protection is per-username/IP but distributed rate limiting unclear)
3. **No evidence found** for MFA/2FA enforcement at org or user level
4. **No evidence found** for password policy enforcement (complexity, expiry)
5. **Retention duration** for audit logs not specified in code
6. **Cross-region tenant isolation** not examined (if applicable)

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `grafana`.