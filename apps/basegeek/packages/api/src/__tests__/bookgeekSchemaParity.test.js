/**
 * bookgeekSchemaParity.test.js — the tripwire for BookGeek's shared schemas
 * (DOCS/BOOKGEEK_CLEANUP_PLAN.md, Phase A step 2).
 *
 * bookgeek's own API and basegeek's GraphQL gateway both declare `Book` and
 * `Profile` against THE SAME `books` / `profiles` collections. Mongoose strict
 * mode drops an unknown path from a `$set` silently, so two drifted copies
 * mean writes through one side return success and persist nothing. Until
 * 2026-09-25 both copies were kept identical by hand; now both build from
 * @geeksuite/schemas/bookgeek/{book,profile}. This suite fails the moment
 * either side stops doing that.
 *
 * The two writers run DIFFERENT mongoose majors (bookgeek's api is on 7.x,
 * basegeek on 8.x), so the write-through below uses each side's own mongoose
 * against the one in-memory Mongo — the production topology, not a
 * simulation of it.
 *
 * The bookgeek half of the tripwire is `apps/bookgeek/api/test/sharedSchema.test.js`
 * (hermetic, node:test).
 *
 * Same shape as fitnessgeekSchemaParity.test.js; the helpers are lifted from it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const { Book: BookGraphQL } = await import('../graphql/bookgeek/models/book.js');
const { Profile: ProfileGraphQL } = await import('../graphql/bookgeek/models/profile.js');
const { Book: BookRest } = await import('../../../../../bookgeek/api/src/models/book.js');
const { Profile: ProfileRest } = await import('../../../../../bookgeek/api/src/models/profile.js');
const { default: bookShared } = await import('@geeksuite/schemas/bookgeek/book');
const { default: profileShared } = await import('@geeksuite/schemas/bookgeek/profile');

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../../../..');

const PROBE_TITLE = `parity-probe-${new mongoose.Types.ObjectId()}`;
const PROBE_USER = `parity-user-${new mongoose.Types.ObjectId()}`;

const PAIRS = [
  {
    name: 'Book',
    Rest: BookRest,
    GraphQL: BookGraphQL,
    createSchema: bookShared.createBookSchema,
    collection: 'books',
    restFile: 'apps/bookgeek/api/src/models/book.js',
    graphqlFile: 'apps/basegeek/packages/api/src/graphql/bookgeek/models/book.js',
    sharedSpecifier: 'schemas/bookgeek/book',
    // Every declared path, so a silently-dropped one is named by the failure.
    expectedPaths: [
      'title', 'authors', 'series', 'isbn', 'isbn13',
      'goodreadsId', 'openLibraryId', 'asin', 'googleBooksId',
      'publisher', 'publishedDate', 'pageCount', 'description', 'language', 'tags',
      'files', 'coverPath', 'owned', 'shelf',
      'rating', 'review', 'dateAdded', 'dateStarted', 'dateFinished', 'readCount', 'readingProgress',
      'source', 'createdAt', 'updatedAt',
    ],
    // No schema.index() and no path-level index on Book: the only index on
    // the real collection is `_id_`.
    expectedIndexes: [],
    filter: { title: PROBE_TITLE },
    // Every declared field set, so the round trip below names any path
    // either side would drop.
    doc: () => ({
      title: PROBE_TITLE,
      authors: ['Frank Herbert'],
      series: { name: 'Dune', index: 1 },
      isbn: '0441013597',
      isbn13: '9780441013593',
      goodreadsId: 'gr-probe',
      openLibraryId: 'OL-probe',
      asin: 'B-probe',
      googleBooksId: 'g-probe',
      publisher: 'Ace',
      publishedDate: new Date('1965-01-01T00:00:00.000Z'),
      pageCount: 412,
      description: 'probe',
      language: 'en',
      tags: ['sf'],
      files: [{ format: 'epub', path: 'Frank Herbert/Dune/dune.epub', size: 1234, addedAt: new Date('2026-09-25T00:00:00.000Z') }],
      coverPath: 'Frank Herbert/Dune/cover.jpg',
      owned: true,
      shelf: 'custom-probe',
      rating: 4,
      review: 'probe review',
      dateAdded: new Date('2026-09-01T00:00:00.000Z'),
      dateStarted: new Date('2026-09-02T00:00:00.000Z'),
      dateFinished: new Date('2026-09-03T00:00:00.000Z'),
      readCount: 2,
      readingProgress: 37,
      source: 'manual',
    }),
  },
  {
    name: 'Profile',
    Rest: ProfileRest,
    GraphQL: ProfileGraphQL,
    createSchema: profileShared.createBookProfileSchema,
    collection: 'profiles',
    restFile: 'apps/bookgeek/api/src/models/profile.js',
    graphqlFile: 'apps/basegeek/packages/api/src/graphql/bookgeek/models/profile.js',
    sharedSpecifier: 'schemas/bookgeek/profile',
    expectedPaths: [
      'userId', 'kindleEmail', 'deviceWord', 'customShelves', 'savedFilters', 'createdAt', 'updatedAt',
    ],
    // `userId` unique (path-level) and `deviceWord` unique+sparse — the two
    // indexes the real `profiles` collection carries besides `_id_`.
    expectedIndexes: [
      JSON.stringify([{ deviceWord: 1 }, { unique: true, sparse: true }]),
      JSON.stringify([{ userId: 1 }, { unique: true, sparse: false }]),
    ].sort(),
    filter: { userId: PROBE_USER },
    // deviceWord already trimmed/lowercased: those setters are pinned by
    // the path comparison above, this block is about what survives.
    doc: () => ({
      userId: PROBE_USER,
      kindleEmail: 'probe@kindle.example',
      deviceWord: 'probe-word',
      customShelves: [{ id: 'custom-probe', label: 'Probe' }],
      savedFilters: [{
        id: 'f1', name: 'Probe', sortBy: 'title', sortDir: 'asc', searchQuery: 'dune',
        authorFilter: 'Herbert', tagFilter: 'sf', shelfFilter: 'read', ownedOnly: true, ownedFilter: 'owned',
      }],
    }),
  },
];

// ---------------------------------------------------------------------------
// Helpers (lifted from fitnessgeekSchemaParity.test.js)
// ---------------------------------------------------------------------------

function describePath(p) {
  const o = p.options || {};
  return JSON.stringify({
    instance: p.instance,
    enum: o.enum ? [].concat(o.enum) : undefined,
    default: typeof o.default === 'function' ? '[fn]' : o.default,
    required: !!o.required,
    index: !!o.index,
    unique: !!o.unique,
    sparse: !!o.sparse,
    trim: !!o.trim,
    lowercase: !!o.lowercase,
    min: o.min,
    max: o.max,
  });
}

const describeIndexes = (schema) =>
  schema
    .indexes()
    .map(([keys, opts = {}]) => JSON.stringify([keys, { unique: !!opts.unique, sparse: !!opts.sparse }]))
    .sort();

const COMPILED_ONLY = new Set(['_id', '__v']);
const fieldKeys = (paths) => Object.keys(paths).filter((k) => !COMPILED_ONLY.has(k)).sort();

/** Every path including array sub-document paths, so nested drift shows too. */
function deepPaths(schema, prefix = '') {
  const out = {};
  for (const [k, p] of Object.entries(schema.paths)) {
    if (!prefix && k === '__v') continue; // added when a model compiles, not by the definition
    out[prefix + k] = describePath(p);
    if (p.schema) Object.assign(out, deepPaths(p.schema, `${prefix}${k}.$.`));
  }
  return out;
}

/** JSON-normalize, drop every `_id`, keep only the keys the probe doc set. */
function roundTrip(stored, doc) {
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).filter(([k]) => k !== '_id').map(([k, x]) => [k, strip(x)]));
    }
    return v;
  };
  const json = strip(JSON.parse(JSON.stringify(stored)));
  return Object.fromEntries(Object.keys(doc).map((k) => [k, json[k]]));
}
const expectedRoundTrip = (doc) => roundTrip(doc, doc);

const subdocIdOption = (schema, key) => schema.path(key)?.schema?.options?._id;

// ---------------------------------------------------------------------------
// Schema parity
// ---------------------------------------------------------------------------

describe.each(PAIRS.map((p) => [p.name, p]))('%s schema parity (tripwire)', (name, pair) => {
  test('both models expose exactly the expected schema paths', () => {
    const restKeys = fieldKeys(pair.Rest.schema.paths);
    const graphqlKeys = fieldKeys(pair.GraphQL.schema.paths);
    const onlyInRest = restKeys.filter((k) => !graphqlKeys.includes(k));
    const onlyInGraphQL = graphqlKeys.filter((k) => !restKeys.includes(k));
    expect({ onlyInRest, onlyInGraphQL }).toEqual({ onlyInRest: [], onlyInGraphQL: [] });
    expect(restKeys).toEqual([...pair.expectedPaths].sort());
  });

  test('both models agree on every path, nested ones included, with each other and the shared definition', () => {
    const rest = deepPaths(pair.Rest.schema);
    const graphql = deepPaths(pair.GraphQL.schema);
    const shared = deepPaths(pair.createSchema(mongoose));
    expect(graphql).toEqual(rest);
    expect(shared).toEqual(rest);
  });

  test('both models declare exactly the expected indexes (no surprise index builds on deploy)', () => {
    expect(describeIndexes(pair.Rest.schema)).toEqual(pair.expectedIndexes);
    expect(describeIndexes(pair.GraphQL.schema)).toEqual(pair.expectedIndexes);
    expect(describeIndexes(pair.createSchema(mongoose))).toEqual(pair.expectedIndexes);
  });

  test('same options: timestamps on, strict on, no virtuals, no toJSON/toObject transforms', () => {
    for (const m of [pair.Rest, pair.GraphQL]) {
      expect(m.schema.options.timestamps).toBe(true);
      expect(m.schema.options.strict).toBe(true);
      expect(m.schema.options.toJSON).toBeUndefined();
      expect(m.schema.options.toObject).toBeUndefined();
      expect(Object.keys(m.schema.virtuals).filter((v) => v !== 'id')).toEqual([]);
    }
  });

  test('both models resolve to the same collection', () => {
    expect(pair.Rest.collection.name).toBe(pair.collection);
    expect(pair.GraphQL.collection.name).toBe(pair.collection);
  });

  test('both model files build from the shared module and declare no schema of their own', () => {
    // The structural checks above would still pass if someone pasted a
    // faithful copy back into either file. This is what catches that.
    for (const rel of [pair.restFile, pair.graphqlFile]) {
      const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
      expect({ rel, imports: src.includes(pair.sharedSpecifier) }).toEqual({ rel, imports: true });
      expect({ rel, declares: /new\s+mongoose\.Schema\s*\(/.test(src) }).toEqual({ rel, declares: false });
    }
  });
});

describe('Book sub-documents keep their shipped shape', () => {
  test('files[] and series carry no _id on either side (real documents have none)', () => {
    for (const m of [BookRest, BookGraphQL]) {
      expect(subdocIdOption(m.schema, 'files')).toBe(false);
      expect(subdocIdOption(m.schema, 'series')).toBe(false);
    }
  });

  test('customShelves[] and savedFilters[] DO carry an _id on either side (real profiles have them)', () => {
    for (const m of [ProfileRest, ProfileGraphQL]) {
      expect(subdocIdOption(m.schema, 'customShelves')).not.toBe(false);
      expect(subdocIdOption(m.schema, 'savedFilters')).not.toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Write-through: bookgeek api (mongoose 7) ⇄ gateway (mongoose 8), one Mongo
// ---------------------------------------------------------------------------

describe.each(PAIRS.map((p) => [p.name, p]))('%s write-through (api ⇄ gateway on one collection)', (name, pair) => {
  let apiConn;
  let RestSide;

  beforeAll(async () => {
    await pair.GraphQL.db.asPromise();
    // The api model's own mongoose (7.x), on its own connection, pointed at
    // the database the gateway model uses.
    const { host, port, name: dbName } = pair.GraphQL.db;
    apiConn = pair.Rest.base.createConnection(`mongodb://${host}:${port}/`, { dbName });
    await apiConn.asPromise();
    RestSide = apiConn.model(pair.name, pair.Rest.schema, pair.collection);
  }, 60000);

  afterEach(async () => {
    await pair.GraphQL.deleteMany(pair.filter);
  });

  afterAll(async () => {
    await apiConn?.close();
  });

  test('the two sides really are different mongoose installs (the premise of this block)', () => {
    expect(pair.Rest.base).not.toBe(mongoose);
  });

  test('a document written by the api reads back whole through the gateway', async () => {
    const doc = pair.doc();
    await RestSide.create(doc);
    const after = await pair.GraphQL.findOne(pair.filter).lean();
    expect(after).toBeTruthy();
    expect(roundTrip(after, doc)).toEqual(expectedRoundTrip(doc));
  });

  test('a document written by the gateway reads back whole through the api', async () => {
    const doc = pair.doc();
    await pair.GraphQL.create(doc);
    const after = await RestSide.findOne(pair.filter).lean();
    expect(after).toBeTruthy();
    expect(roundTrip(after, doc)).toEqual(expectedRoundTrip(doc));
  });

  test('control: strict mode really does drop a path neither schema declares', async () => {
    await pair.GraphQL.findOneAndUpdate(
      pair.filter,
      { $set: { ...pair.doc(), not_a_real_field: 'nope' } },
      { upsert: true, new: true }
    );
    await RestSide.updateOne(pair.filter, { $set: { also_not_real: 'nope' } });
    const after = await pair.GraphQL.findOne(pair.filter).lean();
    expect(after).toBeTruthy();
    expect(after.not_a_real_field).toBeUndefined();
    expect(after.also_not_real).toBeUndefined();
  });
});

afterAll(async () => {
  await BookGraphQL.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
