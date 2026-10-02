/**
 * The Attic's guards (DOCS/THINGGEEK_PLAN.md "The Attic"), in the order
 * every /api/attic route runs them:
 *
 *   noStore      → Cache-Control: no-store on EVERY answer (errors included):
 *                  nothing from the Attic may land in a browser cache, a
 *                  service-worker cache or a proxy.
 *   memberGate   → signed in + a household member (the kids' accounts: 403).
 *   requireKey   → the vault key loaded at boot; without it the Attic refuses
 *                  to serve (503 ATTIC_UNAVAILABLE) — never a plaintext path.
 *   requireVault → a live vault session belonging to THIS user, from the
 *                  HttpOnly `thinggeek_vault` cookie (423 VAULT_LOCKED). One
 *                  atomic check-and-touch: activity pushes the idle deadline.
 */
import vaultSessionModule from '@geeksuite/schemas/thinggeek/vaultSession';

const { readVaultToken, findVaultSession } = vaultSessionModule;

export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

export function createRequireKey(keyring) {
  return function requireKey(req, res, next) {
    if (keyring?.ok) return next();
    return res.status(503).json({
      code: 'ATTIC_UNAVAILABLE',
      message: 'The Attic is closed: this server has no vault key, and it never serves the Attic without one.',
    });
  };
}

export function createRequireVault({ VaultSession, now = () => new Date() }) {
  return async function requireVault(req, res, next) {
    try {
      const session = await findVaultSession(VaultSession, {
        token: readVaultToken(req.cookies),
        userId: req.user?.id,
        householdId: req.householdId,
        now: now(),
        touch: true,
      });
      if (!session) return res.status(423).json({ code: 'VAULT_LOCKED', message: 'The Attic is locked.' });
      req.vault = session;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Append one audit row: who, when, what — never a value. Fails the request if it can't be written. */
export function auditEntry(req, now, entry) {
  return {
    householdId: req.householdId,
    userId: String(req.user?.id),
    actorName: String(req.user?.username || req.user?.name || 'A member').slice(0, 120),
    at: now(),
    ...entry,
  };
}

export default { noStore, createRequireKey, createRequireVault, auditEntry };
