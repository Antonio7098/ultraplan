# Source Analysis: nats-server

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server implements a comprehensive multi-tenant security model centered on **Accounts** as the primary tenant isolation construct. Authentication supports multiple mechanisms (NKeys,用户名/密码, JWT, TLS certificates, LDAP). Authorization is enforced through per-account permissions and subject-level pub/sub ACLs. Tenant isolation is achieved at the subject namespace level — accounts have no access to each other's subjects unless explicit imports/exports are configured. Audit events are emitted for connect/disconnect/auth failures. JetStream supports encryption-at-rest with AES-GCM or ChaCha20-Poly1305, and TPM integration for key management.

## Rating

**8/10** — Good implementation with minor issues. The account-based multi-tenancy is robust, but audit event retention is not explicitly configurable (events are fire-and-forget to subscribers). TLS certificate revocation checking relies on OCSP which has known limitations (network dependency, responder availability). No native secret rotation mechanism for stored encryption keys.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| AuthN model | NKeys-based authentication with nonce signature verification | `server/auth.go:866-1159` |
| AuthN model | JWT-based authentication using `jwt.UserClaims` | `server/auth.go:814-1124` |
| AuthN model | Password authentication with bcrypt hash comparison | `server/auth.go:1624-1640` |
| AuthN model | TLS certificate-based authentication via subject mapping | `server/auth.go:1267-1361` |
| AuthN model | LDAP integration for external directory auth | `server/auth.go:877-929` |
| AuthZ model | Per-account `Permissions` struct with publish/subscribe allow/deny lists | `server/auth.go:139-153` |
| AuthZ model | Subject permission template expansion with tags | `server/auth.go:429-602` |
| AuthZ enforcement | `checkAuthforWarnings` validates password hashing | `server/auth.go:194-221` |
| AuthZ enforcement | `processClientOrLeafAuthentication` validates all auth claims | `server/auth.go:604-1188` |
| AuthZ enforcement | `checkUserRevoked` validates user revocation | `server/accounts.go:3208-3213` |
| Tenant isolation | Account struct with `Name`, `Issuer`, `imports`, `exports` | `server/accounts.go:50-119` |
| Tenant isolation | Default deny — no messages shared between accounts | `server/accounts.go:42-44` |
| Tenant isolation | Stream/service imports require explicit authorization | `server/accounts.go:1081-1104` |
| Tenant isolation | Cycle detection for service imports | `server/accounts.go:1601-1633` |
| Tenant isolation | `IsClaimRevoked` checks user revocation by issued time | `server/accounts.go:3873-3909` |
| Audit events | `ConnectEventMsg` and `DisconnectEventMsg` emitted per account | `server/events.go:155-177` |
| Audit events | `authErrorEventSubj` for authentication failures | `server/events.go:64` |
| Audit events | `JSAPIAudit` for JetStream admin actions | `server/jetstream_events.go:49-60` |
| Audit event emission | `accountConnectEvent` sends connect events | `server/events.go:2557-2600` |
| Audit event emission | `sendAccountAuthErrorEvent` sends auth failure events | `server/events.go:2725-2760` |
| Audit event emission | `sendJetStreamAPIAuditAdvisory` sends JS API audit events | `server/jetstream_api.go:5347-5354` |
| TLS/transit | TLS configuration with `GenTLSConfig` generating configs | `server/opts.go:346-368` |
| TLS/transit | `TLSVerify` field in server info indicating client cert requirement | `server/server.go:741` |
| TLS/transit | OCSP-based certificate revocation checking | `server/ocsp.go:53-60` |
| Encryption at rest | `FileStoreConfig.Cipher` supporting AES and ChaCha | `server/filestore.go:72-73` |
| Encryption at rest | AES-GCM and ChaCha20-Poly1305 implementations | `server/filestore.go:87-106` |
| Encryption at rest | TPM seal/unseal for JetStream encryption keys | `server/tpm/js_ek_tpm_windows.go:38-275` |
| Auth callout | External auth service integration via `$SYS.REQ.USER.AUTH` | `server/auth_callout.go:30` |
| Auth callout | Encrypted auth callout requests using XKey | `server/auth_callout.go:69-82` |
| Auth callout | JWT-signed authorization response validation | `server/auth_callout.go:115-150` |
| User revocation | `usersRevoked` map tracking revocation timestamps | `server/accounts.go:84` |
| User revocation | `isRevoked` checking revocation by user NKey and issued time | `server/auth.go:1063-1066` |
| Session management | JWT expiration validation in `validateTimes` | `server/jwt.go:204-247` |
| Session management | Bearer token disallowal option per account | `server/accounts.go:3215-3220` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

**Authentication**: nats-server supports multiple authentication methods:
- **NKeys** (`server/auth.go:866-1159`): Public key authentication using cryptographic signatures. Client signs a server nonce with their private key.
- **JWT** (`server/auth.go:814-1124`): User claims encoded in JWT, verified against the account's issuer. Supports scoped signing keys, time-based restrictions (`validateTimes` at `server/jwt.go:204`), source IP restrictions (`validateSrc` at `server/jwt.go:182`), and connection type restrictions.
- **用户名/密码** (`server/auth.go:1160-1171`): Bcrypt-hashed passwords compared using constant-time comparison (`server/auth.go:1624-1640`).
- **TLS certificates** (`server/auth.go:1267-1361`): Client certificates mapped to users via subject DN, email, DNS SAN, or URI SAN.
- **LDAP** (`server/auth.go:877-929`): Certificate subject DN matched against LDAP directory entries.
- **Auth callout** (`server/auth_callout.go:44-161`): External authorization service receives encrypted auth requests and returns signed JWT responses.

**Session management**: Sessions are implicit in the connection lifetime. JWTs carry expiration times (`claims.Expires` checked via `validateTimes` at `server/jwt.go:204-247`). User revocation is checked by comparing the JWT `IssuedAt` against the revocation timestamp in `usersRevoked` map (`server/accounts.go:3873-3909`). No explicit session tokens beyond the underlying TLS transport.

### 2. How are authorization decisions made and enforced across API boundaries?

**Authorization model**: Per-account permissions defined in `Permissions` struct (`server/auth.go:139-153`) with `Publish` and `Subscribe` each having `Allow` and `Deny` subject lists. Permissions are checked at message routing time.

**Enforcement points**:
1. **Connection authorization** (`server/auth.go:381-402`): `isClientAuthorized` checks authentication method validity before allowing connection.
2. **Permission application** (`server/auth.go:85-102`): User struct clone includes permissions; `RegisterUser` at `server/auth.go:1168` applies them to the client.
3. **Subject-level filtering** (`server/accounts.go:1081-1104`): `setExportAuth` validates that import authorization is granted by the exporting account.
4. **Service import authorization** (`server/accounts.go:1579`): `checkServiceImportAuthorized` validates each service import against the destination account's export permissions.
5. **JetStream API** (`server/jetstream_api.go:1034-1042`): JS API checks account JWT claims and permissions before processing administrative requests.

**Cross-boundary enforcement**: When a message crosses an account boundary via import/export, the export's `approved` map (`server/accounts.go:226`) is checked. Unidirectional streams require explicit export configuration; services require bilateral import/export agreement.

### 3. How is tenant A prevented from accessing tenant B's data?

**Subject namespace isolation**: By default, accounts have no visibility into each other's subjects. The comment at `server/accounts.go:42-44` states: "By default no messages are shared between accounts."

**Isolation mechanisms**:
1. **Account registration** (`server/accounts.go:951-988`): Clients are registered with a specific account via `addClient`. The `clients` map on each `Account` is separate.
2. **No cross-account routing** (`server/accounts.go:939-949`): `Interest` method only checks local subscriptions within the account's sublist.
3. **Explicit imports/exports** (`server/accounts.go:1081-1104`): Data sharing requires the owning account to export and the receiving account to import. Authorization is checked at import time via `checkServiceImportAuthorized`.
4. **Cycle detection** (`server/accounts.go:1601-1633`): Prevents recursive import chains that could leak data.
5. **User revocation** (`server/accounts.go:3873-3909`): Ensures revoked users cannot reconnect even if they previously had access.

**JetStream isolation**: Streams belong to an account. The `js` field on `Account` (`server/accounts.go:92`) is per-account. JS API requests are validated against the account's JWT and permissions (`server/jetstream_api.go:1034`).

### 4. What audit events are captured and how long are they retained?

**Captured events**:
- **Connect/disconnect** (`server/events.go:155-177`): `ConnectEventMsg` and `DisconnectEventMsg` with client info (host, ID, account, user, JWT subject, RTT, etc.)
- **Authentication errors** (`server/events.go:64-65`): `$SYS.SERVER.%s.CLIENT.AUTH.ERR` and `$SYS.ACCOUNT.CLIENT.AUTH.ERR` for auth failures
- **Account connection changes** (`server/events.go:207-229`): `AccountNumConns` sent when account connection counts change
- **JetStream API audits** (`server/jetstream_events.go:49-60`): `JSAPIAudit` with subject, request, response, client info, server ID
- **Stream/consumer action advisories** (`server/jetstream_events.go:71-103`): Create/delete/modify events for streams and consumers
- **OCSP failures** (`server/events.go:95-96`): Peer rejection and chainlink invalidation events

**Retention**: Events are published to internal system subjects (`$SYS.ACCOUNT.%s.CONNECT`). There is **no native retention mechanism** — events are fire-and-forget. If no subscriber is listening, events are dropped. The `publishAdvisory` function at `server/jetstream_events.go:23-47` checks for subscriber interest before encoding JSON. Retention duration depends on external subscription logic (e.g., a collector writing to a database).

### 5. How are secrets encrypted at rest and in transit?

**In transit**:
- **TLS** (`server/server.go:740-741`): `TLSRequired` and `TLSVerify` flags. Server supports `tls.RequireAndVerifyClientCert` for mTLS.
- **Auth callout encryption** (`server/auth_callout.go:69-112`): XKey (Curve25519) used to encrypt auth callout requests and responses. Server creates ephemeral user keypair (`server/auth_callout.go:85-87`) to prevent replay attacks.
- **Inter-cluster encryption** (`server/server.go:706-712`): XKey keypair created for encrypting messages between servers.

**At rest (JetStream)**:
- **FileStore encryption** (`server/filestore.go:72-73, 87-106`): `StoreCipher` supports `AES` (AES-GCM) and `ChaCha` (ChaCha20-Poly1305). Block-level encryption with per-block keys derived from master key.
- **Key management**:
  - Password-based key derivation (`encryption_password` config at `server/opts.go:2595`)
  - TPM sealed keys on Windows (`server/tpm/js_ek_tpm_windows.go:38-275`) using SRK (Storage Root Key) and PCR (Platform Configuration Registers) for binding
  - Key rotation via `prev_key`/`prev_encryption_key` (`server/opts.go:2700`)
- **No native secret rotation**: Key rotation requires stream re-encryption. No automatic rotation schedule.

## Architectural Decisions

1. **Account as primary tenant unit**: Rather than role-based access within a shared namespace, nats-server uses Accounts as isolated subject namespaces. This provides stronger isolation but requires explicit cross-account sharing configuration.

2. **JWT-based identity propagation**: User identity and permissions are encoded in signed JWTs that travel with the connection. This avoids server-side session state but requires careful validation at each hop.

3. **Subject-level permission model**: Permissions are allow/deny lists on subjects rather than capability-based roles. This is more flexible for pub/sub workloads but requires careful configuration to avoid over-permissive wildcards.

4. **Fire-and-forget audit**: Audit events are published as internal messages. No built-in persistence — external subscriber required for retention. This keeps the core simple but places retention burden on operators.

5. **Auth callout as escape hatch**: External authorization service integration via encrypted `AuthorizationResponseClaims` allows enterprise identity integration without embedding LDAP/password logic in the core.

## Notable Patterns

- **Template expansion in permissions** (`server/auth.go:429-602`): Permissions can use `{{account-name()}}`, `{{name()}}`, `{{subject()}}`, and `tag()` functions to generate subject-specific permissions from a single JWT claim. Limits expansions to 4096 subjects to prevent DoS.

- **Revocation by timestamp** (`server/accounts.go:3873-3909`): Users are revoked by comparing JWT `IssuedAt` against a revocation timestamp. This allows "revoke all users issued before X" without enumerating each user.

- **XKey encryption for auth callout** (`server/auth_callout.go:106-113`): Auth callout requests can be encrypted using Curve25519, with the server's ephemeral public key sent in the `Nats-Server-Xkey` header.

- **Import authorization via bilateral agreement** (`server/accounts.go:1081-1104`): Stream imports require the exporting account to explicitly allow the importing account's NKey in their `approved` map. No unilateral data exposure.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Account-based isolation | Strong tenant separation but higher complexity for workloads that need cross-tenant sharing |
| JWT identity propagation | No server-side session state, but requires careful clock synchronization and JWT expiration management |
| Subject-level ACLs | Fine-grained control but complex to manage at scale without tooling |
| OCSP for revocation | Standard mechanism but network-dependent, responder can become unavailable |
| Fire-and-forget audit | Simple core, but no built-in retention requires external collector |
| TPM key sealing | Strong key protection on Windows but not available on other platforms; limited to JS encryption keys only |

## Failure Modes / Edge Cases

1. **Clock skew**: JWT time restrictions (`validateTimes` at `server/jwt.go:204-247`) require synchronized clocks. Expired tokens may be accepted or valid tokens rejected if clocks diverge.

2. **OCSP responder unavailable** (`server/ocsp.go:53`): If OCSP responder is unreachable, certs may be treated as revoked or valid depending on configuration. `preserve_revoked` option in OCSP cache can retain revoked entries.

3. **Wildcard permission explosion**: Template expansion with multi-value tags can generate up to 4096 subjects (`maxPermTemplateSubjectExpansions` at `server/auth.go:425`). Misconfigured templates could enable broader access than intended.

4. **Auth callout timeout**: If the external auth service is slow or unavailable, connection attempts hang. `AuthTimeout` (`server/opts.go:439`) controls this but default may be too long for high-throughput systems.

5. **Revocation propagation delay**: Account claim updates propagate via `$SYS.ACCOUNT.%s.CLAIMS.UPDATE`. There may be a window where a revoked user can reconnect before the update reaches all servers in a cluster.

6. **LDAP TLS requirement**: LDAP auth requires TLS (`server/auth.go:904`). If the LDAP server doesn't support TLS, authentication fails. No clear error message if LDAP is unreachable.

## Future Considerations

1. **Persistent audit storage**: Native advisory event persistence (e.g., JetStream stream with TTL) would provide built-in retention without external collectors.

2. **Secret rotation automation**: Automated encryption key rotation with online re-encryption would reduce operational burden for compliance requirements.

3. **CRL caching improvement**: More resilient OCSP/CRL handling with local fallback when responders are unavailable, similar to `preserve_revoked` but with configurable fresheness.

4. **Multi-region revocation propagation**: Current revocation uses timestamp comparison; in multi-region deployments, clock skew between regions could cause inconsistent enforcement.

5. **Granular permission introspection**: No API to enumerate effective permissions for a given user across all subjects. Useful for security auditing but currently requires reconstructing from JWT claims.

## Questions / Gaps

1. **Account claim refresh interval**: How frequently are account JWTs refreshed from the resolver? If a user's permissions change in the external IdP, how long until the nats-server account reflects that change?

2. **Rate limiting on auth failures**: Is there configurable rate limiting on authentication attempts to prevent brute-force attacks against password-authenticated users?

3. **Permission inheritance across imports**: If account A imports a service from account B, and account B has wildcard permissions, does account A inherit those permissions or only the specific exported subjects?

4. **TLS mutual authentication per-account**: Can different accounts require different client certificate validity requirements (e.g., different CA chains or OCSP configurations)?

5. **Audit event schema evolution**: Additives to event schemas (new fields in `ClientInfo`) may break consumers expecting fixed-width records. Is there a versioning strategy?

---

Generated by `dimensions/16-security-multi-tenant-isolation.md` against `nats-server`.