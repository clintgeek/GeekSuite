/**
 * newsgeek per-source URL path rules (`Source.pathExclude`, 2026-10-11,
 * DOCS/NEWSGEEK_PLAN.md "Ingest hygiene").
 *
 * A rule is a JavaScript regular-expression SOURCE string (no flags) tested
 * against an item URL's PATHNAME — `/online_features/press_releases/x.html`,
 * never the host or the query. The ingest worker drops a matching item before
 * it is stored; the one-off purge script deletes stored ones. The gateway
 * validates with cleanPathExclude (the frontend mirrors the same rules).
 *
 * Who may set them: admins only. A rule runs on the worker's single thread
 * for every item, so a reader-supplied pattern with catastrophic
 * backtracking could stall ingest for everyone.
 */

const PATH_EXCLUDE_MAX = 20;
const PATH_EXCLUDE_PATTERN_MAX = 200;
// Pathnames longer than this are cut before matching (bounds the regex work).
const PATHNAME_MATCH_MAX = 1000;

/**
 * Validate and normalise a list from a writer: entries trimmed, empty ones
 * dropped, duplicates dropped (first kept); at most PATH_EXCLUDE_MAX, each at
 * most PATH_EXCLUDE_PATTERN_MAX characters, each must compile.
 * @returns {{ ok: true, rules: string[] } | { ok: false, message: string }}
 */
function cleanPathExclude(list) {
  if (!Array.isArray(list)) return { ok: false, message: 'pathExclude must be a list of patterns' };
  const rules = [];
  for (const raw of list) {
    const p = String(raw ?? '').trim();
    if (!p || rules.includes(p)) continue;
    if (p.length > PATH_EXCLUDE_PATTERN_MAX) {
      return { ok: false, message: `A path pattern must be at most ${PATH_EXCLUDE_PATTERN_MAX} characters` };
    }
    try {
      new RegExp(p);
    } catch {
      return { ok: false, message: `Not a valid pattern: ${p.slice(0, 80)}` };
    }
    rules.push(p);
  }
  if (rules.length > PATH_EXCLUDE_MAX) return { ok: false, message: `At most ${PATH_EXCLUDE_MAX} path patterns` };
  return { ok: true, rules };
}

/** The stored rules as RegExps. A rule that no longer compiles is skipped, never thrown. */
function compilePathRules(list) {
  const out = [];
  for (const p of list || []) {
    try { out.push(new RegExp(String(p))); } catch { /* skipped */ }
  }
  return out;
}

/** The pathname of an http(s) URL, or null. */
function pathnameOf(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.pathname.slice(0, PATHNAME_MATCH_MAX);
  } catch {
    return null;
  }
}

/** True when any of `urls` has a pathname matching any compiled rule. */
function isPathExcluded(urls, compiled) {
  if (!compiled || !compiled.length) return false;
  for (const url of [].concat(urls)) {
    const path = url ? pathnameOf(url) : null;
    if (path == null) continue;
    if (compiled.some((re) => re.test(path))) return true;
  }
  return false;
}

module.exports = {
  PATH_EXCLUDE_MAX, PATH_EXCLUDE_PATTERN_MAX, PATHNAME_MATCH_MAX,
  cleanPathExclude, compilePathRules, pathnameOf, isPathExcluded,
};
