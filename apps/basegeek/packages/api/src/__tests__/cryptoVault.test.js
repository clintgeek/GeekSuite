/**
 * cryptoVault unit tests.
 *
 * Tests the AES-256-GCM encrypt/decrypt round-trip, isEncrypted helper,
 * and safeDecrypt null-on-failure behaviour.
 *
 * Environment: KEY_VAULT_SECRET is set in setEnv.js before this module loads.
 */

import { describe, it, expect } from '@jest/globals';
import { encrypt, decrypt, isEncrypted, safeDecrypt } from '../lib/cryptoVault.js';

describe('cryptoVault', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('decrypts back to the original plaintext', () => {
      const plain = 'sk-abc123supersecret';
      const packed = encrypt(plain);
      expect(decrypt(packed)).toBe(plain);
    });

    it('produces different ciphertext each call (random IV)', () => {
      const plain = 'same-plaintext';
      const a = encrypt(plain);
      const b = encrypt(plain);
      expect(a).not.toBe(b);
      // Both must still decrypt correctly
      expect(decrypt(a)).toBe(plain);
      expect(decrypt(b)).toBe(plain);
    });

    it('round-trips an empty string', () => {
      const packed = encrypt('');
      expect(decrypt(packed)).toBe('');
    });

    it('round-trips a string with colons (the delimiter)', () => {
      // The v1 format uses `:` as delimiter; values containing `:` must be safe
      const plain = 'key:with:colons:inside';
      expect(decrypt(encrypt(plain))).toBe(plain);
    });

    it('packed value starts with v1:', () => {
      const packed = encrypt('hello');
      expect(packed.startsWith('v1:')).toBe(true);
    });

    it('packed value has exactly 4 colon-separated segments', () => {
      const packed = encrypt('hello');
      // format: v1:{iv_hex}:{tag_hex}:{ciphertext_hex}
      expect(packed.split(':').length).toBe(4);
    });
  });

  describe('isEncrypted', () => {
    it('returns true for a packed ciphertext', () => {
      expect(isEncrypted(encrypt('test'))).toBe(true);
    });

    it('returns true for any string starting with v1:', () => {
      expect(isEncrypted('v1:foo')).toBe(true);
    });

    it('returns false for a plain string', () => {
      expect(isEncrypted('sk-plaintext-key')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
      expect(isEncrypted(42)).toBe(false);
    });
  });

  describe('safeDecrypt', () => {
    it('decrypts a valid packed value', () => {
      const plain = 'secret-key';
      expect(safeDecrypt(encrypt(plain))).toBe(plain);
    });

    it('returns null on garbage input', () => {
      expect(safeDecrypt('not-encrypted-at-all')).toBeNull();
    });

    it('returns null on a truncated packed value', () => {
      expect(safeDecrypt('v1:deadbeef')).toBeNull();
    });

    it('returns null on tampered ciphertext (auth tag mismatch)', () => {
      const packed = encrypt('original');
      const parts = packed.split(':');
      // Flip the last hex character of the ciphertext segment
      const cipher = parts[3];
      parts[3] = cipher.slice(0, -1) + (cipher.endsWith('0') ? '1' : '0');
      const tampered = parts.join(':');
      expect(safeDecrypt(tampered)).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(safeDecrypt(null)).toBeNull();
      expect(safeDecrypt(undefined)).toBeNull();
    });
  });

  describe('decrypt error cases', () => {
    it('throws on non-string input', () => {
      expect(() => decrypt(null)).toThrow(TypeError);
    });

    it('throws on wrong number of segments', () => {
      expect(() => decrypt('v1:onlythreesegments')).toThrow();
    });

    it('throws on unsupported version prefix', () => {
      const valid = encrypt('x');
      const withV2 = valid.replace(/^v1:/, 'v2:');
      expect(() => decrypt(withV2)).toThrow(/unsupported version/i);
    });
  });
});
