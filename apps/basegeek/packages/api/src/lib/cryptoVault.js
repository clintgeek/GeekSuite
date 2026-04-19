/**
 * cryptoVault.js — AES-256-GCM symmetric encryption for secrets at rest.
 *
 * Key source: KEY_VAULT_SECRET env var (64 hex chars = 32 bytes).
 * Fails fast at module load if the env var is missing or wrong length — same
 * pattern as the JWT_SECRET enforcement in authService.js.
 *
 * Packed format: v1:{iv_hex}:{tag_hex}:{ciphertext_hex}
 */

import crypto from 'crypto';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Key initialisation — fail fast
// ---------------------------------------------------------------------------

const KEY_HEX = process.env.KEY_VAULT_SECRET;

if (!KEY_HEX) {
  throw new Error(
    '[cryptoVault] KEY_VAULT_SECRET env var is not set. ' +
    'Generate one with: openssl rand -hex 32'
  );
}

if (KEY_HEX.length !== 64 || !/^[0-9a-fA-F]+$/.test(KEY_HEX)) {
  throw new Error(
    `[cryptoVault] KEY_VAULT_SECRET must be exactly 64 hex characters (32 bytes). ` +
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
export function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('[cryptoVault] encrypt() requires a string');
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
export function decrypt(packed) {
  if (typeof packed !== 'string') {
    throw new TypeError('[cryptoVault] decrypt() requires a string');
  }

  const parts = packed.split(':');
  if (parts.length !== 4) {
    throw new Error('[cryptoVault] decrypt(): malformed packed value (expected 4 colon-separated parts)');
  }

  const [version, ivHex, tagHex, ciphertextHex] = parts;

  if (version !== VERSION_PREFIX) {
    throw new Error(`[cryptoVault] decrypt(): unsupported version prefix "${version}"`);
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
 * Returns true iff the value looks like a cryptoVault-encrypted string.
 * Used for idempotency checks (migration script, model helpers).
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${VERSION_PREFIX}:`);
}

/**
 * Like decrypt() but returns null on any error instead of throwing.
 * Logs the error at warn level. Safe to use on the read path where a single
 * bad row should not bring down the request.
 * @param {string} packed
 * @returns {string|null}
 */
export function safeDecrypt(packed) {
  try {
    return decrypt(packed);
  } catch (err) {
    logger.warn({ err }, '[cryptoVault] safeDecrypt() failed — returning null');
    return null;
  }
}
