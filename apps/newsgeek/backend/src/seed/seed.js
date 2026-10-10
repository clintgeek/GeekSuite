/**
 * Seeding: the gazetteer and the starter sources (./data.js).
 *
 * INSERT-IF-ABSENT BY SLUG, nothing else. A place or source whose slug
 * already exists is left exactly as it is — its feeds, poll state, status,
 * places and every admin edit — and so is a source an admin retired or
 * whose feeds an admin replaced. Missing feeds are NOT added to an existing
 * source either: the seed can't tell "never had it" from "an admin removed
 * it", and the second must win. To pick up a changed starter source, add or
 * edit it through the gateway (or delete the document and re-seed).
 *
 * Each write is one `updateOne({ slug }, { $setOnInsert }, { upsert })`,
 * atomic per document, so two concurrent seeds (two boots) can't duplicate a
 * slug (the unique index backs that up; a duplicate-key race is ignored).
 * Runs on every boot and as `npm run seed`. Logs counts only.
 */
import { PLACES, SOURCES } from './data.js';

const isDupKey = (err) => err?.code === 11000;

async function insertIfAbsent(Model, doc, now) {
  // Build through the model so defaults, casting and validation (enums,
  // feed subdocument _ids) are exactly what a gateway write would produce.
  const built = new Model(doc);
  const invalid = built.validateSync();
  if (invalid) throw invalid;
  const obj = built.toObject({ depopulate: true });
  delete obj._id;
  obj.createdAt = now;
  obj.updatedAt = now;
  try {
    const res = await Model.collection.updateOne({ slug: doc.slug }, { $setOnInsert: obj }, { upsert: true });
    return res.upsertedCount === 1;
  } catch (err) {
    if (isDupKey(err)) return false;
    throw err;
  }
}

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.Place
 * @param {import('mongoose').Model} deps.Source
 * @param {{ places?: object[], sources?: object[] }} [deps.data]  defaults to ./data.js
 * @returns {Promise<{ placesInserted: number, sourcesInserted: number, placesTotal: number, sourcesTotal: number }>}
 */
export async function runSeed({ Place, Source, data = {}, now = () => new Date(), log } = {}) {
  const places = data.places || PLACES;
  const sources = data.sources || SOURCES;
  const at = now();

  // Places in list order: parents come before children.
  let placesInserted = 0;
  const idBySlug = new Map();
  const known = async (slug) => {
    if (!idBySlug.has(slug)) {
      const row = await Place.findOne({ slug }, { _id: 1 }).lean();
      if (row) idBySlug.set(slug, row._id);
    }
    return idBySlug.get(slug) || null;
  };
  for (const p of places) {
    const parentId = p.parent ? await known(p.parent) : null;
    if (p.parent && !parentId) {
      log?.warn({ event: 'seed_place_parent_missing', slug: p.slug, parent: p.parent }, 'seed: parent place missing');
    }
    const inserted = await insertIfAbsent(Place, {
      slug: p.slug, name: p.name, kind: p.kind, parentId, aliases: p.aliases || [], fips: p.fips ?? null,
    }, at);
    if (inserted) placesInserted += 1;
    await known(p.slug);
  }

  let sourcesInserted = 0;
  for (const s of sources) {
    const placeIds = [];
    for (const slug of s.places || []) {
      const id = await known(slug);
      if (id) placeIds.push(id);
      else log?.warn({ event: 'seed_source_place_missing', slug: s.slug, place: slug }, 'seed: source place missing');
    }
    const inserted = await insertIfAbsent(Source, {
      slug: s.slug,
      name: s.name,
      homepage: s.homepage ?? null,
      kind: s.kind,
      sections: s.sections || [],
      places: placeIds,
      feeds: (s.feeds || []).map((f) => ({ url: f.url, format: f.format || 'rss', pollEveryMin: f.pollEveryMin })),
      status: 'active',
      access: s.access,
      blockedDomains: s.blockedDomains || [],
      notes: s.notes || '',
    }, at);
    if (inserted) sourcesInserted += 1;
  }

  const result = { placesInserted, sourcesInserted, placesTotal: places.length, sourcesTotal: sources.length };
  log?.info({ event: 'seed_done', ...result }, 'seed finished');
  return result;
}

export default { runSeed };
