/**
 * KEY_VAULT_SECRET boot guard.
 *
 * The Garmin Connect password is encrypted at rest with
 * `@geeksuite/crypto-vault` (see the `garmin.password` section of
 * `@geeksuite/schemas/fitnessgeek/userSettings`). Garmin is a core feature of
 * this app — the dashboard's Garmin summary card, the activity page, sleep and
 * the weight sync all hang off it — and without the key every settings save
 * that carries a password is refused and every stored password reads back as
 * null. That is a broken app pretending to work, so this fails at BOOT rather
 * than degrading quietly.
 *
 * Deliberately NOT done by importing crypto-vault at the top of the module
 * graph: crypto-vault throws a raw `Error` at require time, which surfaces as
 * an unhelpful stack from deep inside the schemas package. This produces one
 * clear line naming the variable and how to generate it, and exits 1.
 *
 * The check is a plain format check — it never logs, echoes or hashes the
 * value itself.
 */

const VAR = 'KEY_VAULT_SECRET';
const EXPECTED_HEX_CHARS = 64; // 32 bytes

/**
 * @param {object} [env] - defaults to process.env; injectable for tests.
 * @returns {{ ok: boolean, message?: string }}
 */
export function checkKeyVaultSecret(env = process.env) {
  const value = env[VAR];

  if (!value) {
    return {
      ok: false,
      message:
        `${VAR} is not set. FitnessGeek encrypts the Garmin Connect password at ` +
        'rest and cannot start without it. Generate one with `openssl rand -hex 32` ' +
        'and use the SAME value basegeek is configured with — both processes read ' +
        'and write this field. See apps/fitnessgeek/DOCS/CONTEXT.md.'
    };
  }

  if (value.length !== EXPECTED_HEX_CHARS || !/^[0-9a-fA-F]+$/.test(value)) {
    return {
      ok: false,
      message:
        `${VAR} must be exactly ${EXPECTED_HEX_CHARS} hexadecimal characters ` +
        `(32 bytes); got ${value.length} characters. Generate one with ` +
        '`openssl rand -hex 32`. See apps/fitnessgeek/DOCS/CONTEXT.md.'
    };
  }

  return { ok: true };
}

/**
 * Fail-fast wrapper for the boot sequence. Logs one clear line and exits 1.
 *
 * @param {object} logger - anything with `.error(msg)`.
 * @param {object} [env]
 */
export function assertKeyVaultSecret(logger, env = process.env) {
  const result = checkKeyVaultSecret(env);
  if (result.ok) return;

  logger.error(result.message);
  process.exit(1);
}

export default assertKeyVaultSecret;
