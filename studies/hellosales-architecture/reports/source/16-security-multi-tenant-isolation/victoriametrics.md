# Source Analysis: victoriametrics

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics implements multi-tenancy primarily through the `vmauth` proxy component, which handles authentication via multiple methods (bearer tokens, basic auth, JWT/OIDC) and routes requests to backends. Tenant isolation is enforced via `AccountID` and `ProjectID` fields embedded in auth tokens, with the storage layer organizing data by tenant. Access logging exists in vmauth but there is no dedicated compliance-grade audit trail. Secret handling uses masking in YAML outputs and TLS support is comprehensive. Encryption at rest is not built-in, relying on filesystem-level mechanisms.

## Rating

**5/10** — Basic multi-tenant architecture with clear separation mechanisms but notable gaps in audit trail generation, encryption at rest, and storage-layer tenant enforcement.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Auth Token Model | `Token` struct with `AccountID uint32` and `ProjectID uint32` | `lib/auth/auth.go:10-13` |
| Auth Token Parsing | `NewToken()` parses `accountID:projectID` format | `lib/auth/auth.go:27-33` |
| JWT/VMAccessClaims | `VMAccessClaim` with tenant fields: `MetricsAccountID`, `MetricsProjectID`, `LogsAccountID`, `LogsProjectID` | `lib/jwt/jwt.go:373-401` |
| JWT Read/Write Mode | `CanRead()` and `CanWrite()` methods based on Mode bitfield (1=read, 2=write, 3=both, 0=all) | `lib/jwt/jwt.go:613-635` |
| vmauth Main Auth Flow | `requestHandler()` extracts auth tokens and routes to user config | `app/vmauth/main.go:171-216` |
| vmauth JWT Auth | `getJWTUserInfo()` parses JWT and verifies against config | `app/vmauth/jwt.go:215-252` |
| vmauth OIDC Support | OIDC discovery and JWK key fetching | `app/vmauth/oidc.go:50-128` |
| vmauth User Config | `UserInfo` struct with auth fields (bearer_token, jwt, auth_token, username, password) | `app/vmauth/auth_config.go:67-107` |
| vmauth AccessLog | `AccessLog` struct with filter configuration | `app/vmauth/auth_config.go:109-135` |
| vmauth Access Logging | `logRequest()` method logging request details | `app/vmauth/auth_config.go:120-135` |
| Rate Limiting Per-User | `maxConcurrentPerUserRequests` flag and per-user `concurrencyLimitCh` | `app/vmauth/main.go:61-70` |
| Tenant in Storage | `encodeTenantID()` for storage key encoding | `lib/storage/metricsmetadata/storage.go:88` |
| Per-Tenant Storage Map | `perTenantStorage[tenantID]` map for tenant isolation | `lib/storage/metricsmetadata/storage.go:97` |
| Secret Masking | `Secret.MarshalYAML()` returns `"<secret>"` | `lib/promauth/config.go:45-50` |
| TLS Config | `TLSConfig` struct with CA, Cert, Key, ServerName, InsecureSkipVerify | `lib/promauth/config.go:70-85` |
| TLS MinVersion | `MinVersion` field with comment about not supporting MaxVersion | `lib/promauth/config.go:82-84` |
| OAuth2 Config | `OAuth2Config` with ClientID, ClientSecret, TokenURL | `lib/promauth/config.go:141-152` |
| Auth Header Caching | 1-second cache for auth header reading from files | `lib/promauth/config.go:446-459` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication in VictoriaMetrics is primarily handled by the `vmauth` component (`app/vmauth/`), which acts as an auth proxy. It supports multiple authentication methods:

- **Bearer tokens**: Via `Authorization: Bearer <token>` header (`app/vmauth/auth_config.go:1236-1237`)
- **Basic auth**: Username/password via `Authorization: Basic <base64>` (`app/vmauth/auth_config.go:1240-1244`)
- **Auth tokens**: Custom `auth_token` field in config (`app/vmauth/auth_config.go:1232-1233`)
- **JWT tokens**: Including OIDC discovery for dynamic key fetching (`app/vmauth/jwt.go:215-252`, `app/vmauth/oidc.go:50-128`)
- **URL-based auth**: `http://user:pass@hostname/` format (`app/vmauth/auth_config.go:1268-1274`)

JWT authentication extracts `VMAccessClaim` from the token body containing tenant identifiers (`MetricsAccountID`, `MetricsProjectID`, `LogsAccountID`, `LogsProjectID`) and optional read/write mode (`lib/jwt/jwt.go:373-401`).

Sessions are not explicitly managed — vmauth is stateless, checking credentials per-request. The `authToken` maps directly to a `UserInfo` configuration that defines backend routing. JWT tokens include expiration (`exp` claim) checked via `Token.IsExpired()` (`lib/jwt/jwt.go:608-611`).

**No evidence found** for session token generation, refresh tokens, or session store.

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization decisions are made at the `vmauth` layer based on the matched user's configuration. The flow:

1. Request arrives at vmauth with auth credentials
2. `getUserInfoByAuthTokens()` looks up the user by token (`app/vmauth/main.go:218-227`)
3. If JWT, `getJWTUserInfo()` verifies signature and matches claims (`app/vmauth/jwt.go:254-305`)
4. `getUserInfoByJWTToken()` matches against configured `MatchClaims` regex patterns (`app/vmauth/jwt.go:254`)
5. User's `URLMaps` determine routing based on `SrcPaths`, `SrcHosts`, `SrcQueryArgs`, `SrcHeaders` (`app/vmauth/auth_config.go:236-271`)
6. JWT placeholders in URLs allow dynamic routing with tenant info (`app/vmauth/jwt.go:307-368`)

The deprecated `Mode` field in `VMAccessClaim` provides read/write permission checking (`lib/jwt/jwt.go:613-635`), but this is not actively enforced in vmauth — it's informational in the JWT claim.

**No evidence found** for RBAC role definitions, permission roles beyond read/write mode, or enforcement at storage layer.

### 3. How is tenant A prevented from accessing tenant B's data?

Tenant isolation is implemented through the `AccountID` and `ProjectID` fields in the auth token:

- **Token structure**: `"accountID"` or `"accountID:projectID"` format (`lib/auth/auth.go:20-24`)
- **Multitenant mode**: Special token value `"multitenant"` returns `nil` Token (`lib/auth/auth.go:36-43`)
- **Storage isolation**: Tenant ID is encoded into storage keys via `encodeTenantID()` (`lib/storage/metricsmetadata/storage.go:88`), with a `perTenantStorage` map (`lib/storage/metricsmetadata/storage.go:97`)
- **Query context**: `GetForTenant()` retrieves data for specific tenant (`lib/storage/metricsmetadata/storage.go:84-97`)

**Critical gap**: The storage layer trusts the caller to pass correct tenant IDs. There is **no enforcement** at the storage layer to reject cross-tenant access. If a caller passes `AccountID=1` when authenticated as tenant `AccountID=2`, no validation occurs.

Tenant context propagates via JWT `VMAccessClaim` placeholders (`{{.MetricsTenant}}`, `{{.LogsAccountID}}`, etc.) injected into backend URLs (`app/vmauth/jwt.go:307-368`), but this depends on proper configuration.

### 4. What audit events are captured and how long are they retained?

vmauth provides **access logging** via the `AccessLog` configuration:

- Log format includes: `request_host`, `request_uri`, `status_code`, `remote_addr`, `user_agent`, `referer`, `duration_ms`, `username` (`app/vmauth/auth_config.go:133`)
- Optional status code filtering via `AccessLogFilters.SkipStatusCodes` (`app/vmauth/auth_config.go:115-118`)
- Logs output via `logger.Infof()` — **not a dedicated audit store**

**No evidence found** for:
- Structured audit event schema
- Tamper-proof audit logging
- Audit log retention configuration
- Dedicated audit trail (separate from general application logs)
- Compliance-grade audit events (who accessed what data when)

Access logs are best-effort informational logging, not a compliance audit trail.

### 5. How are secrets encrypted at rest and in transit?

**In transit**:
- TLS fully supported with configurable certs, keys, CA, server name (`lib/promauth/config.go:70-85`)
- TLS minimum version configuration (`lib/promauth/config.go:82`)
- Client certificate support for mTLS (`lib/promauth/config.go:610-613`)
- Backend TLS with `backend.tls*` flags (`app/vmauth/main.go:77-86`)
- Comment explicitly noting MaxVersion not supported for security reasons (`lib/promauth/config.go:83-84`, `lib/promauth/config.go:607-608`)
- OAuth2 token handling with client credentials (`lib/promauth/config.go:900-918`)

**At rest**:
- **No built-in encryption at rest** — data stored in plain files on filesystem
- Secrets in config masked in YAML output (`Secret.MarshalYAML()` returns `"<secret>"`) (`lib/promauth/config.go:45-50`)
- Passwords can be read from files instead of config (`fscore.ReadPasswordFromFileOrHTTP()`) (`lib/promauth/config.go:311`)
- Relies on filesystem-level encryption (LUKS, cloud storage encryption) for data-at-rest protection

**No evidence found** for:
- Built-in encryption at rest
- Integration with secret managers (Vault, AWS KMS, GCP KMS)
- Encryption key management within VictoriaMetrics

## Architectural Decisions

1. **Stateless auth proxy model**: vmauth performs auth checks per-request without session state, simplifying horizontal scaling but limiting session management capabilities.

2. **Tenant ID in auth token**: Tenant context is embedded in the authentication token (JWT `VMAccessClaim`), not in a separate tenant context object. This couples auth with tenant identification.

3. **Storage-layer trust model**: The storage layer (`lib/storage/`) receives tenant IDs from callers and does not validate cross-tenant access. Enforcement relies entirely on the caller passing correct tenant IDs.

4. **YAML-based auth configuration**: User-to-backend routing configured via YAML files rather than dynamic registration. Supports hot reload via SIGHUP or config check interval.

5. **JWT placeholder templating**: vmauth can template JWT claims into backend URLs (`{{.MetricsTenant}}`, `{{.LogsAccountID}}`), allowing dynamic tenant-aware routing without backend awareness.

## Notable Patterns

1. **Auth token formats**:
   - `http_auth:Bearer <token>` — bearer token
   - `http_auth:Basic <base64>` — basic auth
   - `http_auth:<token>` — raw auth token
   (`app/vmauth/auth_config.go:1258-1264`)

2. **JWT claim matching**: `MatchClaims` regex patterns matched against JWT body for user selection, sorted by specificity (`app/vmauth/jwt.go:191-198`)

3. **Concurrency limiting**: Per-user and global request concurrency limits via buffered channels (`app/vmauth/main.go:750-763`)

4. **Request buffering**: Request body buffered before acquiring concurrency slot to prevent slow client attacks (`app/vmauth/main.go:797-834`)

5. **Backend health checking**: Automatic backend health detection with circuit breaker pattern (`app/vmauth/auth_config.go:429-474`)

## Tradeoffs

1. **vs. built-in RBAC**: No formal role-based access control — permissions limited to read/write mode in deprecated JWT claim. Configuration-based routing is the primary access control mechanism.

2. **vs. storage-enforced tenant isolation**: Tenant isolation at storage layer is advisory (tenant ID passed by caller). Storage does not validate tenant access. Relies on vmauth passing correct tenant context.

3. **vs. dedicated audit trail**: Access logging is best-effort via logger, not a structured tamper-proof audit system. No dedicated audit event persistence or retention policy.

4. **vs. encryption at rest**: No built-in transparent encryption. Relies on underlying filesystem/cloud storage encryption. Appropriate for cloud deployments using managed storage encryption.

5. **vs. session management**: Stateless design means no server-side sessions, refresh tokens, or session revocation. JWT expiration is the only session lifecycle mechanism.

## Failure Modes / Edge Cases

1. **Cross-tenant data access**: If vmauth misconfigured or a bug passes wrong tenant ID, no storage-layer enforcement prevents cross-tenant data access.

2. **JWT signature bypass**: If `skip_verify=true` set in JWT config, tokens are accepted without signature verification (`app/vmauth/jwt.go:260-262`).

3. **No audit trail for data access**: If audit logs are not collected/retained, there is no way to audit who accessed what data. Logs go to stdout/stderr via logger.

4. **Secret in config files**: While secrets are masked in YAML marshaling, secrets may still appear in config files on disk or in process arguments.

5. **OIDC key rotation**: OIDC verifier pools refresh periodically (default 5 minutes + jitter), but during key rotation there may be a window where old keys are still accepted.

6. **Token collision**: Auth tokens stored in-memory map — if two users have same token hash (xxhash), collisions could cause misrouting.

## Future Considerations

1. **Storage-layer tenant enforcement**: Add validation at storage layer to reject requests where tenant ID doesn't match authenticated principal.

2. **Dedicated audit trail**: Implement structured tamper-proof audit logging with configurable retention, separate from application logs.

3. **Encryption at rest**: Consider transparent encryption at storage layer with key management integration.

4. **Formal RBAC**: Expand beyond read/write mode to full role-based access control with named roles and permissions.

5. **Session management**: Add server-side sessions with refresh tokens and revocation capability for enterprise use cases.

## Questions / Gaps

1. How does vmauth handle JWT token revocation?
2. What happens if backend URL templating produces invalid tenant ID?
3. Is there any mechanism to audit data deleted per tenant?
4. How are tenant quotas enforced beyond concurrency limits?
5. What is the procedure if a secret is compromised in the config file?

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `victoriametrics`.