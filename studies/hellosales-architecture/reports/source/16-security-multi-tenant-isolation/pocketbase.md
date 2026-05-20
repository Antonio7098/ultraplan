# Source Analysis: pocketbase

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase is a self-hosted backend platform that provides an embedded SQLite database with a REST API. Its security model centers on a JWT-based authentication system with per-collection access rules, not a multi-tenant architecture. Authentication supports password, OAuth2, OTP, and MFA. Authorization uses filter-based rules (ListRule, ViewRule, UpdateRule, DeleteRule) evaluated at the query level. Superusers are a separate privileged role for platform administration. Settings (including sensitive S3/SMTP credentials) are encrypted at rest using AES-256-GCM when an encryption environment variable is provided. Request logging is available with configurable retention (default 5 days). No built-in tenant isolation mechanism exists; data isolation relies entirely on access rules.

## Rating

**5/10** — Basic implementation with gaps. PocketBase lacks multi-tenant isolation as a built-in concept. Authentication and authorization are well-implemented with JWTs, bcrypt, and filter-based access rules, but tenant A is prevented from accessing tenant B's data solely through application-level rules (ListRule/ViewRule/UpdateRule/DeleteRule) — not through database-level or process-level isolation. There is no resource-level tenancy, no API key scoping to tenants, and no separate encryption contexts per tenant.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Auth middleware | `RequireAuth()`, `RequireSuperuserAuth()` | `apis/middlewares.go:84,106` |
| Auth token loading | `loadAuthToken()` middleware | `apis/middlewares.go:184-209` |
| JWT generation | `NewAuthToken()` using HS256 | `core/record_tokens.go:46-72` |
| Password hashing | bcrypt with configurable cost | `core/field_password.go:292-303` |
| Access rules | `ListRule`, `ViewRule`, `UpdateRule`, `DeleteRule` | `core/collection_model.go:358-362` |
| Rule enforcement | `CanAccessRecord()` applies filter rules | `core/record_query.go:599-634` |
| Superuser model | `_superusers` collection, `IsSuperuser()` | `core/record_model_superusers.go:12,116` |
| MFA support | MFA model and flow | `core/mfa_model.go` |
| OTP support | OTP model and flow | `core/otp_model.go` |
| Settings encryption | AES-256-GCM encryption for settings | `core/settings_model.go:271-278` |
| Activity logging | `activityLogger()` middleware, `logRequest()` | `apis/middlewares.go:349-463` |
| Log model | `Log` struct with retention | `core/log_model.go:9-18` |
| Rate limiting | Rate limit middleware | `apis/middlewares_rate_limit.go` |
| Superuser IP whitelist | `superuserIPsWhitelist()` middleware | `apis/middlewares.go:305-325` |
| Request info context | `RequestInfo` struct with `Auth` field | `core/event_request.go:162-182` |
| Auth alert emails | Login origin tracking and alerts | `apis/record_helpers.go:589-663` |
| Encryption utility | `Encrypt()`/`Decrypt()` using AES-256-GCM | `tools/security/encrypt.go:14-61` |
| Record auth response | IP whitelist check | `apis/record_helpers.go:46-50` |
| Auth refresh | Token refresh with refreshable claim | `apis/record_auth_refresh.go:20-31` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication is performed via JWT tokens (HS256) signed with a composite key of `record.TokenKey() + collection.AuthToken.Secret`. The token payload contains `id`, `type` ("auth"), `collectionId`, and a `refreshable` boolean claim (`core/record_tokens.go:51-72`). Token loading happens in `loadAuthToken()` middleware (`apis/middlewares.go:184-209`) which extracts the token from the `Authorization` header (accepting both bare token and `Bearer` prefix). Auth refresh is supported via the `TokenClaimRefreshable` claim — if set, the server issues a new token on refresh (`apis/record_auth_refresh.go:24-27`). Supported auth methods: password (`record_auth_with_password.go`), OAuth2 (`record_auth_with_oauth2.go`), OTP (`record_auth_with_otp.go`), and MFA (`core/mfa_model.go`). Session state is stateless (JWT) except for optional MFA challenges which are persisted server-side. Superuser auth follows the same token pattern but uses the `_superusers` collection.

**Rating: 7/10** — Well-implemented with multiple auth methods, but refresh token rotation is not automatic (depends on `refreshable` claim), and the JWT signing key composition (tokenKey + collectionSecret) requires the per-record tokenKey to remain stable.

### 2. How are authorization decisions made and enforced across API boundaries?

Authorization is enforced at the API level through per-collection filter rules: `ListRule`, `ViewRule`, `CreateRule`, `UpdateRule`, `DeleteRule` (`core/collection_model.go:358-362`). These are expressed as filter expressions (e.g., `@request.auth.id != ''`) and are applied as WHERE conditions in the query builder (`core/record_query.go:66-74`). The `CanAccessRecord()` method (`core/record_query.go:599-634`) verifies access by building a query that checks if the record is accessible under the rule. Superusers bypass all rule checks (`core/record_query.go:600-603`). Middleware such as `RequireAuth()`, `RequireSuperuserAuth()`, and `RequireSuperuserOrOwnerAuth()` (`apis/middlewares.go:84-147`) enforce authentication requirements at the route level. The `ManageRule` field (`core/collection_model.go`) exists for per-record management access control. Field-level access can be controlled via `Hidden` on field definitions.

**Rating: 6/10** — Rule-based authorization is flexible and well-integrated into the query layer, but there is no formal RBAC model (no roles/permissions collections), rules are string-based expressions with no compile-time safety, and the API boundary enforcement relies entirely on the rule application in the query builder — not on a dedicated authorization layer.

### 3. How is tenant A prevented from accessing tenant B's data?

**No built-in tenant isolation mechanism.** PocketBase does not have a multi-tenant architecture. All data from all "tenants" (if conceptualized as such) lives in the same SQLite database. Tenant A is prevented from accessing tenant B's data only through access rules (ListRule/ViewRule/etc.) that the application developer must set correctly. For example, a ListRule could be `@request.auth.tenantId = 'A'` to filter records by tenant — but this is entirely a application-level rule, not a database-enforced isolation. There is no separate database, no separate namespace, no separate encryption key per tenant, and no resource-level tenancy. If a developer fails to set a rule, or misconfigures it, cross-tenant data leakage is possible.

**Rating: 2/10** — No tenant isolation built-in. This is a fundamental gap for HelloSales which needs to handle customer sales data across organisational boundaries.

### 4. What audit events are captured and how long are they retained?

Request activity is captured via the `activityLogger()` middleware (`apis/middlewares.go:349-363`) and written asynchronously via `logRequest()` (`apis/middlewares.go:365-463`). Logged data includes: HTTP method, URL, status code, referer, user agent, auth collection name, auth ID (if enabled), user IP, remote IP, execution time, and any error details. The retention period is configurable via `Settings.Logs.MaxDays` (default 5 days) (`core/settings_model.go:560-565`). Old logs are deleted via `DeleteOldLogs()` (`core/app.go:382`). There are no dedicated audit events for data changes (create/update/delete) — only HTTP request logs. The log store is the `_logs` table (`core/log_model.go:9`). Log retention is configurable, IP logging is optional, and auth ID logging is optional. Sensitive URLs are excluded from success logs via `SkipSuccessActivityLog()` (`apis/middlewares.go:327-337`).

**Rating: 6/10** — Good request logging with configurable retention, but no data-level audit trail (no event logging for create/update/delete operations on records). Audit is limited to HTTP access logs.

### 5. How are secrets encrypted at rest and in transit?

**At rest:** App settings (including S3 secrets, SMTP passwords) are encrypted using AES-256-GCM before being stored in the database (`core/settings_model.go:271-278`). The encryption key is sourced from the `EncryptionEnv` environment variable (32-char AES key). If the env var is not set, settings are stored in plaintext. The encryption mechanism is implemented in `tools/security/encrypt.go:14-37` using Go's `crypto/aes` and `crypto/cipher`. Passwords in auth records are hashed using bcrypt (`core/field_password.go:298`). Record token keys are used as part of the JWT signing key composite but are stored in plaintext in the database.

**In transit:** PocketBase supports TLS configuration. The settings model includes SMTP TLS flag (`core/settings_model.go:388`). No evidence found for mTLS or client certificate authentication.

**Rating: 6/10** — Settings encryption at rest is solid (AES-256-GCM), but encryption key management relies on a single env var with no key rotation mechanism. Sensitive fields (S3, SMTP) are masked in JSON serialization (`core/settings_model.go:342-355`). In-transit TLS is supported but not enforced by default.

## Architectural Decisions

1. **Stateless JWT auth with composite signing key** — Token key = `record.TokenKey() + collection.AuthToken.Secret`. This couples the signing key to each auth record's tokenKey, requiring tokenKey to be preserved on password changes (it is regenerated on password change via `record.RefreshTokenKey()` in `core/record_model_auth.go:46-48`).

2. **Per-collection filter rules instead of RBAC** — Access control is expressed as filter expressions attached to collections (`ListRule`, `ViewRule`, etc.), not as role/permission objects. This is flexible but puts the burden of correct rule construction on the application developer.

3. **Superuser is a special auth collection (`_superusers`)** — Superusers are records in a dedicated `_superusers` collection (`core/record_model_superusers.go:12`). They bypass all access rules and can access everything. This is checked via `IsSuperuser()` (`core/record_model_superusers.go:116`).

4. **Settings encrypted as a single blob** — All app settings are serialized as JSON, optionally encrypted with AES-256-GCM using the EncryptionEnv key, and stored as a single row in the `_params` table (`core/settings_model.go:245-284`). This means the encryption key unlocks the entire settings object.

5. **Query-level rule enforcement** — Access rules are applied as WHERE conditions in the SQL query builder, not as a post-query filter. This is efficient but means rules must be expressed in the search filter syntax and evaluated at query time.

6. **No multi-tenancy** — PocketBase is designed as a single-tenant system. There is no concept of tenant, no separate namespaces, and no separate encryption contexts per tenant.

## Notable Patterns

- **Auth token middleware chain** (`apis/middlewares.go:184-209`) — `loadAuthToken()` runs before auth requirement middlewares, populating `e.Auth` from the Authorization header. This allows subsequent middlewares like `RequireAuth()` to work with already-loaded auth context.

- **Dummy password check** (`apis/record_auth_with_password.go:123-136`) — To prevent timing side-channel attacks on login, if no record is found, a dummy password check is run against a random existing record using the collection's configured bcrypt cost.

- **Request info context propagation** — `RequestInfo` (`core/event_request.go:162-182`) is constructed from the request event and passed through resolvers and rule evaluators. It carries the authenticated `Auth` record and query parameters.

- **IP whitelist for superusers** (`apis/middlewares.go:305-325`) — Superuser requests can be restricted to specific IPs via `Settings.SuperuserIPs`. This is checked in `recordAuthResponse()` (`apis/record_helpers.go:46-50`) before issuing a token.

- **Activity logger async write** (`apis/middlewares.go:448-463`) — Log writes are non-blocking using `routine.FireAndForget()`.

- **Auth origin tracking** (`apis/record_helpers.go:589-663`) — Login origins are tracked by fingerprint (MD5 of IP + user agent) up to `maxAuthOrigins=5`, with alerts sent on new origin detection.

## Tradeoffs

- **Rule-based vs. RBAC** — PocketBase chose filter rules over a formal RBAC model. This is simpler to use for basic scenarios but scales poorly to complex permission hierarchies.

- **Single-tenant design** — No built-in multi-tenancy means operators must implement their own tenant isolation, typically via access rules. This adds complexity and risk of misconfiguration.

- **Stateless sessions** — JWT-based auth means no server-side session state, but token revocation is not directly supported (tokens are valid until expiry). The `refreshable` claim allows token rotation but not invalidation.

- **Settings encryption coupling** — Encrypting the entire settings blob with a single key means compromising the env var compromises all settings (S3 credentials, SMTP password, etc.).

- **SQLite backend** — Single-file SQLite limits horizontal scalability and makes live backup/restore more complex. Tenant isolation is further complicated when all tenants share the same database file.

## Failure Modes / Edge Cases

1. **Misconfigured access rules** — If a developer sets `ListRule = ""` (public) instead of a proper filter, all records become publicly accessible. No warning or guard exists.

2. **TokenKey loss** — If the `tokenKey` field is corrupted or reset without the user's knowledge, all active tokens for that record become invalid. The tokenKey is regenerated on password change but not on other credential updates.

3. **No token revocation** — JWT tokens cannot be invalidated before expiry. If a token is compromised, the server cannot revoke it. The only mitigation is short token duration.

4. **Encryption key loss** — If the `EncryptionEnv` key is lost, all encrypted settings are unrecoverable (including S3 credentials, SMTP password).

5. **Cross-tenant data leakage via rule errors** — If a rule expression contains an error (e.g., references a non-existent field), `CanAccessRecord()` returns `false, err` — meaning access is denied. This is safe but could cause legitimate access to be blocked silently.

6. **No MFA enforcement option** — MFA can be configured per collection, but there is no way to enforce MFA for all users regardless of rule evaluation.

7. **Superuser IP whitelist bypass** — The IP whitelist is checked only during auth response generation (`apis/record_helpers.go:46-50`), not on every request. A compromised token could be used from any IP after initial auth.

## Future Considerations

- **Implement multi-tenancy** — To properly serve HelloSales, a tenant isolation layer would need to be built on top of PocketBase, using a `tenantId` field on all collections and ensuring `ListRule`/`ViewRule` always filter by `@request.auth.tenantId`.

- **Key rotation** — The single encryption env var has no rotation mechanism. Consider supporting key versioning or key rotation.

- **Token revocation** — Consider adding a token blacklist or short-lived token with refresh mechanism that supports server-side revocation.

- **Data-level audit trail** — Currently only HTTP access logs are captured. A proper audit trail for create/update/delete operations on sensitive records would require a separate event log.

- **Formal RBAC** — For complex organizational hierarchies, a role/permission model would be more maintainable than string-based filter rules.

## Questions / Gaps

1. **How are record tokenKeys generated and stored?** The `TokenKey` is a field on auth records, generated via `RefreshTokenKey()` (`core/record_model_auth.go:46-48`). Is it stored encrypted or plaintext?

2. **Is there any built-in support for API keys?** No evidence found of API key authentication separate from record-based auth. Superuser tokens are the only privileged tokens.

3. **Can access rules be validated at collection save time?** The `ensureNoSystemRuleChange` validator (`core/collection_validate.go:133-156`) checks that system collections' rules are not changed, but general rule syntax is not validated until query execution.

4. **What happens when the encryption env var is set but the stored value is not encrypted?** The code checks `if encryptionKey != ""` before encrypting (`core/settings_model.go:271`). If a plaintext value exists and encryption is later enabled, existing settings are not re-encrypted.

5. **No evidence found for penetration testing, security audits, or vulnerability disclosure policy** — The repository shows no evidence of a security policy, responsible disclosure, or third-party security audits.

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `pocketbase`.