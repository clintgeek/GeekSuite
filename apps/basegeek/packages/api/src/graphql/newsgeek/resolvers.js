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

const {
  SOURCE_KINDS, SECTIONS, SOURCE_STATUSES, FEED_FORMATS, PAYWALLS, PAYWALLED_LEVELS, CONTENT_LEVELS,
} = constants;
const { feedHealth } = healthModule;
const { PAYWALLED_DOMAIN_REGEX, isPaywalledDomain } = paywallsModule;
const { normalizeFeedUrl } = feedUrlModule;
const { READER_LINKS_MAX, READER_LINK_LABEL_MAX, READER_LINK_TEMPLATE_MAX } = prefsSchemaModule;

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
async function countLast7d(sourceIds) {
  if (!sourceIds.length) return new Map();
  const since = new Date(Date.now() - 7 * DAY_MS);
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
  };
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

const isPaywalledSource = (s) => PAYWALLED_LEVELS.includes(s.access?.paywall);

function shapePrefs(row) {
  return {
    freeToReadOnly: Boolean(row?.freeToReadOnly ?? PREFS_DEFAULTS.freeToReadOnly),
    readerLinks: (row?.readerLinks || []).map((l) => ({ label: l.label, template: l.template })),
  };
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
function paywalledClause(sources) {
  const walled = sources.filter(isPaywalledSource).map((s) => s._id);
  const aggregators = sources.filter((s) => s.kind === 'aggregator' && !isPaywalledSource(s)).map((s) => s._id);
  const or = [];
  if (walled.length) or.push({ sourceId: { $in: walled } });
  if (aggregators.length) or.push({ sourceId: { $in: aggregators }, publisherDomain: { $regex: PAYWALLED_DOMAIN_REGEX } });
  return or.length ? { $or: or } : null;
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

/** The place and every descendant, from one read of the (small) gazetteer. */
async function placeWithDescendants(placeId) {
  const root = toObjectId(placeId, 'placeId');
  const all = await NewsPlace.find({}, { parentId: 1 }).lean();
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

async function articlePage(args, viewer) {
  const { freeToReadOnly } = viewer;
  const { section, placeId, sourceId, before } = args;
  if (section != null) oneOf(section, SECTIONS, 'section');
  let limit = args.limit == null ? DEFAULT_LIMIT : args.limit;
  if (!Number.isInteger(limit) || limit < 1) throw badInput('limit must be a positive integer');
  limit = Math.min(limit, MAX_LIMIT);

  // Which sources can contribute: the ones this reader sees (never retired),
  // optionally in a section / one source.
  const sourceFilter = visibleSourceClause(viewer);
  if (section) sourceFilter.sections = section;
  if (sourceId != null) sourceFilter._id = toObjectId(sourceId, 'sourceId');
  const sources = await NewsSource.find(sourceFilter, { name: 1, kind: 1, sections: 1, access: 1 }).lean();
  if (!sources.length) return { items: [], nextBefore: null, hiddenPaywalled: 0 };

  const now = new Date();
  // Everything but the cursor: the whole current list.
  const listFilter = {
    sourceId: { $in: sources.map((s) => s._id) },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };
  if (placeId != null) listFilter.places = { $in: await placeWithDescendants(placeId) };

  const walled = freeToReadOnly ? paywalledClause(sources) : null;
  const filter = { ...listFilter };
  if (before != null) filter.publishedAt = { $lt: before };
  if (walled) filter.$nor = [walled];

  const [rows, hiddenPaywalled] = await Promise.all([
    NewsArticle.find(filter, { embedding: 0 })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit)
      .lean(),
    // The one extra count, only when something can be hidden.
    walled ? NewsArticle.countDocuments({ $and: [listFilter, walled] }) : 0,
  ]);

  const sourceMap = new Map(sources.map((s) => [String(s._id), s]));
  const placeMap = await loadPlaceMap(rows.map((a) => a.places || []));

  const items = rows.map((a) => {
    const src = sourceMap.get(String(a.sourceId));
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
      sections: src.sections || [],
      places: placesOf(a.places, placeMap),
    };
  });

  return {
    items,
    nextBefore: items.length === limit ? items[items.length - 1].publishedAt : null,
    hiddenPaywalled,
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
      const row = await writePrefs(String(user.id), { $set: set });
      return shapePrefs(row);
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
