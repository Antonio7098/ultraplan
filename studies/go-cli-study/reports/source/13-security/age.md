# Repo Analysis: age

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

age is a file encryption tool that implements the age-encryption.org/v1 specification. It provides identity-based encryption using X25519, post-quantum hybrid keys (ML-KEM-768 + X25519), and passphrase-based encryption via scrypt. The tool is designed with explicit trust boundaries: it never executes shell commands, uses plugin executables with controlled invocation, validates all inputs rigorously, and protects secrets from logging/debug output.

## Rating

**9/10** — Explicit trust boundaries and defensive engineering. age is a security-focused encryption tool that treats input validation, secret handling, and plugin isolation with significant care. No shell execution, controlled plugin invocation, comprehensive input validation, and MAC verification demonstrate enterprise-grade security hygiene.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Input validation | `recipientFileSizeLimit = 16 << 20` (16 MiB) for recipient files | `cmd/age/parse.go:71` |
| Input validation | `lineLengthLimit = 8 << 10` (8 KiB) for lines in files | `cmd/age/parse.go:72` |
| Input validation | UTF-8 validation for all identity/recipient file lines | `cmd/age/parse.go:82-84` |
| Input validation | Stanza arguments validated as printable ASCII (33-126) | `internal/format/format.go:301-311` |
| Input validation | Private key size limits: 16 MiB for age keys, 16 KiB for SSH | `cmd/age/parse.go:168,192` |
| Shell execution | No shell execution — uses `exec.Command` directly | `plugin/client.go:433` |
| Shell execution | Plugin working directory set to `os.TempDir()` | `plugin/client.go:463` |
| Shell execution | Plugin names rejected if containing path separators | `plugin/client.go:430-431` |
| Secret handling | Secret keys written with 0600 permissions by default | `cmd/age-keygen/keygen.go:97` |
| Secret handling | Passphrase prompts use `term.ReadSecret` (no echo) | `internal/term/term.go:65-73` |
| Secret handling | Warning issued if secret key file is world-readable | `cmd/age-keygen/keygen.go:122-124` |
| Secret handling | Error messages hide details of malformed confidential files | `cmd/age/parse.go:98-100` |
| Trust boundary | MAC verification before accepting file key | `age/age.go:367-370` |
| Trust boundary | Scrypt work factor capped via `SetMaxWorkFactor` | `scrypt.go:140-145` |
| Trust boundary | Armor format strictly validated (header/footer/columns) | `armor/armor.go:131,146-148` |
| Trust boundary | Plugin protocol uses stdin/stdout only, not shell | `plugin/plugin.go:1-8` |

## Answers to Protocol Questions

### 1. How are secrets stored?

Secrets (private keys) are stored as plain text in files with one key per line. The format uses Bech32 encoding for X25519 keys (`AGE-SECRET-KEY-1...`) and hybrid keys (`AGE-SECRET-KEY-PQ-1...`). Files are written with 0600 permissions by `age-keygen`, and a warning is issued if the output file is world-readable (`cmd/age-keygen/keygen.go:122-124`). There is no global keyring; keys are stored at application-specific paths chosen by the user. Identity files support comments (lines starting with `#`) and empty lines, which are ignored during parsing (`parse.go:32-34`).

Passphrase-based identities use scrypt with a work factor (default 2^18 for encryption, max 2^22 for decryption) to derive the file key (`scrypt.go:46,129`). The scrypt implementation caps the work factor to prevent DoS attacks via excessively high work factors in malicious files (`scrypt.go:185-187`).

### 2. How is shell execution sandboxed?

age does **not** execute shell commands. The only external program invocation is for plugins, which are executed via `exec.Command` with no shell involvement (`plugin/client.go:433`). Plugin names are restricted to avoid path traversal: names containing `os.PathSeparator` are rejected (`plugin/client.go:430-431`). The plugin's working directory is set to `os.TempDir()` to prevent reliance on the client's working directory (`plugin/client.go:463`). Plugins communicate exclusively via stdin/stdout using a stanza-based protocol defined in `plugin/plugin.go`.

The `AGEDEBUG=plugin` environment variable can enable debug output of plugin communication, which writes to stderr, but this is an opt-in debug feature (`plugin/client.go:454-458`).

### 3. How are user inputs validated?

Input validation is centralized and comprehensive:

- **File size limits**: Recipient files limited to 16 MiB (`cmd/age/parse.go:71`), identity files to 16 MiB (`parse.go:227`), SSH private keys to 16 KiB (`cmd/age/parse.go:192`)
- **Line length limits**: 8 KiB per line, matching sshd(8) (`cmd/age/parse.go:72`)
- **UTF-8 validation**: All lines must be valid UTF-8 (`cmd/age/parse.go:82-83`, `parse.go:35-36`)
- **Stanza argument validation**: Printable ASCII only (33-126), no null bytes (`internal/format/format.go:301-311`)
- **Armor format validation**: Strict header ("-----BEGIN AGE ENCRYPTED FILE-----"), footer, column limits, and trailing data checks (`armor/armor.go:131,146-148`)
- **Bech32 decoding**: Plugin recipients/identities decoded from Bech32; invalid names rejected (`plugin/client.go:41-44`)
- **SSH key type validation**: Base64 decoding and type field extraction for SSH public keys (`cmd/age/parse.go:113-134`)

Additionally, the decrypt path checks for PowerShell mangling of the file intro (`cmd/age/age.go:437-441,488-493`) and refuses to output binary to a terminal unless explicitly requested (`cmd/age/age.go:289-295,299-302`).

### 4. Are trust boundaries explicit?

Yes. Trust boundaries are explicit in several ways:

1. **Encrypted identity files**: When an identity file is itself encrypted (requires passphrase), this is detected at parse time by peeking for the "age-encryption" or "-----BEGIN AGE" header, and a passphrase prompt is issued before the file is decrypted (`cmd/age/parse.go:161-188`).

2. **MAC verification**: The file header includes a MAC that is verified before the file key is used (`age/age.go:367-370`), ensuring header integrity.

3. **Scrypt work factor caps**: `ScryptIdentity.SetMaxWorkFactor` allows capping the computational work allowed when processing untrusted files (`scrypt.go:140-145`), preventing DoS via high work factors.

4. **Plugin protocol isolation**: Plugins receive only the data they need (recipient/identity string, stanzas) and cannot access the file system beyond their working directory (`plugin/client.go:463`).

5. **Stanza type allowlist**: Only known stanza types are processed; unknown types in uni-directional phases are ignored (`plugin/plugin.go:227-228,417-418`).

6. **No default key paths**: age has no default key path, forcing users to explicitly specify identities and recipients.

## Architectural Decisions

- **No keyring**: Keys are not stored in a central location; each application using age is expected to manage its own keys. This avoids a privileged secret store that could become an attack target.
- **Plugin execution without shell**: Plugins are invoked as separate processes with controlled arguments, communicating via stdin/stdout. This isolates plugin code from the main process.
- **File-based identity format**: Keys are stored as line-oriented text files, making them easy to back up, transfer, and manage with standard tools.
- **MAC-then-encrypt**: The age format computes a MAC over the header before the encrypted payload, ensuring header integrity is verified before decryption proceeds.

## Notable Patterns

- **Lazy passphrase prompting**: `LazyScryptIdentity` only requests the passphrase if an scrypt stanza is encountered, avoiding unnecessary prompts.
- **Deterministic error messages for malformed files**: Parse errors hide details that might leak information about confidential files, returning generic "malformed recipient at line N" errors.
- **Plugin name validation**: Plugin names are validated to prevent path traversal attacks (`plugin/client.go:430-431`).
- **Armor auto-detection**: The decrypt path automatically detects armored files by peeking for the header, avoiding the need for explicit flags.

## Tradeoffs

- **No encrypted identity file in recipients file**: If a user accidentally puts an identity (secret key) in a recipients file, the parser detects this and returns an error at that line number, but the error message is generic to avoid leaking the key content.
- **scrypt AEAD not robust**: The scrypt implementation uses an AEAD that is not robust (meaning an attacker could craft messages decrypting under two keys). This is documented in `scrypt.go:198-205` and deemed acceptable for the offline decryption oracle use case.
- **Single-file identity files**: Identities are stored one per line in files, which works for individuals but requires careful handling for shared keys.

## Failure Modes / Edge Cases

- **PowerShell redirection mangling**: Files encrypted on Windows with PowerShell redirection may have mangled intros (CRLF or UTF-16LE). age detects this and suggests using `-o` or `-a`.
- **Plugin not found**: If a plugin binary is not in PATH, `NotFoundError` is returned with a helpful message pointing to the plugin list.
- **Passphrase mismatch**: During encryption, if the user enters mismatched passphrases, this is detected and an error returned.
- **High scrypt work factor**: Files with excessively high scrypt work factors are rejected; the maximum is configurable via `SetMaxWorkFactor`.

## Future Considerations

- The TODO in `scrypt.go:45` mentions automatically scaling the work factor to 1s, which would improve security by default on modern hardware.
- The plugin test framework is noted as TODO in `plugin/plugin.go:24`.
- Support for multiple spaces/tabs as SSH key field separators (noted in `cmd/age/parse.go:114-115`).

## Questions / Gaps

- No evidence found for hardware token support (YubiKey, etc.) — the plugin system could support this but no built-in plugin exists.
- No evidence of audit logging or operation logging — secrets operations are not recorded.
- No evidence of forward secrecy — age files encrypted to a recipient key can be decrypted by that recipient indefinitely (no key rotation mechanism).

---

Generated by `study-areas/13-security.md` against `age`.