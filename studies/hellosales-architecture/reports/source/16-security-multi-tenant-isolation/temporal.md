# Source Analysis: temporal

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal implements security via a layered approach: JWT-based authentication with configurable claim mapping, role-based authorization (RBAC) with system and namespace-level permissions, and namespace-based tenant isolation at the data layer. TLS is supported for transport encryption, and secrets are masked in logs. However, no dedicated audit trail system was found.

## Rating

**5/10** — Basic implementation with gaps. The authN/authZ model is well-designed with JWT support and RBAC, but tenant isolation relies solely on namespace IDs without explicit row-level security, no audit trail was found, and encryption at rest for persistence data was not evidenced.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| AuthN | JWT claim mapper extracts permissions from Bearer tokens | `common/authorization/default_jwt_claim_mapper.go:76-110` |
| AuthN | AuthInfo struct holds TLS subject and auth token | `common/authorization/claim_mapper.go:15-23` |
| AuthZ | Authorizer interface with DecisionAllow/Deny | `common/authorization/authorizer.go:14-19` |
| AuthZ | Default authorizer with role-based rules | `common/authorization/default_authorizer.go:25-65` |
| AuthZ | Interceptor enforces auth on gRPC calls | `common/authorization/interceptor.go:129-185` |
| AuthZ | Role enum: Worker, Reader, Writer, Admin | `common/authorization/roles.go:8-13` |
| AuthZ | Claims struct with System and Namespaces roles | `common/authorization/roles.go:23-36` |
| AuthZ | Cross-namespace command authorization | `common/authorization/interceptor.go:347-413` |
| Tenant | Namespace ID in all persistence schemas | `schema/sqlite/v3/temporal/schema.sql:32,48,65` |
| Tenant | Namespace type with ID and Name | `common/namespace/namespace.go:32-36` |
| TLS | TLSConfigProvider interface for cert management | `common/rpc/encryption/tls_factory.go:17-24` |
| TLS | LocalStoreCertProvider for file-based certs | `common/rpc/encryption/local_store_cert_provider.go` |
| Secrets | Password masking in YAML logs | `common/masker/masker.go:9-37` |
| Secrets | PasswordCommand for dynamic credentials | `common/config/persistence.go:299-319` |
| Noop | NoopAuthorizer always returns DecisionAllow | `common/authorization/noop_authorizer.go:12` |
| Noop | NoopClaimMapper grants system admin to all | `common/authorization/claim_mapper.go:52-53` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication is performed via JWT Bearer tokens passed in the `authorization` header. The `defaultJWTClaimMapper` parses the JWT, extracts the `sub` claim as subject identity, and permissions from a configurable claim (default: `permissions`). The claim format is `namespace:role` (e.g., `my-namespace:admin`) or `system:role` for cluster-wide roles. TLS client certificates are also supported via `PeerCert()` extraction from the gRPC context (`common/authorization/interceptor.go:70-81`). Sessions are not explicitly managed — Temporal relies on stateless JWT validation on each request. The `AuthInfoRequired` interface allows claim mappers to enforce auth on all requests.

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization is enforced by the `Interceptor` gRPC middleware (`common/authorization/interceptor.go:129-185`). For each request, it extracts auth info, maps to `Claims`, builds a `CallTarget` with namespace and API name, then calls the `Authorizer.Authorize()` method. The `defaultAuthorizer` (`common/authorization/default_authorizer.go:35-65`) uses a role-hierarchy: System roles apply across all namespaces; namespace-specific roles apply only to that namespace. API access levels (`AccessReadOnly`, `AccessWrite`) map to required roles (`RoleReader`, `RoleWriter`, `RoleAdmin`). The method metadata determines scope (cluster vs namespace). Cross-namespace commands (signal external workflow, start child workflow) are explicitly authorized against target namespaces in `authorizeTargetNamespaces()` (`interceptor.go:347-413`).

### 3. How is tenant A prevented from accessing tenant B's data?

Tenant isolation is enforced at the namespace level. All persistence tables include `namespace_id` as a partitioning key (e.g., `current_executions` table at `schema/sqlite/v3/temporal/schema.sql:48`). The visibility store queries include `namespace_id` filtering (`common/persistence/visibility/store/sql/visibility_store.go:187`). The namespace registry (`common/namespace/registry.go`) provides `GetNamespaceByID` and `GetNamespace` lookups. The authorizer checks that claims include the target namespace role before allowing access. However, **no row-level security or column encryption per tenant was found** — isolation relies entirely on application code correctly passing namespace IDs.

### 4. What audit events are captured and how long are they retained?

**No evidence found.** The search for "audit" patterns returned no results. There is no dedicated audit event emission or storage system. Workflow history events are stored (which record workflow state transitions), but these are not audit events in the security sense. Authorization decisions are logged with metrics (`metrics.ServiceErrUnauthorizedCounter`) but not persisted as audit records.

### 5. How are secrets encrypted at rest and in transit?

**In transit**: TLS is fully supported. The `TLSConfigProvider` interface (`common/rpc/encryption/tls_factory.go:17-24`) manages frontend and internode TLS configs. LocalStoreCertProvider loads certificates from files with support for refresh. Mutual TLS is supported for both frontend and worker connections.

**At rest**: **No evidence found.** The database schemas show `data` columns stored as `MEDIUMBLOB` with `data_encoding` type markers, but no encryption at rest implementation was found in the persistence layer. The `common/persistence/serialization/serializer.go` handles serialization but not encryption. Database passwords support `passwordCommand` for dynamic fetching (`common/config/persistence.go:299-319`) but the actual password storage in the database is not encrypted by Temporal.

## Architectural Decisions

1. **JWT-based stateless auth**: Temporal chose stateless JWT authentication rather than session-based, suitable for a durable execution platform where workers may connect/disconnect.

2. **Namespace as isolation boundary**: Namespaces serve as the primary tenant isolation construct, rather than sub-namespaces or organizations. This is a simpler model appropriate for Temporal's workflow-centric architecture.

3. **No pluggable audit**: Audit trail was not prioritized in the core authorization design. External solutions would need to be layered on top.

4. **Claim mapping is configurable**: The `defaultJWTClaimMapper` supports regex-based permission extraction and configurable claim names, allowing integration with various identity providers.

5. **Role bitmask**: Temporal uses a Go bitmask for roles (`RoleWorker|RoleReader|RoleWriter|RoleAdmin`) allowing compound roles per context.

## Notable Patterns

- **Authorization interceptor chain**: gRPC interceptors handle both unary and streaming RPCs, centralizing auth logic.
- **Method metadata**: API methods are classified by scope (cluster vs namespace) and access level (read-only, write, admin) in `common/api/method_metadata.go`.
- **Context propagation**: Mapped claims are stored in Go context via `context.WithValue`, enabling downstream access without global state.
- **Principal stripping**: Inbound principal headers are always stripped to prevent spoofing (`interceptor.go:157-158`).
- **Cross-namespace authorization**: Explicit check for target namespaces in cross-namespace workflow commands.

## Tradeoffs

1. **Namespace isolation only**: Temporal's multi-tenancy is namespace-based. There is no row-level security, so a bug in application code could potentially leak data between namespaces.

2. **No built-in audit**: Organizations requiring audit trails must build them externally or use workflow history as a proxy, which is not designed for security auditing.

3. **No encryption at rest**: Sensitive data in persistence is not encrypted at the storage layer. Organizations must rely on database-level encryption (e.g., AWS RDS encryption).

4. **Noop authorizer default**: When no authorizer is configured, `noopAuthorizer` allows all access (`common/authorization/authorizer.go:67-68`).

5. **JWT key management external**: Temporal does not manage JWT keys — keys must be provided via `TokenKeyProvider` or JWKS endpoint configuration.

## Failure Modes / Edge Cases

1. **Namespace case sensitivity**: The authorizer test shows case-sensitive namespace matching — `BarAdminOnFooBAR` fails when namespace is `bar` (`default_authorizer_test.go:129`). This could cause confusion.

2. **Empty claims on secured endpoints**: If `claimMapper` returns nil claims, `DefaultAuthorizer` denies access (`default_authorizer.go:41-43`).

3. **passwordCommand timeout**: If `passwordCommand` fails or times out, the system cannot connect to persistence (`common/config/persistence.go:319`).

4. **JWT validation relies on key provider**: If `TokenKeyProvider` returns wrong keys or is unavailable, all auth fails.

5. **Health checks bypass auth**: Health check APIs are always allowed (`default_authorizer.go:36-39`), which is standard but worth noting.

## Future Considerations

1. **Row-level security**: Add database-level row security policies for namespace isolation as defense-in-depth.

2. **Audit trail service**: Implement a dedicated audit event service that captures admin actions, auth decisions, and data access.

3. **Encryption at rest**: Add envelope encryption for persistence data using a key management service.

4. **mTLS everywhere**: Expand mandatory mTLS for all inter-service communication, not just optional configuration.

5. **Principal propagation for async operations**: For workflows that make outbound calls, ensure the principal context is properly propagated.

## Questions / Gaps

1. How are namespace IDs assigned and can they be predicted/guessed? (No evidence of ID randomization.)
2. Is there rate limiting per namespace to prevent noisy neighbor problems?
3. How is the JWT key rotation handled without downtime?
4. Are there any quotas on API calls per namespace?
5. What happens when a namespace is deleted — is data actually removed or just marked deleted?

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `temporal`.