/**
 * Paywall markers — the ONE place the "does this article page want a
 * subscription?" check lives. It encodes the 2026-10-10 manual check
 * (apps/newsgeek/DOCS/CONTEXT.md "south half of Arkansas", Paywall check):
 * publisher markup `isAccessibleForFree: false`, the Zephr / Piano,
 * CherryRoad and PMPro paywall plugins, and "premium content" /
 * "subscribers only" text. Discovery calls it on one article page.
 *
 * The level is a best guess from markup and both levels count as paywalled
 * ("Free to read": metered counts, Chef 2026-10-10):
 *   - `hard`    when the page says so in words (subscribers only, premium
 *               content), carries a members-only plugin (PMPro), or marks
 *               itself not free with no meter vendor present;
 *   - `metered` when a meter vendor (Zephr, Piano, CherryRoad) is present
 *               and nothing says hard;
 *   - `none`    when no marker is present.
 * The Verge carries isAccessibleForFree:false AND Zephr and is metered; the
 * Sentinel-Record carries the same pair and is hard — markup cannot tell
 * those apart, so an admin can always correct `access.paywall`.
 */

const MARKERS = [
  { name: 'isAccessibleForFree: false', level: 'hard', meter: false,
    re: /["']?isAccessibleForFree["']?\s*[:=]\s*["']?false\b|itemprop=["']isAccessibleForFree["'][^>]*content=["']false["']/i },
  { name: 'Zephr', level: 'metered', meter: true, re: /zephr/i },
  { name: 'Piano', level: 'metered', meter: true, re: /tinypass\.com|\bpiano\.io\b|cdn\.piano\./i },
  { name: 'CherryRoad', level: 'metered', meter: true, re: /cherryroad/i },
  { name: 'PMPro', level: 'hard', meter: false, re: /\bpmpro[_-]|paid-memberships-pro/i },
  { name: '"premium content"', level: 'hard', meter: false, re: /premium content/i },
  { name: '"subscribers only"', level: 'hard', meter: false, re: /subscribers?[\s-]+only/i },
];

const TEXT_OR_PLUGIN_HARD = new Set(['PMPro', '"premium content"', '"subscribers only"']);

/**
 * @param {string} html  one article page
 * @returns {{ level: 'none'|'metered'|'hard', markers: string[] }}
 */
export function detectPaywall(html) {
  const s = String(html ?? '');
  const found = MARKERS.filter((m) => m.re.test(s));
  const markers = found.map((m) => m.name);
  if (!found.length) return { level: 'none', markers };
  const meter = found.some((m) => m.meter);
  const hardWords = found.some((m) => TEXT_OR_PLUGIN_HARD.has(m.name));
  const notFree = markers.includes('isAccessibleForFree: false');
  if (hardWords || (notFree && !meter)) return { level: 'hard', markers };
  return { level: 'metered', markers };
}

export default { detectPaywall };
