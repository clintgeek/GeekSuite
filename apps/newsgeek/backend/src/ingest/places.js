/**
 * Gazetteer matching: which places does an article's title + excerpt name?
 *
 * Rules (DOCS/NEWSGEEK_PLAN.md "Data model": "the source's places +
 * gazetteer matches in title/excerpt"):
 *   - A place matches on its `name` or any alias, as a whole word/phrase,
 *     case-insensitive, any run of whitespace between words.
 *   - The LONGEST match wins a span: "Hot Springs Village" is one match for
 *     Hot Springs Village, not also one for Hot Springs. (The city "Hot
 *     Springs" and "Hot Spring County" never collide in the first place:
 *     neither phrase is contained in the other, and no alias is a bare
 *     "Hot Spring".)
 *   - AMBIGUOUS names (below: "Malvern" is also in PA and the UK, "Clark
 *     County" is Las Vegas, "Bismarck" is North Dakota and a chancellor,
 *     "Hot Springs" is also SD/NC/VA…) count only with context: the article's
 *     source covers that place's state (or anything inside it), or the text
 *     also names an unambiguous place inside that state ("Arkansas",
 *     "Arkadelphia", "Hot Spring County"…). The list is code, keyed by slug —
 *     a place added later through the gateway is unambiguous until it is
 *     added here. Known v1 gap: a Clark County, Arkansas story that never
 *     says "Arkansas" and comes from a national source is not tagged.
 */

/** Slugs whose names exist elsewhere too. See the header. */
export const AMBIGUOUS_PLACE_SLUGS = new Set([
  'malvern-ar', 'bismarck-ar', 'amity-ar', 'okolona-ar', 'donaldson-ar', 'rockport-ar',
  'hot-springs-ar', 'clark-county-ar',
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRegex(phrase) {
  const body = phrase.trim().split(/\s+/).map(escapeRe).join('\\s+');
  // Letter/digit boundaries (Unicode-aware) instead of \b, which treats a
  // trailing "." in "Hot Spring Co." as a non-word char and gets it wrong.
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * Build a matcher over the gazetteer.
 * @param {Array<{_id, slug, name, aliases, parentId, kind}>} places
 */
export function buildPlaceMatcher(places) {
  const byId = new Map(places.map((p) => [String(p._id), p]));
  const patterns = [];
  for (const p of places) {
    const phrases = new Set([p.name, ...(p.aliases || [])].map((x) => String(x || '').trim()).filter((x) => x.length >= 3));
    for (const phrase of phrases) patterns.push({ place: p, phrase, re: phraseRegex(phrase) });
  }

  /** The id chain from a place up to the root, itself included. */
  function ancestry(id) {
    const out = [];
    const seen = new Set();
    let cur = byId.get(String(id));
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      out.push(String(cur._id));
      cur = cur.parentId ? byId.get(String(cur.parentId)) : null;
    }
    return out;
  }

  function stateOf(id) {
    return ancestry(id).find((a) => byId.get(a)?.kind === 'state') || null;
  }

  /**
   * @param {string} text   title + ' ' + excerpt
   * @param {Array} sourcePlaceIds
   * @returns {string[]} matched place ids (strings), source places NOT included
   */
  function match(text, sourcePlaceIds = []) {
    const s = String(text || '');
    if (!s) return [];
    const hits = [];
    for (const pat of patterns) {
      pat.re.lastIndex = 0;
      let m;
      while ((m = pat.re.exec(s)) !== null) {
        hits.push({ id: String(pat.place._id), start: m.index, end: m.index + m[0].length });
      }
    }
    // Longest first; a hit inside an accepted span is dropped.
    hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const accepted = [];
    for (const h of hits) {
      if (accepted.some((a) => h.start >= a.start && h.end <= a.end && a.id !== h.id)) continue;
      accepted.push(h);
    }
    const found = [...new Set(accepted.map((h) => h.id))];

    // Context for ambiguous names: evidence = source places + unambiguous text matches.
    const isAmbiguous = (id) => AMBIGUOUS_PLACE_SLUGS.has(byId.get(id)?.slug);
    const evidence = [...sourcePlaceIds.map(String), ...found.filter((id) => !isAmbiguous(id))];
    const evidenceChains = evidence.map((id) => new Set(ancestry(id)));
    return found.filter((id) => {
      if (!isAmbiguous(id)) return true;
      const state = stateOf(id);
      if (!state) return false;
      return evidenceChains.some((chain) => chain.has(state));
    });
  }

  return { match, ancestry };
}

export default { buildPlaceMatcher, AMBIGUOUS_PLACE_SLUGS };
