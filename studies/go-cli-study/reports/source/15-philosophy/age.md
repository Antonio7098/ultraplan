# Repo Analysis: age

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

age is a file encryption tool and format that prioritizes simplicity, security, and composability. The project optimizes for minimal attack surface, explicit behavior, and UNIX-style composability. It deliberately avoids configuration options, global keyrings, and agent support, favoring small explicit keys that can be passed on command lines or stored in dedicated files.

## Rating

**8/10** — Strong coherent engineering style. The project demonstrates clear intentional design with disciplined tradeoffs. Every complexity decision is deliberate and documented.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Core philosophy | "simple, modern and secure file encryption tool, format, and Go library" | README.md:13 |
| No keyring philosophy | "age does not have a global keyring" | age.go:18 |
| Key per-task design | "you are encouraged to generate dedicated keys for each task and application" | age.go:19-20 |
| No default key path | "There is no default path for age keys" | age.go:26 |
| No config philosophy | "no config options" | README.md:15 |
| SSH key support rationale | "supported for manual encryption operations" | age.go:32-33 |
| Backwards compatibility | "Files encrypted with a stable version...will decrypt with any later versions" | age.go:39-42 |
| Post-quantum support | "safe against future cryptographically-relevant quantum computers" | pq.go:23-24 |
| Scrypt labels | "ensures a ScryptRecipient can't be mixed with other recipients" | scrypt.go:92-100 |
| Anonymous recipients | "an attacker can't tell from the message alone if it is encrypted to a certain recipient" | x25519.go:28-29 |
| Changelog | C2SP specification linked, versioned format | README.md:11 |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Simplicity and minimalism** with security as a non-negotiable constraint. The project tagline is "simple, modern and secure" (`README.md:13`). It optimizes for:

- **Minimal attack surface**: No config files, no global keyrings, no plugin configuration
- **Explicit behavior**: Small explicit keys, no default paths, clear file format specification
- **Composability**: UNIX-style design where tools compose through stdin/stdout
- **Security by default**: Authenticated encryption (ChaCha20-Poly1305), post-quantum hybrid keys (ML-KEM768+X25519)

Key evidence from `age.go:17-25`:
> "age does not have a global keyring. Instead, since age keys are small, textual, and cheap, you are encouraged to generate dedicated keys for each task and application."

### 2. What complexity is intentionally accepted?

- **Multiple recipient types**: X25519, scrypt (passphrase), hybrid post-quantum, SSH keys (ssh-ed25519, ssh-rsa). Each has distinct security properties and mixing rules.

- **Plugin system**: Allows external binaries to provide additional identity/recipient types. This adds interface complexity but enables extensibility without core changes (`plugin/` directory, `cmd/age/age.go:385-389`).

- **Scrypt work factor configuration**: `SetWorkFactor` and `SetMaxWorkFactor` allow tuning but also create a spectrum of security/performance tradeoffs (`scrypt.go:52-60`, `scrypt.go:134-145`).

- **Passphrase authentication semantics**: Scrypt recipients must be sole recipient due to authentication expectation (`scrypt.go:95-101`). This creates a constraint that requires enforcement.

- **SSH key tracking risk**: The docs explicitly warn that SSH key support "makes it possible to track files that are encrypted to a specific public key" (`README.md:291`). This is accepted as a tradeoff for convenience.

### 3. What complexity is intentionally avoided?

- **No configuration files**: Explicitly stated as a design goal ("no config options" `README.md:15`)
- **No keyring/secret management**: Deliberate choice, keys stored at application-specific paths (`age.go:26-28`)
- **No ssh-agent support**: Explicitly rejected ("ssh-agent is not supported" `README.md:284`)
- **No plugin configuration**: Plugins are discovered via `$PATH`, no config needed
- **No symmetric encryption by default**: Only asymmetric recipients unless `-e` explicitly invoked with `-i`
- **No key rotation mechanism**: Not built into the format
- **Limited identity ordering control**: Only native vs non-native identities are sorted (`decryptHdr` at `age.go:324-341`)

## Architectural Decisions

1. **Format over implementation**: The age format is specified at age-encryption.org/v1 (`README.md:11`, `format/format.go:106`), enabling multiple interoperable implementations (Rust rage, TypeScript Typage).

2. **Stanza-based header design**: Multiple recipients each get a stanza in the header, enabling multi-recipient encryption without ciphertext expansion (`format/format.go:111-131`).

3. **File key encapsulation**: A single 16-byte file key (`fileKeySize` at `primitives.go:115`) encrypted to each recipient, avoiding redundant symmetric encryption.

4. **Implicit vs explicit ordering**: Native identities (X25519, Hybrid, Scrypt) are tried before plugins in decryption (`age.go:324-341`). This is an implicit policy rather than a user-configurable one.

5. **Label-based recipient mixing prevention**: `RecipientWithLabels` interface (`age.go:88-101`) prevents mixing incompatible recipients (e.g., post-quantum with classic), enforced at encryption time.

## Notable Patterns

- **HKDF for key derivation**: Uses HKDF-SHA256 for both header MAC (`primitives.go:52-63`) and payload stream keys (`primitives.go:65-72`), with distinctinfo parameters ("header" vs "payload").

- **ChaCha20-Poly1305 as sole cipher**: Only one symmetric cipher suite, reducing attack surface. Fixed nonce pattern is safe because keys are single-use (`primitives.go:24-27`).

- **Bech32 for key encoding**: Human-readable keys with error detection (`internal/bech32/`).

- **Error wrapping hierarchy**: `ErrIncorrectIdentity` for incorrect keys, `NoIdentityMatchError` aggregating all failures, with proper `Unwrap()` chains (`age.go:75-77`, `age.go:220-240`).

## Tradeoffs

| Decision | Accepted Complexity | Avoided Complexity |
|----------|---------------------|---------------------|
| No global keyring | Users must manage multiple key files | No key rotation, no centralized audit |
| Post-quantum keys are 2000 chars | Verbose but safe | Short post-quantum keys |
| Scrypt must be sole recipient | Can't mix passphrase + public key | Multi-recipient passphrase files |
| SSH key tracking risk | Convenience of GitHub keys | Anonymity |
| No config files | Explicit every invocation | Configuration management |

## Failure Modes / Edge Cases

1. **PowerShell redirection corruption**: Binary age files mangled by PowerShell redirection are detected via magic intro strings (`cmd/age/age.go:437-493`).

2. **Multi-key AEAD attack mitigation**: Fixed-size ciphertext decryption limits multi-key attack surface (`primitives.go:35-50`).

3. **Scrypt work factor scaling**: Default of 2^18 (1s) may be too slow or too fast depending on hardware. CLI has `--work-factor` but no auto-tuning (`scrypt.go:45-46`).

4. **Plugin discovery via PATH**: Security relies on PATH integrity. Malicious `age-plugin-*` in PATH could steal keys.

## Future Considerations

- v2 might break v1 backwards compatibility (`age.go:41-42`)
- Post-quantum may become default (currently opt-in with `-pq` flag)
- No automatic work factor scaling; TODO at `scrypt.go:45` mentions "automatically scale this to 1s"

## Questions / Gaps

1. **No documented plugin security model**: How are plugins isolated? What prevents a plugin from exfiltrating keys?
2. **No key rotation mechanism**: How should users migrate from compromised keys?
3. **No audit logging**: Operation history is not preserved.
4. **Deterministic passphrase generation**: The wordlist-based passphrase generation (`wordlist.go`) should be reviewed for entropy quality.

---

Generated by `study-areas/15-philosophy.md` against `age`.