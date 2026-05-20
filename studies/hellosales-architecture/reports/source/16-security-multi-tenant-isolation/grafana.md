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

Grafana implements a comprehensive security architecture with multiple authentication clients, RBAC-based authorization, org-level tenant isolation, audit logging for API server operations, and envelope encryption for secrets. The auth system uses a pluggable client architecture supporting session cookies, API keys, JWT, OAuth, SAML, and LDAP. Authorization is enforced via middleware and fine-grained permission evaluation, with Zanzana (OpenFGA-based) providing next-generation authorization. Tenant isolation is achieved through OrgID-based filtering at the database layer. Audit logging captures API operations with configurable verbosity levels.

## Rating

**8/10** — Good implementation with minor issues. Grafana has a mature, layered security model with multiple defense mechanisms. Some legacy components are marked deprecated, and certain features (like audit retention) lack explicit configuration options.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| AuthN Clients | Session, API Key, Basic, JWT, OAuth, SAML, LDAP, Proxy, Form authentication clients | `pkg/services/authn/authn.go:21-34` |
| Session Management | Cookie-based session with token lookup and rotation | `pkg/services/authn/clients/session.go:62` |
| API Key Auth | API key validation with org membership check | `pkg/services/authn/clients/api_key.go:221` |
| AuthZ Middleware | Access control middleware for permission evaluation | `pkg/services/accesscontrol/middleware.go:30` |
| Permission Evaluator | Evaluator interface for RBAC permission checks | `pkg/services/accesscontrol/evaluator.go:16` |
| SQL Permission Filter | Org-based SQL filtering for data access restriction | `pkg/services/accesscontrol/filter.go:38` |
| Identity OrgID | OrgID field in identity for tenant context | `pkg/services/authn/identity.go:32` |
| Zanzana AuthZ | OpenFGA-based fine-grained authorization | `pkg/services/authz/zanzana.go:45` |
| Audit Policy | Kubernetes-style audit policy rule evaluator | `pkg/apiserver/auditing/policy.go:29` |
| Audit Decrypt | Audit logging for secret decryption operations | `pkg/storage/secret/metadata/decrypt_store.go:69-110` |
| Envelope Encryption | Legacy envelope encryption service (deprecated) | `pkg/services/secrets/manager/manager.go:38` |
| Encryption Ciphers | AES-CFB and AES-GCM cipher support | `pkg/services/encryption/encryption.go:12-13` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication in Grafana uses a pluggable client architecture defined in `pkg/services/authn/authn.go:21-34`. Multiple clients are registered: session (cookie-based), API key, basic auth, JWT, extended JWT, render key, form login, proxy, SAML, LDAP, and provisioning.

**Session management** (`pkg/services/authn/clients/session.go:46-92`):
- Sessions are cookie-based using `grafana_session` cookie
- Token lookup via `sessionService.LookupToken(ctx, rawSessionToken)` at line 62
- Token rotation check at line 67 with configurable interval
- Session expiry cookie tracks next rotation time (`session.go:330-344`)

**API Key authentication** (`pkg/services/authn/clients/api_key.go:58-86`):
- API keys are validated by decoding, hashing, and looking up in database
- OrgID validation at line 221 ensures key belongs to requested organization
- Keys must belong to a service account (line 226)

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization is enforced through a layered approach:

**Middleware layer** (`pkg/services/accesscontrol/middleware.go:30-84`):
```go
func Middleware(ac AccessControl) func(Evaluator) web.Handler {
    return func(evaluator Evaluator) web.Handler {
        return func(c *contextmodel.ReqContext) {
            // ...
            authorize(c, ac, c.SignedInUser, evaluator)
        }
    }
}
```

**Permission evaluation** (`pkg/services/accesscontrol/evaluator.go:40-58`):
- `permissionEvaluator` checks if user has required action with matching scope
- Scope matching supports wildcards (prefix matching with `*`)
- Returns true only if at least one user scope matches a target scope

**Zanzana (next-gen authz)** (`pkg/services/authz/zanzana.go`):
- OpenFGA-based authorization service
- Supports embedded or remote deployment modes
- Token-based authentication with audience validation (`zanzana.go:323-336`)

**SQL-level filtering** (`pkg/services/accesscontrol/filter.go:38-89`):
- `Filter()` function creates org-scoped WHERE clauses
- Parses permission scopes to extract resource IDs
- Returns `1=0` (deny) or `1=1` (allow) or `id IN (...)` patterns

### 3. How is tenant A prevented from accessing tenant B's data?

Tenant isolation is achieved through multiple mechanisms:

**OrgID in Identity** (`pkg/services/authn/identity.go:32`):
```go
type Identity struct {
    OrgID int64
    OrgRoles map[int64]org.RoleType
    // ...
}
```

**Database-level filtering** (`pkg/services/accesscontrol/filter.go:38`):
- `Filter()` function restricts queries to user's org
- Example: `WHERE org_id = ?` added to queries
- Accept list prevents SQL injection in filter construction (`filter.go:12-23`)

**API validation** (`pkg/services/authn/clients/api_key.go:221`):
```go
if orgID != key.OrgID {
    return errAPIKeyOrgMismatch.Errorf("API does not belong in Organization")
}
```

**Cross-org access control** (`pkg/services/accesscontrol/middleware.go:255-267`):
```go
if targetOrgID != c.GetOrgID() {
    orgUser, err = authnService.ResolveIdentity(c.Req.Context(), targetOrgID, c.GetID())
    // User must be member of target org to access its data
}
```

### 4. What audit events are captured and how long are they retained?

**Audit Policy** (`pkg/apiserver/auditing/policy.go:33-67`):
- `LevelMetadata` for most resource requests (GET, UPDATE, DELETE)
- `LevelRequestResponse` for create operations ( VerbCreate at line 51-52)
- `LevelNone` for watch requests and privileged users (system group)
- Stages omitted: RequestReceived, ResponseStarted, Panic

**Secrets Audit** (`pkg/storage/secret/metadata/decrypt_store.go:69-110`):
- All decryption operations logged with:
  - Namespace, secret name, decrypter identity
  - Success/failure status
  - Service identity from request metadata
- Uses Grafana App SDK logging (`logging.FromContext(ctx).Info("Secrets Audit Log", args...)`)

**No explicit retention configuration found** — audit events are logged via configurable backends (noop by default). The standard Kubernetes audit backend is used, but retention policy would be determined by the backend implementation.

### 5. How are secrets encrypted at rest and in transit?

**Envelope Encryption** (`pkg/services/secrets/manager/manager.go:38-61`):
- Data keys are used to encrypt secrets (envelope encryption)
- Data keys themselves are encrypted by provider (kmsproviders)
- Cache for data keys with configurable TTL (`manager.go:77`)

**Cipher Support** (`pkg/services/encryption/encryption.go:12-13`):
- AES-CFB (deprecated)
- AES-GCM (recommended)

**Key Derivation** (`pkg/services/encryption/encryption.go:44-46`):
```go
func KeyToBytes(secret, salt string) ([]byte, error) {
    return pbkdf2.Key(sha256.New, secret, []byte(salt), 10000, 32)
}
```

**Deprecated Notice** (`pkg/services/secrets/secrets.go:16-19`):
```
// Deprecated: Multi-tenant APIs should not use imports from pkg/services/secrets/, as it creates a dependency on the legacy database.
// If you need to encrypt data in a multi-tenant API, use Grafana Secrets Manager (GSM) instead.
```

**Secrets Manager** (newer): The `pkg/storage/secret/metadata/decrypt_store.go` provides a separate secrets manager with explicit authorization checks per decryption operation.

## Architectural Decisions

1. **Pluggable Auth Architecture**: Authentication is client-based with priority ordering, allowing easy addition of new auth methods. Each client implements `Client` interface (`pkg/services/authn/authn.go:152-158`).

2. **Org-Based Multi-Tenancy**: Uses `OrgID` as the primary tenant identifier, stored in identity and enforced at query level. Simple but effective for most Grafana deployment scenarios.

3. **RBAC with Permission Scopes**: Permissions are action+scope pairs (e.g., `dashboards:read`, `datasources:uid:1`). Scope resolvers dynamically inject resource IDs into queries (`pkg/services/accesscontrol/filter.go:91-113`).

4. **Dual AuthZ Systems**: Legacy SQL-based RBAC and newer Zanzana (OpenFGA) coexist with migration path via feature flags (`pkg/services/authz/rbac.go:59`, `pkg/services/authz/zanzana.go:47`).

5. **Audit as Middleware**: Kubernetes-style audit evaluation happens at API server level with configurable policy rule evaluator (`pkg/apiserver/auditing/policy.go:29`).

## Notable Patterns

- **Context-aware auth clients**: Clients implement `ContextAwareClient` interface to conditionally participate in auth chain based on request context (`pkg/services/authn/authn.go:162-168`)
- **Hook system for post-auth actions**: `PostAuthHookFn` allows synchronous actions after successful authentication (`pkg/services/authn/authn.go:86`)
- **Permission caching**: User permissions are cached on the identity object and invalidated on updates (`pkg/services/accesscontrol/accesscontrol.go:44-45`)
- **SQL injection prevention**: Accept-list approach for SQL filter column names (`pkg/services/accesscontrol/filter.go:12-23`)
- **Audit span attributes**: Decrypt operations trace with identity and service information via OpenTelemetry spans (`pkg/storage/secret/metadata/decrypt_store.go:80-96`)

## Tradeoffs

1. **Legacy vs. Modern AuthZ**: Dual systems (RBAC + Zanzana) create complexity. Zanzana requires explicit feature flag enablement and gradual rollout.

2. **OrgID Limitations**: Single-org design may not scale to true multi-tenant SaaS. The system expects Grafana to be the tenant boundary, not resources within Grafana.

3. **No Native Audit Retention**: Audit logs are dispatched to backends with no built-in retention policy. Operators must configure external storage.

4. **Envelope Encryption Complexity**: Data key caching improves performance but adds operational complexity for key rotation scenarios.

5. **Anonymous Access Option**: `AllowAnonymous` flag allows partial authentication with force-login fallback, which could be a security consideration (`pkg/middleware/auth.go:205-216`).

## Failure Modes / Edge Cases

1. **Token Rotation Race**: Session token rotation check happens at authentication time (`pkg/services/authn/clients/session.go:67`) — concurrent requests could see inconsistent state during rotation.

2. **API Key Org Mismatch**: Returns 401 instead of 403 when API key org doesn't match request org (`pkg/services/authn/clients/api_key.go:221`), potentially leaking org existence information.

3. **Anonymous Force-Login Bypass**: If `forceLogin=true` param is present, anonymous users are redirected to login even on public dashboards (`pkg/middleware/auth.go:289-296`).

4. **Permission Cache Invalidation**: Clearing permission cache is user-level only (`pkg/services/accesscontrol/accesscontrol.go:44-45`) — no bulk invalidation for role/permission changes.

5. **Zanzana Reconciler MT Mode**: Multi-tenant reconciler runs as background goroutine with error logging only (`pkg/services/authz/zanzana.go:157-159`) — failures are not retried.

## Future Considerations

1. **Full Zanzana Migration**: Complete migration from legacy RBAC to Zanzana for fine-grained authorization with better performance characteristics.

2. **Audit Retention Policy**: Implement configurable retention settings for audit logs, with automatic cleanup of old entries.

3. **Multi-Tenant Secrets Manager**: GSM (Grafana Secrets Manager) for multi-tenant APIs is referenced but details would need to be reviewed.

4. **Zero-Trust Networking**: gRPC authz client supports token exchange but current implementation uses `insecure.NewCredentials()` by default (`pkg/services/authz/rbac.go:225`).

5. **Service Identity Propagation**: Decrypt authorization passes service identity via gRPC metadata (`pkg/storage/secret/metadata/decrypt_store.go:92-96`) — could be exploited for privilege escalation if not validated.

## Questions / Gaps

1. **No evidence found** for explicit audit log retention period configuration — searched `pkg/apiserver/auditing/`, `pkg/services/audit/` (does not exist), `conf/` defaults.

2. **No evidence found** for encryption at rest configuration per tenant — envelope encryption appears globally configured.

3. **No evidence found** for rate limiting on auth endpoints to prevent brute force attacks.

4. **No evidence found** for password policy enforcement in the auth service.

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `grafana`.