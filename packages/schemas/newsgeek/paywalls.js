/**
 * newsgeek paywalls — which publishers want a subscription before you can read.
 *
 * Two ways a story is "paywalled" for the reader's "Free to read" switch
 * (DOCS/NEWSGEEK_PLAN.md, Decisions: "Paywalls"):
 *   1. its SOURCE says so: `access.paywall` ∈ PAYWALLED_LEVELS (constants.js);
 *   2. it came through an AGGREGATOR (Google News) and its real publisher's
 *      domain is listed below. An aggregator source is free; what it points at
 *      may not be.
 * Metered counts as paywalled (Chef, 2026-10-10): a meter you have used up is
 * a wall.
 *
 * Matching is a domain SUFFIX on a label boundary: `obits.nwaonline.com`
 * matches `nwaonline.com`; `notreuters.com` does not match `reuters.com`.
 *
 * Evidence (checked 2026-10-10):
 * - hotsr.com, arkansasonline.com, theverge.com: the article pages' own markup
 *   says `isAccessibleForFree: false`, and they load Zephr (a paywall vendor).
 * - WEHCO Media owns the Democrat-Gazette (arkansasonline.com), the NWA
 *   Democrat-Gazette (nwaonline.com) and the Sentinel-Record (hotsr.com): one
 *   paywall stack.
 * - Gannett owns the Baxter Bulletin (baxterbulletin.com): metered.
 * - BBC: metered for US readers since 2025.
 * - malvern-online.com (Malvern Daily Record): Chef confirmed, 2026-10-10.
 *   Not detected: it rate-limits us, so we never fetched its article pages.
 * - Reuters: paywall since 2024.
 * - The rest are well-known subscription publishers (metered or hard).
 * Add a domain here, not in the gateway; there is one list.
 */

const PAYWALLED_DOMAINS = [
  'reuters.com',
  'nwaonline.com',
  'arkansasonline.com',
  'hotsr.com',
  'baxterbulletin.com',
  'theverge.com',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'wsj.com',
  'washingtonpost.com',
  'bloomberg.com',
  'ft.com',
  'economist.com',
  'theatlantic.com',
  'newyorker.com',
  'wired.com',
  'businessinsider.com',
  'latimes.com',
  'bostonglobe.com',
  'newsweek.com',
  'malvern-online.com', // Chef, 2026-10-10
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ONE anchored, case-insensitive pattern for every listed domain:
 * `^(?:[^.]+\.)*(?:reuters\.com|…)$`. Usable as a Mongo `$regex`.
 */
function paywalledDomainRegex(domains = PAYWALLED_DOMAINS) {
  const alternatives = domains.map((d) => escapeRegex(String(d).toLowerCase()));
  return new RegExp(`^(?:[^.]+\\.)*(?:${alternatives.join('|')})$`, 'i');
}

const PAYWALLED_DOMAIN_REGEX = paywalledDomainRegex();

/** True when `domain` is a listed paywalled domain or a subdomain of one. */
function isPaywalledDomain(domain) {
  if (!domain) return false;
  const d = String(domain).trim().toLowerCase().replace(/\.$/, '');
  return PAYWALLED_DOMAIN_REGEX.test(d);
}

module.exports = { PAYWALLED_DOMAINS, PAYWALLED_DOMAIN_REGEX, paywalledDomainRegex, isPaywalledDomain };
