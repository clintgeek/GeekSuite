import logger from '../lib/logger.js';
import { FALLBACK_ORDER } from '../config/aiProviders.js';

/**
 * RotationManager — provider-level cooldowns, in memory, and nothing else.
 *
 * What this used to be, and why none of it survived Phase 1 (2026-09-07):
 *
 *   - **`PROVIDER_LIMITS`** — a hand-typed RPM/TPM/RPD table. It was the third
 *     copy of those numbers in the repo (`aiService.rateLimits` and
 *     `aiDirectorService`'s free-tier seed were the others) and the three
 *     disagreed: Groq's TPM was 6000, 12000 and 18000 depending on which file
 *     you read. Quotas are now learned from the `x-ratelimit-*` headers of
 *     real calls — see `aiService.recordObservedLimits` and
 *     `aiCatalogDiscovery.parseRateLimitHeaders`. Nothing declares them.
 *
 *   - **`ROTATION_PRIORITY`** — a fourth restatement of the provider order.
 *     `config/aiProviders.js` already carries `rotationPosition` per provider
 *     and exports `FALLBACK_ORDER`; that is now the one list.
 *
 *   - **`rotation-state.json`** — per-container file state under `logs/`,
 *     holding remaining-request counters that reset on every deploy and were
 *     never shared between containers. It was written on *every* call
 *     (`persistState` after each `recordUsage`) to hold numbers the request
 *     path could read off a response header for free. Both the file and the
 *     `recordUsage` / `updateRemaining` / `resetProviderUsage` methods that
 *     fed it are gone; `AIFreeTier.observed` is where remaining quota lives
 *     now, per row rather than per provider.
 *
 * What is left is the one thing that was load-bearing and correct: a
 * short-lived, in-process cooldown so a provider that just answered 429 is
 * skipped by the *next* rotation pick. Minutes long, per provider, and
 * deliberately not persisted — a restart clearing it is the right failure
 * direction.
 *
 * Row-level free-tier health (`AIFreeTier.health`, R130) is the other half and
 * is orthogonal: this class knows nothing about models.
 */
export default class RotationManager {
  /**
   * @param {{order?: string[]}} [opts] `order` is injectable for tests only;
   *   production always uses `FALLBACK_ORDER`.
   */
  constructor(opts = {}) {
    const order = Array.isArray(opts.order) ? opts.order : FALLBACK_ORDER;
    this.order = [...order];
    /** provider id → epoch ms at which it may be picked again. */
    this.cooldowns = new Map();
    this.activeProvider = this.order[0] || null;
  }

  markProviderCooling(provider, cooldownMs) {
    const until = Date.now() + Math.max(0, Number(cooldownMs) || 0);
    this.cooldowns.set(provider, until);
    logger.debug({ provider, until }, '[RotationManager] provider cooling');
    return until;
  }

  isCooling(provider, now = Date.now()) {
    const until = this.cooldowns.get(provider);
    if (until === undefined) return false;
    if (now > until) {
      this.cooldowns.delete(provider);
      return false;
    }
    return true;
  }

  /** The rotation order, from `config/aiProviders.js`. Never a local copy. */
  getPriorityList() {
    return [...this.order];
  }

  /**
   * The first provider in rotation order that is not cooling. When every one
   * is cooling, the head of the list is returned with `fallback: true` —
   * answering with a long shot beats answering nothing, and the caller's own
   * walk will move on if it fails.
   */
  selectProvider(now = Date.now()) {
    for (const provider of this.order) {
      if (this.isCooling(provider, now)) continue;
      this.activeProvider = provider;
      return { provider };
    }
    return { provider: this.order[0] || null, fallback: true };
  }

  /** For the status surfaces. No file, no counters — just what is asleep. */
  getState(now = Date.now()) {
    const cooling = {};
    for (const [provider, until] of this.cooldowns) {
      if (until > now) cooling[provider] = new Date(until).toISOString();
    }
    return { activeProvider: this.activeProvider, cooling, order: this.getPriorityList() };
  }
}
