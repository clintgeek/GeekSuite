import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { NewsSource } from './models/source.js';
import { NewsPlace } from './models/place.js';
import { NewsArticle } from './models/article.js';
import { NewsPrefs } from './models/prefs.js';
import { requireAdminUser } from '../basegeek/resolvers.js';
import constants from '@geeksuite/schemas/newsgeek/constants';
import healthModule from '@geeksuite/schemas/newsgeek/health';
import paywallsModule from '@geeksuite/schemas/newsgeek/paywalls';

const {
  SOURCE_KINDS, SECTIONS, SOURCE_STATUSES, FEED_FORMATS, PAYWALLS, PAYWALLED_LEVELS, CONTENT_LEVELS,
} = constants;
const { feedHealth } = healthModule;
const { PAYWALLED_DOMAIN_REGEX } = paywallsModule;

/**
 * NewsGeek gateway — DOCS/NEWSGEEK_PLAN.md "Gateway API, N0".
 *
 * Every query needs a signed-in user; every source mutation needs an admin
 * (requireAdminUser, checked BEFORE validation). newsSetPrefs is per reader:
 * any signed-in user, and only ever the caller's own row. Sources and places are
 * shaped in batch (one places read, one aggregation for articlesLast7d), so
 * there are no field resolvers and no N+1.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_FEEDS = 20;
const MAX_BLOCKED = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const { ObjectId } = mongoose.Types;

function codedError(message, code) {
  return new GraphQLError(message, { extensions: { code } });
}
const badInput = (message) => codedError(message, 'BAD_USER_INPUT');

function requireUser(user) {
  if (!user?.id) throw codedError('Authentication required', 'UNAUTHENTICATED');
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

async function shapeSources(docs) {
  const [placeMap, counts] = await Promise.all([
    loadPlaceMap(docs.map((s) => s.places || [])),
    countLast7d(docs.map((s) => s._id)),
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
  }));
}

async function shapeOneSource(id) {
  const doc = await NewsSource.findById(id).lean();
  if (!doc) throw codedError('Source not found', 'NOT_FOUND');
  return (await shapeSources([doc]))[0];
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
    if (seen.has(url)) throw badInput(`Duplicate feed url: ${url}`);
    seen.add(url);
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
  return { freeToReadOnly: Boolean(row?.freeToReadOnly ?? PREFS_DEFAULTS.freeToReadOnly) };
}

/** The caller's prefs; userId comes from the session only. */
async function prefsFor(user) {
  const row = await NewsPrefs.findOne({ userId: String(user.id) }).lean();
  return shapePrefs(row);
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

async function articlePage(args, { freeToReadOnly = false } = {}) {
  const { section, placeId, sourceId, before } = args;
  if (section != null) oneOf(section, SECTIONS, 'section');
  let limit = args.limit == null ? DEFAULT_LIMIT : args.limit;
  if (!Number.isInteger(limit) || limit < 1) throw badInput('limit must be a positive integer');
  limit = Math.min(limit, MAX_LIMIT);

  // Which sources can contribute: not retired, optionally in a section / one source.
  const sourceFilter = { status: { $ne: 'retired' } };
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
// Resolvers
// ---------------------------------------------------------------------------

export const resolvers = {
  Query: {
    newsViewer: async (_, __, { user }) => {
      requireUser(user);
      try {
        await requireAdminUser(user);
        return { isAdmin: true };
      } catch (err) {
        if (err?.extensions?.code === 'ADMIN_REQUIRED') return { isAdmin: false };
        throw err;
      }
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
      const docs = await NewsSource.find(filter).sort({ name: 1 }).lean();
      return shapeSources(docs);
    },

    newsSource: async (_, { id }, { user }) => {
      requireUser(user);
      const oid = toObjectId(id, 'id');
      const doc = await NewsSource.findById(oid).lean();
      if (!doc) return null;
      return (await shapeSources([doc]))[0];
    },

    newsPrefs: async (_, __, { user }) => {
      requireUser(user);
      return prefsFor(user);
    },

    newsArticles: async (_, args, { user }) => {
      requireUser(user);
      return articlePage(args, await prefsFor(user));
    },
  },

  Mutation: {
    newsSetPrefs: async (_, { input }, { user }) => {
      requireUser(user);
      const userId = String(user.id);
      const set = {};
      if (input?.freeToReadOnly != null) set.freeToReadOnly = Boolean(input.freeToReadOnly);
      const write = () => NewsPrefs.findOneAndUpdate(
        { userId },
        { $set: set, $setOnInsert: { userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      // Two first-ever writes racing on the unique userId: the loser retries as an update.
      const row = await write().catch((err) => (err?.code === 11000 ? write() : Promise.reject(err)));
      return shapePrefs(row);
    },

    newsCreateSource: async (_, { input }, { user }) => {
      await requireAdminUser(user);
      const { patch, feeds } = await validateSourceInput(input, { creating: true });
      const explicit = patch.slug != null;
      const base = explicit ? patch.slug : slugify(patch.name);
      if (!base) throw badInput('Could not derive a slug from the name; provide one');
      const slug = await uniqueSlug(base, { explicit });

      const doc = { slug, status: 'discovered', ...expandPatch(patch) };
      doc.feeds = (feeds || []).map((f) => ({ ...f, nextPollAt: new Date() }));
      try {
        const created = await NewsSource.create(doc);
        return await shapeOneSource(created._id);
      } catch (err) {
        return duplicateSlugGuard(err);
      }
    },

    newsUpdateSource: async (_, { id, input }, { user }) => {
      await requireAdminUser(user);
      const oid = toObjectId(id, 'id');
      const { patch, feeds } = await validateSourceInput(input, { creating: false });
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
      return shapeOneSource(oid);
    },

    newsSetSourceStatus: async (_, { id, status }, { user }) => {
      await requireAdminUser(user);
      const oid = toObjectId(id, 'id');
      oneOf(status, SOURCE_STATUSES, 'status');
      // Poll state is deliberately left alone: the worker owns it.
      const res = await NewsSource.updateOne({ _id: oid }, { $set: { status } });
      if (!res.matchedCount) throw codedError('Source not found', 'NOT_FOUND');
      return shapeOneSource(oid);
    },

    newsCheckSourceNow: async (_, { id }, { user }) => {
      await requireAdminUser(user);
      const oid = toObjectId(id, 'id');
      const res = await NewsSource.updateOne({ _id: oid }, { $set: { 'feeds.$[].nextPollAt': new Date() } });
      if (!res.matchedCount) throw codedError('Source not found', 'NOT_FOUND');
      return shapeOneSource(oid);
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
