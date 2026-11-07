/**
 * authHardeningCaller.test.js — a JWT's `app` claim is attribution, not
 * identity. (Audit 2026-11-06, finding B3.)
 *
 * Login takes `app` from the request body (`routes/auth.js` login, refresh,
 * register) and signs it into the access token; the only check anywhere is
 * VALID_APPS membership. That is correct for what the claim is *for* — "which
 * app did this user sign into", which SSO and attribution need — and wrong for
 * what `resolveCaller` used to do with it: report it as a `verified` app
 * identity. Any user could log in with `app: 'storygeek'` and call aiGeek as
 * storygeek, inheriting storygeek's AIAppConfig row (allowPaid / paidFirst)
 * and spend.
 *
 * The rule now: only an API key (minted under the Q62/B1 gate) or an
 * in-process caller is a trusted app identity. A JWT caller keeps its claimed
 * appId for attribution, but `verified: false` and `trustedApp: false`.
 *
 * The routing half — refusing paid policy to an untrusted caller — lives in
 * files Track A owns (aiRoute / aiService / aiFeatureRunner). Those cases are
 * written below as `it.failing`: they pass *because* the behaviour is still
 * missing, and will turn red the moment it lands, at which point they must be
 * flipped to `it`. That is deliberate — a red flag that cannot be forgotten,
 * not a skip that passes quietly.
 */

import { describe, it, expect, jest } from '@jest/globals';

const { resolveCaller, internalCaller, UNATTRIBUTED } = await import('../services/callerIdentity.js');
const { generateToken } = await import('../services/authService.js');
const { verifyAccessToken } = await import('../middleware/auth.js');
const { resolveRoute } = await import('../services/aiRoute.js');
const { runFeatureCore, _resetCounters } = await import('../services/aiFeatureRunner.js');

/** What a real login with a chosen body `app` hands to resolveCaller. */
function reqForLogin(app) {
  const token = generateToken({ _id: 'user-1', username: 'u', email: 'u@example.test' }, app);
  const result = verifyAccessToken(token);
  if (!result.ok) throw new Error(`token did not verify: ${result.message}`);
  return { user: result.decoded };
}

const PAID_ROW = {
  appName: 'storygeek',
  enabled: true,
  tier: 'auto',
  allowPaid: true,
  paidFirst: true,
  paidProvider: 'openrouter',
  paidModel: 'openai/gpt-4.1-mini',
};

describe('B3 — resolveCaller: a JWT app claim is not a verified identity', () => {
  it('keeps the claimed app for attribution, but neither verified nor trusted', () => {
    const caller = resolveCaller({ user: { id: 'user-1', app: 'storygeek' } }, {});
    expect(caller).toMatchObject({
      appId: 'storygeek',
      userId: 'user-1',
      source: 'jwt',
      verified: false,
      trustedApp: false,
    });
  });

  it('a user who chose `app: storygeek` in the login body gets an untrusted storygeek caller', () => {
    const caller = resolveCaller(reqForLogin('storygeek'), { appName: 'storygeek' });
    expect(caller.appId).toBe('storygeek');
    expect(caller.trustedApp).toBe(false);
  });

  it('an API key and an in-process caller remain trusted app identities', () => {
    const keyCaller = resolveCaller({
      user: { id: 'apikey_x', app: 'storygeek', type: 'api_key' },
      apiKey: { appName: 'storygeek' },
    }, {});
    expect(keyCaller).toMatchObject({ appId: 'storygeek', verified: true, trustedApp: true });
    expect(internalCaller({ appId: 'notegeek' })).toMatchObject({ verified: true, trustedApp: true });
  });

  it('nothing unattributed is ever trusted', () => {
    expect(resolveCaller({}, {})).toMatchObject({ appId: UNATTRIBUTED, trustedApp: false });
    expect(resolveCaller({ user: { id: 'apikey_x', type: 'api_key' } }, {}))
      .toMatchObject({ appId: UNATTRIBUTED, trustedApp: false });
  });
});

// ───────────── routing half: pending Track A (see header) ─────────────────────

describe('B3 — an untrusted caller cannot obtain an app row\'s paid policy (pending Track A)', () => {
  it('resolveRoute grants no allowPaid / paidFirst when config.appTrusted is false', () => {
    const caller = resolveCaller(reqForLogin('storygeek'), {});
    const route = resolveRoute(
      { appName: caller.appId, appTrusted: caller.trustedApp },
      PAID_ROW,
      { providerIds: ['openrouter', 'groq'], appId: caller.appId }
    );
    expect(route.allowPaid).toBe(false);
    expect(route.paidFirst).toBeNull();
  });

  it('runFeatureCore does not consult the paid-first model for an untrusted caller', async () => {
    _resetCounters();
    const caller = resolveCaller(reqForLogin('storygeek'), {});
    const ai = {
      resolveNeedCandidates: jest.fn(async () => [{ provider: 'groq', modelId: 'free-model', why: [] }]),
      noteNeedFailure: jest.fn(),
      noteNeedSuccess: jest.fn(),
      paidFirstFor: jest.fn(async () => ({ provider: 'openrouter', model: 'openai/gpt-4.1-mini' })),
      callAI: jest.fn(async () => 'ok'),
      lastProviderInfo: {},
    };
    await runFeatureCore({
      app: caller.appId,
      appTrusted: caller.trustedApp,
      feature: 'gm',
      userId: caller.userId,
      system: 's',
      user: 'u',
      need: 'prose:deep',
      ai,
      timeoutMs: 1000,
    });
    expect(ai.paidFirstFor).not.toHaveBeenCalled();
    for (const [, cfg] of ai.callAI.mock.calls) {
      expect(cfg.paidOnly).not.toBe(true);
      expect(cfg.appTrusted).toBe(false);
    }
  });
});
