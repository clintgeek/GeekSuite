/**
 * NewsGeek duplicate collapse, display time (DOCS/NEWSGEEK_PLAN.md "Ingest
 * hygiene", Chef 2026-10-11). Pure: no Mongo, no clock. The resolver loads
 * the rows; this decides which are one story.
 *
 * Why (production, 7 days to 2026-10-11): 118 same-title groups, 248
 * articles — AP copy across the TV sites, the Sentinel-Record and the Log
 * Cabin; Advocate / Arkansas Times / KUAR co-publishing; an obituary as
 * "Elendle Buck" (The Arkadelphian) and as "Elendle Buck Obituary (2026) -
 * Arkadelphia, AR - Smith Family Funeral Home" (Google News → legacy.com).
 *
 * 1. THE KEY (dupKey). The title normalised like the ingest titleKey
 *    (lower case, accents and punctuation gone). An aggregator title's
 *    trailing " - Publisher" is stripped (ingest already does; repeated here
 *    so a row from before that rule still matches). OBITUARY-SHAPED titles —
 *    the title says "obituary", or the publisher is a known obituary host
 *    (OBITUARY_HOSTS) — keep only the part before the first " - " and lose
 *    "Obituary (YYYY)": the key is the name.
 *    Under-merge guards (two cards beat one wrong card):
 *    - a key of one word never groups;
 *    - a key of 2–3 words ("elendle buck", "police beat") groups only when
 *      the group holds an obituary-shaped member;
 *    - official sources (NWS alerts, city notices) never group;
 *    - a group never holds two articles from one source.
 *
 * 2. THE GROUP. Equal keys whose publishedAt fall within DUP_WINDOW_MS (72 h)
 *    of the group's first (earliest) member.
 *
 * 3. THE REPRESENTATIVE, per reader: (1) a ★ Favorite source; (2) direct
 *    over aggregator; (3) the source's first section local > state > other;
 *    (4) the earliest publishedAt. The rest become `alsoIn` (at most
 *    ALSO_IN_MAX, in the same order).
 *
 * 4. THE GROUP'S SECTION. When no member has an OWN Arkansas place (its
 *    places minus the ones inherited from its source — ranking.js
 *    "locality places") and some member's source is national or world first,
 *    the group goes to that section: wire copy carried by a state paper stays
 *    out of State. Otherwise the representative's per-story section.
 *
 * STORIES (2026-11-27, collapseStories — Today only). The backend's story
 * assigner gives articles about one event the same `storyId`
 * (apps/newsgeek/DOCS/CLUSTERING.md). Title groups that share a story become
 * ONE unit:
 * 5. VOICES. Each title group is one telling, credited to its earliest
 *    member's outlet (AP copy on three stations is AP's). A story's voices are
 *    its distinct outlets: twelve articles from The Hill are one voice.
 * 6. THE STORY'S SECTION is a vote, one per outlet (storySection). A STRONG
 *    vote is earned by the article: Local by a ring place of its own, State
 *    by an own Arkansas place, or the label of a national / world / tech
 *    newsroom. A WEAK vote is a label that says where the paper is, not where
 *    the story is: the hometown paper or a statewide station with no place of
 *    its own in the text, and anything through an aggregator (AP and Reuters
 *    reach us as searches labelled national, whatever they report). Strong
 *    votes decide; with none, the wire rule (4), then agreement, then "home
 *    papers disagree → State". Ties go to the earlier front-page section.
 * 7. THE STORY'S REPRESENTATIVE (storyRepCompare): words that are in the
 *    story's section; a ★ Favorite whose own telling is; one from the story's
 *    last 24 h; the report over a live blog or podcast; anything over a
 *    hard paywall; a typical headline over an angle; a link that serves the
 *    reader (direct and free, then
 *    metered, then a search result or title-only post, then a hard paywall);
 *    an outlet that is itself in the section; a newsroom whose beat it is;
 *    then the newest words. `alsoIn` lists one link per other outlet.
 */
import { sectionOf, firstSection, hasOwnArkansasPlace, hasOwnRingPlace, SECTION_ORDER } from './ranking.js';

export const DUP_WINDOW_MS = 72 * 60 * 60 * 1000;
export const ALSO_IN_MAX = 5;
export const MIN_KEY_WORDS = 4;
export const OBITUARY_HOSTS = ['legacy.com', 'dignitymemorial.com', 'tributearchive.com', 'echovita.com'];

const WIRE_SECTIONS = new Set(['national', 'world']);
const SECTION_RANK = { local: 0, state: 1 };

const collapse = (s) => String(s ?? '').replace(/[\s ​]+/g, ' ').trim();

/** The ingest titleKey's normalisation (apps/newsgeek/backend/src/ingest/normalize.js titleKey). */
export function normKey(s) {
  return collapse(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function underHost(domain, host) {
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  return d === host || d.endsWith(`.${host}`);
}

export const isObituaryHost = (domain) => Boolean(domain) && OBITUARY_HOSTS.some((h) => underHost(domain, h));

function stripPublisherSuffix(title, publisher) {
  const p = collapse(publisher);
  if (!p) return title;
  for (const sep of [' - ', ' – ', ' — ', ' | ']) {
    const suffix = `${sep}${p}`.toLowerCase();
    if (title.length > suffix.length && title.toLowerCase().endsWith(suffix)) return title.slice(0, title.length - suffix.length).trim();
  }
  return title;
}

/**
 * { key, obituary, words } for one article, or null when it can never group.
 * @param {{ title, publisher?, publisherDomain? }} article
 * @param {{ kind? }} [source]
 */
export function dupInfo(article, source = {}) {
  if (source.kind === 'official') return null;
  let title = collapse(article.title);
  if (source.kind === 'aggregator') title = stripPublisherSuffix(title, article.publisher);
  const obituary = /obituary/i.test(title) || isObituaryHost(article.publisherDomain);
  let key;
  if (obituary) {
    const name = title.split(/\s+[-–—|]\s+/)[0].replace(/\bobituary\b(?:\s*\(\d{4}\))?/gi, ' ');
    key = normKey(name);
  } else {
    key = normKey(title);
  }
  const words = key ? key.split(' ').length : 0;
  if (words < 2) return null;
  return { key, obituary, words };
}

/** The key alone (null when the article never groups). */
export const dupKey = (article, source) => dupInfo(article, source)?.key ?? null;

const time = (a) => new Date(a.publishedAt).getTime();
const byTime = (a, b) => time(a.article) - time(b.article) || String(a.article._id).localeCompare(String(b.article._id));

/** Representative order (header, 3). Lower first. */
function repCompare(ctx) {
  const rank = (e) => [
    ctx?.favorites?.has(String(e.source._id)) ? 0 : 1,
    e.source.kind === 'aggregator' ? 1 : 0,
    SECTION_RANK[firstSection(e.source)] ?? 2,
    time(e.article),
  ];
  return (a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return String(a.article._id).localeCompare(String(b.article._id));
  };
}

/** The group's section (header, 4). `members` in representative order. */
export function groupSection(ctx, members) {
  if (members.length > 1 && !members.some((m) => hasOwnArkansasPlace(ctx, m.article, m.source))) {
    const wire = members.find((m) => WIRE_SECTIONS.has(firstSection(m.source)));
    if (wire) return firstSection(wire.source);
  }
  return sectionOf(ctx, members[0].article, members[0].source);
}

const alsoInOf = (members) => members.slice(1, 1 + ALSO_IN_MAX).map((m) => ({
  publisher: m.article.publisher || m.source.name || '',
  url: m.article.url,
  sourceId: String(m.article.sourceId),
}));

/**
 * Collapse duplicates. Every article lands in exactly one group (a single
 * article is a group of one).
 * @param {object} o
 * @param {object} o.ctx            ranking.js createContext (favorites, gazetteer)
 * @param {object[]} o.articles     rows with _id, sourceId, title, publisher, publisherDomain, url, publishedAt, places
 * @param {Map<string, object>} o.sourceById
 * @returns {Array<{ rep, source, members: Array<{article, source}>, alsoIn, section, newestAt }>}
 *   `members` in representative order; groups in no particular order.
 */
export function collapseDuplicates({ ctx, articles, sourceById }) {
  const entries = [];
  for (const article of articles) {
    const source = sourceById.get(String(article.sourceId));
    if (!source) continue;
    entries.push({ article, source, info: dupInfo(article, source) });
  }
  entries.sort(byTime);

  const groups = [];
  const openByKey = new Map(); // key → the latest group with that key
  for (const e of entries) {
    if (!e.info) { groups.push([e]); continue; }
    const g = openByKey.get(e.info.key);
    const joins = g
      && time(e.article) - time(g[0].article) <= DUP_WINDOW_MS
      && !g.some((m) => String(m.source._id) === String(e.source._id));
    if (joins) g.push(e);
    else {
      const fresh = [e];
      groups.push(fresh);
      openByKey.set(e.info.key, fresh);
    }
  }

  const out = [];
  const compare = repCompare(ctx);
  for (const g of groups) {
    // A short key (a name, "police beat") only groups around an obituary.
    const parts = g.length > 1 && g[0].info.words < MIN_KEY_WORDS && !g.some((m) => m.info.obituary) ? g.map((m) => [m]) : [g];
    for (const part of parts) {
      const members = [...part].sort(compare);
      out.push({
        rep: members[0].article,
        source: members[0].source,
        members,
        alsoIn: alsoInOf(members),
        section: members.length > 1 ? groupSection(ctx, members) : sectionOf(ctx, members[0].article, members[0].source),
        newestAt: Math.max(...members.map((m) => time(m.article))),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stories (header, 5–7)
// ---------------------------------------------------------------------------

const STRONG_LABELS = new Set(['national', 'world', 'tech']);
const HOME_SECTIONS = new Set(['local', 'state', 'around']);
// Not the report itself: a live blog, a video, a podcast, a newsletter.
const NOT_THE_REPORT = /^(?:watch(?: live)?|live(?: updates?)?|video|listen|podcast|first thing|news wrap|weather iq)\b[:\s]|\blive updates\b|[-–—]\s*(?:video|live|podcast|the latest)\s*$|\bpodcast\b/i;
/** The representative is chosen among the tellings of the story's last REP_POOL_MS: its current chapter. */
export const REP_POOL_MS = 24 * 60 * 60 * 1000;
/** ...and among those, the ones whose headline is this close to the most typical one. */
export const REP_CENTRAL_SHARE = 0.8;

/** Who published it, as one comparable key (the backend's cluster/stories.js outletKey). */
export function outletKey(article, source = {}) {
  const name = String(article.publisher || source.name || article.publisherDomain || '')
    .toLowerCase()
    .replace(/\.(com|org|net|gov|co\.uk)$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return name || `source:${String(article.sourceId || '')}`;
}

/**
 * One member's vote for the story's section (header, 6). Strong: Local by a
 * ring place of the article's own, State by an own Arkansas place, or a
 * national / world / tech newsroom's label. Everything else is weak: a label
 * that says where the paper is, not where the story is.
 */
export function sectionVote(ctx, article, source) {
  const section = sectionOf(ctx, article, source);
  let strong;
  if (section === 'local') strong = ctx.ring.length ? hasOwnRingPlace(ctx, article, source) : true;
  else if (source.kind === 'aggregator') strong = false;
  else if (section === 'state') strong = hasOwnArkansasPlace(ctx, article, source);
  else strong = STRONG_LABELS.has(section);
  return { section, strong };
}

const sectionOrder = (key) => {
  const i = SECTION_ORDER.indexOf(key);
  return i === -1 ? SECTION_ORDER.length : i;
};

function tally(members, strongOnly) {
  const by = new Map();
  for (const m of members) {
    if (strongOnly && !m.vote.strong) continue;
    if (!by.has(m.vote.section)) by.set(m.vote.section, new Set());
    by.get(m.vote.section).add(m.outlet);
  }
  return [...by.entries()].sort((a, b) => b[1].size - a[1].size || sectionOrder(a[0]) - sectionOrder(b[0]));
}

/**
 * The story's section by vote. `members` carry `vote` and `outlet`.
 * Strong votes decide. With none:
 * - the wire rule (header, 4): nobody names an Arkansas place and some
 *   member's source is national or world first → that section;
 * - every weak vote agrees → that section;
 * - home papers disagree → Local when the reader's own paper ran it and no
 *   more statewide outlets did than hometown ones; otherwise State;
 * - otherwise the most outlets.
 */
export function storySection(ctx, members) {
  const strong = tally(members, true);
  if (strong.length) return strong[0][0];
  if (!members.some((m) => hasOwnArkansasPlace(ctx, m.article, m.source))) {
    const wire = members.filter((m) => WIRE_SECTIONS.has(firstSection(m.source)));
    if (wire.length) {
      const world = wire.filter((m) => firstSection(m.source) === 'world').length;
      return world > wire.length - world ? 'world' : 'national';
    }
  }
  const weak = tally(members, false);
  if (weak.length === 1) return weak[0][0];
  if (weak.every(([key]) => HOME_SECTIONS.has(key))) {
    // Home papers disagree. The reader's own paper ran it and no more
    // statewide outlets did than hometown ones: Local, as it was before
    // stories. Otherwise it is Arkansas news, nobody's local: State.
    const count = (key) => weak.find(([k]) => k === key)?.[1].size || 0;
    return count('local') > 0 && count('local') >= count('state') ? 'local' : 'state';
  }
  return weak[0][0];
}

const STOP_WORDS = new Set(['with', 'from', 'that', 'this', 'after', 'over', 'into', 'about', 'says', 'said', 'what', 'will', 'have', 'been', 'were', 'their', 'more', 'than', 'amid', 'here', 'know']);
const titleWords = (title) => new Set(normKey(title).split(' ').filter((w) => w.length >= 4 && !STOP_WORDS.has(w)));

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n / (a.size + b.size - n);
}

/**
 * How typical each member's headline is of the story's current chapter: the
 * sum of its word overlap with the other outlets' headlines in the pool.
 * Members outside the pool get -1. Sets `m.inPool` and `m.central`.
 */
function markCentral(members) {
  const newest = Math.max(...members.map((m) => m.toldAt));
  const pool = members.filter((m) => m.toldAt >= newest - REP_POOL_MS);
  const words = new Map(pool.map((m) => [m, titleWords(m.article.title)]));
  let best = 0;
  for (const m of members) { m.inPool = false; m.centrality = -1; }
  for (const m of pool) {
    let sum = 0;
    for (const o of pool) if (o !== m && o.outlet !== m.outlet) sum += overlap(words.get(m), words.get(o));
    m.inPool = true;
    m.centrality = sum;
    if (sum > best) best = sum;
  }
  for (const m of members) m.central = m.inPool && m.centrality >= best * REP_CENTRAL_SHARE;
}

/**
 * How well the link serves the reader, lower first: a direct, free story with
 * an excerpt; a metered one; a search result or a title-only post (it opens,
 * but there is nothing to read first); a hard paywall.
 */
function readable(m) {
  const wall = m.source.access?.paywall;
  if (wall === 'hard') return 3;
  if (m.source.kind === 'aggregator' || m.source.access?.content === 'title') return 2;
  return wall === 'metered' ? 1 : 0;
}

/**
 * Representative order (header, 7). Lower first:
 * - words that are in the story's section (`inSection` goes by the telling: a
 *   station's copy of a wire story is the wire's words);
 * - a ★ Favorite whose OWN telling is in that section (the hometown paper's
 *   copy of a statehouse story does not make it the face of a State story);
 * - one from the current chapter; the report over a live blog or podcast;
 *   anything over a hard paywall (the face of a story should open); a
 *   typical headline over an angle;
 * - a link that serves the reader (readable);
 * - an outlet that is itself in that section; a newsroom whose beat this is;
 * - the newest words; among copies of them, the original.
 */
function storyRepCompare(ctx, section) {
  const native = (m) => (HOME_SECTIONS.has(section) ? true : firstSection(m.source) === section);
  const own = (m) => m.vote.section === section;
  const rank = (m) => [
    m.inSection ? 0 : 1,
    own(m) && ctx?.favorites?.has(String(m.source._id)) ? 0 : 1,
    m.inPool ? 0 : 1,
    NOT_THE_REPORT.test(String(m.article.title || '')) ? 1 : 0,
    m.source.access?.paywall === 'hard' ? 1 : 0,
    m.central ? 0 : 1,
    readable(m),
    own(m) ? 0 : 1,
    native(m) ? 0 : 1,
    -m.toldAt,
    time(m.article), // among copies of the same words, the original
  ];
  return (a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return String(a.article._id).localeCompare(String(b.article._id));
  };
}

/**
 * collapseDuplicates, then title groups that share a `storyId` become one
 * unit, with its section voted and its representative chosen by the story
 * rules. An article with no story yet (not embedded yet, or older than the
 * assigner's look-back) still groups by title. Official sources never group. Same shape as collapseDuplicates, plus:
 *   voices      distinct outlets that told the story (1 = alone)
 *   toldAt      when the representative's words were first published (a late copy is not fresh)
 *   repOwn      the representative's own telling is in the story's section (else no ★ boost)
 *   voiceTimes  [{ outlet, at }] — one per telling, for "how many lately"
 * @returns {Array<{ rep, source, members, alsoIn, section, newestAt, voices, voiceTimes }>}
 */
export function collapseStories({ ctx, articles, sourceById }) {
  const groups = collapseDuplicates({ ctx, articles, sourceById });
  const out = [];
  const byStory = new Map();
  for (const g of groups) {
    const first = g.members.find((m) => m.article.storyId && m.source.kind !== 'official');
    if (!first) { out.push([g]); continue; }
    const key = String(first.article.storyId);
    if (!byStory.has(key)) { byStory.set(key, []); out.push(byStory.get(key)); }
    byStory.get(key).push(g);
  }

  return out.map((tellings) => {
    const voiceTimes = [];
    for (const g of tellings) {
      // One telling, credited to whoever had it first.
      const earliest = g.members.reduce((a, b) => (time(b.article) < time(a.article) ? b : a));
      voiceTimes.push({ outlet: outletKey(earliest.article, earliest.source), at: time(earliest.article) });
    }
    const voices = new Set(voiceTimes.map((v) => v.outlet)).size;
    // An article on its own: exactly what collapseDuplicates decided.
    if (tellings.length === 1 && tellings[0].members.length === 1) return { ...tellings[0], voices, voiceTimes };

    // `toldAt`: when these words were first published. A paper that runs
    // Tuesday's wire story on Thursday has not made it Thursday's news.
    const members = tellings.flatMap((g, i) => g.members.map((m) => ({
      article: m.article,
      source: m.source,
      outlet: outletKey(m.article, m.source),
      vote: sectionVote(ctx, m.article, m.source),
      toldAt: voiceTimes[i].at,
      telling: i,
    })));
    const section = storySection(ctx, members);
    // "In the story's section" goes by the words, not the carrier: a
    // station's copy of a wire story is the same telling as the wire's.
    const tellingIn = new Set(members.filter((m) => m.vote.section === section).map((m) => m.telling));
    for (const m of members) m.inSection = tellingIn.has(m.telling);
    markCentral(members);
    members.sort(storyRepCompare(ctx, section));
    const rep = members[0];
    const seen = new Set([rep.outlet]);
    const alsoIn = [];
    for (const m of members.slice(1)) {
      if (seen.has(m.outlet) || alsoIn.length >= ALSO_IN_MAX) continue;
      seen.add(m.outlet);
      alsoIn.push({ publisher: m.article.publisher || m.source.name || '', url: m.article.url, sourceId: String(m.article.sourceId) });
    }
    return {
      rep: rep.article,
      source: rep.source,
      members,
      alsoIn,
      section,
      newestAt: Math.max(...members.map((m) => time(m.article))),
      toldAt: rep.toldAt,
      // The ★ Favorite boost is for the favourite's own beat: its copy of a
      // statehouse story shown in State earns none (ranking.js rankFrontPage).
      repOwn: rep.vote.section === section,
      voices,
      voiceTimes,
    };
  });
}
