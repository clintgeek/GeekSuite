/**
 * One-off migration: the Place tree → the containment graph
 * (DOCS/THINGGEEK_PLAN.md "Containment", decided 2026-09-26).
 *
 * Inside the running container (the image's WORKDIR is the backend, and the
 * container's env already carries MONGODB_URI from .env.production):
 *
 *   docker exec -it thinggeek node scripts/migrate-containment.js                        # dry run (default)
 *   docker exec -it thinggeek node scripts/migrate-containment.js --apply                # write
 *   docker exec -it thinggeek node scripts/migrate-containment.js --apply --drop-places  # write, then drop `places`
 *
 * Per household:
 *   a. Starter types: every type with no stored `kind` gets one (its starter's
 *      kind, else `item`); a household seeded at version 1 gets the starter
 *      types added since (Location, Storage). Its profiles are marked
 *      starterTypesVersion = STARTER_TYPES_VERSION so the gateway doesn't
 *      redo it. A starter type the household deleted stays deleted.
 *   b. Every `places` document becomes a Thing of the household's Location
 *      type WITH THE PLACE'S OWN _id — so old parentIds carry over 1:1, and
 *      "already converted" is simply "a thing with that _id exists".
 *   c. A thing with a legacy `placeId` gets parentId = placeId (when that
 *      place was converted and it has no parent yet); placeId is unset.
 *   d. Relationship kinds that no longer exist (equipped-with, part-of,
 *      stored-with) are pulled.
 * `--drop-places` (only with --apply) drops the `places` collection once
 * every place is verified to exist as a thing; otherwise it is kept.
 *
 * Idempotent: a second --apply finds nothing to do. Prints counts only —
 * never the connection string, ids or names.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import thingConstants from '@geeksuite/schemas/thinggeek/constants';
import thingModule from '@geeksuite/schemas/thinggeek/thing';
import starterModule from '@geeksuite/schemas/thinggeek/starterTypes';

const { RELATIONSHIP_KINDS, STARTER_TYPES, bounds } = thingConstants;
const { createThingSchema, computeSortName } = thingModule;
const { STARTER_TYPES_VERSION, starterTypeDoc, starterTypeUpgrade } = starterModule;

const LOCATION_KEY = 'location';
const isDuplicateKey = (err) =>
  err?.code === 11000 ||
  (Array.isArray(err?.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000));

/** A detached Thing model, only to apply the shared schema's defaults to a new document. */
function thingShaper() {
  const m = new mongoose.Mongoose();
  const Model = m.model('MigrateThing', createThingSchema(m), 'things');
  return (fields) => {
    const doc = new Model(fields);
    const err = doc.validateSync();
    if (err) throw err;
    return doc.toObject({ depopulate: true });
  };
}

async function householdsOf(db) {
  const lists = await Promise.all(
    ['places', 'thingtypes', 'things', 'thingprofiles'].map((c) => db.collection(c).distinct('householdId'))
  );
  return [...new Set(lists.flat().filter(Boolean).map(String))].sort();
}

async function hasCollection(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

/**
 * The migration. `db` is a native MongoDB Db (mongoose.connection.db).
 * @returns {Promise<object>} the counts it printed
 */
export async function migrateContainment({ db, apply = false, dropPlaces = false, log = console.log }) {
  const shape = thingShaper();
  const things = db.collection('things');
  const types = db.collection('thingtypes');
  const profiles = db.collection('thingprofiles');
  const placesExists = await hasCollection(db, 'places');
  const places = db.collection('places');
  const verb = apply ? '' : 'would be ';

  log(`ThingGeek containment migration — ${apply ? 'APPLY' : 'DRY RUN (nothing is written; pass --apply to write)'}`);
  const households = await householdsOf(db);
  const totals = {
    households: households.length,
    kindsSet: 0,
    typesAdded: 0,
    profilesMarked: 0,
    placesConverted: 0,
    placesAlreadyConverted: 0,
    thingsReparented: 0,
    legacyPlaceIdsUnset: 0,
    thingsWithLegacyRelationships: 0,
    placesDropped: false,
  };

  for (const [i, householdId] of households.entries()) {
    log(`household ${i + 1} of ${households.length}:`);

    // a. Starter types.
    const haveTypes = await types.find({ householdId }, { projection: { _id: 1, key: 1, kind: 1 } }).toArray();
    const profs = await profiles.find({ householdId }, { projection: { _id: 1, starterTypesSeededAt: 1, starterTypesVersion: 1 } }).toArray();
    const seeded = profs.filter((p) => p.starterTypesSeededAt);
    const marked = Math.max(0, ...profs.map((p) => Number(p.starterTypesVersion) || 0));
    const fromVersion = marked || (seeded.length ? 1 : null);
    const { setKind, insert: upgradeInsert } = starterTypeUpgrade(haveTypes, fromVersion ?? STARTER_TYPES_VERSION);
    const insert = fromVersion === null ? [] : [...upgradeInsert];

    const hhPlaces = placesExists ? await places.find({ householdId }).toArray() : [];
    const haveLocation = haveTypes.some((t) => t.key === LOCATION_KEY) || insert.some((t) => t.key === LOCATION_KEY);
    if (hhPlaces.length && !haveLocation) insert.push(STARTER_TYPES.find((t) => t.key === LOCATION_KEY));

    const toMark = seeded.filter((p) => (Number(p.starterTypesVersion) || 1) < STARTER_TYPES_VERSION);
    log(`  types: kind ${verb}set on ${setKind.length}; starter types ${verb}added ${insert.length}${insert.length ? ` (${insert.map((t) => t.key).join(', ')})` : ''}`);
    log(`  profiles: starter-type version ${verb}set to ${STARTER_TYPES_VERSION} on ${toMark.length}`);
    totals.kindsSet += setKind.length;
    totals.typesAdded += insert.length;
    totals.profilesMarked += toMark.length;

    if (apply) {
      for (const t of setKind) await types.updateOne({ _id: t._id, householdId, kind: { $in: [null] } }, { $set: { kind: t.kind } });
      if (insert.length) {
        const at = new Date();
        const docs = insert.map((t) => ({ ...starterTypeDoc(t, householdId), createdAt: at, updatedAt: at }));
        try {
          await types.insertMany(docs, { ordered: false });
        } catch (err) {
          if (!isDuplicateKey(err)) throw err;
        }
      }
      if (toMark.length) {
        await profiles.updateMany({ _id: { $in: toMark.map((p) => p._id) }, householdId }, { $set: { starterTypesVersion: STARTER_TYPES_VERSION } });
      }
    }

    // b. Places → location things (same _id).
    const placeIds = new Set(hhPlaces.map((p) => String(p._id)));
    const already = hhPlaces.length
      ? new Set((await things.find({ _id: { $in: hhPlaces.map((p) => p._id) } }, { projection: { _id: 1 } }).toArray()).map((t) => String(t._id)))
      : new Set();
    const pending = hhPlaces.filter((p) => !already.has(String(p._id)));
    log(`  places → location things: ${pending.length} ${apply ? 'converted' : 'to convert'}, ${already.size} already converted`);
    totals.placesConverted += pending.length;
    totals.placesAlreadyConverted += already.size;

    if (apply && pending.length) {
      const location = await types.findOne({ householdId, key: LOCATION_KEY }, { projection: { _id: 1 } });
      if (!location) throw new Error('no Location type to convert places into');
      const docs = pending.map((p) => {
        const name = String(p.name ?? '').trim().slice(0, bounds.name.maxlength) || 'Unnamed place';
        const parent = p.parentId && placeIds.has(String(p.parentId)) ? p.parentId : null;
        const doc = shape({
          _id: p._id,
          householdId,
          name,
          sortName: computeSortName(name),
          typeId: location._id,
          parentId: parent,
          notes: String(p.notes ?? '').slice(0, bounds.notes.maxlength),
          createdBy: null,
          deletedAt: null,
        });
        doc.createdAt = p.createdAt ?? new Date();
        doc.updatedAt = p.updatedAt ?? doc.createdAt;
        return doc;
      });
      try {
        await things.insertMany(docs, { ordered: false });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err; // a concurrent run converted some first
      }
    }

    // c. Legacy placeId → parentId.
    const legacy = await things.find({ householdId, placeId: { $exists: true } }, { projection: { _id: 1, placeId: 1, parentId: 1 } }).toArray();
    const reparent = legacy.filter((t) => t.placeId && !t.parentId && placeIds.has(String(t.placeId)));
    log(`  things: parentId ${verb}set from a legacy placeId on ${reparent.length}; placeId ${verb}removed from ${legacy.length}`);
    totals.thingsReparented += reparent.length;
    totals.legacyPlaceIdsUnset += legacy.length;
    if (apply) {
      for (const t of reparent) await things.updateOne({ _id: t._id, householdId }, { $set: { parentId: t.placeId } });
      if (legacy.length) await things.updateMany({ householdId, placeId: { $exists: true } }, { $unset: { placeId: '' } });
    }

    // d. Relationship kinds that no longer exist.
    // $elemMatch, not 'relationships.kind' $nin: that would match an EMPTY array too.
    const staleRels = { householdId, relationships: { $elemMatch: { kind: { $nin: [...RELATIONSHIP_KINDS] } } } };
    const withStale = await things.countDocuments(staleRels);
    log(`  relationships: retired kinds ${verb}removed from ${withStale} thing${withStale === 1 ? '' : 's'}`);
    totals.thingsWithLegacyRelationships += withStale;
    if (apply && withStale) {
      await things.updateMany(staleRels, { $pull: { relationships: { kind: { $nin: [...RELATIONSHIP_KINDS] } } } });
    }
  }

  // The places collection.
  if (!placesExists) {
    log('places collection: not present');
  } else {
    const all = await places.find({}, { projection: { _id: 1 } }).toArray();
    const converted = all.length ? await things.countDocuments({ _id: { $in: all.map((p) => p._id) } }) : 0;
    if (apply && dropPlaces) {
      if (converted !== all.length) {
        throw new Error(`refusing to drop places: ${all.length - converted} of ${all.length} are not things yet`);
      }
      await places.drop();
      totals.placesDropped = true;
      log(`places collection: ${all.length} documents, all converted — dropped`);
    } else {
      log(`places collection: ${all.length} documents (${converted} converted) — kept${apply ? ' (pass --drop-places with --apply to drop it)' : ''}`);
    }
  }

  const changed =
    totals.kindsSet + totals.typesAdded + totals.profilesMarked + totals.placesConverted +
    totals.thingsReparented + totals.legacyPlaceIdsUnset + totals.thingsWithLegacyRelationships;
  if (!changed && !totals.placesDropped) log('nothing to do — already migrated');
  else if (!apply) log('dry run: nothing was written');
  else log('done');
  return totals;
}

/** The CLI: env (like server.js), connect, run, always disconnect. */
async function main(argv) {
  const apply = argv.includes('--apply');
  const dropPlaces = argv.includes('--drop-places');
  const unknown = argv.filter((a) => !['--apply', '--drop-places'].includes(a));
  if (unknown.length) throw new Error(`unknown option(s): ${unknown.join(' ')} (use --apply, --drop-places)`);
  if (dropPlaces && !apply) console.log('note: --drop-places is only honoured with --apply');

  const here = path.dirname(fileURLToPath(import.meta.url));
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
  dotenv.config({ path: path.resolve(here, '..', envFile) });
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await migrateContainment({ db: mongoose.connection.db, apply, dropPlaces });
  } finally {
    await mongoose.disconnect();
  }
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (err) => {
      // The message only: a driver error can quote the connection string.
      const mongo = String(err?.name ?? '').startsWith('Mongo');
      console.error(`migration failed: ${mongo ? `${err.name}${err.code ? ` (code ${err.code})` : ''}` : err?.message}`);
      process.exit(1);
    }
  );
}

export default { migrateContainment };
