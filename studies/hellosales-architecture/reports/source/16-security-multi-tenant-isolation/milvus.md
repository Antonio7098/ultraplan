# Source Analysis: milvus

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go (with internal C++/Rust components) |
| Analyzed | 2026-05-20 |

## Summary

Milvus implements a layered security architecture with gRPC interceptors for authentication/authorization, Casbin-based RBAC enforcement, database-scoped tenant isolation, and encryption-at-rest support via KMS integration. Authentication supports both username/password (bcrypt hashed) and API key modes. Authorization uses a privilege cache synchronized from root coord, with per-request enforcement at the Proxy layer. Tenant isolation is achieved at the database level with etcd key path prefixing. Audit logging is available via the access log subsystem. Encryption covers disk encryption and message-level cipher for streaming.

## Rating

**7/10** — Good implementation with minor issues. Strong RBAC with Casbin, layered interceptors, database-scoped isolation. However, audit trail retention is not clearly configurable, encryption at rest requires external KMS setup, and tenant isolation is database-level rather than namespace-level (which may be insufficient for multi-org SaaS).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Auth Interceptor | `AuthenticationInterceptor` verifies base64 `username:password` tokens and API keys | `internal/proxy/authentication_interceptor.go:56-106` |
| Password Encryption | bcrypt `PasswordEncrypt` using `golang.org/x/crypto/bcrypt` | `pkg/util/crypto/crypto.go:22-28` |
| AuthZ Interceptor | `PrivilegeInterceptor` enforces RBAC via Casbin enforcer with result caching | `internal/proxy/privilege_interceptor.go:45-181` |
| RBAC Model | Casbin model with `sub/obj/act` matcher supporting `globMatch` and privilege groups | `internal/proxy/privilege/model.go:23-35` |
| Privilege Groups | ReadOnly, ReadWrite, Admin privilege groups configurable via paramtable | `pkg/util/paramtable/component_param.go:327-329` |
| Privilege Cache | `privilegeCache` maintains user→roles mapping with root coord sync | `internal/proxy/privilege/cache.go:60-68` |
| Tenant Context | `WithTenantID`/`TenantID` propagate tenant via context values | `pkg/util/contextutil/context_util.go:36-51` |
| Database Interceptor | `DatabaseInterceptor` fills `DbName` from metadata into requests | `internal/proxy/database_interceptor.go:12-17` |
| Etcd Tenant Prefix | `HandleTenantForEtcdPrefix` builds tenant-scoped etcd key prefixes | `pkg/util/funcutil/func.go:714-727` |
| Database Model | `Database` struct has `TenantID` field serialized to `TenantId` in protobuf | `internal/metastore/model/database.go:13`, `pkg/proto/etcdpb/etcd_meta.pb.go:763` |
| Authorization Config | `AuthorizationEnabled` master switch; `RootShouldBindRole` config | `pkg/util/paramtable/component_param.go:265, 268` |
| Audit AccessLog | `AccessInfo` interface with `UserName`, `DbName`, `CollectionName` fields | `internal/proxy/accesslog/info/info.go:62-91` |
| Woodpecker Config | `AuditorMaxInterval` param for audit batch interval | `pkg/util/paramtable/service_param.go:715` |
| Disk Encryption | `EnalbeDiskEncryption` param with KMS key configuration | `pkg/util/paramtable/cipher_config.go:19, 38-43` |
| Message Cipher | `RegisterCipher`/`getDecryptorWithRetry` for streaming message encryption | `pkg/streaming/util/message/cipher.go:24, 52-100` |
| Cipher Config | `CipherConfig` struct with EzID and CollectionID per message | `pkg/streaming/util/message/cipher.go:102-109` |
| Secret Redaction | `secretExtfsKeys` marking extfs secrets for redaction | `pkg/util/externalspec/external_spec.go:218` |
| Pulsar Tenant | `tenant` field for Pulsar tenant/namespace isolation | `pkg/mq/msgstream/mqwrapper/pulsar/pulsar_client.go:39` |
| Resource Group | `StrictResourceGroupIsolationEnabled` for compute isolation | `pkg/util/paramtable/component_param.go:7146-7147` |
| Etcd Auth | `EtcdEnableAuth` with username/password for etcd authentication | `pkg/util/paramtable/service_param.go:117-120` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication is performed at the Proxy layer via `AuthenticationInterceptor` (`internal/proxy/authentication_interceptor.go:56-106`). It supports two modes:

- **Username/Password**: Token is base64-encoded `username:password` format. Password verified via `passwordVerify` against cached credentials (`internal/proxy/util.go:1626`). Passwords are bcrypt-encrypted (`pkg/util/crypto/crypto.go:22-28`).
- **API Key**: Raw token verified via `VerifyAPIKey` hook extension (`internal/proxy/authentication_interceptor.go:85-88`).

The `AuthorizationEnabled` param (`pkg/util/paramtable/component_param.go:265`) acts as a master kill switch. When disabled, all auth checks are bypassed.

Session management is implicit — no explicit session tokens. User identity is extracted from gRPC metadata at each request and propagated via context (`pkg/util/contextutil/context_util.go:86-112`). Credentials are cached in `privilegeCache` (`internal/proxy/privilege/cache.go:97-122`).

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization uses **Casbin** (`github.com/casbin/casbin/v2`) with a synced enforcer initialized in `GetEnforcer()` (`internal/proxy/privilege/model.go:74-88`). The model supports `sub=role, obj=resource, act=privilege` with glob matching for patterns like `*-*` for global resources.

Enforcement flow (`internal/proxy/privilege_interceptor.go:45-181`):
1. Check `AuthorizationEnabled` — if false, allow all.
2. Extract user credentials from context.
3. Get user's roles from `privilegeCache` (sync'd from root coord via `ListPolicy`).
4. Add implicit `RolePublic` to all users.
5. For each role, check `Enforce(roleName, object, privilege)` against Casbin.
6. Results cached via `GetResultCache`/`SetResultCache` (`internal/proxy/privilege/result_cache.go:126-139`).

Object type and name extracted via `privilegeExt.ObjectType` and `privilegeExt.ObjectNameIndex` using `funcutil.GetObjectName` (`internal/proxy/privilege_interceptor.go:72`). DB scope enforced via `dbMatch` function in Casbin matcher (`internal/proxy/privilege/model.go:92-99`).

### 3. How is tenant A prevented from accessing tenant B's data?

Tenant isolation operates at **database level**:

- `Database` model has `TenantID` field (`internal/metastore/model/database.go:13`).
- `DatabaseInterceptor` (`internal/proxy/database_interceptor.go:12-17`) fills `DbName` into all requests from gRPC metadata when absent.
- Requests for collection `X` in database `A` cannot reach collection `X` in database `B` because RBAC checks include database scope via the `dbMatch` function (`internal/proxy/privilege/model.go:92-99`).
- Etcd key paths use tenant-prefixed structure via `HandleTenantForEtcdPrefix` (`pkg/util/funcutil/func.go:714-727`).
- Pulsar messaging uses `tenant/namespace/topic` format (`pkg/mq/msgstream/mqwrapper/pulsar/pulsar_client.go:141-150`).

**Gap**: Isolation is database-scoped, not namespace/project-scoped. A compromised database-level permission could allow cross-collection within the same database. There is no row-level or field-level access control.

### 4. What audit events are captured and how long are they retained?

The access log subsystem (`internal/proxy/accesslog/`) captures audit events. The `AccessInfo` interface (`internal/proxy/accesslog/info/info.go:62-91`) defines fields: `UserName`, `DbName`, `CollectionName`, `MethodName`, `MethodStatus`, `TraceID`, `ErrorCode`, `TimeCost`, `ResponseSize`, etc.

The `MetricFuncMap` (`internal/proxy/accesslog/info/info.go:31-60`) maps template keys like `$user_name`, `$database_name`, `$collection_name`, `$time_start`, `$time_end` for log formatting.

`WoodpeckerConfig.AuditorMaxInterval` (`pkg/util/paramtable/service_param.go:715`) controls batch interval for auditing operations. However, **no retention duration is visible in the codebase** — logs appear to be written to MinIO/S3 handlers (`internal/proxy/accesslog/minio_handler.go`) with no visible TTL enforcement in the accessed files.

### 5. How are secrets encrypted at rest and in transit?

**At rest**:
- Disk encryption via `EnalbeDiskEncryption` param (`pkg/util/paramtable/cipher_config.go:19`) with KMS key (`cipherPlugin.kms.defaultKey`).
- Passwords stored as bcrypt hashes (`pkg/util/crypto/crypto.go:22-28`).
- SHA256 for password comparison (`pkg/util/crypto/crypto.go:12-18`).

**In transit**:
- TLS for gRPC is configured at the infrastructure level (not visible in this study's scope).
- Message-level encryption for streaming via `Cipher` interface (`pkg/streaming/util/message/cipher.go`), with `EzID` and `CollectionID` per message.
- `getDecryptorWithRetry` with exponential backoff for KMS key fetching.

**Secret handling**:
- `secretExtfsKeys` (`pkg/util/externalspec/external_spec.go:218`) marks extfs keys (access_key_value, secret_key_value, external_id) as redacted.
- `redactExtfsSecrets` function (`pkg/util/externalspec/external_spec.go:521-538`) scrubs secret values.

**Gaps**:
- No visible certificate rotation mechanism.
- API keys passed through metadata are only base64-encoded, not encrypted in transit (relies on TLS).

## Architectural Decisions

1. **Interception-based auth at Proxy layer**: All auth/authZ happens at gRPC interceptors in the Proxy component, keeping core node logic clean. This is a sensible perimeter-focused approach.

2. **Casbin for RBAC**: Uses the battle-tested Casbin library with a synced enforcer and custom `dbMatch`/`privilegeGroupContains` functions. The model supports glob patterns for wildcard matching on resource names.

3. **Privilege cache with root coord sync**: Permissions are cached locally in Proxy with periodic sync from root coord via `ListPolicy`. This reduces root coord load but introduces cache staleness window.

4. **Database-scoped tenant isolation**: Tenants map to databases, not separate clusters or processes. This is operationally efficient but provides weaker isolation than process-level separation.

5. **Configurable privilege groups**: ReadOnly, ReadWrite, Admin groups are configurable via `paramtable` rather than hard-coded, allowing customization without code changes.

## Notable Patterns

- **gRPC middleware chain**: Auth → Database → Privilege interceptors run in sequence on every request.
- **Context propagation**: Tenant ID and user identity propagate via Go context values and gRPC metadata, not thread-local storage.
- **Result caching for permissions**: `GetResultCache`/`SetResultCache` avoids repeated Casbin enforcement calls.
- **Hook extension for API keys**: `VerifyAPIKey` is implemented as a hook extension (`internal/util/hookutil/ez.go`), allowing external key management integration.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Database-level tenant isolation | Operational simplicity vs. weaker isolation vs. process-level |
| Centralized root coord for auth policy | Consistency vs. single point of failure / scalability bottleneck |
| Privilege cache sync via `ListPolicy` | Reduced latency vs. cache staleness window |
| Configurable privilege groups | Flexibility vs. operational complexity |
| Casbin model with glob matching | Expressive patterns vs. harder to audit/verify |

## Failure Modes / Edge Cases

1. **Cache stale after grant/revoke**: `RefreshPolicyInfo` reloads from root coord, but enforcer `LoadPolicy()` call could fail silently (`internal/proxy/privilege/cache.go:187-196`), leaving stale permissions.

2. **Authorization bypass when `AuthorizationEnabled=false`**: Entire RBAC stack disabled — useful for dev, dangerous in production misconfiguration.

3. **Root user bypass**: `RootShouldBindRole` (`pkg/util/paramtable/component_param.go:268`) controls whether root user must bind to admin role. If disabled, root has unrestricted access.

4. **Alias resolution for RBAC**: `resolveCollectionAlias` (`internal/proxy/privilege_interceptor.go:204-209`) is used to map alias→collection for RBAC checks, but failures fall back to original name silently — potential for incorrect permissions if alias resolves to wrong collection.

5. **API key in metadata**: API key passed as raw token (not hashed) in base64 — if TLS is terminated before Proxy, token is visible in plaintext.

## Future Considerations

1. **Row-level access control**: Currently no field or row-level filtering; all data in a collection is accessible if permission granted.

2. **Retention policy enforcement**: No visible audit log retention TTL. Should add lifecycle policy for access logs.

3. **MTLS everywhere**: Only client auth shown; service-to-service mTLS not visible in studied code.

4. **Key rotation**: `RotationPeriodInHours` config exists but rotation mechanism not traced to enforcement.

## Questions / Gaps

1. **No evidence of field-level authorization** — RBAC operates at collection/database granularity only.
2. **Audit log retention duration unclear** — `AuditorMaxInterval` controls batch interval, not retention.
3. **Session expiry not visible** — no token TTL or refresh mechanism found in studied code.
4. **Encryption in transit for internal communication** — service-to-service TLS not studied.
5. **Multi-tenant etcd/storage isolation** — while etcd keys use tenant prefixes, storage (MinIO/S3) objects do not show tenant prefix isolation in accessed code.

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `milvus`.