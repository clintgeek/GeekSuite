/**
 * Unlocking the Attic (DOCS/THINGGEEK_PLAN.md "The Attic" → "Unlock"):
 * a passkey (fingerprint / face on the phone — WebAuthn, user verification
 * REQUIRED) with a PIN fallback, enforced here, server-side. An unlock opens
 * a vault session: a random token in an HttpOnly, Secure, SameSite=Strict,
 * host-only cookie; only its sha256 is stored, bound to this user and
 * household, 10 min idle / 60 min absolute (vaultSession.js).
 *
 *   GET    /api/attic/vault                        status (set up? unlocked? until when?)
 *   POST   /api/attic/vault/pin                    set / change the PIN   (set-up or unlocked)
 *   POST   /api/attic/vault/unlock/pin             unlock with the PIN     (backoff)
 *   POST   /api/attic/vault/passkeys/options       registration options    (set-up or unlocked)
 *   POST   /api/attic/vault/passkeys               register a passkey      (set-up or unlocked)
 *   DELETE /api/attic/vault/passkeys/:id           remove one              (unlocked)
 *   POST   /api/attic/vault/unlock/passkey/options assertion options
 *   POST   /api/attic/vault/unlock/passkey         unlock with a passkey
 *   POST   /api/attic/vault/ping                   activity: push the idle deadline (unlocked)
 *   POST   /api/attic/vault/lock                   lock now (deletes the session)
 *
 * SET-UP is trust-on-first-use behind the SSO session and the member gate:
 * while a member has NO credential at all, the first PIN or passkey may be
 * enrolled without unlocking (and opens a session). After that, adding or
 * changing a credential needs an unlocked vault.
 *
 * PIN: 6–12 digits, stored as bcrypt( HMAC-SHA256(pepper, pin) ) — the
 * pepper is derived from the vault key, so a database dump alone cannot be
 * brute-forced. Backoff (attic.js pinLockoutMs): 4 free failures, then
 * 30 s doubling to 1 h; a success resets it. Every attempt first CLAIMS the
 * gate atomically (pinNextAttemptAt), so parallel guesses can't race it.
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as simpleWebAuthn from '@simplewebauthn/server';
import atticModule from '@geeksuite/schemas/thinggeek/attic';
import vaultSessionModule from '@geeksuite/schemas/thinggeek/vaultSession';
import { auditEntry } from '../middleware/attic.js';

const { PIN_MIN, PIN_MAX, PIN_FREE_FAILURES, pinLockoutMs, VAULT_IDLE_MS, VAULT_MAX_MS, VAULT_COOKIE, atticBounds } = atticModule;
const { newVaultToken, hashVaultToken, readVaultToken, findVaultSession, vaultSessionRow } = vaultSessionModule;

const CHALLENGE_MS = 5 * 60 * 1000;
/** While one PIN attempt is being checked, no other can start. */
const ATTEMPT_HOLD_MS = 1500;
const DEFAULT_PIN_COST = 12;

const PIN_RE = new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`);

/** Refuse the PINs a shoulder-surfer tries first: one repeated digit, or a straight run. */
export function weakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => (d - digits[i] + 10) % 10);
  return steps.every((s) => s === 1) || steps.every((s) => s === 9);
}

const pinBody = z.object({ pin: z.string().regex(PIN_RE) }).strict();
const passkeyBody = z.object({ response: z.record(z.string(), z.unknown()), label: z.string().trim().max(60).optional() }).strict();
const assertionBody = z.object({ response: z.record(z.string(), z.unknown()) }).strict();

const hasCredential = (cred) => Boolean(cred && (cred.pinHash || (cred.passkeys ?? []).length));

export function webAuthnConfig(env = process.env) {
  const rpID = env.ATTIC_RP_ID || 'thinggeek.clintgeek.com';
  const origins = (env.ATTIC_ORIGINS || `https://${rpID}`).split(',').map((s) => s.trim()).filter(Boolean);
  return { rpID, origins, rpName: 'ThingGeek' };
}

/**
 * @param {object} deps
 * @param {Function[]} deps.memberGate
 * @param {Function} deps.requireKey
 * @param {Function} deps.requireVault
 * @param {object} deps.keyring
 * @param {object} deps.models     { VaultCredential, VaultSession, AtticAudit }
 * @param {object} [deps.webauthn] the @simplewebauthn/server functions (tests inject a stub)
 * @param {object} [deps.config]   { rpID, origins, rpName }
 * @param {number} [deps.pinCost]  bcrypt cost (tests lower it)
 * @param {() => Date} [deps.now]
 */
export function createAtticVaultRoutes({
  memberGate,
  requireKey,
  requireVault,
  keyring,
  models,
  webauthn = simpleWebAuthn,
  config = webAuthnConfig(),
  pinCost = DEFAULT_PIN_COST,
  now = () => new Date(),
}) {
  const { VaultCredential, VaultSession, AtticAudit } = models;
  const router = express.Router();
  const base = [...memberGate, requireKey];
  const audit = (req, entry) => AtticAudit.create(auditEntry(req, now, entry));
  const scope = (req) => ({ userId: String(req.user.id), householdId: req.householdId });

  const loadCred = (req) => VaultCredential.findOne(scope(req)).lean();

  async function ensureCred(req) {
    const existing = await loadCred(req);
    if (existing) return existing;
    try {
      await VaultCredential.create({ ...scope(req), passkeys: [], pinFailures: 0 });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
    return loadCred(req);
  }

  const peek = (req, touch = false) =>
    findVaultSession(VaultSession, { token: readVaultToken(req.cookies), ...scope(req), now: now(), touch });

  function cookieOptions(req) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || req.secure,
      sameSite: 'strict',
      path: '/',
      maxAge: VAULT_MAX_MS,
    };
  }

  async function statusOf(req, sessionArg) {
    const cred = await loadCred(req);
    const session = sessionArg === undefined ? await peek(req) : sessionArg;
    const t = now().getTime();
    const retry = cred?.pinNextAttemptAt ? new Date(cred.pinNextAttemptAt) : null;
    return {
      available: true,
      setUp: hasCredential(cred),
      pin: Boolean(cred?.pinHash),
      passkeys: (cred?.passkeys ?? []).map((p) => ({ id: String(p._id), label: p.label || 'Passkey', createdAt: p.createdAt ?? null, lastUsedAt: p.lastUsedAt ?? null })),
      unlocked: Boolean(session),
      method: session?.method ?? null,
      idleExpiresAt: session?.idleExpiresAt ?? null,
      expiresAt: session?.expiresAt ?? null,
      pinRetryAt: retry && retry.getTime() > t && pinLockoutMs(cred.pinFailures) > 0 ? retry : null,
      idleMs: VAULT_IDLE_MS,
      maxMs: VAULT_MAX_MS,
      pinLength: { min: PIN_MIN, max: PIN_MAX },
    };
  }

  /** A new session for this user; the request's old one (if any) is replaced. */
  async function openSession(req, res, method) {
    const old = readVaultToken(req.cookies);
    if (old) await VaultSession.deleteOne({ tokenHash: hashVaultToken(old), userId: String(req.user.id) });
    const token = newVaultToken();
    const at = now();
    await VaultSession.create(vaultSessionRow({ token, ...scope(req), method, now: at }));
    res.cookie(VAULT_COOKIE, token, cookieOptions(req));
    await audit(req, { action: 'unlock', method });
    return findVaultSession(VaultSession, { token, ...scope(req), now: at, touch: false });
  }

  /** Enrolling needs set-up (no credential yet) or an unlocked vault. → { cred, setup } or null */
  async function enrollContext(req) {
    const cred = await ensureCred(req);
    if (!hasCredential(cred)) return { cred, setup: true };
    const session = await peek(req, true);
    return session ? { cred, setup: false } : null;
  }

  const locked = (res) => res.status(423).json({ code: 'VAULT_LOCKED', message: 'Unlock the Attic first.' });

  /** Take the pending challenge if it matches the purpose and is fresh; one use only. */
  async function consumeChallenge(req, purpose) {
    const row = await VaultCredential.findOne({ ...scope(req), 'challenge.purpose': purpose, 'challenge.expiresAt': { $gt: now() } }).lean();
    if (!row?.challenge?.value) return null;
    // Clear it only if it is still the same challenge: two racing answers can't both use it.
    const taken = await VaultCredential.updateOne(
      { ...scope(req), 'challenge.value': row.challenge.value },
      { $set: { challenge: { value: null, purpose: null, expiresAt: null } } },
    );
    return taken?.matchedCount ? { value: row.challenge.value, cred: row } : null;
  }

  async function storeChallenge(req, purpose, value) {
    await VaultCredential.updateOne(scope(req), { $set: { challenge: { value, purpose, expiresAt: new Date(now().getTime() + CHALLENGE_MS) } } });
  }

  router.get('/vault', ...base, async (req, res, next) => {
    try {
      return res.json(await statusOf(req));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/vault/ping', ...base, requireVault, async (req, res, next) => {
    try {
      return res.json(await statusOf(req, req.vault));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/vault/lock', ...memberGate, async (req, res, next) => {
    try {
      const token = readVaultToken(req.cookies);
      let removed = 0;
      if (token) removed = (await VaultSession.deleteOne({ tokenHash: hashVaultToken(token), userId: String(req.user.id) }))?.deletedCount ?? 0;
      res.clearCookie(VAULT_COOKIE, { ...cookieOptions(req), maxAge: undefined });
      if (removed) await audit(req, { action: 'lock' });
      return res.json({ unlocked: false });
    } catch (err) {
      return next(err);
    }
  });

  // ── PIN ────────────────────────────────────────────────────────────────────

  router.post('/vault/pin', ...base, async (req, res, next) => {
    try {
      const parsed = pinBody.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', message: `A PIN is ${PIN_MIN}–${PIN_MAX} digits.` });
      if (weakPin(parsed.data.pin)) return res.status(400).json({ code: 'PIN_TOO_SIMPLE', message: 'Pick a PIN that isn’t one repeated digit or a straight run.' });
      const ctx = await enrollContext(req);
      if (!ctx) return locked(res);
      const pinHash = await bcrypt.hash(keyring.pinDigest(parsed.data.pin), pinCost);
      await VaultCredential.updateOne(scope(req), {
        $set: { pinHash, pinPepperVersion: keyring.version, pinSetAt: now(), pinFailures: 0, pinNextAttemptAt: null },
      });
      await audit(req, { action: 'pin-set' });
      const session = ctx.setup ? await openSession(req, res, 'setup') : undefined;
      return res.status(ctx.setup ? 201 : 200).json(await statusOf(req, session));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/vault/unlock/pin', ...base, async (req, res, next) => {
    try {
      const parsed = pinBody.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', message: `A PIN is ${PIN_MIN}–${PIN_MAX} digits.` });
      const t = now();
      // Claim the gate: only when no lockout or other attempt is running.
      const cred = await VaultCredential.findOneAndUpdate(
        { ...scope(req), pinHash: { $ne: null }, $or: [{ pinNextAttemptAt: null }, { pinNextAttemptAt: { $lte: t } }] },
        { $set: { pinNextAttemptAt: new Date(t.getTime() + ATTEMPT_HOLD_MS) } },
        { new: true },
      ).lean();
      if (!cred) {
        const current = await loadCred(req);
        if (!current?.pinHash) return res.status(409).json({ code: 'NO_PIN', message: 'No PIN is set for the Attic yet.' });
        return res.status(429).json({ code: 'PIN_LOCKED', message: 'Too many wrong PINs. Wait, or use your fingerprint.', retryAt: current.pinNextAttemptAt });
      }
      const ok = await bcrypt.compare(keyring.pinDigest(parsed.data.pin, cred.pinPepperVersion ?? keyring.version), cred.pinHash);
      if (!ok) {
        const failures = (cred.pinFailures ?? 0) + 1;
        const lockMs = pinLockoutMs(failures);
        const retryAt = lockMs ? new Date(now().getTime() + lockMs) : null;
        await VaultCredential.updateOne(scope(req), { $set: { pinFailures: failures, pinNextAttemptAt: retryAt } });
        await audit(req, { action: 'unlock-failed', method: 'pin' });
        return res.status(422).json({
          code: 'PIN_WRONG',
          message: lockMs ? 'Wrong PIN. The PIN is paused for a while.' : 'Wrong PIN.',
          retryAt,
          attemptsLeft: Math.max(0, PIN_FREE_FAILURES - failures),
        });
      }
      await VaultCredential.updateOne(scope(req), { $set: { pinFailures: 0, pinNextAttemptAt: null } });
      const session = await openSession(req, res, 'pin');
      return res.json(await statusOf(req, session));
    } catch (err) {
      return next(err);
    }
  });

  // ── Passkeys ───────────────────────────────────────────────────────────────

  router.post('/vault/passkeys/options', ...base, async (req, res, next) => {
    try {
      const ctx = await enrollContext(req);
      if (!ctx) return locked(res);
      if ((ctx.cred.passkeys ?? []).length >= atticBounds.passkeysPerUser.max) {
        return res.status(409).json({ code: 'LIMIT_REACHED', message: 'That’s as many passkeys as the Attic keeps.' });
      }
      const name = String(req.user.username || req.user.email || req.user.id);
      const options = await webauthn.generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpID,
        userName: name,
        userDisplayName: name,
        userID: new TextEncoder().encode(String(req.user.id)),
        attestationType: 'none',
        excludeCredentials: (ctx.cred.passkeys ?? []).map((p) => ({ id: p.credentialId, transports: p.transports ?? [] })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        timeout: 120000,
      });
      await storeChallenge(req, 'register', options.challenge);
      return res.json({ options });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/vault/passkeys', ...base, async (req, res, next) => {
    try {
      const parsed = passkeyBody.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Send the passkey response.' });
      const ctx = await enrollContext(req);
      if (!ctx) return locked(res);
      const challenge = await consumeChallenge(req, 'register');
      if (!challenge) return res.status(400).json({ code: 'CHALLENGE_EXPIRED', message: 'That took too long. Try again.' });
      let verification;
      try {
        verification = await webauthn.verifyRegistrationResponse({
          response: parsed.data.response,
          expectedChallenge: challenge.value,
          expectedOrigin: config.origins,
          expectedRPID: config.rpID,
          requireUserVerification: true,
        });
      } catch {
        verification = null;
      }
      if (!verification?.verified || !verification.registrationInfo) {
        return res.status(400).json({ code: 'PASSKEY_REJECTED', message: 'That passkey could not be verified.' });
      }
      const info = verification.registrationInfo;
      const credentialId = String(info.credential.id);
      if ((challenge.cred.passkeys ?? []).some((p) => p.credentialId === credentialId)) {
        return res.status(409).json({ code: 'PASSKEY_EXISTS', message: 'That passkey is already registered.' });
      }
      const passkey = {
        credentialId,
        publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
        counter: info.credential.counter ?? 0,
        transports: info.credential.transports ?? parsed.data.response?.response?.transports ?? [],
        deviceType: info.credentialDeviceType ?? null,
        backedUp: Boolean(info.credentialBackedUp),
        label: parsed.data.label || 'This phone',
        createdAt: now(),
        lastUsedAt: null,
      };
      await VaultCredential.updateOne(scope(req), { $push: { passkeys: passkey } });
      await audit(req, { action: 'passkey-added' });
      const session = ctx.setup ? await openSession(req, res, 'setup') : undefined;
      return res.status(201).json(await statusOf(req, session));
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/vault/passkeys/:id', ...base, requireVault, async (req, res, next) => {
    try {
      const cred = await loadCred(req);
      const keep = (cred?.passkeys ?? []).filter((p) => String(p._id) !== String(req.params.id));
      if (!cred || keep.length === (cred.passkeys ?? []).length) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });
      if (!keep.length && !cred.pinHash) return res.status(409).json({ code: 'LAST_CREDENTIAL', message: 'Set a PIN before removing your only passkey.' });
      await VaultCredential.updateOne(scope(req), { $set: { passkeys: keep } });
      await audit(req, { action: 'passkey-removed' });
      return res.json(await statusOf(req, req.vault));
    } catch (err) {
      return next(err);
    }
  });

  router.post('/vault/unlock/passkey/options', ...base, async (req, res, next) => {
    try {
      const cred = await loadCred(req);
      if (!(cred?.passkeys ?? []).length) return res.status(409).json({ code: 'NO_PASSKEY', message: 'No passkey is registered for the Attic yet.' });
      const options = await webauthn.generateAuthenticationOptions({
        rpID: config.rpID,
        allowCredentials: cred.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports ?? [] })),
        userVerification: 'required',
        timeout: 120000,
      });
      await storeChallenge(req, 'unlock', options.challenge);
      return res.json({ options });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/vault/unlock/passkey', ...base, async (req, res, next) => {
    try {
      const parsed = assertionBody.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Send the passkey response.' });
      const challenge = await consumeChallenge(req, 'unlock');
      if (!challenge) return res.status(400).json({ code: 'CHALLENGE_EXPIRED', message: 'That took too long. Try again.' });
      // Only THIS user's passkeys: another member's credential id is unknown here.
      const passkey = (challenge.cred.passkeys ?? []).find((p) => p.credentialId === String(parsed.data.response.id ?? ''));
      let verification = null;
      if (passkey) {
        try {
          verification = await webauthn.verifyAuthenticationResponse({
            response: parsed.data.response,
            expectedChallenge: challenge.value,
            expectedOrigin: config.origins,
            expectedRPID: config.rpID,
            credential: {
              id: passkey.credentialId,
              publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
              counter: passkey.counter ?? 0,
              transports: passkey.transports ?? [],
            },
            requireUserVerification: true,
          });
        } catch {
          verification = null;
        }
      }
      if (!verification?.verified) {
        await audit(req, { action: 'unlock-failed', method: 'passkey' });
        return res.status(400).json({ code: 'PASSKEY_REJECTED', message: 'That passkey could not be verified.' });
      }
      const passkeys = challenge.cred.passkeys.map((p) =>
        p.credentialId === passkey.credentialId ? { ...p, counter: verification.authenticationInfo?.newCounter ?? p.counter, lastUsedAt: now() } : p,
      );
      // A passkey success also clears the PIN's backoff.
      await VaultCredential.updateOne(scope(req), { $set: { passkeys, pinFailures: 0, pinNextAttemptAt: null } });
      const session = await openSession(req, res, 'passkey');
      return res.json(await statusOf(req, session));
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default createAtticVaultRoutes;
