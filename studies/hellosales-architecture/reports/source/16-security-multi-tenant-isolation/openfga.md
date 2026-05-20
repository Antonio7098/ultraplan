# Source Analysis: openfga

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go (golang) |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA is a high-performance ReBAC (Relationship-Based Access Control) authorization engine implementing the Zanzibar model. It provides multi-tenant isolation through store-based segmentation, with authentication via OIDC/JWT or preshared keys, and authorization decisions enforced through its own relationship-based model. The system tracks all tuple changes in a changelog for cache invalidation but does not have a dedicated audit trail system. TLS is supported for transport security, and optional AES-GCM encryption is available for data at rest.

## Rating

**7/10** — Good implementation with minor issues. OpenFGA provides solid multi-tenant isolation through store-based separation and relationship-based access control. However, audit trail functionality is limited to changelog tracking for cache purposes rather than security auditing, secret management relies on external configuration, and the default encryption is a no-op.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| AuthN Interface | `Authenticator` interface defines `Authenticate()` and `Close()` methods | `internal/authn/authn.go:20-26` |
| Noop Authenticator | No-op authenticator returns empty claims (for testing/dev) | `internal/authn/authn.go:28-39` |
| OIDC Authenticator | JWT-based authentication with JWKS key fetching, audience/issuer/subject validation | `internal/authn/oidc/oidc.go:27-77` |
| PSK Authenticator | Preshared key authentication with key map lookup | `internal/authn/presharedkey/presharedkey.go:13-44` |
| Auth Middleware | gRPC interceptor that populates AuthClaims into context | `internal/middleware/authn/authn.go:12-20` |
| Auth Claims Storage | Context-based auth claims storage with skip-authz flag | `pkg/authclaims/authclaims.go:12-46` |
| Authorizer Interface | `AuthorizerInterface` defines `Authorize()`, `AuthorizeCreateStore()`, `ListAuthorizedStores()` | `internal/authz/authz.go:86-93` |
| Relation Constants | Permission relations: `CanCallRead`, `CanCallWrite`, `CanCallCheck`, etc. | `internal/authz/authz.go:32-47` |
| Store-based Authorization | Authorization checks use store ID as the authorization object | `internal/authz/authz.go:185-190` |
| Module-based Authorization | Fine-grained per-module authorization for write operations | `internal/authz/authz.go:417-463` |
| Noop Authorizer | Pass-through authorizer for disabled access control | `internal/authz/authz.go:95-123` |
| Store ID Middleware | gRPC interceptor extracting store_id from request into context | `pkg/middleware/storeid/storeid.go:60-105` |
| Store ID Context | `StoreIDFromContext()` retrieves store ID from context | `pkg/middleware/storeid/storeid.go:30-38` |
| Server Struct | Server holds `authorizer`, `datastore`, and store-specific config | `pkg/server/server.go:167-259` |
| TLS Config | TLS configuration for gRPC and HTTP servers | `pkg/server/config/config.go:204-209` |
| TLS Server Setup | TLS credentials setup with cert watcher for hot-reload | `cmd/run/run.go:643-659` |
| HTTP TLS Setup | HTTP server TLS configuration | `cmd/run/run.go:798-812` |
| GCM Encrypter | AES-GCM encryption implementation for data at rest | `pkg/encrypter/gcm_encrypter.go:15-64` |
| Noop Encrypter | Default encrypter that passes data through unchanged | `pkg/encrypter/encrypter.go:12-28` |
| Changelog Backend | Interface for tracking tuple writes/deletes | `pkg/storage/storage.go:395-405` |
| Changelog on Write | Write operations must write to changelog | `pkg/storage/storage.go:276` |
| ReadChanges API | API for consuming changelog entries | `pkg/server/read_changes.go:57` |
| Changelog Horizon | Configurable offset to filter recent changes | `cmd/run/run.go:279` |
| Datastore URI | Private field (not logged) for connection strings | `pkg/server/config/config.go:132-137` |
| Authzen Per-Store Discovery | Per-store discovery endpoint following AuthZEN multi-tenant pattern | `pkg/server/authzen_configuration.go:14` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication in OpenFGA is stateless and token-based, using either OIDC/JWT or preshared keys:

- **OIDC Authentication** (`internal/authn/oidc/oidc.go:79-168`): JWT tokens are validated using RS256 algorithm. The authenticator fetches OIDC configuration from `/.well-known/openid-configuration` and retrieves JWKS from the `jwks_uri`. Token validation includes:
  - Audience validation (`jwt.WithAudience`)
  - Issuer validation (main issuer + aliases)
  - Subject validation (optional allowlist)
  - Expiration checking (`jwt.WithExpirationRequired`)
  - Client ID extraction from configurable claims (`azp`, `client_id`)

- **Preshared Key Authentication** (`internal/authn/presharedkey/presharedkey.go:31-43`): Bearer tokens are validated by exact key match against a configured key map.

- **Session Management**: No explicit session management — authentication is stateless. Auth claims are stored in request context (`pkg/authclaims/authclaims.go:23-35`) and include `Subject`, `ClientID`, and `Scopes`.

- **Auth Middleware** (`internal/middleware/authn/authn.go:12-20`): gRPC interceptor wraps handlers, populating auth claims into context before handler execution.

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization in OpenFGA is self-referential — it uses OpenFGA's own model to authorize API operations:

- **Authorizer Interface** (`internal/authz/authz.go:86-93`): Defines methods for `Authorize()`, `AuthorizeCreateStore()`, `AuthorizeListStores()`, and `ListAuthorizedStores()`.

- **Store-Level Authorization** (`internal/authz/authz.go:192-238`): The `Authorize()` method checks if the client has the required relation (e.g., `CanCallRead`, `CanCallWrite`) on the store object (`StoreIDType(storeID).String()`).

- **Relation Mapping** (`internal/authz/authz.go:147-183`): API methods are mapped to permission relations:
  - `Read` → `CanCallRead`
  - `Write` → `CanCallWrite`
  - `Check` → `CanCallCheck`
  - `ListObjects` → `CanCallListObjects`

- **Module-Based Authorization** (`internal/authz/authz.go:417-463`): For write requests, authorization can be checked against modules (fine-grained authorization models) in parallel.

- **Internal Check for Authorization** (`internal/authz/authz.go:384-415`): `individualAuthorize()` makes an internal Check call to the OpenFGA server to determine if the client has the required permission.

- **Skip Authz Flag** (`pkg/authclaims/authclaims.go:37-46`): Context flag `skipAuthzCheck` prevents recursive authorization checks when making internal calls.

- **Noop Authorizer** (`internal/authz/authz.go:95-123`): When access control is disabled, all authorization checks pass through.

### 3. How is tenant A prevented from accessing tenant B's data?

Tenant isolation is enforced at multiple layers:

- **Store-Based Isolation**: Each tenant's data is stored in a separate store. The store ID (`store_id`) is the primary isolation boundary. All API requests require a `store_id` parameter.

- **Store ID Middleware** (`pkg/middleware/storeid/storeid.go:60-105`): gRPC interceptor extracts `store_id` from the request and stores it in the context. This middleware is applied to all incoming requests.

- **Database-Level Isolation**: Each datastore implementation (PostgreSQL, MySQL, SQLite) stores tuples in table structures that include `store_id` as a primary key column. All queries are scoped by store ID.

- **Changelog Isolation** (`pkg/storage/storage.go:395-405`): The `ReadChanges` API is scoped to a specific store, returning only changes for that store's tuples.

- **AuthZen Per-Store Discovery** (`docs/authzen/pdp-capabilities-registry.md:114`): AuthZEN discovery endpoints are per-store, following the multi-tenant pattern specified in the AuthZEN spec.

- **ListAuthorizedStores** (`internal/authz/authz.go:282-317`): The authorizer's `ListAuthorizedStores()` method uses a ListObjects call to return only stores the authenticated client has access to.

- **No Cross-Store Access**: There is no mechanism to query across stores. The storage interface methods all require a `store` parameter as the first argument.

### 4. What audit events are captured and how long are they retained?

OpenFGA does not have a dedicated security audit trail system. Instead, it has a **changelog** for tracking tuple changes:

- **Changelog Backend** (`pkg/storage/storage.go:395-405`): Interface defines `ReadChanges()` method that returns tuple writes and deletes in order.

- **Changelog on Write** (`pkg/storage/storage.go:276`): The `Write()` method "must also write to the changelog" — every tuple modification is recorded.

- **Changelog Retention**: There is **no retention policy** or TTL-based expiration for changelog entries. Changelog entries are stored indefinitely in the database.

- **ReadChanges API** (`pkg/server/read_changes.go:57`): Exposes changelog via API with `changelogHorizonOffset` parameter for filtering out recent changes (for eventually consistent databases).

- **Cache Invalidation Use** (`internal/cachecontroller/cache_controller.go:235-297`): The cache controller uses the changelog to invalidate cached Check results when tuples are modified.

- **Horizon Offset** (`cmd/run/run.go:279`): `changelog-horizon-offset` flag allows ignoring changes within a time window for eventually consistent setups.

- **No Security Audit Events**: There is no evidence of security-specific audit logging (e.g., failed auth attempts, authorization denials, admin operations). The changelog is for data synchronization, not security auditing.

### 5. How are secrets encrypted at rest and in transit?

- **In Transit (TLS)**: Both gRPC and HTTP servers support TLS.
  - gRPC TLS (`cmd/run/run.go:643-659`): Configured via `--grpc-tls-enabled`, `--grpc-tls-cert`, `--grpc-tls-key` flags.
  - HTTP TLS (`cmd/run/run.go:798-812`): Configured via `--http-tls-enabled`, `--http-tls-cert`, `--http-tls-key` flags.
  - Cert watcher for hot-reload (`cmd/run/run.go:96-125`): Certificate changes are detected and reloaded without restart.
  - TLS configuration structure (`pkg/server/config/config.go:204-209`): `Enabled`, `CertPath`, `KeyPath`.

- **At Rest (Encryption)**: Optional AES-GCM encryption is available.
  - `GCMEncrypter` (`pkg/encrypter/gcm_encrypter.go:15-64`): Uses AES-256 (key derived from SHA-256 hash), with random nonce generation.
  - `NoopEncrypter` (`pkg/encrypter/encrypter.go:12-28`): Default implementation passes data through unchanged — **no encryption by default**.
  - Encrypter interface (`pkg/encrypter/encrypter.go:6-10`): `Encrypt()` and `Decrypt()` methods.

- **Secret Management**: Connection credentials (username/password) are private fields (`json:"-"`) that won't be logged (`pkg/server/config/config.go:132-137`). However, secrets must be provided via configuration — there is no secret store integration (e.g., Vault, Kubernetes secrets).

- **Datastore Passwords**: `--datastore-username` and `--datastore-password` flags (or env vars) pass credentials to the datastore connection.

## Architectural Decisions

1. **Self-Referential Authorization**: OpenFGA uses its own authorization model to authorize API calls. The access control store holds permissions like `client:app1#can_call_read@store:store123`. This is elegant but creates a bootstrapping problem — how is the initial access control store configured?

2. **Store as Tenant Boundary**: Each store is a completely isolated namespace. There is no mechanism for cross-store queries or operations. This is a hard boundary — not a soft one.

3. **Stateless Authentication**: JWT/OIDC tokens contain all auth information. No server-side session storage. This enables horizontal scaling but limits revocation capabilities.

4. **Relationship-Based Access Control (ReBAC)**: Authorization is not traditional RBAC — it's graph-based. Permissions are relationships between users and objects through arbitrary paths.

5. **No Built-in Audit Trail**: The changelog is for data consistency, not security auditing. Failed auth attempts, permission denials, and admin actions are not systematically logged.

6. **Optional Encryption**: Encryption at rest is a no-op by default. Users must explicitly configure and provide encryption keys.

## Notable Patterns

1. **Context Propagation**: Auth claims and store ID are propagated through Go context, not passed as function parameters. Uses `context.WithValue()` with typed keys.

2. **Authz Skip Flag**: `ContextWithSkipAuthzCheck()` prevents recursive authorization checks when making internal service calls (`pkg/authclaims/authclaims.go:37-46`).

3. **Parallel Module Authorization**: Module authorization checks run concurrently with `sync.WaitGroup` (`internal/authz/authz.go:427-460`).

4. **Circular Resolver Chain**: The check resolver chain forms a circular linked list for middleware composition (`internal/graph/builder.go`).

5. **Configurable Cache Invalidation**: Cache controller monitors changelog and invalidates entries based on recent writes (`internal/cachecontroller/cache_controller.go:235-297`).

6. **Private Fields for Secrets**: Connection URIs and passwords are marked `json:"-"` to prevent logging.

## Tradeoffs

1. **Self-authorization bootstrapping**: Requires an access control store to be pre-configured with permissions. The initial setup requires careful planning.

2. **No native session revocation**: JWT-based auth means token revocation requires token expiration or a denylist (not implemented).

3. **No security audit trail**: Changelog tracks data changes, not security events. Forensic analysis of auth failures or breaches would be limited.

4. **No encryption by default**: `NoopEncrypter` means data at rest is unencrypted unless explicitly configured.

5. **Single-store isolation**: Cannot query across stores — limits multi-tenant reporting and cross-tenant operations.

6. **JWKS caching**: OIDC keys are cached for 48 hours with rate-limited refresh (`internal/authn/oidc/oidc.go:41-42`). If a key is rotated, there could be a window where old tokens are accepted or new tokens rejected.

## Failure Modes / Edge Cases

1. **Invalid store_id**: Requests without valid store ID return error. Store existence is checked at handler level.

2. **Expired JWT**: Returns `unauthenticated` error. No refresh mechanism.

3. **Missing auth claims**: If `ClientID` is empty in context, authorization fails with "client ID not found in context" (`internal/authz/authz.go:467-471`).

4. **Malformed OIDC config**: If JWKS URI is missing or unreachable, authenticator creation fails at startup.

5. **Concurrent writes to same tuple**: Returns `ErrTransactionalWriteFailed` — no idempotency built-in for retries.

6. **Cache incoherence**: With eventually consistent datastore and stale cache, authorization decisions could be based on stale data. Horizon offset helps but doesn't fully solve it.

7. **Module authorization failure**: If any module authorization fails, the entire request fails (fail-fast on error channel).

## Future Considerations

1. **Secret Management Integration**: Consider integrating with Vault, Kubernetes secrets, or cloud secret managers for credential handling.

2. **Security Audit Trail**: Implement a dedicated audit log for security events (auth failures, permission denials, admin operations).

3. **Token Revocation**: Add support for token revocation or denylist to complement JWT's stateless nature.

4. **Encryption at Rest by Default**: Consider requiring encryption or making it the default for production deployments.

5. **Cross-Store Queries**: For administrative purposes, consider read-only cross-store access with proper authorization.

6. **Zero-Trust Networking**: Add mTLS support for service-to-service communication within a deployment.

## Questions / Gaps

1. **How is the initial access control store configured at deployment time?** The self-referential auth model requires bootstrapping. Is there a recommended approach or tooling?

2. **What happens if the access control store's model ID is deleted or becomes invalid?** There's a `config.ModelID` in the authorizer config but no evident validation.

3. **Is there any rate limiting on authentication failures?** No evidence of brute-force protection or lockout mechanisms.

4. **How are OIDC issuer aliases validated?** The code validates against a list of valid issuers, but the mechanism for adding/removing aliases isn't clear.

5. **What is the retention policy for the access control store's own tuples?** If OpenFGA authorizes using its own store, who authorizes the authorizer?

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `openfga`.