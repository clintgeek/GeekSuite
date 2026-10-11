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
 */
import { sectionOf, firstSection, hasOwnArkansasPlace } from './ranking.js';

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
