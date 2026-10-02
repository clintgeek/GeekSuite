/**
 * Unlocking the Attic: set-up (trust on first use), PIN storage and
 * backoff, passkeys (WebAuthn stubbed — the challenge, user-binding and
 * one-use rules are ours and tested here; the library's crypto is its own),
 * the session cookie, lock, and the kids' accounts.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import * as realWebAuthn from '@simplewebauthn/server';
import atticModule from '@geeksuite/schemas/thinggeek/attic';
import vaultSessionModule from '@geeksuite/schemas/thinggeek/vaultSession';
import { buildHarness, auth, newId, CHEF_ID, HEATHER_ID } from './helpers/harness.js';
import { weakPin } from '../src/routes/atticVaultRoutes.js';

const { atticStarterTypeDoc, ATTIC_STARTER_TYPES, VAULT_MAX_MS } = atticModule;
const { VAULT_COOKIE } = vaultSessionModule;

const PIN = '481516';

/** A WebAuthn stand-in: "verified" iff the response echoes the expected challenge (and asks for UV). */
function stubWebAuthn() {
  const calls = [];
  let n = 0;
  return {
    calls,
    async generateRegistrationOptions(opts) {
      calls.push(['regOptions', opts]);
      n += 1;
      return { challenge: `reg-challenge-${n}`, rp: { id: opts.rpID }, user: { name: opts.userName } };
    },
    async verifyRegistrationResponse(opts) {
      calls.push(['regVerify', opts]);
      const ok = opts.response.challenge === opts.expectedChallenge && opts.requireUserVerification === true;
      return ok
        ? { verified: true, registrationInfo: { credential: { id: opts.response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] }, credentialDeviceType: 'multiDevice', credentialBackedUp: true } }
        : { verified: false };
    },
    async generateAuthenticationOptions(opts) {
      calls.push(['authOptions', opts]);
      n += 1;
      return { challenge: `auth-challenge-${n}`, allowCredentials: opts.allowCredentials };
    },
    async verifyAuthenticationResponse(opts) {
      calls.push(['authVerify', opts]);
      const ok = opts.response.challenge === opts.expectedChallenge && opts.requireUserVerification === true && opts.credential.id === opts.response.id;
      return ok ? { verified: true, authenticationInfo: { newCounter: 7 } } : { verified: false };
    },
  };
}

let h;
let clock;
let wa;
const now = () => new Date(clock);
const advance = (ms) => { clock += ms; };

function docSeed() {
  const type = { _id: newId(), ...atticStarterTypeDoc(ATTIC_STARTER_TYPES.find((t) => t.key === 'passport'), 'default') };
  const doc = { _id: newId(), householdId: 'default', typeId: type._id, personIds: [], title: 'P', fields: {}, secrets: {}, files: [], links: [], deletedAt: null };
  return { type, doc };
}

let seed;
beforeEach(() => {
  clock = Date.UTC(2026, 9, 2, 12);
  wa = stubWebAuthn();
  seed = docSeed();
  h = buildHarness({ now, webauthn: wa, attic: { AtticDocumentType: [seed.type], AtticDocument: [seed.doc] } });
});
afterEach(() => h.cleanup());

const vaultCookie = (res) => {
  const raw = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${VAULT_COOKIE}=`));
  return raw ? raw.split(';')[0] : null;
};
const post = (path, body, who = 'chef', cookie = '') => request(h.app).post(`/api/attic/vault${path}`).set(auth(who)).set('Cookie', cookie).send(body);
const status = (who = 'chef', cookie = '') => request(h.app).get('/api/attic/vault').set(auth(who)).set('Cookie', cookie);
const attic = (who, cookie) => request(h.app).get(`/api/attic/documents/${seed.doc._id}/identifiers/number`).set(auth(who)).set('Cookie', cookie);

async function setUpPin(who = 'chef', pin = PIN) {
  const res = await post('/pin', { pin }, who);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return vaultCookie(res);
}

describe('set-up', () => {
  test('first visit: not set up; a PIN can be set without unlocking, and it opens the vault with a strict cookie', async () => {
    const s = await status();
    assert.equal(s.status, 200);
    assert.equal(s.headers['cache-control'], 'no-store, max-age=0');
    assert.deepEqual([s.body.setUp, s.body.pin, s.body.unlocked], [false, false, false]);
    const res = await post('/pin', { pin: PIN });
    assert.equal(res.status, 201);
    const raw = res.headers['set-cookie'].find((c) => c.startsWith(`${VAULT_COOKIE}=`));
    assert.match(raw, /HttpOnly/);
    assert.match(raw, /SameSite=Strict/);
    assert.match(raw, /Path=\//);
    assert.match(raw, new RegExp(`Max-Age=${VAULT_MAX_MS / 1000}`));
    assert.equal(res.body.unlocked, true);
    assert.equal(res.body.method, 'setup');
    assert.equal((await attic('chef', vaultCookie(res))).status, 200);
    assert.deepEqual(h.attic.AtticAudit.docs.map((a) => a.action), ['pin-set', 'unlock']);
    assert.equal(h.attic.AtticAudit.docs[1].method, 'setup');
  });

  test('once set up, changing the PIN or adding a passkey needs an unlocked vault', async () => {
    const cookie = await setUpPin();
    assert.equal((await post('/pin', { pin: '902114' })).status, 423);
    assert.equal((await post('/passkeys/options', {})).status, 423);
    assert.equal((await post('/pin', { pin: '902114' }, 'chef', cookie)).status, 200);
  });

  test('weak or malformed PINs are refused', async () => {
    for (const pin of ['000000', '123456', '987654', '890123', '12345', '1234567890123', 'abcdef']) {
      assert.equal((await post('/pin', { pin })).status, 400, pin);
    }
    assert.equal(weakPin('481516'), false);
  });

  test('the PIN is stored peppered: bcrypt of an HMAC — the hash alone does not confirm the PIN', async () => {
    await setUpPin();
    const cred = h.attic.VaultCredential.docs[0];
    assert.match(cred.pinHash, /^\$2[aby]\$/);
    assert.ok(!JSON.stringify(cred).includes(PIN));
    assert.equal(await bcrypt.compare(PIN, cred.pinHash), false, 'needs the pepper (from the vault key)');
    assert.equal(await bcrypt.compare(h.keyring.pinDigest(PIN), cred.pinHash), true);
    assert.equal(cred.pinPepperVersion, 1);
  });
});

describe('PIN unlock and backoff', () => {
  beforeEach(async () => {
    await setUpPin();
  });

  test('the right PIN opens a new session; a wrong one does not', async () => {
    const wrong = await post('/unlock/pin', { pin: '111222' });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.code, 'PIN_WRONG');
    assert.equal(vaultCookie(wrong), null);
    const ok = await post('/unlock/pin', { pin: PIN });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.method, 'pin');
    assert.equal((await attic('chef', vaultCookie(ok))).status, 200);
  });

  test('4 free failures, then a 30 s lockout that doubles; even the right PIN waits; success resets', async () => {
    for (let i = 1; i <= 4; i += 1) {
      const r = await post('/unlock/pin', { pin: '111222' });
      assert.equal(r.status, 422);
      assert.equal(r.body.attemptsLeft, 4 - i);
      advance(2000); // past the in-flight hold
    }
    const fifth = await post('/unlock/pin', { pin: '111222' });
    assert.equal(fifth.status, 422);
    assert.equal(new Date(fifth.body.retryAt).getTime() - clock, 30000);
    const blocked = await post('/unlock/pin', { pin: PIN });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'PIN_LOCKED');
    assert.ok((await status()).body.pinRetryAt, 'status shows when to retry');
    advance(30001);
    const sixth = await post('/unlock/pin', { pin: '111222' });
    assert.equal(new Date(sixth.body.retryAt).getTime() - clock, 60000, 'doubled');
    advance(60001);
    assert.equal((await post('/unlock/pin', { pin: PIN })).status, 200);
    assert.equal(h.attic.VaultCredential.docs[0].pinFailures, 0);
    assert.equal(h.attic.AtticAudit.docs.filter((a) => a.action === 'unlock-failed').length, 6);
  });

  test('parallel guesses cannot race the gate: one is checked, the rest wait', async () => {
    const results = await Promise.all(['111222', '222333', '333444', '444555'].map((pin) => post('/unlock/pin', { pin })));
    const codes = results.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 422).length, 1);
    assert.equal(codes.filter((c) => c === 429).length, 3);
    assert.equal(h.attic.VaultCredential.docs[0].pinFailures, 1);
  });

  test("the kids' accounts are refused at every vault endpoint", async () => {
    for (const [method, path, body] of [['get', ''], ['post', '/pin', { pin: PIN }], ['post', '/unlock/pin', { pin: PIN }], ['post', '/passkeys/options', {}], ['post', '/unlock/passkey/options', {}], ['post', '/ping', {}], ['post', '/lock', {}]]) {
      const r = await request(h.app)[method](`/api/attic/vault${path}`).set(auth('kid')).send(body);
      assert.equal(r.status, 403, path);
      assert.equal(r.body.code, 'NOT_A_MEMBER');
      assert.equal(vaultCookie(r), null);
    }
    assert.equal(h.attic.VaultCredential.docs.some((c) => c.userId !== CHEF_ID), false);
  });

  test('a member with no PIN yet (Heather) is told so, not locked out', async () => {
    const r = await post('/unlock/pin', { pin: PIN }, 'heather');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'NO_PIN');
  });
});

describe('the session', () => {
  test('lock deletes it at once and clears the cookie; ping pushes the idle deadline', async () => {
    const cookie = await setUpPin();
    advance(5 * 60000);
    const ping = await post('/ping', {}, 'chef', cookie);
    assert.equal(ping.status, 200);
    assert.equal(new Date(ping.body.idleExpiresAt).getTime(), clock + 10 * 60000);
    const lock = await post('/lock', {}, 'chef', cookie);
    assert.equal(lock.status, 200);
    assert.match(lock.headers['set-cookie'].join(';'), new RegExp(`${VAULT_COOKIE}=;`));
    assert.equal(h.attic.VaultSession.docs.length, 0);
    assert.equal((await attic('chef', cookie)).status, 423);
    assert.equal(h.attic.AtticAudit.docs.at(-1).action, 'lock');
  });

  test('idle for 10 minutes → locked; 60 minutes after the unlock → locked even while active', async () => {
    const cookie = await setUpPin();
    advance(10 * 60000 + 1);
    assert.equal((await attic('chef', cookie)).status, 423);
    const again = vaultCookie(await post('/unlock/pin', { pin: PIN }));
    for (let i = 0; i < 7; i += 1) {
      advance(9 * 60000);
      const r = await attic('chef', again);
      assert.equal(r.status, i < 6 ? 200 : 423, `minute ${(i + 1) * 9}`);
    }
  });

  test("a member's cookie does nothing for another member", async () => {
    const cookie = await setUpPin();
    const s = await status('heather', cookie);
    assert.equal(s.body.unlocked, false);
    assert.equal((await attic('heather', cookie)).status, 423);
    assert.equal((await post('/ping', {}, 'heather', cookie)).status, 423);
  });

  test('a fresh unlock replaces the old session of the same browser', async () => {
    const first = await setUpPin();
    const second = vaultCookie(await post('/unlock/pin', { pin: PIN }, 'chef', first));
    assert.equal(h.attic.VaultSession.docs.length, 1);
    assert.equal((await attic('chef', first)).status, 423);
    assert.equal((await attic('chef', second)).status, 200);
  });
});

describe('passkeys', () => {
  async function registerPasskey(who = 'chef', cookie = '', id = 'cred-chef-phone') {
    const opts = await post('/passkeys/options', {}, who, cookie);
    assert.equal(opts.status, 200, JSON.stringify(opts.body));
    const res = await post('/passkeys', { response: { id, challenge: opts.body.options.challenge }, label: 'S25+' }, who, cookie);
    return res;
  }

  test('set-up with a passkey: registration options ask for user verification; the passkey is stored; the vault opens', async () => {
    const res = await registerPasskey();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.unlocked, true);
    assert.equal(res.body.passkeys.length, 1);
    const [, regOpts] = wa.calls.find((c) => c[0] === 'regOptions');
    assert.equal(regOpts.authenticatorSelection.userVerification, 'required');
    assert.equal(regOpts.rpID, 'thinggeek.test');
    const [, verify] = wa.calls.find((c) => c[0] === 'regVerify');
    assert.equal(verify.requireUserVerification, true);
    assert.deepEqual(verify.expectedOrigin, ['https://thinggeek.test']);
    assert.equal(h.attic.VaultCredential.docs[0].passkeys[0].credentialId, 'cred-chef-phone');
    assert.equal(h.attic.VaultCredential.docs[0].passkeys[0].label, 'S25+');
  });

  test('unlock with the passkey: the challenge is one-use and expires; the counter updates', async () => {
    await registerPasskey();
    const opts = await post('/unlock/passkey/options', {});
    assert.equal(opts.status, 200);
    assert.deepEqual(opts.body.options.allowCredentials.map((c) => c.id), ['cred-chef-phone']);
    const response = { id: 'cred-chef-phone', challenge: opts.body.options.challenge };
    const ok = await post('/unlock/passkey', { response });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.method, 'passkey');
    assert.equal(h.attic.VaultCredential.docs[0].passkeys[0].counter, 7);
    const replay = await post('/unlock/passkey', { response });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.code, 'CHALLENGE_EXPIRED');
    const late = await post('/unlock/passkey/options', {});
    advance(5 * 60000 + 1);
    assert.equal((await post('/unlock/passkey', { response: { id: 'cred-chef-phone', challenge: late.body.options.challenge } })).status, 400);
  });

  test("another member's passkey cannot unlock this member's vault", async () => {
    await registerPasskey('chef');
    const heather = await setUpPin('heather', '730261');
    await registerPasskey('heather', heather, 'cred-heather');
    const opts = await post('/unlock/passkey/options', {}, 'chef');
    const r = await post('/unlock/passkey', { response: { id: 'cred-heather', challenge: opts.body.options.challenge } }, 'chef');
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSKEY_REJECTED');
    assert.equal(h.attic.AtticAudit.docs.at(-1).action, 'unlock-failed');
    assert.equal(h.attic.AtticAudit.docs.at(-1).userId, CHEF_ID);
    void HEATHER_ID;
  });

  test('a passkey success clears the PIN backoff; the only credential cannot be removed', async () => {
    const reg = await registerPasskey();
    const cookie = vaultCookie(reg);
    assert.equal((await request(h.app).delete(`/api/attic/vault/passkeys/${reg.body.passkeys[0].id}`).set(auth('chef')).set('Cookie', cookie)).status, 409);
    await post('/pin', { pin: PIN }, 'chef', cookie);
    for (let i = 0; i < 6; i += 1) {
      await post('/unlock/pin', { pin: '111222' });
      advance(120000);
    }
    assert.ok(h.attic.VaultCredential.docs[0].pinFailures >= 5);
    const opts = await post('/unlock/passkey/options', {});
    await post('/unlock/passkey', { response: { id: 'cred-chef-phone', challenge: opts.body.options.challenge } });
    assert.equal(h.attic.VaultCredential.docs[0].pinFailures, 0);
  });

  test('the real library builds our registration options (RP ID, UV required, no attestation)', async () => {
    const real = buildHarness({ webauthn: realWebAuthn });
    const r = await request(real.app).post('/api/attic/vault/passkeys/options').set(auth('chef')).send({});
    assert.equal(r.status, 200);
    assert.equal(r.body.options.rp.id, 'thinggeek.test');
    assert.equal(r.body.options.authenticatorSelection.userVerification, 'required');
    assert.equal(r.body.options.attestation, 'none');
    assert.match(r.body.options.challenge, /^[A-Za-z0-9_-]{20,}$/);
    real.cleanup();
  });
});
