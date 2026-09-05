'use strict';

/**
 * @geeksuite/crypto-vault
 *
 * AES-256-GCM symmetric encryption for secrets at rest. Promoted out of
 * basegeek's in-process `apps/basegeek/packages/api/src/lib/cryptoVault.js`
 * (September 2026) so other backends — starting with fitnessgeek's Garmin
 * password — can encrypt sensitive fields before writing to MongoDB without
 * depending on basegeek's api package.
 *
 * BYTE-FOR-BYTE COMPATIBLE with the original module: same env var name
 * (`KEY_VAULT_SECRET`), same key derivation (raw 32-byte key from 64 hex
 * chars, no KDF), same cipher (`aes-256-gcm`), same 96-bit random IV, same
 * packed format (`v1:{iv_hex}:{tag_hex}:{ciphertext_hex}`). Existing
 * ciphertext already written to Mongo by the old module decrypts unchanged —
 * see `src/__tests__/cryptoVault.test.js`'s "format stability" test, which
 * checks a fixture packed string captured from the pre-promotion module
 * against a fixed throwaway key.
 *
 * Written as plain CommonJS (no "type": "module"), matching `@geeksuite/logger`
 * and `@geeksuite/schemas`: ESM backends (basegeek's api) `import { encrypt }
 * from '@geeksuite/crypto-vault'` — Node's CJS/ESM interop statically reads
 * the named `module.exports` below — and a CJS backend (fitnessgeek, step 2)
 * can `require('@geeksuite/crypto-vault')` directly. A "type": "module"
 * package could not be `require()`-d by a CJS caller at all.
 *
 * Logging: the original module logged `safeDecrypt()` failures through
 * basegeek's local pino instance. This package has no logging dependency of
 * its own (it's a low-level primitive other apps depend on, and pulling in a
 * logger here would force every consumer to carry one) — failures go to
 * `console.warn` instead. The condition logged and the fact that the return
 * value is `null` are unchanged; only the transport differs.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Key initialisation — fail fast
// ---------------------------------------------------------------------------

const KEY_HEX = process.env.KEY_VAULT_SECRET;

if (!KEY_HEX) {
  throw new Error(
    '[crypto-vault] KEY_VAULT_SECRET env var is not set. ' +
    'Generate one with: openssl rand -hex 32'
  );
}

if (KEY_HEX.length !== 64 || !/^[0-9a-fA-F]+$/.test(KEY_HEX)) {
  throw new Error(
    `[crypto-vault] KEY_VAULT_SECRET must be exactly 64 hex characters (32 bytes). ` +
    `Got ${KEY_HEX.length} characters.`
  );
}

const KEY = Buffer.from(KEY_HEX, 'hex'); // 32 bytes

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV, recommended for GCM
const VERSION_PREFIX = 'v1';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  Packed ciphertext: "v1:{iv_hex}:{tag_hex}:{ciphertext_hex}"
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('[crypto-vault] encrypt() requires a string');
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const ciphertextBuf = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${VERSION_PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertextBuf.toString('hex')}`;
}

/**
 * Decrypt a packed ciphertext string produced by encrypt().
 * @param {string} packed
 * @returns {string} Decrypted plaintext
 * @throws {Error} On malformed input, unknown version, or auth-tag mismatch.
 */
function decrypt(packed) {
  if (typeof packed !== 'string') {
    throw new TypeError('[crypto-vault] decrypt() requires a string');
  }

  const parts = packed.split(':');
  if (parts.length !== 4) {
    throw new Error('[crypto-vault] decrypt(): malformed packed value (expected 4 colon-separated parts)');
  }

  const [version, ivHex, tagHex, ciphertextHex] = parts;

  if (version !== VERSION_PREFIX) {
    throw new Error(`[crypto-vault] decrypt(): unsupported version prefix "${version}"`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return plaintext.toString('utf8');
}

/**
 * Returns true iff the value looks like a crypto-vault-encrypted string.
 * Used for idempotency checks (migration scripts, model helpers).
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${VERSION_PREFIX}:`);
}

/**
 * Like decrypt() but returns null on any error instead of throwing.
 * Logs the error at warn level. Safe to use on the read path where a single
 * bad row should not bring down the request.
 * @param {string} packed
 * @returns {string|null}
 */
function safeDecrypt(packed) {
  try {
    return decrypt(packed);
  } catch (err) {
    console.warn('[crypto-vault] safeDecrypt() failed — returning null:', err.message);
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  safeDecrypt,
};
