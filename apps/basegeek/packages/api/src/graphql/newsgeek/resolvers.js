import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { NewsSource } from './models/source.js';
import { NewsPlace } from './models/place.js';
import { NewsArticle } from './models/article.js';
import { NewsPrefs } from './models/prefs.js';
import { requireAdminUser } from '../basegeek/resolvers.js';
import { User } from '../../models/user.js';
import constants from '@geeksuite/schemas/newsgeek/constants';
import healthModule from '@geeksuite/schemas/newsgeek/health';
import paywallsModule from '@geeksuite/schemas/newsgeek/paywalls';
import feedUrlModule from '@geeksuite/schemas/newsgeek/feedUrl';
import prefsSchemaModule from '@geeksuite/schemas/newsgeek/prefs';
import {
  createContext, rankFrontPage, sectionClause, sectionOf, whyChips, LOCAL_WINDOW_DAYS,
} from './ranking.js';

const {
  SOURCE_KINDS, SECTIONS, SOURCE_STATUSES, FEED_FORMATS, PAYWALLS, PAYWALLED_LEVELS, CONTENT_LEVELS,
} = constants;
const { feedHealth } = healthModule;
const { PAYWALLED_DOMAIN_REGEX, paywalledDomainRegex, isPaywalledDomain } = paywallsModule;
const { normalizeFeedUrl } = feedUrlModule;
const {
  READER_LINKS_MAX, READER_LINK_LABEL_MAX, READER_LINK_TEMPLATE_MAX, SUBSCRIBED_DOMAINS_MAX, MUTED_DOMAINS_MAX,
  HOME_PLACES_MAX, PRIORITY_SOURCES_MAX, SECTION_QUOTA_DEFAULTS, SECTION_QUOTA_MAX,
} = prefsSchemaModule;

/**
 * NewsGeek gateway — DOCS/NEWSGEEK_PLAN.md "Gateway API, N0" and
 * "Reader-added sources".
 *
 * Every query needs a signed-in user. Sources: any signed-in user may add one
 * (off for everyone else); the adder may edit it, check it now and set it
 * active/retired; admins may do anything, plus "On for everyone"
 * (newsSetSourceDefaultOn). Permission is checked BEFORE validation.
 * newsSetPrefs / newsSetSourceOn are per reader: only ever the caller's own
 * row. Sources and places are shaped in batch (one places read, one
 * aggregation for articlesLast7d, one users read for admins), so there are no
 * field resolvers and no N+1.
 *
 * Visibility (one rule, used by newsArticles and NewsSource.onForMe): a reader
 * sees source S when S is not retired and S is default-on and not in their
 * sourcesOff, or S is in their sourcesOn, or they added S and it is not in
 * their sourcesOff.
 *
 * Source sheet (plan "Source sheet", Chef 2026-10-10), per reader:
 * subscribedSourceIds keep a paywalled source through "Free to read";
 * subscribedDomains do the same for aggregator items by publisher domain;
 * mutedDomains drop aggregator items by publisher domain, whatever the switch.
 * Domain matching is the paywall list's: a suffix on a label boundary.
 *
 * Front page (plan "Ranking: the front page", Chef 2026-10-11): newsFrontPage
 * is Today, ranked per reader by ranking.js (the formula is in its header).
 * Per reader: homePlaces (the ring), favoriteSourceIds / lessSourceIds
 * (newsSetSourcePriority) and sectionQuotas. Every article carries its
 * per-reader `section` and `why` chips, and newsArticles(section) filters by
 * that same per-story section (ranking.js sectionClause). newsFrontPage costs
 * six reads: prefs, sources, places, one 7-day count aggregation, the
 * candidates (one find, scoring fields only) and the chosen stories.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_FEEDS = 20;
const MAX_BLOCKED = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
// Reader-added sources: abuse limits (per non-admin user).
export const CREATE_LIMIT_PER_DAY = 20;
export const CREATE_LIMIT_TOTAL = 200;
// The statuses an adder (non-admin) may set on their own source.
const ADDER_STATUSES = ['active', 'retired'];
// newsSuggestedSources
const SUGGEST_WINDOW_DAYS = 30;
const SUGGEST_TOP = 30;
const SUGGEST_SAMPLE_TITLES = 3;
const { ObjectId } = mongoose.Types;

function codedError(message, code) {
  return new GraphQLError(message, { extensions: { code } });
}
const badInput = (message) => codedError(message, 'BAD_USER_INPUT');
const adminRequired = (message = 'admin role required') => new GraphQLError(message, {
  extensions: { code: 'ADMIN_REQUIRED', error: 'admin_required' },
});

function requireUser(user) {
  if (!user?.id) throw codedError('Authentication required', 'UNAUTHENTICATED');
}

/** requireAdminUser as a boolean (same source of truth: the user document's role). */
async function isAdminUser(user) {
  try {
    await requireAdminUser(user);
    return true;
  } catch (err) {
    if (err?.extensions?.code === 'ADMIN_REQUIRED') return false;
    throw err;
  }
}

function toObjectId(value, label) {
  const s = String(value ?? '');
  if (!ObjectId.isValid(s) || String(new ObjectId(s)) !== s.toLowerCase()) {
    throw badInput(`${label} is not a valid id`);
  }
  return new ObjectId(s);
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw badInput(`${label} must be one of: ${allowed.join(', ')}`);
  return value;
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

function shapePlace(p) {
  return {
    id: String(p._id),
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    parentId: p.parentId ? String(p.parentId) : null,
  };
}

/** One read for every place any of `idLists` mentions → Map(idString → shaped place). */
async function loadPlaceMap(idLists) {
  const ids = [...new Set(idLists.flat().map(String))];
  if (!ids.length) return new Map();
  const rows = await NewsPlace.find({ _id: { $in: ids } }).lean();
  return new Map(rows.map((p) => [String(p._id), shapePlace(p)]));
}

const placesOf = (ids, map) => (ids || []).map((id) => map.get(String(id))).filter(Boolean);

/** Articles in the last 7 days per source — ONE aggregation for the whole list. */
async function countLast7d(sourceIds, now = Date.now()) {
  if (!sourceIds.length) return new Map();
  const since = new Date(now - 7 * DAY_MS);
  const rows = await NewsArticle.aggregate([
    { $match: { sourceId: { $in: sourceIds }, publishedAt: { $gte: since } } },
    { $group: { _id: '$sourceId', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

function shapeFeed(feed, sourceStatus) {
  return {
    id: String(feed._id),
    url: feed.url,
    format: feed.format || 'rss',
    pollEveryMin: feed.pollEveryMin ?? 15,
    lastFetchAt: feed.lastFetchAt ?? null,
    lastOkAt: feed.lastOkAt ?? null,
    lastItemAt: feed.lastItemAt ?? null,
    lastNewItemAt: feed.lastNewItemAt ?? null,
    consecutiveFailures: feed.consecutiveFailures || 0,
    lastError: feed.lastError ?? null,
    lastHttpStatus: feed.lastHttpStatus ?? null,
    stale: Boolean(feed.stale),
    health: feedHealth(feed, sourceStatus),
  };
}

/** Admins only: addedBy user id → a display name (never the email). One read. */
async function loadAdderNames(docs) {
  const ids = [...new Set(docs.map((s) => s.addedBy).filter((id) => id && ObjectId.isValid(String(id))))];
  if (!ids.length) return new Map();
  const rows = await User.find({ _id: { $in: ids } }).select('displayName username').lean();
  return new Map(rows.map((u) => [String(u._id), u.displayName || u.username || null]));
}

async function shapeSources(docs, viewer) {
  const [placeMap, counts, names] = await Promise.all([
    loadPlaceMap(docs.map((s) => s.places || [])),
    countLast7d(docs.map((s) => s._id)),
    viewer.isAdmin ? loadAdderNames(docs) : new Map(),
  ]);
  return docs.map((s) => ({
    id: String(s._id),
    slug: s.slug,
    name: s.name,
    homepage: s.homepage ?? null,
    kind: s.kind,
    sections: s.sections || [],
    places: placesOf(s.places, placeMap),
    status: s.status,
    access: { paywall: s.access?.paywall || 'none', content: s.access?.content || 'excerpt' },
    feeds: (s.feeds || []).map((f) => shapeFeed(f, s.status)),
    blockedDomains: s.blockedDomains || [],
    notes: s.notes || '',
    articlesLast7d: counts.get(String(s._id)) || 0,
    paywalled: isPaywalledSource(s),
    defaultOn: isDefaultOn(s),
    onForMe: seesSource(s, viewer),
    addedByMe: isAdder(s, viewer),
    canEdit: viewer.isAdmin || isAdder(s, viewer),
    addedByName: viewer.isAdmin && s.addedBy ? (names.get(String(s.addedBy)) ?? null) : null,
    subscribedByMe: viewer.subscribedSourceIds.has(String(s._id)),
    priorityForMe: priorityFor(s._id, viewer),
  }));
}

async function shapeOneSource(id, viewer) {
  const doc = await NewsSource.findById(id).lean();
  if (!doc) throw codedError('Source not found', 'NOT_FOUND');
  return (await shapeSources([doc], viewer))[0];
}

// ---------------------------------------------------------------------------
// The viewer + visibility (plan "Reader-added sources": "What a reader sees")
// ---------------------------------------------------------------------------

/** Everything about the caller the source rules need: one prefs read, one role read. */
async function viewerOf(user, { withRole = true } = {}) {
  const userId = String(user.id);
  const [row, isAdmin] = await Promise.all([
    NewsPrefs.findOne({ userId }).lean(),
    withRole ? isAdminUser(user) : false,
  ]);
  return {
    userId,
    isAdmin,
    freeToReadOnly: Boolean(row?.freeToReadOnly ?? PREFS_DEFAULTS.freeToReadOnly),
    sourcesOn: new Set((row?.sourcesOn || []).map(String)),
    sourcesOff: new Set((row?.sourcesOff || []).map(String)),
    subscribedSourceIds: new Set((row?.subscribedSourceIds || []).map(String)),
    subscribedDomains: row?.subscribedDomains || [],
    mutedDomains: row?.mutedDomains || [],
    homePlaces: (row?.homePlaces || []).map(String),
    favoriteSourceIds: new Set((row?.favoriteSourceIds || []).map(String)),
    lessSourceIds: new Set((row?.lessSourceIds || []).map(String)),
    sectionQuotas: resolveQuotas(row),
  };
}

const priorityFor = (id, viewer) => {
  if (viewer.favoriteSourceIds.has(String(id))) return 'favorite';
  if (viewer.lessSourceIds.has(String(id))) return 'less';
  return 'normal';
};

/** The reader's quota overrides over SECTION_QUOTA_DEFAULTS. */
function resolveQuotas(row) {
  const out = { ...SECTION_QUOTA_DEFAULTS };
  for (const key of Object.keys(out)) {
    const v = row?.sectionQuotas?.[key];
    if (Number.isInteger(v)) out[key] = v;
  }
  return out;
}

// A missing defaultOn reads as true: rows that predate the field are the starter list.
const isDefaultOn = (s) => s.defaultOn !== false;
const isAdder = (s, viewer) => Boolean(s.addedBy) && String(s.addedBy) === viewer.userId;

/** The rule, in JS (NewsSource.onForMe). Must agree with visibleSourceClause. */
function seesSource(s, viewer) {
  if (s.status === 'retired') return false;
  const id = String(s._id);
  if (viewer.sourcesOn.has(id)) return true;
  if (viewer.sourcesOff.has(id)) return false;
  return isDefaultOn(s) || isAdder(s, viewer);
}

const idList = (set) => [...set].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

/** The same rule as one Mongo clause over sources (newsArticles). */
function visibleSourceClause(viewer) {
  const off = idList(viewer.sourcesOff);
  return {
    status: { $ne: 'retired' },
    $or: [
      { _id: { $in: idList(viewer.sourcesOn) } },
      { defaultOn: { $ne: false }, _id: { $nin: off } },
      { addedBy: viewer.userId, _id: { $nin: off } },
    ],
  };
}

/** May this viewer edit / check / set the status of this source? */
function requireEditor(source, viewer) {
  if (viewer.isAdmin || isAdder(source, viewer)) return;
  throw adminRequired('Only the reader who added this source, or an admin, can change it');
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function cleanString(value, label, max) {
  const s = String(value).trim();
  if (s.length > max) throw badInput(`${label} must be at most ${max} characters`);
  return s;
}

function cleanFeedsInput(feeds) {
  if (feeds.length > MAX_FEEDS) throw badInput(`A source can have at most ${MAX_FEEDS} feeds`);
  const seen = new Set();
  return feeds.map((f) => {
    const url = String(f.url ?? '').trim();
    if (!isHttpUrl(url)) throw badInput(`Feed url must be http(s): ${url}`);
    if (url.length > 2000) throw badInput('Feed url is too long');
    const key = normalizeFeedUrl(url);
    if (seen.has(key)) throw badInput(`Duplicate feed url: ${url}`);
    seen.add(key);
    const out = { url };
    if (f.format != null) out.format = oneOf(f.format, FEED_FORMATS, 'feed format');
    if (f.pollEveryMin != null) {
      if (!Number.isInteger(f.pollEveryMin) || f.pollEveryMin < 5 || f.pollEveryMin > 1440) {
        throw badInput('pollEveryMin must be a whole number of minutes between 5 and 1440');
      }
      out.pollEveryMin = f.pollEveryMin;
    }
    return out;
  });
}

/** Validate the provided fields only → a patch of Source fields (dotted paths for access). */
async function validateSourceInput(input, { creating }) {
  const patch = {};

  if (input.name != null) {
    const name = cleanString(input.name, 'name', 160);
    if (!name) throw badInput('name is required');
    patch.name = name;
  } else if (creating) {
    throw badInput('name is required');
  }

  if (input.kind != null) patch.kind = oneOf(input.kind, SOURCE_KINDS, 'kind');
  else if (creating) throw badInput('kind is required');

  if (input.slug != null) {
    const slug = slugify(input.slug);
    if (!slug) throw badInput('slug must contain letters or numbers');
    patch.slug = slug;
  }

  if (input.homepage !== undefined) {
    const hp = input.homepage == null ? '' : String(input.homepage).trim();
    if (hp && !isHttpUrl(hp)) throw badInput('homepage must be an http(s) URL');
    if (hp.length > 2000) throw badInput('homepage is too long');
    patch.homepage = hp || null;
  }

  if (input.sections != null) {
    patch.sections = [...new Set(input.sections.map((s) => oneOf(s, SECTIONS, 'section')))];
  }

  if (input.placeIds != null) {
    const ids = [...new Set(input.placeIds.map(String))].map((id) => toObjectId(id, 'placeId'));
    const found = await NewsPlace.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw badInput('Unknown placeId');
    patch.places = ids;
  }

  if (input.paywall != null) patch['access.paywall'] = oneOf(input.paywall, PAYWALLS, 'paywall');
  if (input.content != null) patch['access.content'] = oneOf(input.content, CONTENT_LEVELS, 'content');

  if (input.blockedDomains != null) {
    const domains = [...new Set(input.blockedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
    if (domains.length > MAX_BLOCKED) throw badInput(`At most ${MAX_BLOCKED} blocked domains`);
    for (const d of domains) {
      if (d.length > 255 || !/^[a-z0-9.-]+$/.test(d)) throw badInput(`Not a domain: ${d}`);
    }
    patch.blockedDomains = domains;
  }

  if (input.notes != null) patch.notes = cleanString(input.notes, 'notes', 2000);
  if (input.defaultOn != null) patch.defaultOn = Boolean(input.defaultOn);

  const feeds = input.feeds != null ? cleanFeedsInput(input.feeds) : null;
  return { patch, feeds };
}

/** Auto-derived slugs get -2, -3… on collision; an explicit slug that collides is an error. */
async function uniqueSlug(base, { explicit, excludeId }) {
  const taken = async (s) => NewsSource.exists({ slug: s, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
  if (explicit) {
    if (await taken(base)) throw badInput(`slug "${base}" is already in use`);
    return base;
  }
  let candidate = base;
  for (let n = 2; await taken(candidate); n += 1) {
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
  }
  return candidate;
}

/**
 * One poll per feed: a feed URL (normalized — packages/schemas/newsgeek/feedUrl.js,
 * the same function discovery uses) that already belongs to another source →
 * DUPLICATE_FEED, extensions.sourceId = that source.
 */
async function assertNoDuplicateFeeds(feeds, { excludeId = null } = {}) {
  if (!feeds?.length) return;
  const wanted = new Set(feeds.map((f) => normalizeFeedUrl(f.url)));
  const filter = excludeId ? { _id: { $ne: excludeId } } : {};
  const others = await NewsSource.find(filter, { 'feeds.url': 1, name: 1 }).lean();
  for (const s of others) {
    for (const f of s.feeds || []) {
      if (wanted.has(normalizeFeedUrl(f.url))) {
        throw new GraphQLError(`That feed is already here: ${s.name}`, {
          extensions: { code: 'DUPLICATE_FEED', sourceId: String(s._id), sourceName: s.name, feedUrl: f.url },
        });
      }
    }
  }
}

/** Non-admin add limits: 20 per rolling 24h, 200 in total. */
async function assertUnderCreateLimits(userId) {
  const [today, total] = await Promise.all([
    NewsSource.countDocuments({ addedBy: userId, createdAt: { $gte: new Date(Date.now() - DAY_MS) } }),
    NewsSource.countDocuments({ addedBy: userId }),
  ]);
  if (today >= CREATE_LIMIT_PER_DAY) {
    throw new GraphQLError(`You can add ${CREATE_LIMIT_PER_DAY} sources a day. Try again tomorrow.`, {
      extensions: { code: 'RATE_LIMITED', limit: CREATE_LIMIT_PER_DAY, window: '24h' },
    });
  }
  if (total >= CREATE_LIMIT_TOTAL) {
    throw new GraphQLError(`You have added ${CREATE_LIMIT_TOTAL} sources, the most one reader can add.`, {
      extensions: { code: 'RATE_LIMITED', limit: CREATE_LIMIT_TOTAL, window: 'total' },
    });
  }
}

/** What only an admin may put in a NewsSourceInput. */
// Reader-added feeds poll no faster than every 30 minutes (an admin can set
// 5–1440). 200 sources a reader × 5-minute polls would hammer publishers.
export const READER_MIN_POLL_MIN = 30;
const readerFeeds = (feeds) => feeds && feeds.map((f) => ({ ...f, pollEveryMin: Math.max(f.pollEveryMin ?? READER_MIN_POLL_MIN, READER_MIN_POLL_MIN) }));

function assertAdderInput(input) {
  if (input.defaultOn != null) throw adminRequired('Only an admin can turn a source on for everyone');
  if (input.kind === 'aggregator') throw adminRequired('Only an admin can add an aggregator');
}

function duplicateSlugGuard(err) {
  if (err?.code === 11000) throw badInput('slug is already in use');
  throw err;
}

// ---------------------------------------------------------------------------
// Prefs + paywalls
// ---------------------------------------------------------------------------

const PREFS_DEFAULTS = Object.freeze({ freeToReadOnly: false });
const SOURCE_PRIORITIES = ['favorite', 'normal', 'less'];

const isPaywalledSource = (s) => PAYWALLED_LEVELS.includes(s.access?.paywall);

/** NewsPrefs. Async because homePlaces are shaped places (one read, order kept). */
async function shapePrefs(row) {
  const homeIds = (row?.homePlaces || []).map(String).filter((id) => ObjectId.isValid(id));
  const placeMap = await loadPlaceMap([homeIds]);
  return {
    freeToReadOnly: Boolean(row?.freeToReadOnly ?? PREFS_DEFAULTS.freeToReadOnly),
    readerLinks: (row?.readerLinks || []).map((l) => ({ label: l.label, template: l.template })),
    subscribedSourceIds: (row?.subscribedSourceIds || []).map(String),
    subscribedDomains: row?.subscribedDomains || [],
    mutedDomains: row?.mutedDomains || [],
    homePlaces: placesOf(homeIds, placeMap),
    favoriteSourceIds: (row?.favoriteSourceIds || []).map(String),
    lessSourceIds: (row?.lessSourceIds || []).map(String),
    sectionQuotas: resolveQuotas(row),
  };
}

/** NewsSectionQuotasInput → $set / $unset of the provided keys (null = back to the default). */
function quotaUpdate(input) {
  const set = {};
  const unset = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!(key in SECTION_QUOTA_DEFAULTS)) throw badInput(`Unknown section: ${key}`);
    if (value == null) { unset[`sectionQuotas.${key}`] = ''; continue; }
    if (!Number.isInteger(value) || value < 0 || value > SECTION_QUOTA_MAX) {
      throw badInput(`A section quota must be a whole number from 0 to ${SECTION_QUOTA_MAX}`);
    }
    set[`sectionQuotas.${key}`] = value;
  }
  return { set, unset };
}

/**
 * A publisher domain from a reader (newsSetPublisherPref): trimmed, lower-case,
 * no trailing dot, no leading `www.`. It must be a bare hostname — at least two
 * labels of [a-z0-9-] (no edge hyphens, ≤63 each, ≤253 in all) with a
 * letter-only (or xn--) top label, so URLs, paths, ports and IP addresses are
 * refused.
 */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP_LABEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
export function normalizePublisherDomain(value) {
  const d = String(value ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  const labels = d.split('.');
  if (!d || d.length > 253 || labels.length < 2 || !labels.every((l) => HOST_LABEL.test(l)) || !TOP_LABEL.test(labels[labels.length - 1])) {
    throw badInput(`Not a publisher domain: ${String(value ?? '').slice(0, 80)} (use a bare name like example.com)`);
  }
  return d;
}

const READER_LINK_PLACEHOLDERS = ['{url}', '{title}'];

/**
 * "Open with…" templates (plan "Open-with links"): ≤5; label trimmed 1–40;
 * template ≤500, contains {url}, no placeholder but {url}/{title}, and is an
 * absolute http(s) URL once the placeholders are filled with a dummy value.
 * Stored only — the gateway never fetches a template.
 */
function cleanReaderLinks(links) {
  if (links.length > READER_LINKS_MAX) throw badInput(`At most ${READER_LINKS_MAX} "Open with" links`);
  return links.map((l, i) => {
    const n = i + 1;
    const label = String(l.label ?? '').trim();
    if (!label) throw badInput(`Link ${n}: a label is required`);
    if (label.length > READER_LINK_LABEL_MAX) throw badInput(`Link ${n}: the label must be at most ${READER_LINK_LABEL_MAX} characters`);
    const template = String(l.template ?? '').trim();
    if (template.length > READER_LINK_TEMPLATE_MAX) throw badInput(`Link ${n}: the template must be at most ${READER_LINK_TEMPLATE_MAX} characters`);
    if (!template.includes('{url}')) throw badInput(`Link ${n}: the template must contain {url}`);
    const unknown = (template.match(/\{[^}]*\}/g) || []).filter((p) => !READER_LINK_PLACEHOLDERS.includes(p));
    if (unknown.length) throw badInput(`Link ${n}: only {url} and {title} can be used (found ${unknown[0]})`);
    if (/[{}]/.test(template.replace(/\{url\}|\{title\}/g, ''))) throw badInput(`Link ${n}: stray { or } in the template`);
    const filled = template.replace(/\{url\}|\{title\}/g, 'x');
    let u;
    try { u = new URL(filled); } catch { throw badInput(`Link ${n}: the template must be a full http(s) address`); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw badInput(`Link ${n}: only http and https links are allowed`);
    if (!u.hostname) throw badInput(`Link ${n}: the template must be a full http(s) address`);
    return { label, template };
  });
}

/** The caller's prefs; userId comes from the session only. */
async function prefsFor(user) {
  const row = await NewsPrefs.findOne({ userId: String(user.id) }).lean();
  return shapePrefs(row);
}

/** Upsert the caller's own prefs row; two first-ever writes racing on userId → the loser retries. */
async function writePrefs(userId, update) {
  const write = () => NewsPrefs.findOneAndUpdate(
    { userId },
    { ...update, $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return write().catch((err) => (err?.code === 11000 ? write() : Promise.reject(err)));
}

/**
 * What the "Free to read" switch hides, as one Mongo clause over articles:
 * everything from a metered/hard source, and aggregator (Google News) items
 * whose real publisher's domain is a paywalled one. A direct source is judged
 * by its own `access.paywall` only, so an admin's setting there wins.
 */
function paywalledClause(sources, viewer) {
  // What the reader subscribes to is never hidden: a subscribed source, or an
  // aggregator item whose publisher is (under) a subscribed domain.
  const walled = sources.filter((s) => isPaywalledSource(s) && !viewer.subscribedSourceIds.has(String(s._id))).map((s) => s._id);
  const aggregators = sources.filter((s) => s.kind === 'aggregator' && !isPaywalledSource(s)).map((s) => s._id);
  const or = [];
  if (walled.length) or.push({ sourceId: { $in: walled } });
  if (aggregators.length) {
    const byDomain = { sourceId: { $in: aggregators }, publisherDomain: { $regex: PAYWALLED_DOMAIN_REGEX } };
    if (viewer.subscribedDomains.length) {
      byDomain.$and = [{ publisherDomain: { $not: paywalledDomainRegex(viewer.subscribedDomains) } }];
    }
    or.push(byDomain);
  }
  return or.length ? { $or: or } : null;
}

/** Aggregator items from a domain the reader hid. Direct sources are never muted by domain. */
function mutedClause(sources, viewer) {
  if (!viewer.mutedDomains.length) return null;
  const aggregators = sources.filter((s) => s.kind === 'aggregator').map((s) => s._id);
  if (!aggregators.length) return null;
  return { sourceId: { $in: aggregators }, publisherDomain: { $regex: paywalledDomainRegex(viewer.mutedDomains) } };
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

/** The whole (small) gazetteer, one read: ranking needs every ancestry. */
const loadAllPlaces = () => NewsPlace.find({}, { slug: 1, name: 1, kind: 1, parentId: 1 }).lean();

/** The place and every descendant, from the loaded gazetteer. */
function placeWithDescendants(placeId, all) {
  const root = toObjectId(placeId, 'placeId');
  const children = new Map();
  for (const p of all) {
    const key = p.parentId ? String(p.parentId) : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(String(p._id));
  }
  const out = new Set([String(root)]);
  const queue = [String(root)];
  while (queue.length) {
    for (const child of children.get(queue.shift()) || []) {
      if (!out.has(child)) { out.add(child); queue.push(child); }
    }
  }
  return [...out].map((id) => new ObjectId(id));
}

// What ranking and the section rule need from a source.
const SOURCE_LIST_FIELDS = { name: 1, kind: 1, sections: 1, access: 1, places: 1 };

const rankingContext = (places, viewer, now) => createContext({
  places,
  homePlaces: viewer.homePlaces,
  favoriteSourceIds: viewer.favoriteSourceIds,
  lessSourceIds: viewer.lessSourceIds,
  now,
});

/** One article for this reader: its per-reader section and why-chips included. */
function shapeArticle(a, src, placeMap, ctx) {
  return {
    id: String(a._id),
    title: a.title,
    url: a.url,
    excerpt: a.excerpt || '',
    publisher: a.publisher,
    publishedAt: a.publishedAt,
    expiresAt: a.expiresAt ?? null,
    sourceId: String(a.sourceId),
    sourceName: src.name,
    sourceKind: src.kind,
    publisherDomain: a.publisherDomain || null,
    viaAggregator: src.kind === 'aggregator',
    sections: src.sections || [],
    places: placesOf(a.places, placeMap),
    section: sectionOf(ctx, a, src),
    why: whyChips(ctx, a, src),
  };
}

const placeMapOf = (places) => new Map(places.map((p) => [String(p._id), shapePlace(p)]));

/** Not expired (NWS alerts leave when the alert does). */
const unexpired = (now) => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });

async function articlePage(args, viewer) {
  const { freeToReadOnly } = viewer;
  const { section, placeId, sourceId, before } = args;
  if (section != null) oneOf(section, SECTIONS, 'section');
  let limit = args.limit == null ? DEFAULT_LIMIT : args.limit;
  if (!Number.isInteger(limit) || limit < 1) throw badInput('limit must be a positive integer');
  limit = Math.min(limit, MAX_LIMIT);
  if (placeId != null) toObjectId(placeId, 'placeId');

  // Which sources can contribute: the ones this reader sees (never retired),
  // optionally one source. The section is the STORY's, per reader (below).
  const sourceFilter = visibleSourceClause(viewer);
  if (sourceId != null) sourceFilter._id = toObjectId(sourceId, 'sourceId');
  const [sources, places] = await Promise.all([
    NewsSource.find(sourceFilter, SOURCE_LIST_FIELDS).lean(),
    loadAllPlaces(),
  ]);
  if (!sources.length) return { items: [], nextBefore: null, hiddenPaywalled: 0 };

  const now = new Date();
  const ctx = rankingContext(places, viewer, now);
  // Everything but the cursor: the whole current list.
  const list = [{ sourceId: { $in: sources.map((s) => s._id) } }, unexpired(now)];
  if (placeId != null) list.push({ places: { $in: placeWithDescendants(placeId, places) } });
  if (section) list.push(sectionClause(ctx, section, sources));
  // A hidden publisher is out of the list itself, so hiddenPaywalled never counts it.
  const muted = mutedClause(sources, viewer);
  if (muted) list.push({ $nor: [muted] });

  const walled = freeToReadOnly ? paywalledClause(sources, viewer) : null;
  const filter = { $and: [...list] };
  if (before != null) filter.$and.push({ publishedAt: { $lt: before } });
  if (walled) filter.$and.push({ $nor: [walled] });

  const [rows, hiddenPaywalled] = await Promise.all([
    NewsArticle.find(filter, { embedding: 0 })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit)
      .lean(),
    // The one extra count, only when something can be hidden.
    walled ? NewsArticle.countDocuments({ $and: [...list, walled] }) : 0,
  ]);

  const sourceMap = new Map(sources.map((s) => [String(s._id), s]));
  const placeMap = placeMapOf(places);
  const items = rows.map((a) => shapeArticle(a, sourceMap.get(String(a.sourceId)), placeMap, ctx));

  return {
    items,
    nextBefore: items.length === limit ? items[items.length - 1].publishedAt : null,
    hiddenPaywalled,
  };
}

// ---------------------------------------------------------------------------
// Today: the front page (ranking.js)
// ---------------------------------------------------------------------------

// Scoring needs only these; the chosen stories are read in full afterwards.
const CANDIDATE_FIELDS = { sourceId: 1, publishedAt: 1, expiresAt: 1, places: 1, publisherDomain: 1 };

async function frontPage(viewer) {
  const now = new Date();
  const [sources, places] = await Promise.all([
    NewsSource.find(visibleSourceClause(viewer), SOURCE_LIST_FIELDS).lean(),
    loadAllPlaces(),
  ]);
  if (!sources.length) return { generatedAt: now, sections: [] };
  const ids = sources.map((s) => s._id);

  // The same visibility, Free-to-read and hidden-publisher rules as newsArticles.
  const and = [
    { sourceId: { $in: ids } },
    { publishedAt: { $gte: new Date(now.getTime() - LOCAL_WINDOW_DAYS * DAY_MS) } },
    unexpired(now),
  ];
  const muted = mutedClause(sources, viewer);
  if (muted) and.push({ $nor: [muted] });
  const walled = viewer.freeToReadOnly ? paywalledClause(sources, viewer) : null;
  if (walled) and.push({ $nor: [walled] });

  const [counts, candidates] = await Promise.all([
    countLast7d(ids, now.getTime()),
    NewsArticle.find({ $and: and }, CANDIDATE_FIELDS).lean(),
  ]);

  const ctx = rankingContext(places, viewer, now);
  const ranked = rankFrontPage({ ctx, candidates, sources, counts, quotas: viewer.sectionQuotas });
  const chosen = ranked.flatMap((s) => s.items.map((e) => e.article._id));
  const full = chosen.length ? await NewsArticle.find({ _id: { $in: chosen } }, { embedding: 0 }).lean() : [];
  const byId = new Map(full.map((a) => [String(a._id), a]));
  const placeMap = placeMapOf(places);

  return {
    generatedAt: now,
    sections: ranked.map((s) => ({
      key: s.key,
      title: s.title,
      moreCount: s.moreCount,
      items: s.items
        .filter((e) => byId.has(String(e.article._id))) // purged between the two reads
        .map((e) => shapeArticle(byId.get(String(e.article._id)), e.source, placeMap, ctx)),
    })).filter((s) => s.items.length),
  };
}

// ---------------------------------------------------------------------------
// Suggestions: publishers Google News keeps surfacing that we don't read directly
// ---------------------------------------------------------------------------

const bareHost = (h) => String(h || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');

function hostOf(url) {
  try { return bareHost(new URL(String(url)).hostname); } catch { return null; }
}

/** `domain` is `base` or a subdomain of it (label boundary). */
const underDomain = (domain, base) => domain === base || domain.endsWith(`.${base}`);

async function suggestedSources() {
  const [aggregators, direct] = await Promise.all([
    NewsSource.find({ kind: 'aggregator' }, { _id: 1 }).lean(),
    NewsSource.find({ kind: { $ne: 'aggregator' } }, { homepage: 1, 'feeds.url': 1 }).lean(),
  ]);
  if (!aggregators.length) return [];
  // Hosts any non-aggregator source reads (any status): homepage + every feed.
  const directHosts = [...new Set(direct.flatMap((s) => [s.homepage, ...(s.feeds || []).map((f) => f.url)]).map(hostOf).filter(Boolean))];

  const since = new Date(Date.now() - SUGGEST_WINDOW_DAYS * DAY_MS);
  const groups = await NewsArticle.aggregate([
    { $match: { sourceId: { $in: aggregators.map((s) => s._id) }, publishedAt: { $gte: since }, publisherDomain: { $nin: [null, ''] } } },
    { $sort: { publishedAt: -1 } },
    { $group: {
      _id: { $toLower: '$publisherDomain' },
      count: { $sum: 1 },
      lastSeenAt: { $max: '$publishedAt' },
      titles: { $push: '$title' },
      places: { $push: '$places' },
    } },
  ]);

  const kept = groups
    .filter((g) => !directHosts.some((h) => underDomain(bareHost(g._id), h)))
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt || String(a._id).localeCompare(String(b._id)))
    .slice(0, SUGGEST_TOP);

  const placeIds = kept.map((g) => [...new Set(g.places.flat().map(String))]);
  const placeMap = await loadPlaceMap(placeIds);
  return kept.map((g, i) => ({
    domain: g._id,
    count: g.count,
    lastSeenAt: g.lastSeenAt,
    places: placesOf(placeIds[i], placeMap),
    sampleTitles: [...new Set(g.titles.filter(Boolean))].slice(0, SUGGEST_SAMPLE_TITLES),
    paywalled: isPaywalledDomain(g._id),
  }));
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

/** Load a source for a write, or NOT_FOUND. */
async function sourceForWrite(id) {
  const oid = toObjectId(id, 'id');
  const doc = await NewsSource.findById(oid).lean();
  if (!doc) throw codedError('Source not found', 'NOT_FOUND');
  return doc;
}

export const resolvers = {
  Query: {
    newsViewer: async (_, __, { user }) => {
      requireUser(user);
      return { isAdmin: await isAdminUser(user) };
    },

    newsPlaces: async (_, __, { user }) => {
      requireUser(user);
      const rows = await NewsPlace.find({}).sort({ name: 1 }).lean();
      return rows.map(shapePlace);
    },

    newsSources: async (_, { status }, { user }) => {
      requireUser(user);
      const filter = {};
      if (status != null) filter.status = oneOf(status, SOURCE_STATUSES, 'status');
      const [docs, viewer] = await Promise.all([
        NewsSource.find(filter).sort({ name: 1 }).lean(),
        viewerOf(user),
      ]);
      return shapeSources(docs, viewer);
    },

    newsSource: async (_, { id }, { user }) => {
      requireUser(user);
      const oid = toObjectId(id, 'id');
      const doc = await NewsSource.findById(oid).lean();
      if (!doc) return null;
      return (await shapeSources([doc], await viewerOf(user)))[0];
    },

    newsPrefs: async (_, __, { user }) => {
      requireUser(user);
      return prefsFor(user);
    },

    newsArticles: async (_, args, { user }) => {
      requireUser(user);
      return articlePage(args, await viewerOf(user, { withRole: false }));
    },

    newsFrontPage: async (_, __, { user }) => {
      requireUser(user);
      return frontPage(await viewerOf(user, { withRole: false }));
    },

    newsSuggestedSources: async (_, __, { user }) => {
      requireUser(user);
      return suggestedSources();
    },
  },

  Mutation: {
    newsSetPrefs: async (_, { input }, { user }) => {
      requireUser(user);
      const set = {};
      if (input?.freeToReadOnly != null) set.freeToReadOnly = Boolean(input.freeToReadOnly);
      if (input?.readerLinks != null) set.readerLinks = cleanReaderLinks(input.readerLinks);
      const quotas = input?.sectionQuotas != null ? quotaUpdate(input.sectionQuotas) : { set: {}, unset: {} };
      const update = { $set: { ...set, ...quotas.set } };
      if (Object.keys(quotas.unset).length) update.$unset = quotas.unset;
      const row = await writePrefs(String(user.id), update);
      return shapePrefs(row);
    },

    // The caller's ring, closest first. Replaces the whole list.
    newsSetHomePlaces: async (_, { placeIds }, { user }) => {
      requireUser(user);
      if (placeIds.length > HOME_PLACES_MAX) throw badInput(`At most ${HOME_PLACES_MAX} home places`);
      const ids = placeIds.map((id) => toObjectId(id, 'placeId'));
      const strings = ids.map(String);
      if (new Set(strings).size !== strings.length) throw badInput('A place is in the list twice');
      if (ids.length && (await NewsPlace.countDocuments({ _id: { $in: ids } })) !== ids.length) throw badInput('Unknown placeId');
      return shapePrefs(await writePrefs(String(user.id), { $set: { homePlaces: strings } }));
    },

    // The caller's priority for one source: favorite | normal | less.
    newsSetSourcePriority: async (_, { id, priority }, { user }) => {
      requireUser(user);
      oneOf(priority, SOURCE_PRIORITIES, 'priority');
      const doc = await sourceForWrite(id);
      if (doc.status === 'retired' && priority !== 'normal') throw badInput('This source is retired');
      const viewer = await viewerOf(user);
      const sid = String(doc._id);
      const list = priority === 'favorite' ? viewer.favoriteSourceIds : viewer.lessSourceIds;
      if (priority !== 'normal' && !list.has(sid) && list.size >= PRIORITY_SOURCES_MAX) {
        throw badInput(`At most ${PRIORITY_SOURCES_MAX} sources can be marked ${priority}`);
      }
      const update = {
        favorite: { $addToSet: { favoriteSourceIds: sid }, $pull: { lessSourceIds: sid } },
        less: { $addToSet: { lessSourceIds: sid }, $pull: { favoriteSourceIds: sid } },
        normal: { $pull: { favoriteSourceIds: sid, lessSourceIds: sid } },
      }[priority];
      await writePrefs(viewer.userId, update);
      return shapeOneSource(doc._id, await viewerOf(user));
    },

    newsSetSourceOn: async (_, { id, on }, { user }) => {
      requireUser(user);
      const doc = await sourceForWrite(id);
      if (doc.status === 'retired' && on) throw badInput('This source is retired');
      const viewer = await viewerOf(user);
      const sid = String(doc._id);
      // Keep the rows minimal: an explicit entry only where it differs from
      // what this reader would get anyway (default-on, or added by them).
      const byDefault = isDefaultOn(doc) || isAdder(doc, viewer);
      const update = on
        ? { $pull: { sourcesOff: sid }, ...(byDefault ? { } : { $addToSet: { sourcesOn: sid } }) }
        : { $pull: { sourcesOn: sid }, ...(byDefault ? { $addToSet: { sourcesOff: sid } } : {}) };
      // On for a default source: also drop any stale sourcesOn entry; off for a
      // non-default one: drop any stale sourcesOff entry.
      if (on && byDefault) update.$pull.sourcesOn = sid;
      if (!on && !byDefault) update.$pull.sourcesOff = sid;
      await writePrefs(viewer.userId, update);
      return shapeOneSource(doc._id, await viewerOf(user));
    },

    // Source sheet: "I subscribe" for a source — the caller's own row only.
    newsSetSourceSubscribed: async (_, { id, on }, { user }) => {
      requireUser(user);
      const doc = await sourceForWrite(id);
      if (doc.status === 'retired' && on) throw badInput('This source is retired');
      const viewer = await viewerOf(user);
      const sid = String(doc._id);
      await writePrefs(viewer.userId, on ? { $addToSet: { subscribedSourceIds: sid } } : { $pull: { subscribedSourceIds: sid } });
      return shapeOneSource(doc._id, await viewerOf(user));
    },

    // Source sheet, aggregator items: "I subscribe" / "Hide this publisher" by
    // domain. An omitted flag is left as it is. The caller's own row only.
    newsSetPublisherPref: async (_, { domain, subscribed, muted }, { user }) => {
      requireUser(user);
      const d = normalizePublisherDomain(domain);
      const userId = String(user.id);
      const update = {};
      const add = (field) => { update.$addToSet = { ...(update.$addToSet || {}), [field]: d }; };
      const pull = (field) => { update.$pull = { ...(update.$pull || {}), [field]: d }; };
      if (subscribed === true || muted === true) {
        const row = await NewsPrefs.findOne({ userId }, { subscribedDomains: 1, mutedDomains: 1 }).lean();
        const full = (field, max) => {
          const list = row?.[field] || [];
          return !list.includes(d) && list.length >= max;
        };
        if (subscribed === true && full('subscribedDomains', SUBSCRIBED_DOMAINS_MAX)) {
          throw badInput(`You can subscribe to at most ${SUBSCRIBED_DOMAINS_MAX} publishers`);
        }
        if (muted === true && full('mutedDomains', MUTED_DOMAINS_MAX)) {
          throw badInput(`You can hide at most ${MUTED_DOMAINS_MAX} publishers`);
        }
      }
      if (subscribed === true) add('subscribedDomains');
      if (subscribed === false) pull('subscribedDomains');
      if (muted === true) add('mutedDomains');
      if (muted === false) pull('mutedDomains');
      if (!Object.keys(update).length) return prefsFor(user);
      return shapePrefs(await writePrefs(userId, update));
    },

    newsSetSourceDefaultOn: async (_, { id, on }, { user }) => {
      await requireAdminUser(user);
      const oid = toObjectId(id, 'id');
      const res = await NewsSource.updateOne({ _id: oid }, { $set: { defaultOn: Boolean(on) } });
      if (!res.matchedCount) throw codedError('Source not found', 'NOT_FOUND');
      return shapeOneSource(oid, await viewerOf(user));
    },

    newsCreateSource: async (_, { input }, { user }) => {
      requireUser(user);
      const viewer = await viewerOf(user);
      if (!viewer.isAdmin) assertAdderInput(input);
      const validated = await validateSourceInput(input, { creating: true });
      const { patch } = validated;
      const feeds = viewer.isAdmin ? validated.feeds : readerFeeds(validated.feeds);
      const explicit = patch.slug != null;
      const base = explicit ? patch.slug : slugify(patch.name);
      if (!base) throw badInput('Could not derive a slug from the name; provide one');
      if (!viewer.isAdmin) await assertUnderCreateLimits(viewer.userId);
      await assertNoDuplicateFeeds(feeds);
      const slug = await uniqueSlug(base, { explicit });

      // Every new source is `active`, so the worker polls it on its next tick
      // (2026-10-10; N0's `discovered` default served only the hand-entry
      // form). An admin's is on for everyone unless they say otherwise; a
      // reader's is on only for them.
      const doc = {
        slug,
        status: 'active',
        ...expandPatch(patch),
        addedBy: viewer.userId,
        defaultOn: viewer.isAdmin ? (patch.defaultOn ?? true) : false,
      };
      doc.feeds = (feeds || []).map((f) => ({ ...f, nextPollAt: new Date() }));
      try {
        const created = await NewsSource.create(doc);
        return await shapeOneSource(created._id, viewer);
      } catch (err) {
        return duplicateSlugGuard(err);
      }
    },

    newsUpdateSource: async (_, { id, input }, { user }) => {
      requireUser(user);
      const current = await sourceForWrite(id);
      const viewer = await viewerOf(user);
      requireEditor(current, viewer);
      if (!viewer.isAdmin) assertAdderInput(input);
      const oid = current._id;
      const validated = await validateSourceInput(input, { creating: false });
      const { patch } = validated;
      const feeds = viewer.isAdmin ? validated.feeds : readerFeeds(validated.feeds);
      if (feeds) await assertNoDuplicateFeeds(feeds, { excludeId: oid });
      const existing = await NewsSource.findById(oid);
      if (!existing) throw codedError('Source not found', 'NOT_FOUND');

      if (patch.slug != null) patch.slug = await uniqueSlug(patch.slug, { explicit: true, excludeId: oid });

      existing.set(expandPatch(patch));

      if (feeds) {
        // Replace by url: a url that stays keeps its subdocument (id + poll state);
        // a new url starts fresh and is due now; a url that's gone is dropped.
        const byUrl = new Map(existing.feeds.map((f) => [f.url, f.toObject()]));
        existing.feeds = feeds.map((f) => {
          const kept = byUrl.get(f.url);
          return kept ? { ...kept, ...f } : { ...f, nextPollAt: new Date() };
        });
      }

      try {
        await existing.save();
      } catch (err) {
        return duplicateSlugGuard(err);
      }
      return shapeOneSource(oid, viewer);
    },

    newsSetSourceStatus: async (_, { id, status }, { user }) => {
      requireUser(user);
      const current = await sourceForWrite(id);
      const viewer = await viewerOf(user);
      requireEditor(current, viewer);
      oneOf(status, SOURCE_STATUSES, 'status');
      if (!viewer.isAdmin && !ADDER_STATUSES.includes(status)) {
        throw adminRequired(`You can set your own source to ${ADDER_STATUSES.join(' or ')}`);
      }
      // Poll state is deliberately left alone: the worker owns it.
      const res = await NewsSource.updateOne({ _id: current._id }, { $set: { status } });
      if (!res.matchedCount) throw codedError('Source not found', 'NOT_FOUND');
      return shapeOneSource(current._id, viewer);
    },

    newsCheckSourceNow: async (_, { id }, { user }) => {
      requireUser(user);
      const current = await sourceForWrite(id);
      const viewer = await viewerOf(user);
      requireEditor(current, viewer);
      const res = await NewsSource.updateOne({ _id: current._id }, { $set: { 'feeds.$[].nextPollAt': new Date() } });
      if (!res.matchedCount) throw codedError('Source not found', 'NOT_FOUND');
      return shapeOneSource(current._id, viewer);
    },
  },
};

/** { 'access.paywall': x } → { access: { paywall: x } } so `doc.set` / `create` take it uniformly. */
function expandPatch(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith('access.')) {
      out.access = { ...(out.access || {}), [key.slice(7)]: value };
    } else {
      out[key] = value;
    }
  }
  return out;
}
