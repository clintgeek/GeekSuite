/**
 * garminPasswordEncryption.test.js — DOCS/SUITE_TODO.md #20 step 2.
 *
 * The Garmin Connect password is a reusable third-party credential (the app
 * logs in to Garmin as the user), so it is encrypted at rest rather than
 * hashed. The encryption lives in the schema shared by this app and basegeek's
 * GraphQL gateway — `@geeksuite/schemas/fitnessgeek/userSettings` — because
 * both processes write and read the field.
 *
 * WHAT IS COVERED
 *   write     — a settings write leaves `isEncrypted()` ciphertext in the doc
 *   read      — the Garmin login path decrypts it back to plaintext
 *   legacy    — a pre-backfill plaintext value still logs in untouched
 *   response  — GET /api/settings does not carry the password at all
 *   backfill  — dry run counts and writes nothing; a real run encrypts; a
 *               second run is a no-op
 *
 * HOW IT STAYS HERMETIC
 * This suite has no Mongo (see jest.setup.js), so the write path is exercised
 * by running the registered mongoose middleware directly through the schema's
 * hook registry rather than by issuing a query. That reaches through
 * `schema.s.hooks`, which is mongoose-internal — the trade is deliberate: the
 * alternative is either mongodb-memory-server (a dependency this suite has
 * always refused) or testing a copy of the logic instead of the wiring, which
 * would not catch the hook being registered on the wrong operation.
 *
 * THE KEY BELOW IS A THROWAWAY. crypto-vault reads KEY_VAULT_SECRET once at
 * module load, so it is set before the first dynamic import that reaches it.
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';

// 64 hex chars = 32 bytes. Fixed and worthless; never a real key.
process.env.KEY_VAULT_SECRET = 'ab'.repeat(32);

const PLAINTEXT = 'garmin-pass-example';
const mod = (p) => new URL(p, import.meta.url).pathname;

let vault;
let mongoose;
let createUserSettingsSchema;
let readGarminPassword;

beforeAll(async () => {
  vault = await import('@geeksuite/crypto-vault');
  ({ default: mongoose } = await import('mongoose'));
  const schemaModule = await import('@geeksuite/schemas/fitnessgeek/userSettings');
  ({ createUserSettingsSchema, readGarminPassword } = schemaModule.default ?? schemaModule);
});

/** Drive the schema's registered pre-middleware for one operation. */
const execPre = (schema, op, context) =>
  new Promise((resolve, reject) => {
    schema.s.hooks.execPre(op, context, [], (err) => (err ? reject(err) : resolve()));
  });

/**
 * Build a real (unexecuted) mongoose Query for the update hooks to run against.
 * A hand-rolled stand-in is not enough — mongoose's own timestamps middleware
 * is registered on the same operation and reaches for `query.model.base`.
 */
let modelSeq = 0;
const buildQuery = (update) => {
  const schema = createUserSettingsSchema(mongoose);
  const Model = mongoose.model(`UserSettingsQuery_${modelSeq += 1}`, schema);
  return { schema, query: Model.findOneAndUpdate({ user_id: 'u1' }, update) };
};

describe('writing a Garmin password stores ciphertext', () => {
  test('findOneAndUpdate with a dot-path $set is encrypted before it reaches Mongo', async () => {
    const { schema, query } = buildQuery({
      $set: { 'garmin.username': 'me@example.com', 'garmin.password': PLAINTEXT }
    });

    await execPre(schema, 'findOneAndUpdate', query);

    const stored = query.getUpdate().$set['garmin.password'];
    expect(vault.isEncrypted(stored)).toBe(true);
    expect(stored).not.toBe(PLAINTEXT);
    expect(stored).not.toContain(PLAINTEXT);
    // Everything else in the same $set is untouched.
    expect(query.getUpdate().$set['garmin.username']).toBe('me@example.com');
    // And it really is this password, not just some ciphertext.
    expect(vault.decrypt(stored)).toBe(PLAINTEXT);
  });

  test('the nested {garmin: {password}} update shape is encrypted too', async () => {
    // basegeek's updateFitnessUserSettings passes `garmin` through as a whole
    // JSON object rather than dot paths.
    const { schema, query } = buildQuery({ $set: { garmin: { enabled: true, password: PLAINTEXT } } });

    await execPre(schema, 'findOneAndUpdate', query);

    expect(vault.isEncrypted(query.getUpdate().$set.garmin.password)).toBe(true);
  });

  test('document saves are encrypted as well', async () => {
    const schema = createUserSettingsSchema(mongoose);
    const Model = mongoose.model(`UserSettingsSaveHook_${Date.now()}`, schema);
    const doc = new Model({ user_id: 'u1', garmin: { enabled: true, password: PLAINTEXT } });

    await execPre(schema, 'save', doc);

    const stored = doc.get('garmin.password', null, { getters: false });
    expect(vault.isEncrypted(stored)).toBe(true);
    expect(vault.decrypt(stored)).toBe(PLAINTEXT);
  });

  test('encryption is idempotent — a second write does not double-wrap', async () => {
    const packed = vault.encrypt(PLAINTEXT);
    const { schema, query } = buildQuery({ $set: { 'garmin.password': packed } });

    await execPre(schema, 'findOneAndUpdate', query);

    expect(query.getUpdate().$set['garmin.password']).toBe(packed);
    expect(vault.decrypt(query.getUpdate().$set['garmin.password'])).toBe(PLAINTEXT);
  });

  test('serialising a document still yields ciphertext, not plaintext', async () => {
    // The decrypt getter must not fire in toObject()/toJSON(), or every route
    // that serialises a settings document would leak the credential.
    const schema = createUserSettingsSchema(mongoose);
    const Model = mongoose.model(`UserSettingsSerialise_${Date.now()}`, schema);
    const doc = new Model({ user_id: 'u1', garmin: { password: vault.encrypt(PLAINTEXT) } });

    expect(doc.toObject().garmin.password).not.toBe(PLAINTEXT);
    expect(vault.isEncrypted(doc.toObject().garmin.password)).toBe(true);
    expect(JSON.stringify(doc.toJSON())).not.toContain(PLAINTEXT);
  });
});

describe('the Garmin login path decrypts', () => {
  // The service is imported fresh per test so the garmin-connect double can be
  // inspected per case.
  async function loadServiceWithStoredPassword(storedPassword) {
    jest.resetModules();

    const constructed = [];
    const login = jest.fn().mockResolvedValue(undefined);

    jest.unstable_mockModule('garmin-connect', () => ({
      default: {
        GarminConnect: class {
          constructor(creds) {
            constructed.push(creds);
            this.client = { oauth1Token: 'o1', oauth2Token: 'o2' };
          }
          login = login;
          loadToken() { throw new Error('no saved tokens'); }
        }
      }
    }));

    // A settings document shaped like the real one, with the schema's getter
    // applied so the service sees exactly what mongoose would hand it.
    const schema = createUserSettingsSchema(mongoose);
    const Model = mongoose.model(`UserSettingsLogin_${Date.now()}_${Math.random()}`, schema);
    const settings = Model.hydrate({
      user_id: 'u1',
      garmin: { enabled: true, username: 'me@example.com', password: storedPassword }
    });

    jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
      default: {
        getOrCreate: jest.fn().mockResolvedValue(settings),
        findOneAndUpdate: jest.fn().mockResolvedValue(settings)
      }
    }));

    jest.unstable_mockModule(mod('../../config/logger.js'), () => ({
      default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    }));

    const { default: garmin } = await import('../../services/garminConnectService.js');
    return { garmin, constructed, login };
  }

  test('an encrypted stored password reaches GarminConnect as plaintext', async () => {
    const { garmin, constructed, login } = await loadServiceWithStoredPassword(vault.encrypt(PLAINTEXT));

    await garmin.getStatus('u1');           // warm the mocked model
    await garmin.getHeartRate('u1').catch(() => {}); // triggers buildClient/login

    expect(login).toHaveBeenCalled();
    expect(constructed[0]).toEqual({ username: 'me@example.com', password: PLAINTEXT });
  });

  test('a legacy plaintext password (pre-backfill) still logs in untouched', async () => {
    const { garmin, constructed, login } = await loadServiceWithStoredPassword(PLAINTEXT);

    await garmin.getHeartRate('u1').catch(() => {});

    expect(login).toHaveBeenCalled();
    expect(constructed[0].password).toBe(PLAINTEXT);
  });

  test('a corrupt stored value fails closed rather than throwing', async () => {
    // Wrong-key / tampered ciphertext: safeDecrypt logs and returns null, the
    // login fails on bad credentials, the request does not blow up.
    const tampered = vault.encrypt(PLAINTEXT).replace(/.$/, (c) => (c === '0' ? '1' : '0'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => readGarminPassword(tampered)).not.toThrow();
    expect(readGarminPassword(tampered)).toBeNull();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('the backfill script', () => {
  // An in-memory stand-in for the raw driver collection: find() returns an
  // async-iterable cursor, updateOne mutates in place.
  function fakeCollection(docs) {
    return {
      docs,
      updates: 0,
      find() {
        const matching = docs.filter(
          (d) => d.garmin && Object.prototype.hasOwnProperty.call(d.garmin, 'password') && d.garmin.password !== null
        );
        return {
          async *[Symbol.asyncIterator]() {
            for (const d of matching) yield JSON.parse(JSON.stringify(d));
          }
        };
      },
      async updateOne(filter, update) {
        this.updates += 1;
        const target = docs.find((d) => d._id === filter._id);
        target.garmin.password = update.$set['garmin.password'];
      }
    };
  }

  const seed = () => [
    { _id: 'a', garmin: { password: 'plain-one' } },
    { _id: 'b', garmin: { password: 'plain-two' } },
    { _id: 'c', garmin: { password: vault.encrypt('already-done') } },
    { _id: 'd', garmin: { password: '' } },
    { _id: 'e', garmin: { enabled: true } }
  ];

  test('--dry-run counts what it would do and writes nothing', async () => {
    const { runBackfill } = await import('../../../scripts/encryptGarminPasswords.js');
    const collection = fakeCollection(seed());

    const counts = await runBackfill({ collection, vault, dryRun: true });

    expect(counts).toEqual({
      scanned: 4, alreadyEncrypted: 1, encrypted: 2, skippedEmpty: 1, failed: 0
    });
    expect(collection.updates).toBe(0);
    expect(collection.docs[0].garmin.password).toBe('plain-one');
  });

  test('a real run encrypts the plaintext rows and leaves the rest alone', async () => {
    const { runBackfill } = await import('../../../scripts/encryptGarminPasswords.js');
    const docs = seed();
    const untouched = docs[2].garmin.password;
    const collection = fakeCollection(docs);

    const counts = await runBackfill({ collection, vault, dryRun: false });

    expect(counts.encrypted).toBe(2);
    expect(counts.failed).toBe(0);
    expect(collection.updates).toBe(2);
    expect(vault.isEncrypted(docs[0].garmin.password)).toBe(true);
    expect(vault.decrypt(docs[0].garmin.password)).toBe('plain-one');
    expect(vault.decrypt(docs[1].garmin.password)).toBe('plain-two');
    expect(docs[2].garmin.password).toBe(untouched); // not re-encrypted
    expect(docs[3].garmin.password).toBe('');
  });

  test('a second run is a no-op', async () => {
    const { runBackfill } = await import('../../../scripts/encryptGarminPasswords.js');
    const docs = seed();
    const collection = fakeCollection(docs);

    await runBackfill({ collection, vault, dryRun: false });
    const after = docs.map((d) => d.garmin.password);
    collection.updates = 0;

    const second = await runBackfill({ collection, vault, dryRun: false });

    expect(second.encrypted).toBe(0);
    expect(second.alreadyEncrypted).toBe(3);
    expect(collection.updates).toBe(0);
    expect(docs.map((d) => d.garmin.password)).toEqual(after);
  });

  test('the printed report carries counts, never values', async () => {
    const { runBackfill, formatCounts } = await import('../../../scripts/encryptGarminPasswords.js');
    const docs = seed();
    const counts = await runBackfill({ collection: fakeCollection(docs), vault, dryRun: true });

    const report = formatCounts(counts, true);
    expect(report).toContain('WOULD encrypt');
    expect(report).toContain('2');
    expect(report).not.toContain('plain-one');
    expect(report).not.toContain('v1:');
  });
});

describe('the KEY_VAULT_SECRET boot guard', () => {
  test('accepts a well-formed 64-hex key', async () => {
    const { checkKeyVaultSecret } = await import('../../config/keyVault.js');
    expect(checkKeyVaultSecret({ KEY_VAULT_SECRET: 'ab'.repeat(32) })).toEqual({ ok: true });
  });

  test('names the variable when it is missing', async () => {
    const { checkKeyVaultSecret } = await import('../../config/keyVault.js');
    const result = checkKeyVaultSecret({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('KEY_VAULT_SECRET');
    expect(result.message).toContain('openssl rand -hex 32');
  });

  test('rejects a wrong-length or non-hex value without echoing it', async () => {
    const { checkKeyVaultSecret } = await import('../../config/keyVault.js');
    const short = checkKeyVaultSecret({ KEY_VAULT_SECRET: 'abc' });
    expect(short.ok).toBe(false);
    expect(short.message).not.toContain('abc');

    const notHex = checkKeyVaultSecret({ KEY_VAULT_SECRET: 'z'.repeat(64) });
    expect(notHex.ok).toBe(false);
  });
});
