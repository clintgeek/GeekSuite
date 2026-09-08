/**
 * aiRoute — the one place that knows where a request should go.
 *
 * Before this file, `callAI` accepted eleven ways of saying the same three
 * things and resolved them in ~150 lines of interacting branches, each of
 * which could switch the others off: `tier: free | rotation | specific`,
 * `provider: 'free'`, `provider: 'basegeek-app'`, `freeOnly`, `useAppConfig`,
 * `autoRotate`, `noFallback`, a `<provider>/<model>` pin, a bare catalog id,
 * and the three `basegeek-*` aliases. Reading it told you what happened; it
 * did not tell you what was *meant*, and the two had drifted (a `tier: free`
 * caller could be answered, and billed, by a paid default model — R130).
 *
 * There are two destinations, and this module's whole job is to say which:
 *
 *   `auto` — health-ranked free rows, then the governed paid fallback if the
 *            app's routing row permits it. What almost everything wants.
 *   `pin`  — this provider, this model, because the caller means it.
 *
 * Everything else in the old vocabulary is a *hint* on one of those two, and
 * the hints are kept on the Route so a log line can still say which legacy
 * field produced the decision. That matters more than it sounds: the legacy
 * spellings live in deployed consumers and in `/openai/v1`'s alias table, so
 * they are not going away this phase — they are just no longer *decisions*.
 *
 * Everything here is pure. No models, no I/O, no clock. `resolveRoute` is
 * handed the app's routing row rather than fetching it, which is what lets
 * `aiRoute.test.js` be a table over every legacy input instead of a fixture
 * farm. The one import is `callerIdentity`, which is pure by the same rule
 * (`models/AIAppConfig.js` imports from it, so it must stay dependency-free).
 *
 * The pieces that are *not* pure — is this pinned row cooling, has today's
 * spend passed the cap — live on `aiService`, and call into the pure verdict
 * functions at the bottom of this file for the arithmetic.
 */

import { declaresAppRouting } from './callerIdentity.js';

/** @typedef {{
 *   mode: 'auto' | 'pin',
 *   provider: string | null,
 *   model: string | null,
 *   allowPaid: boolean,
 *   singleAttempt: boolean,
 *   sticky: null | { key: string },
 *   hints: string[]
 * }} Route */

/**
 * Routing-row `tier` values that predate `auto` and mean it.
 *
 * `free` meant "free rows only" and `rotation` meant "every provider on its
 * own default model". `auto` is now both — it walks the free rows and reaches
 * for paid only with `allowPaid` and the governor's blessing — so both legacy
 * values resolve here, with a hint, and are rewritten to `auto` the next time
 * the row is saved. No data migration: a tolerant read is cheaper than a
 * migration that has to be right the first time (see the Rollback section of
 * DOCS/AIGEEK_FRONT_DOOR.md — rows are read tolerantly in *both* directions,
 * so the Phase 2 revert is a `git revert` and nothing else).
 */
export const LEGACY_AUTO_TIERS = Object.freeze(['free', 'rotation']);

/** The three virtual model ids `/openai/v1` offers instead of a real one. */
export const ROUTING_ALIASES = Object.freeze({
  FREE: 'basegeek-free',
  ROTATION: 'basegeek-rotation',
  APP: 'basegeek-app'
});

/** The `provider` value that has always meant "any free row". */
export const FREE_PROVIDER_ALIAS = 'free';

/** Default paid-budget caps, in dollars. Overridden by env; see `paidCaps`. */
export const PAID_PER_DAY_USD_DEFAULT = 0.05;
export const PAID_PER_CALL_USD_DEFAULT = 0.01;

/** A Route with every field present, so no reader has to guard for absence. */
function route({ mode, provider = null, model = null, allowPaid = false, singleAttempt = false, sticky = null, hints = [] }) {
  return {
    mode,
    provider,
    model,
    allowPaid: !!allowPaid,
    singleAttempt: !!singleAttempt,
    sticky: sticky ?? null,
    // Deduped and ordered: hints go into log lines, and a line that says
    // `free` twice reads like two decisions were made.
    hints: [...new Set(hints.filter(Boolean))]
  };
}

/**
 * The pin the *request* is naming, if it is naming one. Pure, and separated
 * out because `callAI` uses it to decide whether it has to pay for the app
 * routing row lookup at all: a pin does not read the row.
 *
 * Three spellings, all of which predate this file:
 *
 *   1. `model: '<provider>/<id>'` where the prefix is a roster provider. Only
 *      split on a known prefix — real model ids contain slashes
 *      (`meta-llama/llama-3.1-70b`) and splitting those would invent a
 *      provider called `meta-llama`.
 *   2. `provider: '<roster id>'` with a `model`. The plain form.
 *   3. `provider: '<roster id>'` with no model. The table in
 *      DOCS/AIGEEK_FRONT_DOOR.md §1 is silent on this one, so: it is a pin,
 *      on that provider's `defaultModel` — which §2 keeps in
 *      `aiProviders.js` for exactly this and for the probe. A caller that
 *      names a backend and no model still named a backend, and answering it
 *      from a *different* vendor is the F-22 bug ("a model pin is a
 *      promise") wearing a different hat. `model: null` here means "the
 *      provider's default", resolved by the caller that has `this.providers`.
 *
 * `free`, `basegeek-free`, `basegeek-rotation` and `basegeek-app` are not
 * roster ids, so they fall through to `resolveRoute`'s alias handling.
 *
 * @param {object} config       the raw `callAI` config (never defaulted)
 * @param {string[]} providerIds  the live roster
 * @returns {{provider: string, model: string|null}|null}
 */
export function explicitPinOf(config = {}, providerIds = []) {
  const roster = new Set(providerIds);
  const model = typeof config?.model === 'string' ? config.model : null;
  const provider = typeof config?.provider === 'string' ? config.provider : null;

  if (model && model.includes('/')) {
    const slashIdx = model.indexOf('/');
    const prefix = model.slice(0, slashIdx);
    const rest = model.slice(slashIdx + 1);
    if (roster.has(prefix) && rest) return { provider: prefix, model: rest };
  }

  if (provider && roster.has(provider)) {
    return { provider, model: model || null };
  }

  return null;
}

/** Does anything in the request say "free rows only, never money"? */
function signalsFree(config = {}) {
  return (
    config.freeOnly === true ||
    config.provider === FREE_PROVIDER_ALIAS ||
    config.model === ROUTING_ALIASES.FREE
  );
}

/** Does anything in the request say "the old all-provider rotation"? */
function signalsRotation(config = {}) {
  return config.autoRotate === true || config.model === ROUTING_ALIASES.ROTATION;
}

/** Does anything in the request say "route me by my app's row"? */
function signalsAppRouting(config = {}) {
  return (
    config.useAppConfig === true ||
    config.provider === ROUTING_ALIASES.APP ||
    config.model === ROUTING_ALIASES.APP
  );
}

/**
 * The sticky key for one conversation, or null when this call is not sticky.
 *
 * The key is `${app}:${conversationId}` and not the conversation id alone: two
 * apps may legitimately use the same id space (a story id and a note id are
 * both mongo ids), and a pick is per app's routing row.
 */
function stickyFor(appRow, appId, conversationId) {
  if (appRow?.sticky !== 'per-conversation') return null;
  if (!conversationId) return null;
  return { key: `${appId || 'unknown'}:${conversationId}` };
}

/**
 * resolveRoute — the whole routing decision, as one pure function.
 *
 * Order matters and is deliberate:
 *
 *   1. An explicit pin in the request wins. A caller that named a backend
 *      gets that backend; the app's row does not get to overrule it (F-22).
 *   2. `tier: 'specific'` on the row is a pin too — the row *is* the caller's
 *      standing instruction, and the aiGeek UI is where it was typed.
 *   3. Everything else is `auto`, and the only questions left are whether it
 *      may spend money (`allowPaid`, from the row, vetoed by any free
 *      signal), whether it is sticky, and how many attempts it gets.
 *
 * @param {object} config              raw `callAI` config
 * @param {object|null} appRow         the `AIAppConfig` row, already fetched
 * @param {object} ctx
 * @param {string[]} ctx.providerIds   the live roster
 * @param {string} ctx.appId           resolved app id (credential, never body)
 * @param {string|null} [ctx.conversationId]
 * @param {boolean} [ctx.ignorePins]   skip both pin branches — see `degradePin`
 * @returns {Route}
 */
export function resolveRoute(config = {}, appRow = null, ctx = {}) {
  const cfg = config || {};
  const providerIds = ctx.providerIds || [];
  const appId = ctx.appId || 'unknown';
  const conversationId = ctx.conversationId ?? cfg.conversationId ?? null;

  const hints = [];
  // `noFallback` is the one legacy field that is orthogonal to everything
  // else: it says "one attempt", on either mode. `/openai/v1` sets it on
  // every request that names a concrete model, which is what keeps a pin a
  // promise instead of a preference (F-22).
  const singleAttempt = cfg.noFallback === true;
  if (singleAttempt) hints.push('no_fallback');

  // ── 1. the request's own pin ───────────────────────────────────────────
  const pin = ctx.ignorePins ? null : explicitPinOf(cfg, providerIds);
  if (pin) {
    return route({
      mode: 'pin',
      provider: pin.provider,
      model: pin.model,
      allowPaid: false,
      singleAttempt,
      hints: [...hints, 'explicit_pin']
    });
  }

  // ── the legacy vocabulary, recorded as hints ───────────────────────────
  const free = signalsFree(cfg);
  if (free) hints.push('free');
  if (signalsRotation(cfg)) hints.push('rotation');
  if (signalsAppRouting(cfg)) hints.push('app_config');

  // ── 2. the row's own pin ───────────────────────────────────────────────
  if (!ctx.ignorePins && appRow?.tier === 'specific' && appRow.provider && appRow.model) {
    return route({
      mode: 'pin',
      provider: appRow.provider,
      model: appRow.model,
      allowPaid: false,
      singleAttempt,
      hints: [...hints, 'app_pin']
    });
  }

  // ── 3. auto ────────────────────────────────────────────────────────────
  if (appRow && LEGACY_AUTO_TIERS.includes(appRow.tier)) {
    // Recorded, not corrected: rewriting the row here would make a read a
    // write, and a read that writes is a read you cannot do on a replica.
    // The rewrite happens on the row's next save (GraphQL saveAIAppConfig).
    hints.push(`legacy_tier:${appRow.tier}`);
  }
  if (!appRow) hints.push('no_row');

  return route({
    mode: 'auto',
    // A free signal is a veto on money, whatever the row says: a caller that
    // asked for the free tier by name did not ask to be billed.
    allowPaid: appRow?.allowPaid === true && !free,
    singleAttempt,
    sticky: stickyFor(appRow, appId, conversationId),
    hints
  });
}

/**
 * A pin the catalog says cannot serve this request, downgraded.
 *
 * §1: "A `pin` whose row is cooling or absent from the catalog degrades to
 * `auto` with a logged `pin_unavailable` hint **unless** `singleAttempt`."
 * The unless is the whole point — a caller that said `noFallback` asked to
 * fail as itself, and turning that into a different model's answer at HTTP 200
 * is F-22 again.
 *
 * The *decision* that a pin is unusable needs the catalog and so lives on
 * `aiService.pinIsUsable`; this is only the resulting Route.
 *
 * @param {Route} pinned
 * @param {object} config
 * @param {object|null} appRow
 * @param {object} ctx
 * @returns {Route}
 */
export function degradePin(pinned, config = {}, appRow = null, ctx = {}) {
  const auto = resolveRoute(
    // Keep everything except the pin (including `noFallback`, which is still
    // the caller's attempt budget even when its pin has gone).
    config,
    appRow,
    // `ignorePins` rather than blanking `config.provider`/`config.model`,
    // because a pin can come from *either* the request or the routing row and
    // blanking only the request's would have let a `tier: 'specific'` row
    // re-derive the very pin we just found unusable — an infinite "degrade to
    // itself". One flag turns both branches off.
    { ...ctx, ignorePins: true }
  );
  return route({
    ...auto,
    hints: [...pinned.hints, ...auto.hints, 'pin_unavailable']
  });
}

/**
 * The body→config translation `/api/ai/call` and `/api/ai/parse-json` have
 * always shared, moved here so the routes stop naming the legacy vocabulary.
 *
 * It returns a patch rather than mutating, but it reproduces the original
 * order exactly, including the part that reads oddly: the app-routing branch's
 * `else if` was evaluated *after* the free branch had already set
 * `config.freeOnly`, so a body that said `freeOnly` never picked up the
 * legacy app-routing auto-trigger. That is behaviour two deployed consumers
 * rely on, so it is reproduced rather than tidied.
 *
 * What it does *not* do is touch identity. `appName`, `userId` and `feature`
 * are stamped from the credential by the route, after this, and nothing here
 * reads them except `declaresAppRouting`, which uses them only as a switch.
 *
 * @param {object} body    the request body
 * @param {object} config  `body.config`, already shallow-copied by the route
 * @returns {object} fields to assign onto `config` (`provider: undefined`
 *                   means "delete it")
 */
export function legacyRoutingSwitches(body = {}, config = {}) {
  const b = body || {};
  const working = { ...(config || {}) };
  const patch = {};

  if (working.provider === FREE_PROVIDER_ALIAS || working.freeOnly || b.freeOnly) {
    patch.freeOnly = true;
    patch.provider = undefined;
    working.freeOnly = true;
    working.provider = undefined;
  }

  if (working.provider === ROUTING_ALIASES.APP || working.useAppConfig || b.useAppConfig) {
    patch.useAppConfig = true;
    patch.provider = undefined;
  } else if (!working.provider && !working.freeOnly && declaresAppRouting(b)) {
    // The legacy auto-trigger: a body that names an app and no provider wants
    // app routing. Only ever a *switch* — the row looked up is the resolved
    // caller's, whatever name the body used.
    patch.useAppConfig = true;
  }

  return patch;
}

/**
 * The `tier` a routing row should be stored as, given what a save is asking
 * for. `free` and `rotation` are accepted (deployed UIs still send them) and
 * become `auto`; anything unrecognised becomes `auto` too, because `auto` is
 * the mode that always has somewhere to go.
 *
 * @param {*} tier
 * @returns {'auto'|'specific'}
 */
export function normalizeTier(tier) {
  if (tier === 'specific') return 'specific';
  return 'auto';
}

// ─────────────────────────────────────────────────────────────────────────────
// The governor (§3)
//
// Two layers, deliberately, so a bug in ours cannot drain the balance: the
// hard ceiling is the credit limit on the OpenRouter key, which Chef sets in
// their dashboard and this code cannot see and does not try to. What follows
// is the soft one.
// ─────────────────────────────────────────────────────────────────────────────

/** Read a non-negative dollar amount from env, falling back on anything odd. */
function envUsd(raw, fallback, name) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    // Not thrown: a typo'd budget must not take the AI subsystem down, and a
    // NaN cap would compare false against everything and spend without limit.
    // eslint-disable-next-line no-console
    console.warn(`[aiRoute] ignoring invalid ${name}="${raw}" — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

let cachedCaps = null;

/**
 * The paid caps, read from env once per process (§3: "Env, read once").
 * `reset` is the test hook; nothing in production passes it.
 *
 * @param {object} [env]
 * @param {{reset?: boolean}} [opts]
 * @returns {{perDayUsd: number, perCallUsd: number}}
 */
export function paidCaps(env = process.env, { reset = false } = {}) {
  if (cachedCaps && !reset) return cachedCaps;
  cachedCaps = Object.freeze({
    perDayUsd: envUsd(env.AI_PAID_PER_DAY_USD, PAID_PER_DAY_USD_DEFAULT, 'AI_PAID_PER_DAY_USD'),
    perCallUsd: envUsd(env.AI_PAID_PER_CALL_USD, PAID_PER_CALL_USD_DEFAULT, 'AI_PAID_PER_CALL_USD')
  });
  return cachedCaps;
}

/**
 * May this paid attempt happen? Pure arithmetic over three numbers.
 *
 * Both conditions from §3, and both are `<=` rather than `<`: a cap is an
 * amount you are allowed to spend, not an amount you must stay under.
 *
 *   - `spentTodayUsd + estimateUsd <= perDayUsd`
 *   - `estimateUsd <= perCallUsd`
 *
 * An unknown estimate (no `AIPricing` row for a paid model) is refused rather
 * than treated as zero. "We do not know what this costs" is not a reason to
 * buy it, and a paid-fallback row with no price is a catalog bug the status
 * page should show, not a blank cheque.
 *
 * @param {{spentTodayUsd: number, estimateUsd: number|null, caps: {perDayUsd: number, perCallUsd: number}}} input
 * @returns {{ok: boolean, reason: string|null, estimateUsd: number|null, spentTodayUsd: number}}
 */
export function paidBudgetVerdict({ spentTodayUsd = 0, estimateUsd = null, caps = paidCaps() } = {}) {
  // A ledger we could not read arrives here as `Infinity` (see
  // `aiService.spentTodayUsd`). Refused, not defaulted to zero: "we do not
  // know what today has cost" is not permission to spend more.
  const spent = Number(spentTodayUsd);
  if (!Number.isFinite(spent)) {
    return { ok: false, reason: 'paid_ledger_unreadable', estimateUsd: null, spentTodayUsd: spent };
  }

  // `estimateUsd == null` is checked before the numeric coercion on purpose:
  // `Number(null)` is 0, and a nullish estimate silently becoming a free one
  // is the exact confusion this governor exists to prevent.
  const estimate = estimateUsd != null && Number.isFinite(Number(estimateUsd))
    ? Number(estimateUsd)
    : null;

  if (estimate === null) {
    return { ok: false, reason: 'paid_estimate_unknown', estimateUsd: null, spentTodayUsd: spent };
  }
  if (estimate > caps.perCallUsd) {
    return { ok: false, reason: 'paid_budget_per_call', estimateUsd: estimate, spentTodayUsd: spent };
  }
  if (spent + estimate > caps.perDayUsd) {
    return { ok: false, reason: 'paid_budget_per_day', estimateUsd: estimate, spentTodayUsd: spent };
  }
  return { ok: true, reason: null, estimateUsd: estimate, spentTodayUsd: spent };
}

/**
 * What one paid call is expected to cost, from `AIPricing`'s per-1,000,000
 * figures and the tokens we are about to send and allow back.
 *
 * The output side uses `maxTokens` rather than a guess at the real length,
 * which over-estimates on purpose: the governor's job is to refuse the call
 * that *could* be expensive, and a cap that is only breached in hindsight is
 * not a cap.
 *
 * @param {{inputPrice?: number, outputPrice?: number}|null} pricing per 1M USD
 * @param {number} promptTokens
 * @param {number} maxTokens
 * @returns {number|null} dollars, or null when nothing is priced
 */
export function estimatePaidCostUsd(pricing, promptTokens = 0, maxTokens = 0) {
  if (!pricing) return null;
  const input = Number(pricing.inputPrice);
  const output = Number(pricing.outputPrice);
  const haveInput = Number.isFinite(input);
  const haveOutput = Number.isFinite(output);
  if (!haveInput && !haveOutput) return null;
  const cost =
    (Math.max(0, promptTokens) / 1e6) * (haveInput ? input : 0) +
    (Math.max(0, maxTokens) / 1e6) * (haveOutput ? output : 0);
  return Number.isFinite(cost) ? cost : null;
}

export default {
  LEGACY_AUTO_TIERS,
  ROUTING_ALIASES,
  FREE_PROVIDER_ALIAS,
  PAID_PER_DAY_USD_DEFAULT,
  PAID_PER_CALL_USD_DEFAULT,
  explicitPinOf,
  resolveRoute,
  degradePin,
  legacyRoutingSwitches,
  normalizeTier,
  paidCaps,
  paidBudgetVerdict,
  estimatePaidCostUsd
};
