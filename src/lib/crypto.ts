/**
 * Zero-knowledge encryption for Stift projects.
 *
 * Architecture:
 * - Key derivation: PBKDF2-SHA256 (600,000 iterations) + HKDF-SHA512
 * - Encryption: AES-256-GCM (authenticated encryption)
 * - The encryption key is derived entirely from the user's password + username (as salt)
 * - The server NEVER sees the plaintext key or unencrypted data
 * - Post-quantum: AES-256 provides 128-bit security against Grover's algorithm,
 *   HKDF-SHA512 adds a quantum-resistant hash-based derivation layer
 *
 * Password loss = data loss. This is by design.
 */

// 1.2M PBKDF2-SHA256 iterations roughly doubles the 2023 OWASP cheat
// sheet's 600k recommendation, keeping pace with commodity hardware
// improvements. Lowering this retroactively would silently weaken every
// user whose password has already been used to derive a key, so future
// bumps are fine (slower logins for the same user) but reductions need a
// migration plan. Login derivation cost on a mid-range 2024 laptop:
// roughly 500-800 ms across the PBKDF2 + HKDF chain.
const PBKDF2_ITERATIONS = 1200000
const KEY_LENGTH = 256 // bits

// NFC-normalise the username before feeding it into the salt. Two visually
// identical strings can carry different UTF-8 byte sequences (precomposed
// "Müller" vs. "Müller" with a combining diaeresis); without NFC,
// a user logging in from a system that emits the decomposed form would
// derive a different key from the same password and lock themselves out
// of their own data.
function canonicalUsername(username: string): string {
  return username.normalize('NFC').toLowerCase().trim()
}

/** Derive a 256-bit AES key from password + username using PBKDF2 + HKDF */
export async function deriveKey(password: string, username: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const uname = canonicalUsername(username)

  // Step 1: Import password as PBKDF2 key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  // Step 2: PBKDF2 derivation with username as salt
  const pbkdf2Bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(`stift-e2e-${uname}`),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH,
  )

  // Step 3: HKDF-SHA512 as post-quantum strengthening layer
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    pbkdf2Bits,
    'HKDF',
    false,
    ['deriveKey'],
  )

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-512',
      salt: enc.encode(`stift-pq-${uname}`),
      info: enc.encode('stift-aes256gcm-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )

  return aesKey
}

/** Encrypt plaintext string -> base64-encoded ciphertext with embedded IV */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  )

  // Prepend IV to ciphertext, then base64 encode
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return btoa(String.fromCharCode(...combined))
}

/** Decrypt base64-encoded ciphertext -> plaintext string */
export async function decrypt(key: CryptoKey, encrypted: string): Promise<string> {
  const combined = new Uint8Array(
    atob(encrypted).split('').map((c) => c.charCodeAt(0)),
  )

  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )

  return new TextDecoder().decode(plaintext)
}

// -- Shared project key management --

/** Generate a random AES-256 project key */
export async function generateProjectKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable -- we need to wrap/unwrap it
    ['encrypt', 'decrypt'],
  )
}

/** Export a CryptoKey to raw bytes */
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key)
}

/** Import raw bytes as an AES-GCM key */
export async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/** Wrap (encrypt) a project key with a user's personal key */
export async function wrapProjectKey(projectKey: CryptoKey, userKey: CryptoKey): Promise<string> {
  const raw = await exportKey(projectKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  // Re-import userKey as wrapping key (need a non-extractable version with encrypt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, userKey, raw)
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/** Unwrap (decrypt) a project key using a user's personal key */
export async function unwrapProjectKey(wrappedKey: string, userKey: CryptoKey): Promise<CryptoKey> {
  const combined = new Uint8Array(atob(wrappedKey).split('').map((c) => c.charCodeAt(0)))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, userKey, ciphertext)
  return importKey(raw)
}

/** Derive an auth token (not the encryption key!) for server authentication */
export async function deriveAuthToken(password: string, username: string): Promise<string> {
  const enc = new TextEncoder()
  const uname = canonicalUsername(username)

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  // Different salt than encryption key -- auth token and encryption key are independent
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(`stift-auth-${uname}`),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256,
  )

  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
