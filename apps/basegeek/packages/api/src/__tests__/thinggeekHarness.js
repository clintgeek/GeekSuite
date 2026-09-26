/**
 * Shared setup for the thinggeek*.test.js suites (not itself a suite).
 *
 * ThingGeek's behaviour lives as much in FIELD resolvers (Thing.missing,
 * ThingDate.daysUntil, relationships, photo URLs) as in the root ones, so
 * these suites execute real operations against the real merged gateway
 * schema (the ApolloServer the server boots), not just resolver functions.
 *
 * The member gate is real: CHEF and HEATHER are the two ids on
 * @geeksuite/schemas/thinggeek/household's MEMBER_USER_IDS; OUTSIDER is any
 * other signed-in account. The "other household" is rows inserted straight
 * into Mongo with householdId 'other-household' (resolveHouseholdId always
 * answers 'default' today).
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { Thing } = await import('../graphql/thinggeek/models/thing.js');
const { ThingType } = await import('../graphql/thinggeek/models/thingType.js');
const { Place } = await import('../graphql/thinggeek/models/place.js');
const { ThingFile } = await import('../graphql/thinggeek/models/file.js');
const { ThingProfile } = await import('../graphql/thinggeek/models/profile.js');
const thingResolvers = (await import('../graphql/thinggeek/resolvers.js')).resolvers;

export { Thing, ThingType, Place, ThingFile, ThingProfile, thingResolvers };

export const CHEF = '6818c2bddcf626909f6a93a1';
export const HEATHER = '689931bbe8828efb78d11bab';
export const OUTSIDER = String(new mongoose.Types.ObjectId());
export const OTHER_HOUSEHOLD = 'other-household';

export const ctx = (userId) => (userId ? { user: { id: userId } } : { user: null });

let server;

export async function startHarness() {
  await Thing.db.asPromise();
  await Promise.all([Thing.init(), ThingType.init(), Place.init(), ThingFile.init(), ThingProfile.init()]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}

export async function stopHarness() {
  if (server) await server.stop();
  await Thing.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** ALL thinggeek collections — a row left behind leaks into the next suite. */
export async function cleanAll() {
  await Promise.all([
    Thing.deleteMany({}),
    ThingType.deleteMany({}),
    Place.deleteMany({}),
    ThingFile.deleteMany({}),
    ThingProfile.deleteMany({}),
  ]);
}

/** Execute an operation; returns `{ data, errors }`. */
export async function run(query, variables = {}, userId = CHEF) {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctx(userId) });
  const single = res.body.kind === 'single' ? res.body.singleResult : null;
  return { data: single?.data ?? null, errors: single?.errors ?? null };
}

/** Execute and insist on no errors; returns `data`. */
export async function ok(query, variables = {}, userId = CHEF) {
  const { data, errors } = await run(query, variables, userId);
  if (errors) throw new Error(`GraphQL errors: ${JSON.stringify(errors, null, 2)}`);
  return data;
}

/** The first error's extensions.code (or null). */
export async function errorCode(query, variables = {}, userId = CHEF) {
  const { errors } = await run(query, variables, userId);
  return errors?.[0]?.extensions?.code ?? null;
}

export const THING_FIELDS = `
  id name tags notes missing deletedAt createdAt
  type { id key name }
  place { id name }
  acquired { date from price { amount currency } }
  value { amount currency asOf }
  dates { id kind label date recurEveryMonths daysUntil status }
  nextDue { id kind date daysUntil status }
  attributes
  fields { key label kind unit identifier value }
  photos { id fileId role caption url thumbUrl width height }
  coverPhoto { id url thumbUrl }
  documents { id fileId role title url mime size originalName }
  relationships { id kind direction thing { id name coverThumbUrl type { key } } }
`;

export const CREATE_THING = `mutation($input: ThingInput!) { createThing(input: $input) { ${THING_FIELDS} } }`;
export const UPDATE_THING = `mutation($id: ID!, $input: ThingInput!) { updateThing(id: $id, input: $input) { ${THING_FIELDS} } }`;
export const THINGS = `query($filter: ThingFilterInput, $sort: String, $sortDir: String, $seed: Int, $page: Int, $limit: Int) {
  things(filter: $filter, sort: $sort, sortDir: $sortDir, seed: $seed, page: $page, limit: $limit) { total page pages things { id name } }
}`;
export const TYPES = `query { thingTypes { id key name icon builtIn thingCount fields { key label kind choices unit identifier required } } }`;

/** Seed the starter types (as CHEF) and return them keyed by key. */
export async function starterTypes(userId = CHEF) {
  const data = await ok(TYPES, {}, userId);
  return Object.fromEntries(data.thingTypes.map((t) => [t.key, t]));
}

export async function createThing(input, userId = CHEF) {
  return (await ok(CREATE_THING, { input }, userId)).createThing;
}

export async function names(filter = {}, extra = {}, userId = CHEF) {
  const data = await ok(THINGS, { filter, limit: 100, ...extra }, userId);
  return data.things.things.map((t) => t.name);
}

export async function createPlace(name, parentId = null, userId = CHEF) {
  const data = await ok(`mutation($input: PlaceInput!) { createPlace(input: $input) { id name } }`, { input: { name, parentId } }, userId);
  return data.createPlace;
}

/** UTC calendar day `n` days from today, as YYYY-MM-DD. */
export function dayFromToday(n) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n));
  return d.toISOString().slice(0, 10);
}

/** Insert a file record directly (the backend writes these). */
export async function insertFile({ householdId = 'default', thumb = true, kind = 'photo', mime = 'image/jpeg' } = {}) {
  const doc = await ThingFile.create({
    householdId,
    kind,
    mime,
    size: 1234,
    sha256: Math.random().toString(16).slice(2),
    path: `x/${Math.random().toString(16).slice(2)}.jpg`,
    thumbPath: thumb ? 'thumbs/x.webp' : null,
    width: 800,
    height: 600,
    originalName: 'photo.jpg',
  });
  return doc;
}

/** Attach photos/documents directly (uploads are the backend's job). */
export async function attach(thingId, { photos = [], documents = [] } = {}) {
  await Thing.updateOne(
    { _id: thingId },
    {
      $push: {
        photos: { $each: photos.map((p) => ({ _id: new mongoose.Types.ObjectId(), fileId: p.fileId, role: p.role ?? 'overview', caption: '' })) },
        documents: { $each: documents.map((d) => ({ _id: new mongoose.Types.ObjectId(), fileId: d.fileId, role: d.role ?? 'other', title: '' })) },
      },
    }
  );
}
