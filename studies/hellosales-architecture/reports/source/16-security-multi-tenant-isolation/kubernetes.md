# Source Analysis: kubernetes

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes provides a mature, production-grade security architecture with comprehensive authentication, authorization, audit logging, and encryption-at-rest capabilities. The system uses multiple layered authentication mechanisms (OIDC, webhook tokens, ServiceAccount tokens, x509 certificates), RBAC-based authorization with namespace-scoped roles, full-featured audit logging with configurable policy, and KMS-based envelope encryption for secrets at rest.

## Rating

**8/10** — Kubernetes demonstrates excellent security architecture with proper separation of concerns, comprehensive audit trails, and industry-standard encryption. Minor gaps include no native multi-tenancy support (relies on namespace-based soft tenancy) and retention policies are externalized to backend storage.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| OIDC Authentication | OIDC JWT authenticator with CEL-based claim mapping, async initialization, distributed claims support | `staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/oidc/oidc.go:860-972` |
| Webhook Authentication | TokenReview-based webhook authenticator with exponential backoff retry | `staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/webhook/webhook.go:98-195` |
| ServiceAccount Auth | ServiceAccount token generation with namespace-scoped username format `system:serviceaccount:<ns>:<name>` | `staging/src/k8s.io/apiserver/pkg/authentication/serviceaccount/util.go:53-57` |
| RBAC Authorization | RBAC authorizer implementing `authorizer.Authorizer` and `RuleResolver` interfaces | `plugin/pkg/auth/authorizer/rbac/rbac.go:50-169` |
| Bootstrap Tokens | Bootstrap token authenticator for initial cluster join | `plugin/pkg/auth/authenticator/token/bootstrap/bootstrap.go:1-100` |
| Audit Event Types | Audit event struct with Level, Stage, User, ObjectRef, RequestObject, ResponseObject | `staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:79-152` |
| Audit Policy | Policy rules with users, userGroups, verbs, resources, namespaces matching | `staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:214-272` |
| Audit Request Logging | `LogRequestMetadata`, `LogRequestObject`, `LogResponseObject` functions | `staging/src/k8s.io/apiserver/pkg/audit/request.go:43-199` |
| KMS Encryption Interface | gRPC service interface for Encrypt/Decrypt/Status with envelope encryption | `staging/src/k8s.io/kms/pkg/service/interface.go:22-50` |
| Audit Sink Backend | Sink interface with ProcessEvents, Run, Shutdown methods | `staging/src/k8s.io/apiserver/pkg/audit/types.go:23-46` |
| Secret Encryption | value transformer with secretbox (XSalsa20/Poly1305) for at-rest encryption | `staging/src/k8s.io/apiserver/pkg/storage/value/encrypt/secretbox/secretbox.go:30` |
| x509 Authentication | x509 client certificate authenticator with configurable verify options | `staging/src/k8s.io/apiserver/pkg/authentication/request/x509/x509.go:1-150` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Kubernetes supports multiple authentication strategies that can be composed:

**Token-based authentication:**
- **OIDC tokens**: JWT-based authentication via OpenID Connect. The `jwtAuthenticator.AuthenticateToken()` method (`staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/oidc/oidc.go:860`) verifies JWT signatures against issuer keys, validates audiences, and supports CEL expressions for claim mapping. Tokens include username, groups, UID, and extra claims.

- **Webhook tokens**: External TokenReview API via `WebhookTokenAuthenticator.AuthenticateToken()` (`staging/src/k8s.io/apiserver/plugin/pkg/authenticator/token/webhook/webhook.go:98-195`). The webhook receives a `TokenReview` and returns authentication result with exponential backoff retry.

- **ServiceAccount tokens**: Namespace-scoped tokens bound to ServiceAccounts. Username format is `system:serviceaccount:<namespace>:<name>` (`staging/src/k8s.io/apiserver/pkg/authentication/serviceaccount/util.go:55-57`). Groups include `system:serviceaccounts` and `system:serviceaccounts:<namespace>`.

**Session management:**
- Tokens are self-contained JWTs or opaque tokens validated on each request
- No server-side session state; stateless authentication
- Token caching available via `k8s.io/apiserver/pkg/authentication/token/cache` for performance

### 2. How are authorization decisions made and enforced across API boundaries?

**RBAC Authorizer** (`plugin/pkg/auth/authorizer/rbac/rbac.go:78-130`):
- Implements `Authorize()` method that uses `VisitRulesFor()` to check if any PolicyRule allows the request
- Returns `authorizer.DecisionAllow` or `authorizer.DecisionNoOpinion`
- `RuleAllows()` checks verb, API group, resource, resource name, and non-resource URL matches (`rbac.go:181-196`)

**Authorization Attributes**:
- User info (name, UID, groups, extra)
- Verb (get, list, watch, create, update, patch, delete)
- Namespace (for namespaced resources)
- API group and resource
- Subresource
- Resource name

**Enforcement points**:
- API server checks authorization after authentication on every request
- Admission controllers can enforce additional authorization policies
- Webhook authorizer available for external authorization (`staging/src/k8s.io/apiserver/plugin/pkg/authorizer/webhook/webhook.go`)

**RoleBinding scope**:
- RoleBinding links Role to subjects (users, groups, service accounts) within a namespace
- ClusterRoleBinding grants cluster-wide permissions

### 3. How is tenant A prevented from accessing tenant B's data?

**Kubernetes does not have native multi-tenancy** — it relies on namespace-based soft tenancy:

**Namespace isolation**:
- Namespace-scoped resources include namespace in their metadata
- RBAC rules can restrict access to specific namespaces
- ServiceAccount tokens are bound to specific namespaces
- Default deny; explicit RBAC grants required

**Data isolation mechanisms**:
- Storage isolation: etcd stores each namespace's data separately
- API request filtering: namespace field on requests filters results
- No cross-namespace references for certain resources without explicit RBAC

**ServiceAccount isolation** (`staging/src/k8s.io/apiserver/pkg/authentication/serviceaccount/util.go:54-57`):
- ServiceAccounts exist within namespace scope
- Token projected into pods contains namespace claim
- Pod cannot access ServiceAccount of different namespace

**Limitations**:
- Cluster-scoped resources (Nodes, PersistentVolumes) are shared
- No hard tenant separation at infrastructure level
- Relies on RBAC correctness for isolation

### 4. What audit events are captured and how long are they retained?

**Audit Event Structure** (`staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:79-152`):
- `AuditID`: Unique per request
- `Level`: None, Metadata, Request, RequestResponse
- `Stage`: RequestReceived, ResponseStarted, ResponseComplete, Panic
- `Verb`, `RequestURI`, `UserAgent`
- `User`: Username, UID, Groups, Extra
- `ImpersonatedUser`: For impersonation requests
- `SourceIPs`: Client and proxy IPs
- `ObjectRef`: Namespace, Name, Resource, Subresource, APIGroup, APIVersion
- `RequestObject` / `ResponseObject`: JSON-encoded bodies
- `RequestReceivedTimestamp`, `StageTimestamp`
- `Annotations`: Unstructured key-value map

**Audit Policy** (`staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:176-201`):
- Rules specify `Level` based on user, userGroup, verb, resource, namespace
- Per-rule `OmitManagedFields` and `OmitStages` options
- First matching rule wins; default is None

**Backends**:
- **Log backend**: JSON lines to file (`staging/src/k8s.io/apiserver/plugin/pkg/audit/log/backend.go`)
- **Webhook backend**: External HTTP endpoint (`staging/src/k8s.io/apiserver/plugin/pkg/audit/webhook/webhook.go`)
- **Buffered backend**: Batch processing with truncation (`staging/src/k8s.io/apiserver/plugin/pkg/audit/buffered/buffered.go`)

**Retention**:
- Retention is managed by the backend storage (external to Kubernetes)
- No built-in retention enforcement in audit code

### 5. How are secrets encrypted at rest and in transit?

**Encryption at Rest**:
- **KMS Envelope Encryption**: External KMS plugin via gRPC (`staging/src/k8s.io/kms/pkg/service/interface.go:22-50`)
  - `Encrypt(ctx, uid, data)` returns ciphertext with `KeyID`
  - `Decrypt(ctx, uid, req)` with ciphertext, key ID, annotations
  - `Status()` returns healthz and current key ID
- **Transformer-based encryption**: Multiple ciphers via `value.Transformer`
  - AES-GCM, AES-CBC, secretbox (XSalsa20/Poly1305) (`staging/src/k8s.io/apiserver/pkg/storage/value/encrypt/secretbox/secretbox.go:30`)
  - Envelope encryption: DEK encrypted by KEK (KMS key)

**Encryption in Transit**:
- TLS 1.2+ for all API server communication
- mTLS for kubelet to API server communication
- Certificate-based authentication for service accounts
- OIDC tokens support HTTPS transport

**Secretbox cipher** (`staging/src/k8s.io/apiserver/pkg/storage/value/encrypt/secretbox/secretbox.go:30`):
- Implements `Encrypt()` and `Decrypt()` using XSalsa20 for encryption and Poly1305 for authentication
- 32-byte secret key required

## Architectural Decisions

1. **Layered Authentication**: Multiple authenticators can be chained (union authenticator). First successful authentication wins. Allows gradual migration between auth methods.

2. **Stateless Authorization**: RBAC decisions are computed on each request by resolving roles/rolebindings from cache. No persistent session state.

3. **Namespace-scoped Identity**: ServiceAccount tokens embed namespace in identity, making tenant context explicit in every request.

4. **Audit-first Design**: Audit context created early in request lifecycle (`LogRequestMetadata` at `request.go:43`), before authorization, enabling audit of auth failures.

5. **Envelope Encryption Pattern**: Data Encryption Keys (DEK) generated per-secret, encrypted by Key Encryption Key (KEK) from KMS. Enables key rotation without re-encryption of all data.

## Notable Patterns

- **CEL-based claim mapping** (`staging/src/k8s.io/apiserver/pkg/authentication/cel/compile.go`): Authentication supports CEL expressions to derive username, groups, UID from OIDC claims, enabling flexible identity mapping.

- **Distributed Claims Resolution** (`oidc/oidc.go:742-827`): OIDC authenticator can fetch claims from remote endpoints for aggregated/distributed claims.

- **Async Verifier Initialization** (`oidc/oidc.go:158-190`): OIDC providers can initialize asynchronously to support self-hosted issuers.

- **Audit Context Propagation** (`staging/src/k8s.io/apiserver/pkg/audit/context.go`): Audit context carried through request lifecycle via `context.Context`, shared across middleware.

- **ServiceAccount Token Projection** (`plugin/pkg/admission/serviceaccount/admission.go:416-524`): Tokens mounted as projected volumes with auto-mounted CA cert and namespace.

## Tradeoffs

1. **Soft Multi-tenancy**: Kubernetes was designed for single-tenant clusters. Namespace isolation relies entirely on RBAC correctness; misconfigured RBAC allows cross-tenant access.

2. **Stateless Sessions**: No server-side session tracking means token revocation is not immediate — tokens must expire or be ignored based on credential ID.

3. **Audit Retention Externalized**: Audit events are emitted to backends; retention policy and storage are external responsibilities, not enforced by the audit system.

4. **KMS Plugin Complexity**: Envelope encryption requires external KMS integration; plugin lifecycle and key rotation complexity is delegated to cluster operator.

5. **No Built-in Tenant Quotas for Cross-Tenant Resources**: Cluster-scoped resources (Nodes, PVs) cannot be namespace-isolated without additional admission policies.

## Failure Modes / Edge Cases

1. **RBAC Misconfiguration**: Overly permissive ClusterRoleBindings grant namespace-wide access unintentionally. Wildcard (`*`) in roles matches all resources.

2. **Token Leakage**: ServiceAccount tokens persist in pod manifests or environment variables if not properly secured. Projected tokens mitigate this but require proper configuration.

3. **Audit Event Loss**: If webhook backend is unavailable, events may be lost unless buffered backend is configured with adequate queue depth.

4. **KMS Unavailability**: If KMS plugin fails, API server cannot decrypt secrets — cluster becomes unavailable for secret operations until KMS recovers.

5. **OIDC Provider Downtime**: Token validation requires issuer accessibility; cached JWKS keys help but initial connection or key rotation requires provider availability.

6. **nsenter/Container Escape**: Namespace isolation does not protect against container runtime vulnerabilities. Node-level access bypasses namespace isolation.

7. **Secret Encryption Key Loss**: If encryption key is lost and etcd backup is unavailable, encrypted data is irrecoverable.

## Future Considerations

1. **Structured Authentication Configuration**: CEL-based claim mapping (already present in OIDC) could be extended to other authenticators for consistent identity transformation.

2. **Dynamic Audit Policy**: Currently static Policy loaded at startup; dynamic reconfiguration could enable runtime policy changes without apiserver restart.

3. **Multi-Tenant Namespace Isolation Improvements**: Current soft-tenancy model could benefit from admission controllers that enforce stronger tenant boundaries for cluster-scoped resources.

4. **Automated Key Rotation**: KMS v2 API includes key ID tracking; automated key rotation with historical DEK preservation would improve security posture.

5. **Audit Event Signing**: Adding cryptographic signatures to audit events could improve non-repudiation for compliance requirements.

## Questions / Gaps

1. **No evidence found for credential rotation mechanism**: While ServiceAccount tokens can be rotated, the codebase does not show automated token refresh or rotation for long-running workloads beyond bound token expiration.

2. **No evidence found for tenant-specific audit filtering**: Audit policy filters by user/resource but no evidence of tenant-scoped audit event isolation for multi-tenant clusters.

3. **Retention policy enforcement absent**: Audit system emits events to backends but retention duration is not enforced in-code; external storage must implement retention.

4. **No evidence of encryption key escrow**: Lost KMS keys cannot be recovered from Kubernetes alone; external backup mechanisms required.

5. **No evidence of network policies as tenant isolation**: NetworkPolicy resources exist but their enforcement depends on CNI plugins; not evaluated for this study.

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `kubernetes`.