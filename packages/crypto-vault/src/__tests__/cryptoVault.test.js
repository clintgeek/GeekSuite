/**
 * @geeksuite/crypto-vault unit tests.
 *
 * Ported from basegeek's original `apps/basegeek/packages/api/src/__tests__/cryptoVault.test.js`
 * (encrypt/decrypt round trip, isEncrypted, safeDecrypt) plus a wrong-key test
 * and a format-stability fixture proving this package decrypts ciphertext
 * produced by the pre-promotion module unchanged.
 *
 * KEY_VAULT_SECRET below is a throwaway value used only for this test run —
 * never a real key.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

process.env.KEY_VAULT_SECRET = 'a'.repeat(64);

const { encrypt, decrypt, isEncrypted, safeDecrypt } = await import('../index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('crypto-vault', () => {
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
      expect(decrypt(a)).toBe(plain);
      expect(decrypt(b)).toBe(plain);
    });

    it('round-trips an empty string', () => {
      const packed = encrypt('');
      expect(decrypt(packed)).toBe('');
    });

    it('round-trips a string with colons (the delimiter)', () => {
      const plain = 'key:with:colons:inside';
      expect(decrypt(encrypt(plain))).toBe(plain);
    });

    it('round-trips unicode content', () => {
      const plain = 'ünïcödé 🔒 secret';
      expect(decrypt(encrypt(plain))).toBe(plain);
    });

    it('packed value starts with v1:', () => {
      const packed = encrypt('hello');
      expect(packed.startsWith('v1:')).toBe(true);
    });

    it('packed value has exactly 4 colon-separated segments', () => {
      const packed = encrypt('hello');
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
      const cipher = parts[3];
      parts[3] = cipher.slice(0, -1) + (cipher.endsWith('0') ? '1' : '0');
      const tampered = parts.join(':');
      expect(safeDecrypt(tampered)).toBeNull();
    });

    it('returns null on a tampered auth tag', () => {
      const packed = encrypt('original');
      const parts = packed.split(':');
      const tag = parts[2];
      parts[2] = tag.slice(0, -1) + (tag.endsWith('0') ? '1' : '0');
      expect(safeDecrypt(parts.join(':'))).toBeNull();
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

  describe('wrong key fails', () => {
    it('a packed value tampered as if decrypted under a different key fails', () => {
      // Flip a byte in the ciphertext itself — the same failure mode a
      // mismatched KEY_VAULT_SECRET produces on the receiving end: the GCM
      // auth tag no longer matches, so decrypt() throws rather than
      // returning garbage plaintext.
      const packed = encrypt('some-secret-value');
      const parts = packed.split(':');
      const ct = parts[3];
      const flipped = (parseInt(ct[0], 16) ^ 0x1).toString(16);
      parts[3] = flipped + ct.slice(1);
      expect(() => decrypt(parts.join(':'))).toThrow();
    });

    it('a real second key cannot decrypt what the first key encrypted', () => {
      // Spawn a fresh process with a different KEY_VAULT_SECRET, encrypt
      // there, then feed that ciphertext back into this process's decrypt()
      // (loaded under 'a'.repeat(64)) — a genuine cross-key failure, not a
      // simulated one.
      const otherKey = 'c'.repeat(64);
      const modulePath = path.join(__dirname, '..', 'index.js');
      const encryptScript =
        `const { encrypt } = require(${JSON.stringify(modulePath)});` +
        `process.stdout.write(encrypt('cross-key-secret'));`;

      const encryptResult = spawnSync(process.execPath, ['-e', encryptScript], {
        env: { ...process.env, KEY_VAULT_SECRET: otherKey },
        encoding: 'utf8',
      });
      expect(encryptResult.status).toBe(0);

      const packedUnderOtherKey = encryptResult.stdout;
      expect(() => decrypt(packedUnderOtherKey)).toThrow();
    });
  });

  describe('format stability — compatibility with the pre-promotion module', () => {
    // Fixture captured from `apps/basegeek/packages/api/src/lib/cryptoVault.js`
    // BEFORE it was touched during this promotion, using a fixed throwaway
    // key. Proves this package's decrypt() is byte-for-byte compatible with
    // ciphertext already written to Mongo by the original module — no
    // migration needed.
    const FIXTURE_KEY = 'b'.repeat(64);
    const FIXTURE_PLAINTEXT = 'fixture-plaintext-\u{1F512}-with:colons:and unicode';
    const FIXTURE_PACKED =
      'v1:f2b48e698a5adc31f570237e:c7a6c12c63bc5404c475903fe080e68d:' +
      '49e1d5c3747c3539a261fa0f1d9a770735843a159a2ecb708a2bee60c91b2fbd47adf13c968af10420cd53a8f061';

    it('fixture packed value matches the documented v1 format', () => {
      const parts = FIXTURE_PACKED.split(':');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('v1');
      expect(parts[1]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
      expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag
      expect(parts[3]).toMatch(/^[0-9a-f]+$/);
    });

    it('decrypts a ciphertext produced by the original basegeek module', () => {
      // The module under test in this file already loaded with a different
      // KEY_VAULT_SECRET ('a'.repeat(64), captured at import time), so a
      // fresh process is spawned with the fixture's key to exercise a clean
      // module load — the same condition a real deploy is in (one process,
      // one KEY_VAULT_SECRET, reading rows written under an older process).
      const modulePath = path.join(__dirname, '..', 'index.js');
      const script =
        `const { decrypt } = require(${JSON.stringify(modulePath)});` +
        `process.stdout.write(decrypt(${JSON.stringify(FIXTURE_PACKED)}));`;

      const result = spawnSync(process.execPath, ['-e', script], {
        env: { ...process.env, KEY_VAULT_SECRET: FIXTURE_KEY },
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe(FIXTURE_PLAINTEXT);
    });
  });
});
