/**
 * A source's "Skip URLs matching" rules (NewsSource.pathExclude, admin only):
 * JavaScript regular expressions matched against an article URL's pathname
 * (`/online_features/press_releases/foo.html`), so `^/online_features/`
 * skips a whole corner of a site.
 *
 * Mirrors the gateway's validation exactly (it answers BAD_USER_INPUT
 * otherwise): each entry trimmed, empty ones dropped, duplicates (after the
 * trim) dropped keeping the first; at most 20 entries; each at most 200
 * characters; each must compile with `new RegExp(entry)` (no flags).
 */
export const PATH_RULES_MAX = 20;
export const PATH_RULE_MAX_LENGTH = 200;
export const PATH_RULE_EXAMPLE = '^/online_features/';

/** The list as the gateway stores it: trimmed, no empties, first of each duplicate. */
export function normalizePathRules(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const entry = String(row ?? '').trim();
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/** Why one entry would be refused, or null. An empty entry is fine (it is dropped). */
export function pathRuleError(row) {
  const entry = String(row ?? '').trim();
  if (!entry) return null;
  if (entry.length > PATH_RULE_MAX_LENGTH) return `Keep it under ${PATH_RULE_MAX_LENGTH} characters (this is ${entry.length}).`;
  try {
    new RegExp(entry); // eslint-disable-line no-new
  } catch {
    return 'Not a valid pattern. Check the brackets and backslashes.';
  }
  return null;
}

/**
 * Errors for the rows as typed: `rows[i]` is the message for row i (or null),
 * `list` is the whole-list message (too many). `any` says whether Save must refuse.
 */
export function pathRulesErrors(rows = []) {
  const perRow = rows.map(pathRuleError);
  const count = normalizePathRules(rows).length;
  const list = count > PATH_RULES_MAX ? `At most ${PATH_RULES_MAX} patterns (there are ${count}).` : null;
  return { rows: perRow, list, any: Boolean(list) || perRow.some(Boolean) };
}

/**
 * What to send as `pathExclude`: the normalized list when it differs from the
 * source's saved one, otherwise undefined (leave the field out — the gateway
 * keeps the list). Only ever called for an admin.
 */
export function pathRulesChange(saved = [], rows = []) {
  const next = normalizePathRules(rows);
  const before = saved ?? [];
  const same = next.length === before.length && next.every((p, i) => p === before[i]);
  return same ? undefined : next;
}
