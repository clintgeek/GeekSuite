# @geeksuite/crypto-vault

AES-256-GCM symmetric encryption for secrets that need to be stored at rest
(API keys, OAuth tokens, third-party credentials). Promoted out of basegeek's
internal `cryptoVault.js` (September 2026) so other backends can encrypt
sensitive fields — starting with fitnessgeek's Garmin password — without
depending on basegeek's api package.

## Env var

`KEY_VAULT_SECRET` — 64 hex characters (32 bytes), read once at module load.
The process throws immediately on import if it is missing or the wrong
length. Generate one with:

```
openssl rand -hex 32
```

Never commit a value for this variable, and never print or log it. Every
process that calls `encrypt()`/`decrypt()` on the same data must be
configured with the **same** value — a mismatched key fails every decrypt
with an auth-tag error, not a helpful message pointing at the key.

## API

```js
const { encrypt, decrypt, isEncrypted, safeDecrypt } = require('@geeksuite/crypto-vault');
// or: import { encrypt, decrypt, isEncrypted, safeDecrypt } from '@geeksuite/crypto-vault';

const packed = encrypt('plaintext-secret');
decrypt(packed);        // => 'plaintext-secret', throws on tamper/wrong key
isEncrypted(packed);    // => true — cheap format check, no decryption
safeDecrypt(packed);    // => plaintext, or null (never throws) — logs via console.warn
```

## Packed ciphertext format

```
v1:{iv_hex}:{tag_hex}:{ciphertext_hex}
```

- `v1` — format version prefix. `decrypt()` rejects any other value.
- `iv_hex` — 12-byte (96-bit) random IV, hex-encoded, fresh per `encrypt()` call.
- `tag_hex` — the GCM authentication tag, hex-encoded.
- `ciphertext_hex` — the AES-256-GCM ciphertext, hex-encoded.

Cipher: `aes-256-gcm`. Key: the raw 32 bytes decoded from `KEY_VAULT_SECRET`
(no KDF — the env var *is* the key material).

This format is **byte-for-byte identical** to basegeek's original
`cryptoVault.js`. Ciphertext already written to MongoDB by the old module
decrypts unchanged through this package — no migration, no re-encryption.
Do not change the delimiter, field order, or encoding without a version bump
and a migration path for existing rows.

## Consuming from CJS and ESM

This package is plain CommonJS (no `"type": "module"`), the same shape as
`@geeksuite/logger` and `@geeksuite/schemas`:

- An ESM backend (e.g. basegeek's api) does `import { encrypt } from '@geeksuite/crypto-vault'` —
  Node's CJS/ESM interop statically reads the named `module.exports` in `src/index.js`.
- A CJS backend (e.g. fitnessgeek) does `const { encrypt } = require('@geeksuite/crypto-vault')` directly.

A `"type": "module"` package cannot be `require()`-d by a CJS caller at all,
which is why this stays CommonJS even though most callers today are ESM.

## Tests

`pnpm test` (vitest) covers the encrypt/decrypt round trip, tamper detection
(flipped ciphertext byte fails auth), wrong-key failure, `isEncrypted()`, and
a format-stability check against a fixture ciphertext captured from the
pre-promotion basegeek module — proving this package can still decrypt data
encrypted before the promotion.
