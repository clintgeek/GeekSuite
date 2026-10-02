/**
 * The Attic's encryption at rest (DOCS/THINGGEEK_PLAN.md "The Attic" →
 * "Crypto"). This backend is the ONLY holder of the key: the basegeek gateway
 * stores and serves metadata and never sees a key or a plaintext identifier.
 *
 * Algorithm: AES-256-GCM. A fresh random 96-bit IV per sealed item; the
 * 128-bit auth tag is stored with it; additional authenticated data binds
 * every item to WHERE it belongs, so a ciphertext copied onto another
 * document, field, file or household fails to open:
 *   field  "thinggeek-attic|field|<householdId>|<documentId>|<fieldKey>"
 *   file   "thinggeek-attic|file|<householdId>|<fileId>"
 *
 * Keys (env, read once at boot by loadVaultKeyring):
 *   THINGGEEK_VAULT_KEY           32 bytes, base64 — the CURRENT master key
 *   THINGGEEK_VAULT_KEY_VERSION   its version (integer ≥ 1, default 1)
 *   THINGGEEK_VAULT_KEYS_RETIRED  optional "<ver>:<base64>,<ver>:<base64>" —
 *                                 older keys, decrypt-only, kept during a rotation
 * Every sealed item records the version it was sealed with (`v` on a field,
 * the file header's version), so a rotation can re-seal item by item.
 *
 * The master key is never used directly: HKDF-SHA256 derives a separate
 * subkey per purpose (AES for fields and files; the PIN pepper), so the
 * pepper can't decrypt anything and vice versa.
 *
 * File format (self-describing, so a restored file needs nothing else):
 *   "TGA1" (4) | key version uint16 BE (2) | IV (12) | tag (16) | ciphertext
 *
 * No key, or a malformed one → the keyring is unavailable and the Attic
 * refuses to serve (503 ATTIC_UNAVAILABLE). There is no plaintext fallback.
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const FILE_MAGIC = Buffer.from('TGA1', 'latin1');
const FILE_HEADER_BYTES = FILE_MAGIC.length + 2 + IV_BYTES + TAG_BYTES;
const HKDF_SALT = Buffer.from('thinggeek-attic', 'utf8');

export class AtticCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AtticCryptoError';
    this.code = 'ATTIC_CRYPTO';
  }
}

function decodeKey(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64.trim())) return null;
  const buf = Buffer.from(b64.trim(), 'base64');
  return buf.length === KEY_BYTES ? buf : null;
}

const subkey = (master, purpose) => Buffer.from(crypto.hkdfSync('sha256', master, HKDF_SALT, Buffer.from(`thinggeek-attic/${purpose}`, 'utf8'), KEY_BYTES));

/**
 * The keyring from the environment. NEVER logs or returns key material in
 * `reason`. `{ ok: false }` means the Attic must not serve.
 */
export function loadVaultKeyring(env = process.env) {
  const current = decodeKey(env.THINGGEEK_VAULT_KEY);
  if (!env.THINGGEEK_VAULT_KEY) return { ok: false, reason: 'THINGGEEK_VAULT_KEY is not set' };
  if (!current) return { ok: false, reason: 'THINGGEEK_VAULT_KEY must be 32 bytes, base64 (openssl rand -base64 32)' };
  const version = env.THINGGEEK_VAULT_KEY_VERSION ? Number(env.THINGGEEK_VAULT_KEY_VERSION) : 1;
  if (!Number.isInteger(version) || version < 1 || version > 65535) return { ok: false, reason: 'THINGGEEK_VAULT_KEY_VERSION must be an integer 1–65535' };

  const masters = new Map([[version, current]]);
  for (const part of String(env.THINGGEEK_VAULT_KEYS_RETIRED || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const at = part.indexOf(':');
    const v = Number(part.slice(0, at));
    const key = decodeKey(part.slice(at + 1));
    if (at < 1 || !Number.isInteger(v) || v < 1 || v > 65535 || !key || masters.has(v)) {
      return { ok: false, reason: 'THINGGEEK_VAULT_KEYS_RETIRED must be "<version>:<base64 32 bytes>" pairs with distinct versions' };
    }
    masters.set(v, key);
  }

  const enc = new Map([...masters].map(([v, k]) => [v, subkey(k, 'aes-256-gcm')]));
  const pepper = new Map([...masters].map(([v, k]) => [v, subkey(k, 'pin-pepper')]));
  return createKeyring({ version, enc, pepper });
}

/** Build a keyring from derived keys (tests use loadVaultKeyring with a generated test key). */
function createKeyring({ version, enc, pepper }) {
  const encKey = (v) => {
    const k = enc.get(Number(v));
    if (!k) throw new AtticCryptoError('no key for this version');
    return k;
  };
  return Object.freeze({
    ok: true,
    version,
    versions: Object.freeze([...enc.keys()].sort((a, b) => a - b)),

    /** Seal one identifier value → { v, iv, tag, ct } (base64). */
    sealField({ householdId, documentId, key, plaintext }) {
      if (typeof plaintext !== 'string') throw new TypeError('sealField: plaintext must be a string');
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv(ALGO, encKey(version), iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(fieldAad(householdId, documentId, key));
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return { v: version, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
    },

    /** Open one sealed value; throws AtticCryptoError on tamper, a wrong place, or an unknown version. */
    openField({ householdId, documentId, key, sealed }) {
      try {
        const iv = Buffer.from(sealed.iv, 'base64');
        const tag = Buffer.from(sealed.tag, 'base64');
        if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('bad iv/tag');
        const decipher = crypto.createDecipheriv(ALGO, encKey(sealed.v), iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(fieldAad(householdId, documentId, key));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()]).toString('utf8');
      } catch {
        throw new AtticCryptoError('could not open this value');
      }
    },

    /** Seal file bytes → the on-disk buffer (header + ciphertext). */
    sealFile({ householdId, fileId, buffer }) {
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv(ALGO, encKey(version), iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(fileAad(householdId, fileId));
      const ct = Buffer.concat([cipher.update(buffer), cipher.final()]);
      const ver = Buffer.alloc(2);
      ver.writeUInt16BE(version, 0);
      return Buffer.concat([FILE_MAGIC, ver, iv, cipher.getAuthTag(), ct]);
    },

    /** Open an on-disk buffer; throws AtticCryptoError on anything wrong. */
    openFile({ householdId, fileId, sealed }) {
      try {
        if (!Buffer.isBuffer(sealed) || sealed.length < FILE_HEADER_BYTES || !sealed.subarray(0, 4).equals(FILE_MAGIC)) throw new Error('not sealed');
        const v = sealed.readUInt16BE(4);
        const iv = sealed.subarray(6, 6 + IV_BYTES);
        const tag = sealed.subarray(6 + IV_BYTES, FILE_HEADER_BYTES);
        const decipher = crypto.createDecipheriv(ALGO, encKey(v), iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(fileAad(householdId, fileId));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(sealed.subarray(FILE_HEADER_BYTES)), decipher.final()]);
      } catch {
        throw new AtticCryptoError('could not open this file');
      }
    },

    /** The PIN, peppered: HMAC-SHA256(pepper_v, pin) as hex — what bcrypt hashes. */
    pinDigest(pin, v = version) {
      const k = pepper.get(Number(v));
      if (!k) throw new AtticCryptoError('no pepper for this version');
      return crypto.createHmac('sha256', k).update(String(pin), 'utf8').digest('hex');
    },
  });
}

function fieldAad(householdId, documentId, key) {
  return Buffer.from(`thinggeek-attic|field|${householdId}|${documentId}|${key}`, 'utf8');
}
function fileAad(householdId, fileId) {
  return Buffer.from(`thinggeek-attic|file|${householdId}|${fileId}`, 'utf8');
}

/** The on-disk magic, for audits and tests ("is anything on disk NOT sealed?"). */
export const SEALED_FILE_MAGIC = FILE_MAGIC;

export default { loadVaultKeyring, AtticCryptoError, SEALED_FILE_MAGIC };
