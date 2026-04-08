import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Web Crypto API is not available in jsdom. These tests verify the module
// structure and security-critical constants by inspecting the source code.
// Full encrypt/decrypt integration is tested via E2E tests in a real browser.

const source = readFileSync(join(__dirname, 'crypto.ts'), 'utf-8')

describe('crypto module structure', () => {
  it('should export deriveKey, encrypt, decrypt, deriveAuthToken', async () => {
    const mod = await import('./crypto')
    expect(typeof mod.deriveKey).toBe('function')
    expect(typeof mod.encrypt).toBe('function')
    expect(typeof mod.decrypt).toBe('function')
    expect(typeof mod.deriveAuthToken).toBe('function')
  })
})

describe('crypto security properties (source inspection)', () => {
  it('PBKDF2 iterations >= 600,000 (OWASP 2023 recommendation)', () => {
    const match = source.match(/PBKDF2_ITERATIONS\s*=\s*(\d+)/)
    expect(match).toBeTruthy()
    expect(parseInt(match![1])).toBeGreaterThanOrEqual(600000)
  })

  it('AES key length is 256 bits', () => {
    const match = source.match(/KEY_LENGTH\s*=\s*(\d+)/)
    expect(match).toBeTruthy()
    expect(parseInt(match![1])).toBe(256)
  })

  it('AES-GCM IV is 12 bytes (96 bits, NIST recommended)', () => {
    expect(source).toContain('new Uint8Array(12)')
  })

  it('uses different salts for encryption key and auth token', () => {
    expect(source).toContain('stift-e2e-')
    expect(source).toContain('stift-auth-')
    // Verify they are distinct
    const e2eSalt = source.match(/stift-e2e-/g)
    const authSalt = source.match(/stift-auth-/g)
    expect(e2eSalt).toBeTruthy()
    expect(authSalt).toBeTruthy()
  })

  it('uses HKDF-SHA512 as post-quantum strengthening layer', () => {
    expect(source).toContain("hash: 'SHA-512'")
    expect(source).toContain("name: 'HKDF'")
  })

  it('uses AES-GCM (authenticated encryption)', () => {
    expect(source).toContain("name: 'AES-GCM'")
  })

  it('exports generateProjectKey, wrapProjectKey, unwrapProjectKey', async () => {
    const mod = await import('./crypto')
    expect(typeof mod.generateProjectKey).toBe('function')
    expect(typeof mod.wrapProjectKey).toBe('function')
    expect(typeof mod.unwrapProjectKey).toBe('function')
    expect(typeof mod.exportKey).toBe('function')
    expect(typeof mod.importKey).toBe('function')
  })

  it('encryption key is not extractable', () => {
    // deriveKey should have extractable=false
    expect(source).toContain("false,\n    ['encrypt', 'decrypt']")
  })
})
