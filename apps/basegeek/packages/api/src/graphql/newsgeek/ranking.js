/**
 * NewsGeek ranking: Today, the front page (DOCS/NEWSGEEK_PLAN.md "Ranking: the
 * front page", Chef 2026-10-11). Pure: no Mongo, no clock — the caller passes
 * the rows and `now`. The resolver (resolvers.js) loads; this decides.
 *
 * Why it exists (measured in production, 2026-10-11): newest-first lets volume
 * win. The Democrat-Gazette posts 278 stories a week, The Arkadelphian 7 (in
 * one weekly batch), so the Arkadelphian's newest story ranked #1,282 in "All".
 *
 * 1. THE RING. A reader's `homePlaces`, ordered closest first. A place matches
 *    a ring entry when the entry is the place itself or one of its ancestors
 *    (Gurdon → the Clark County entry). Hot Springs Village is under Garland
 *    County, not under the city of Hot Springs, so only a Garland County entry
 *    catches it. The best (lowest-index) matching entry wins.
 *
 * 2. THE STORY'S SECTION, per reader (sectionOf; sectionClause is the same
 *    rule as a Mongo filter, for newsArticles(section)):
 *    - local: one of the story's LOCALITY PLACES is in the ring. Locality
 *      places are the article's own places (its places minus the ones it
 *      inherited from its source at ingest), plus the source's places when the
 *      source is RING-LOCAL: every place it covers (ignoring state/country
 *      places) is in the ring — The Arkadelphian (Arkadelphia, Clark County),
 *      not KATV (Arkansas) or Arkansas TV (Little Rock, Pulaski County,
 *      Arkansas). A reader with no ring: local = the source is labelled local.
 *    - else state: the SOURCE is statewide (its first section is `state`),
 *      or the story has an OWN (non-inherited) Arkansas place — one off the
 *      ring, since one on it already made the story local.
 *    - else around ("Around Arkansas", Chef 2026-10-11): the source is
 *      labelled local first (another town's paper) and the story names no
 *      Arkansas place of its own: another town reporting its own town. On
 *      Chef's Today that was DeWitt's "Calendar of Events" filling State.
 *    - else the source's FIRST section (national / world / tech).
 *    A reader with NO ring keeps the old rule: local = labelled local; state =
 *    any Arkansas place (own or inherited) or labelled state; no `around`.
 *
 * 3. THE SCORE, within a section:
 *      score = (FRESHNESS_SHARE·freshness + LOCALITY_SHARE·locality) × priority
 *    - freshness is PACE-NORMALISED: typicalGap = 7 days / max(1, the source's
 *      stories in the last 7 days), clamped to [1 h, 3 days];
 *      freshness = exp(−(age / typicalGap) / PACE_DECAY) × max(0, 1 − age / window).
 *      So a 2-day-old story from a 7-a-week paper is "fresh for it", and a
 *      6-hour-old story from a 40-a-day wire is not. The second factor is the
 *      hard absolute decay: nothing older than the window scores or shows.
 *      Windows: local 10 days, every other section 7.
 *    - locality = RING_WEIGHTS[best ring index] (entries past the table get
 *      RING_WEIGHT_FLOOR); else ARKANSAS_WEIGHT if any place is in Arkansas;
 *      else 0.
 *    - priority = PRIORITY_WEIGHT[favorite | normal | less].
 *
 * 4. THE FILL, per section, greedy down this order:
 *    - active official alerts (an NWS alert: official, `expiresAt` in the
 *      future) that are Local lead Local, newest first, exempt from the cap;
 *    - then favourites' stories no older than FAVORITE_LEAD_DAYS, by score;
 *    - then everything else by score (ties: newer first).
 *    At most perSourceCap(quota) stories per source per section (PER_SOURCE_CAP
 *    for a block of 8 or more, else half the block rounded up); an aggregator
 *    (Google News) item counts against its real publisher's domain, not
 *    against the aggregator. The section's quota is a CAP, never a target: a
 *    quiet section stays short, and an empty one is left out.
 *
 * 4b. DUPLICATES (2026-10-11, dedupe.js): the resolver passes `collapse`, and
 *    a group of copies of one story (AP across three sites) is ranked as ONE
 *    candidate — its representative, in the GROUP's section (the wire rule)
 *    — so it counts once against its representative's source cap and quota.
 *
 * 5. WHY. Every story carries the chips that explain its score: the ring place
 *    that made it local ("Arkadelphia"), "Arkansas" when that is its locality,
 *    "★ Favorite" / "Less", "Official". If it can't be a chip it isn't in the
 *    score.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Front-page order; "Around Arkansas" comes last (Chef, 2026-10-11).
export const SECTION_ORDER = ['local', 'state', 'national', 'world', 'tech', 'around'];
export const SECTION_TITLES = { local: 'Local', state: 'State', national: 'National', world: 'World', tech: 'Tech', around: 'Around Arkansas' };

// --- The constants (the plan quotes these; keep the two in step) -----------
export const WINDOW_DAYS = 7;
export const LOCAL_WINDOW_DAYS = 10;
export const MIN_GAP_MS = HOUR_MS;
export const MAX_GAP_MS = 3 * DAY_MS;
export const PACE_DECAY = 3;
export const FRESHNESS_SHARE = 0.6;
export const LOCALITY_SHARE = 0.4;
export const RING_WEIGHTS = [1.0, 0.9, 0.75, 0.65, 0.55, 0.5, 0.45];
export const RING_WEIGHT_FLOOR = 0.4;
export const ARKANSAS_WEIGHT = 0.25;
export const PRIORITY_WEIGHT = { favorite: 3, normal: 1, less: 0.3 };
export const FAVORITE_LEAD_DAYS = 7;
export const PER_SOURCE_CAP = 5;
// Blocks this big get the full PER_SOURCE_CAP; smaller ones half (rounded up).
export const FULL_CAP_MIN_QUOTA = 8;
export const ARKANSAS_SLUG = 'arkansas';

// Places at these levels never make a source ring-local (KATV covers "Arkansas").
const BROAD_PLACE_KINDS = new Set(['state', 'country']);

const str = (v) => (v == null ? null : String(v));

/**
 * Everything ranking needs about one reader, built once per request.
 * @param {object} o
 * @param {Array<{_id, parentId, name, slug, kind}>} o.places  the whole gazetteer
 * @param {string[]} [o.homePlaces]       ring, closest first
 * @param {Iterable<string>} [o.favoriteSourceIds]
 * @param {Iterable<string>} [o.lessSourceIds]
 * @param {Date|number} [o.now]
 */
export function createContext({ places = [], homePlaces = [], favoriteSourceIds = [], lessSourceIds = [], now = Date.now() } = {}) {
  const byId = new Map();
  for (const p of places) {
    byId.set(String(p._id), { id: String(p._id), oid: p._id, parentId: str(p.parentId), name: p.name, slug: p.slug, kind: p.kind });
  }
  const seen = new Set();
  const ring = [];
  for (const id of homePlaces || []) {
    const key = String(id);
    if (!byId.has(key) || seen.has(key)) continue;
    seen.add(key);
    ring.push(key);
  }
  const arkansas = [...byId.values()].find((p) => p.slug === ARKANSAS_SLUG) || null;
  return {
    byId,
    ring,
    ringPos: new Map(ring.map((id, i) => [id, i])),
    arkansasId: arkansas ? arkansas.id : null,
    favorites: new Set([...favoriteSourceIds].map(String)),
    less: new Set([...lessSourceIds].map(String)),
    now: now instanceof Date ? now.getTime() : Number(now),
    memo: { ancestry: new Map(), ringIndex: new Map(), ringLocal: new Map() },
  };
}

/** The place and its ancestors, nearest first (cycle-safe). */
export function ancestry(ctx, placeId) {
  const key = String(placeId);
  const cached = ctx.memo.ancestry.get(key);
  if (cached) return cached;
  const out = [];
  const guard = new Set();
  let cur = ctx.byId.get(key);
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.push(cur.id);
    cur = cur.parentId ? ctx.byId.get(cur.parentId) : null;
  }
  ctx.memo.ancestry.set(key, out);
  return out;
}

/** The best (lowest) ring index this place falls under, or -1. */
export function ringIndex(ctx, placeId) {
  const key = String(placeId);
  if (ctx.memo.ringIndex.has(key)) return ctx.memo.ringIndex.get(key);
  let best = -1;
  for (const id of ancestry(ctx, key)) {
    const i = ctx.ringPos.get(id);
    if (i != null && (best === -1 || i < best)) best = i;
  }
  ctx.memo.ringIndex.set(key, best);
  return best;
}

export const inArkansas = (ctx, placeId) => Boolean(ctx.arkansasId) && ancestry(ctx, placeId).includes(ctx.arkansasId);

/** Every place the source covers (state/country ignored) is in the ring. */
export function isRingLocalSource(ctx, source) {
  if (!ctx.ring.length) return false;
  const key = String(source._id);
  if (ctx.memo.ringLocal.has(key)) return ctx.memo.ringLocal.get(key);
  const scoped = (source.places || []).map(String).filter((id) => !BROAD_PLACE_KINDS.has(ctx.byId.get(id)?.kind));
  const yes = scoped.length > 0 && scoped.every((id) => ringIndex(ctx, id) >= 0);
  ctx.memo.ringLocal.set(key, yes);
  return yes;
}

/** The article's own places (minus what it inherited from its source), plus the source's when ring-local. */
export function localityPlaces(ctx, article, source) {
  const sourcePlaces = new Set((source.places || []).map(String));
  const own = (article.places || []).map(String).filter((id) => !sourcePlaces.has(id));
  return isRingLocalSource(ctx, source) ? [...own, ...sourcePlaces] : own;
}

/** { index, placeId } of the best ring match among the story's locality places; index -1 when none. */
export function bestRingMatch(ctx, article, source) {
  let best = { index: -1, placeId: null };
  for (const id of localityPlaces(ctx, article, source)) {
    const i = ringIndex(ctx, id);
    if (i < 0) continue;
    // Same entry: keep the more specific (deeper) place for the chip.
    if (best.index === -1 || i < best.index || (i === best.index && ancestry(ctx, id).length > ancestry(ctx, best.placeId).length)) {
      best = { index: i, placeId: id };
    }
  }
  return best;
}

export const firstSection = (source) => (source.sections && source.sections[0]) || 'national';
const labelledStateOrLocal = (source) => (source.sections || []).some((s) => s === 'state' || s === 'local');

/** The article has a place of its own (not inherited from its source) in Arkansas. */
export function hasOwnArkansasPlace(ctx, article, source) {
  const inherited = new Set((source.places || []).map(String));
  return (article.places || []).map(String).some((id) => !inherited.has(id) && inArkansas(ctx, id));
}

/** The story's section for this reader (header, 2). */
export function sectionOf(ctx, article, source) {
  if (!ctx.ring.length) {
    // No ring: the old rule, untouched (no `around`).
    if ((source.sections || []).includes('local')) return 'local';
    if ((article.places || []).some((id) => inArkansas(ctx, id)) || labelledStateOrLocal(source)) return 'state';
    return firstSection(source);
  }
  if (bestRingMatch(ctx, article, source).index >= 0) return 'local';
  if (hasOwnArkansasPlace(ctx, article, source)) return 'state';
  // Otherwise the source's first section: a statewide source's story is
  // State, a local paper's (off the ring, nothing of its own) is Around.
  const first = firstSection(source);
  return first === 'local' ? 'around' : first;
}

/**
 * At most this many stories from one source in a block of `quota` (Chef,
 * 2026-10-11): PER_SOURCE_CAP for a block of FULL_CAP_MIN_QUOTA or more,
 * else half the block, rounded up — so one busy paper can't fill a 5-slot
 * State block (3 of 5) or a 3-slot World block (2 of 3).
 */
export function perSourceCap(quota) {
  const q = Math.max(0, Math.floor(Number(quota) || 0));
  return q >= FULL_CAP_MIN_QUOTA ? PER_SOURCE_CAP : Math.ceil(q / 2);
}

export function ringWeight(index) {
  if (index < 0) return 0;
  return index < RING_WEIGHTS.length ? RING_WEIGHTS[index] : RING_WEIGHT_FLOOR;
}

/** { value, match, arkansas } — the locality term and what earned it. */
export function locality(ctx, article, source) {
  const match = bestRingMatch(ctx, article, source);
  if (match.index >= 0) return { value: ringWeight(match.index), match, arkansas: false };
  if ((article.places || []).some((id) => inArkansas(ctx, id))) return { value: ARKANSAS_WEIGHT, match, arkansas: true };
  return { value: 0, match, arkansas: false };
}

export function typicalGapMs(countLast7d) {
  const gap = (7 * DAY_MS) / Math.max(1, Number(countLast7d) || 0);
  return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, gap));
}

export const windowMs = (section) => (section === 'local' ? LOCAL_WINDOW_DAYS : WINDOW_DAYS) * DAY_MS;

/** Pace-normalised freshness with the hard absolute decay; 0 outside the window. */
export function freshness(ageMs, countLast7d, winMs) {
  const age = Math.max(0, ageMs);
  if (age > winMs) return 0;
  return Math.exp(-(age / typicalGapMs(countLast7d)) / PACE_DECAY) * Math.max(0, 1 - age / winMs);
}

export function priorityOf(ctx, sourceId) {
  const id = String(sourceId);
  if (ctx.favorites.has(id)) return 'favorite';
  if (ctx.less.has(id)) return 'less';
  return 'normal';
}

export const isActiveAlert = (ctx, article, source) => source.kind === 'official' && article.expiresAt != null && new Date(article.expiresAt).getTime() > ctx.now;

/** The per-source cap's key: the publisher's domain for aggregator items, else the source. */
export function capKey(article, source) {
  const domain = article.publisherDomain && String(article.publisherDomain).toLowerCase().replace(/^www\./, '');
  return source.kind === 'aggregator' && domain ? `domain:${domain}` : `source:${String(source._id)}`;
}

/** The chips that explain a story's place (header, 5). */
export function whyChips(ctx, article, source, loc = locality(ctx, article, source)) {
  const why = [];
  if (loc.match.index >= 0) {
    const name = ctx.byId.get(loc.match.placeId)?.name;
    if (name) why.push(name);
  } else if (loc.arkansas) {
    why.push(ctx.byId.get(ctx.arkansasId)?.name || 'Arkansas');
  }
  const priority = priorityOf(ctx, source._id);
  if (priority === 'favorite') why.push('★ Favorite');
  if (priority === 'less') why.push('Less');
  if (source.kind === 'official') why.push('Official');
  return why;
}

/** One story's full judgement. `section` overrides the per-story rule (a duplicate group's own section). */
export function judge(ctx, article, source, countLast7d, section = sectionOf(ctx, article, source)) {
  const age = ctx.now - new Date(article.publishedAt).getTime();
  const fresh = freshness(age, countLast7d, windowMs(section));
  const loc = locality(ctx, article, source);
  const priority = priorityOf(ctx, source._id);
  const score = (FRESHNESS_SHARE * fresh + LOCALITY_SHARE * loc.value) * PRIORITY_WEIGHT[priority];
  return {
    section,
    score,
    inWindow: Math.max(0, age) <= windowMs(section),
    ageMs: age,
    priority,
    alert: section === 'local' && isActiveAlert(ctx, article, source),
    why: whyChips(ctx, article, source, loc),
  };
}

const byScore = (a, b) => b.score - a.score
  || new Date(b.article.publishedAt) - new Date(a.article.publishedAt)
  || String(a.article._id).localeCompare(String(b.article._id));
const byNewest = (a, b) => new Date(b.article.publishedAt) - new Date(a.article.publishedAt)
  || String(a.article._id).localeCompare(String(b.article._id));

/**
 * Today. `candidates` are the visible, unexpired articles of the last
 * LOCAL_WINDOW_DAYS (already filtered for Free to read and hidden publishers).
 * `collapse({ ctx, articles, sourceById })` (dedupe.js collapseDuplicates)
 * groups copies of one story; without it every article stands alone.
 * @returns {Array<{ key, title, items: Array<{ article, source, section, score, why, alsoIn }>, moreCount }>}
 */
export function rankFrontPage({ ctx, candidates, sources, counts = new Map(), quotas, collapse = null }) {
  const sourceById = new Map(sources.map((s) => [String(s._id), s]));
  const units = collapse
    ? collapse({ ctx, articles: candidates, sourceById })
    : candidates.map((article) => ({ rep: article, source: sourceById.get(String(article.sourceId)), alsoIn: [], section: null }));
  const groups = new Map(SECTION_ORDER.map((k) => [k, []]));
  for (const unit of units) {
    const { rep: article, source } = unit;
    if (!source) continue;
    const j = judge(ctx, article, source, counts.get(String(source._id)) || 0, unit.section || undefined);
    if (!j.inWindow) continue;
    if (!groups.has(j.section)) groups.set(j.section, []);
    groups.get(j.section).push({ article, source, alsoIn: unit.alsoIn || [], ...j });
  }

  const favoriteLeadMs = FAVORITE_LEAD_DAYS * DAY_MS;
  const out = [];
  for (const [key, entries] of groups) {
    const quota = Math.max(0, Number(quotas?.[key] ?? 0));
    if (!entries.length) continue;
    const alerts = entries.filter((e) => e.alert).sort(byNewest);
    const leads = entries.filter((e) => !e.alert && e.priority === 'favorite' && e.ageMs <= favoriteLeadMs).sort(byScore);
    const rest = entries.filter((e) => !e.alert && !(e.priority === 'favorite' && e.ageMs <= favoriteLeadMs)).sort(byScore);

    const items = [];
    const perSource = new Map();
    const cap = perSourceCap(quota);
    for (const e of [...alerts, ...leads, ...rest]) {
      if (items.length >= quota) break;
      if (!e.alert) {
        const k = capKey(e.article, e.source);
        const n = perSource.get(k) || 0;
        if (n >= cap) continue;
        perSource.set(k, n + 1);
      }
      items.push(e);
    }
    if (!items.length) continue;
    out.push({ key, title: SECTION_TITLES[key] || key, items, moreCount: entries.length - items.length });
  }
  out.sort((a, b) => sectionRank(a.key) - sectionRank(b.key));
  return out;
}

const sectionRank = (key) => {
  const i = SECTION_ORDER.indexOf(key);
  return i === -1 ? SECTION_ORDER.length : i;
};

// ---------------------------------------------------------------------------
// The same section rule as a Mongo filter (newsArticles(section)). Values are
// the loaded documents' own ids, so this module needs no driver.
// ---------------------------------------------------------------------------

const NEVER = { sourceId: { $in: [] } };

/** Articles that are Local for this reader. Must agree with sectionOf. */
export function localClause(ctx, sources) {
  if (!ctx.ring.length) {
    return { sourceId: { $in: sources.filter((s) => (s.sections || []).includes('local')).map((s) => s._id) } };
  }
  const ringPlaces = [...ctx.byId.values()].filter((p) => ringIndex(ctx, p.id) >= 0);
  const clauses = [{ sourceId: { $in: sources.filter((s) => isRingLocalSource(ctx, s)).map((s) => s._id) } }];
  // Other sources: an own (non-inherited) place in the ring. Grouped by the
  // ring places they don't already cover, so the $or stays short.
  const groups = new Map();
  for (const s of sources) {
    if (isRingLocalSource(ctx, s)) continue;
    const covered = new Set((s.places || []).map(String));
    const own = ringPlaces.filter((p) => !covered.has(p.id));
    if (!own.length) continue;
    const key = own.map((p) => p.id).join(',');
    if (!groups.has(key)) groups.set(key, { ids: [], places: own.map((p) => p.oid) });
    groups.get(key).ids.push(s._id);
  }
  for (const g of groups.values()) clauses.push({ sourceId: { $in: g.ids }, places: { $in: g.places } });
  return { $or: clauses };
}

/**
 * Articles with an OWN Arkansas place: one not inherited from their source.
 * Sources are grouped by the places they cover, so each group is one clause
 * ($elemMatch: some place in Arkansas and not the source's own).
 */
function ownArkansasClause(ctx, sources) {
  const arkansasPlaces = [...ctx.byId.values()].filter((p) => inArkansas(ctx, p.id)).map((p) => p.oid);
  if (!arkansasPlaces.length) return NEVER;
  const groups = new Map();
  for (const s of sources) {
    const covered = [...new Map((s.places || []).map((id) => [String(id), id])).values()];
    const key = covered.map(String).sort().join(',');
    if (!groups.has(key)) groups.set(key, { ids: [], covered });
    groups.get(key).ids.push(s._id);
  }
  const clauses = [...groups.values()].map((g) => ({
    sourceId: { $in: g.ids },
    places: { $elemMatch: g.covered.length ? { $in: arkansasPlaces, $nin: g.covered } : { $in: arkansasPlaces } },
  }));
  return clauses.length ? { $or: clauses } : NEVER;
}

/** Articles in `section` for this reader. Must agree with sectionOf. */
export function sectionClause(ctx, section, sources) {
  const local = localClause(ctx, sources);
  if (section === 'local') return local;
  const byFirst = (key) => sources.filter((s) => firstSection(s) === key).map((s) => s._id);

  if (!ctx.ring.length) {
    // No ring: the old rule (and no `around`).
    if (section === 'around') return NEVER;
    const arkansasPlaces = [...ctx.byId.values()].filter((p) => inArkansas(ctx, p.id)).map((p) => p.oid);
    const state = {
      $or: [
        { sourceId: { $in: sources.filter(labelledStateOrLocal).map((s) => s._id) } },
        ...(arkansasPlaces.length ? [{ places: { $in: arkansasPlaces } }] : []),
      ],
    };
    if (section === 'state') return { $and: [{ $nor: [local] }, state] };
    const mine = byFirst(section);
    if (!mine.length) return NEVER;
    return { $and: [{ $nor: [local, state] }, { sourceId: { $in: mine } }] };
  }

  const state = { $or: [{ sourceId: { $in: byFirst('state') } }, ownArkansasClause(ctx, sources)] };
  if (section === 'state') return { $and: [{ $nor: [local] }, state] };
  // around: a local-first source's story that is neither local nor state;
  // every other section: the source's first section, likewise.
  const mine = byFirst(section === 'around' ? 'local' : section);
  if (!mine.length) return NEVER;
  return { $and: [{ $nor: [local, state] }, { sourceId: { $in: mine } }] };
}
