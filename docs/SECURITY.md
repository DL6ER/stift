# Security & Privacy

Stift is developed in Germany with a strict privacy-first approach, aligned with European data protection principles.

## Privacy at a glance

- **All processing happens in your browser.** Images are never uploaded, never processed server-side.
- **No telemetry, no tracking, no analytics.** Zero outbound network requests. Nothing to block, nothing to audit.
- **Self-hosted.** Runs as a Docker container on your own infrastructure. You control where the data lives.
- **Portable data.** Project blobs are plain JSON files in `./data/`. No external database, no vendor lock-in.
- **Open source under EUPL-1.2.** European Union Public Licence: copyleft with network-use protection. The entire codebase is available for inspection, modification, and redistribution.

---

## End-to-End Encryption

When using server storage, Stift encrypts all project data client-side before it leaves the browser. The server stores only opaque ciphertext; it cannot read, index, or analyze your projects.

### How it works

1. **Key derivation**: Your password + username are processed through PBKDF2-SHA256 (600,000 iterations) followed by HKDF-SHA512 to derive a 256-bit AES key. This happens entirely in your browser.
2. **Encryption**: Project data is encrypted with AES-256-GCM (authenticated encryption with associated data). Each save uses a fresh random IV.
3. **Authentication**: A separate key (independent from the encryption key) is derived for server authentication. The server stores only this auth token, never your password or encryption key.
4. **Post-quantum resistance**: AES-256 provides 128-bit security against quantum computers (Grover's algorithm). The HKDF-SHA512 layer adds hash-based quantum resistance. No asymmetric cryptography is used in the key derivation path.

### What this means

- The server operator **cannot** read your stored projects
- A database breach exposes only encrypted blobs and auth tokens; no plaintext data
- Your encryption key exists only in your browser's memory during your session
- **Password loss = data loss.** There is no password recovery. This is by design: any recovery mechanism would require the server to access your encryption key, which would break the zero-knowledge guarantee.

### Secure project sharing

Shared projects use per-project encryption keys:

1. When sharing, a random **Project Key** (AES-256) is generated client-side
2. Project data is encrypted with the Project Key
3. The Project Key is then **wrapped** (encrypted) separately for each member using their personal encryption key
4. When adding a member, the inviter decrypts the Project Key with their own key, then re-encrypts it for the invitee
5. The server stores only encrypted data and wrapped keys; it cannot access any project or derive any key

```
Project Data --encrypt--> Ciphertext (stored on server)
                    ^
               Project Key
                    |
           +-------+-------+
           v       v       v
      wrap(UserA) wrap(UserB) wrap(UserC)   <- each user's wrapped copy
```

Removing a member = deleting their wrapped key copy. They can no longer decrypt the Project Key, and therefore cannot access the data.

**Access roles:**
- **Owner**: full control, can invite/remove members, delete project
- **Editor**: can modify project data, invite new members
- **Viewer**: read-only access

### Post-quantum security in detail

Quantum computers threaten two classes of cryptography differently:

| Threat | Asymmetric (RSA, ECDH) | Symmetric (AES) | Hash-based (SHA, HKDF) |
|--------|----------------------|-----------------|----------------------|
| Shor's algorithm | **Broken** | Not affected | Not affected |
| Grover's algorithm | Not primary threat | Halves effective key length | Halves effective output |
| AES-256 post-quantum | N/A | **128-bit security** (sufficient) | N/A |

**Why Kyber/NTRU are not needed here:** Kyber (ML-KEM) and NTRU are post-quantum *key encapsulation mechanisms*; they protect key exchange between parties (replacing RSA/ECDH). Stift's encryption uses no asymmetric cryptography at all. The entire key derivation path is symmetric:

```
Password -> PBKDF2-SHA256 -> HKDF-SHA512 -> AES-256-GCM
              (symmetric)    (hash-based)   (symmetric)
```

Every step in this chain is quantum-resistant. There is no RSA or elliptic-curve step for Shor's algorithm to attack. Adding Kyber would require an asymmetric key exchange scenario that doesn't exist in our architecture.

**Where post-quantum IS a concern:** The TLS connection between your browser and the server uses asymmetric cryptography (ECDHE) which is vulnerable to future quantum computers. However, even if TLS is broken, the attacker only sees AES-256-GCM ciphertext, which remains quantum-resistant. This is defense in depth: break TLS, and you still can't read the data.

### Comparison to audited password managers

Stift's encryption architecture follows the same zero-knowledge pattern used by independently audited password managers:

| Property | Stift | 1Password | Bitwarden |
|----------|---------|-----------|-----------|
| Server sees plaintext | No | No | No |
| Key derivation | PBKDF2 + HKDF | PBKDF2 + HKDF | PBKDF2 (Argon2 planned) |
| Encryption | AES-256-GCM | AES-256-GCM | AES-256-CBC + HMAC |
| Password recovery | No | Emergency Kit only | No (master password) |
| Post-quantum symmetric | Yes (AES-256) | Yes (AES-256) | Yes (AES-256) |
| Forward secrecy | No (file storage) | No (vault storage) | No (vault storage) |

**Independent security audits of comparable architectures:**

- **1Password**: Audited by [Cure53 (2022)](https://cure53.de/audit-report_1password.pdf), [SOC2 Type 2](https://support.1password.com/security-assessments/) certified, [security white paper](https://1passwordstatic.com/files/security/1password-white-paper.pdf)
- **Bitwarden**: Audited by [Cure53 (2022)](https://bitwarden.com/help/is-bitwarden-audited/#third-party-security-audits), [SOC2 and SOC3](https://bitwarden.com/compliance/) certified, [full source code available](https://github.com/bitwarden)

Stift uses the same fundamental primitives (PBKDF2 key derivation, AES-256-GCM encryption, zero-knowledge architecture) validated in these audits. The cryptographic operations are performed by the browser's built-in [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), a FIPS 140-2 validated implementation in all major browsers.
