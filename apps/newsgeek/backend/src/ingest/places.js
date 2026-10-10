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
 *   - CASE: a name matches as written in the gazetteer or in ALL CAPS
 *     ("ARKADELPHIA school board"), never in lower case — so the word "hope"
 *     is not Hope, Arkansas.
 *   - CONTEXT BY DEFAULT (2026-10-10, when the gazetteer grew to the south
 *     half of the state): every town and county is ambiguous — Union County,
 *     Conway, Benton, Warren, Stuttgart, Nashville all exist elsewhere — and
 *     counts only with Arkansas context: the source covers Arkansas (or
 *     anything inside it), or the text also names an unambiguous Arkansas
 *     place. UNIQUE_PLACE_SLUGS lists the names that are Arkansas's alone.
 *   - COMMON WORDS (Hope, Stamps, Magnolia, Mayflower…) need STRONG context:
 *     the source covers that place or its county, or the text names its
 *     county, or writes "<Name>, Ark." / "<Name>, Arkansas" / "<Name>, AR".
 *     "Arkansas context" alone is not enough: a Little Rock station's
 *     "Hope for the holidays" is not about Hempstead County.
 *   Known gap: a Clark County, Arkansas story that never says "Arkansas" and
 *   comes from a national source is not tagged.
 */

/** Towns/counties whose names exist nowhere but Arkansas: no context needed. */
export const UNIQUE_PLACE_SLUGS = new Set([
  'arkadelphia-ar', 'gurdon-ar', 'caddo-valley-ar', 'magnet-cove-ar', 'hot-springs-village-ar',
  'hot-spring-county-ar', 'garland-county-ar', 'arkansas-county-ar',
  'little-rock-ar', 'north-little-rock-ar', 'pine-bluff-ar', 'helena-west-helena-ar',
  'smackover-ar', 'crossett-ar',
]);
// NOT unique, on purpose: Hot Springs (SD, NC, VA), Texarkana (TX), El Dorado
// (KS, CA), Malvern (PA, UK), Clark County (NV), Bismarck (ND).

/** Names that are ordinary words too: they need strong context (header). */
export const COMMON_WORD_PLACE_SLUGS = new Set([
  'hope-ar', 'stamps-ar', 'magnolia-ar', 'mayflower-ar', 'amity-ar', 'star-city-ar', 'waldo-ar',
  'warren-ar', 'cabot-ar', 'bryant-ar', 'benton-ar', 'sheridan-ar', 'haskell-ar', 'conway-ar',
  'hamburg-ar', 'junction-city-ar', 'lake-village-ar', 'white-hall-ar', 'donaldson-ar',
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRegex(phrase) {
  const words = (w) => w.trim().split(/\s+/).map(escapeRe).join('\\s+');
  // As written, or ALL CAPS — never lower case (header: CASE).
  const forms = [...new Set([words(phrase), words(phrase.toUpperCase())])].join('|');
  // Letter/digit boundaries (Unicode-aware) instead of \b, which treats a
  // trailing "." in "Hot Spring Co." as a non-word char and gets it wrong.
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms})(?![\\p{L}\\p{N}])`, 'gu');
}

/** "Hope, Ark." / "Hope, Arkansas" / "Hope, AR" right after a match. */
const STATE_SUFFIX = /^,?\s+(?:Ark\.|Arkansas|AR\b|ARK\.|ARKANSAS)/u;

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
        const end = m.index + m[0].length;
        hits.push({ id: String(pat.place._id), start: m.index, end, suffixed: STATE_SUFFIX.test(s.slice(end, end + 12)) });
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
    const suffixed = new Set(accepted.filter((h) => h.suffixed).map((h) => h.id));

    const slugOf = (id) => byId.get(id)?.slug;
    const kindOf = (id) => byId.get(id)?.kind;
    const isCommonWord = (id) => COMMON_WORD_PLACE_SLUGS.has(slugOf(id));
    const isAmbiguous = (id) => (kindOf(id) === 'town' || kindOf(id) === 'county') && !UNIQUE_PLACE_SLUGS.has(slugOf(id));

    // Common-word places first: they need STRONG context (header).
    const sourceChains = sourcePlaceIds.map((id) => new Set(ancestry(String(id))));
    const strongOk = (id) => {
      if (suffixed.has(id)) return true;
      // The source covers this place or the county it sits in, or the text
      // names that county.
      const own = ancestry(id).filter((a) => kindOf(a) === 'town' || kindOf(a) === 'county');
      const sourceCovers = sourceChains.some((chain) => own.some((a) => chain.has(a)));
      const countyNamed = own.some((a) => a !== id && found.includes(a));
      return sourceCovers || countyNamed;
    };
    const commonOk = new Set(found.filter((id) => isCommonWord(id) && strongOk(id)));

    // Evidence for everything else = source places + unambiguous text matches
    // + suffixed matches + accepted common-word places ("Hope, Hempstead
    // County" — each vouches for the other).
    const evidence = [
      ...sourcePlaceIds.map(String),
      ...found.filter((id) => (!isAmbiguous(id) && !isCommonWord(id)) || suffixed.has(id) || commonOk.has(id)),
    ];
    const evidenceChains = evidence.map((id) => new Set(ancestry(id)));
    return found.filter((id) => {
      if (suffixed.has(id)) return true;
      if (isCommonWord(id)) return commonOk.has(id);
      if (!isAmbiguous(id)) return true;
      const state = stateOf(id);
      if (!state) return false;
      return evidenceChains.some((chain) => chain.has(state));
    });
  }

  return { match, ancestry };
}

export default { buildPlaceMatcher, UNIQUE_PLACE_SLUGS, COMMON_WORD_PLACE_SLUGS };
