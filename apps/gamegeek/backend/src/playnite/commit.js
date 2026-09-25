/**
 * Apply a Playnite import plan (importPlanner.js) to Mongo.
 *
 * Batched `bulkWrite`s, unordered, so ~1000 games is a handful of round
 * trips. Nothing here deletes: every op is an insert, a guarded $push, a
 * targeted $set, or a $max.
 *
 * Race safety: the plan was computed from a read; between that read and this
 * write someone may have added the same Steam game. The per-household unique
 * index on `externalIds.steamAppId` then rejects the insert with E11000, and
 * instead of failing the import we re-match: the copies go onto the game that
 * won, and that user's GamePlayer row is keyed to it.
 *
 * Models are passed in so the writer can be exercised with fakes.
 */

export const BATCH_SIZE = 500;

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function writeErrorsOf(err) {
  if (Array.isArray(err?.writeErrors)) return err.writeErrors;
  if (err?.writeErrors && typeof err.writeErrors === 'object') return Object.values(err.writeErrors);
  const fromResult = err?.result?.getWriteErrors?.();
  if (Array.isArray(fromResult)) return fromResult;
  return null;
}

function isDuplicateKey(e) {
  return (e?.code ?? e?.err?.code) === 11000;
}

/**
 * Run `ops` in unordered batches. Returns the ops that failed with E11000
 * (so the caller can re-match them); any other failure is re-thrown.
 */
async function bulkInBatches(Model, ops, batchSize) {
  const duplicates = [];
  for (const batch of chunks(ops, batchSize)) {
    try {
      await Model.bulkWrite(batch, { ordered: false });
    } catch (err) {
      const errors = writeErrorsOf(err);
      if (!errors || !errors.length || !errors.every(isDuplicateKey)) throw err;
      for (const e of errors) duplicates.push(batch[e.index]);
    }
  }
  return duplicates;
}

/**
 * @param {object} params
 * @param {{ops: object}} params.plan the planner's output
 * @param {string} params.householdId
 * @param {string} params.userId
 * @param {object} params.Game mongoose model (or a fake with bulkWrite/findOne/updateOne)
 * @param {object} params.GamePlayer mongoose model (or a fake with bulkWrite)
 * @param {() => any} params.newId returns a fresh ObjectId
 * @param {number} [params.batchSize]
 */
export async function commitPlayniteImport({ plan, householdId, userId, Game, GamePlayer, newId, batchSize = BATCH_SIZE }) {
  const { creates, gameUpdates, copyUpdates, playerCreates, playerUpdates } = plan.ops;
  const idByKey = new Map();

  // 1. New games. _ids are assigned here so player rows can reference them.
  const createOps = creates.map((c) => {
    const _id = newId();
    idByKey.set(c.key, _id);
    const copies = c.doc.copies.map((copy) => ({ ...copy, _id: newId() }));
    return { insertOne: { document: { ...c.doc, copies, _id, householdId } } };
  });
  const dupCreates = await bulkInBatches(Game, createOps, batchSize);
  for (const op of dupCreates) {
    const doc = op.insertOne.document;
    const appId = doc.externalIds?.steamAppId;
    const winner = appId ? await Game.findOne({ householdId, 'externalIds.steamAppId': appId }, { _id: 1 }).lean() : null;
    if (!winner) throw new Error('Playnite import: duplicate key on a game that could not be re-matched');
    const key = [...idByKey].find(([, id]) => id === doc._id)?.[0];
    if (key) idByKey.set(key, winner._id);
    for (const copy of doc.copies) {
      await Game.updateOne(
        { _id: winner._id, householdId, 'copies.playnite.playniteId': { $ne: copy.playnite.playniteId } },
        { $push: { copies: { ...copy, _id: newId() } }, $set: { owned: true } }
      );
    }
  }

  // 2. Existing games: new copies, fill-only-empty fields, platform union.
  const gameUpdateOp = (u, { withSteam = true } = {}) => {
    const filter = { _id: u.gameId, householdId };
    const update = {};
    const set = { ...u.set };
    if (!withSteam) delete set['externalIds.steamAppId'];
    if (u.pushCopies.length) {
      // Guard: a copy already pushed (a concurrent import) is not pushed twice.
      filter['copies.playnite.playniteId'] = { $nin: u.pushCopies.map((c) => c.playnite.playniteId) };
      update.$push = { copies: { $each: u.pushCopies.map((c) => ({ ...c, _id: newId() })) } };
      set.owned = true;
    }
    if (Object.keys(set).length) update.$set = set;
    if (u.addPlatforms.length) update.$addToSet = { platformsAvailable: { $each: u.addPlatforms } };
    return { updateOne: { filter, update } };
  };
  const dupUpdates = await bulkInBatches(Game, gameUpdates.map((u) => gameUpdateOp(u)), batchSize);
  if (dupUpdates.length) {
    // Only a steamAppId fill can collide; retry those without it.
    const retry = gameUpdates.filter((u) => dupUpdates.some((op) => String(op.updateOne.filter._id) === String(u.gameId)));
    await bulkInBatches(Game, retry.map((u) => gameUpdateOp(u, { withSteam: false })), batchSize);
  }

  // 3. Existing copies: refresh the playnite subdoc only (never platform,
  //    storefront or notes — a person may have edited those).
  const copyOps = copyUpdates.map((u) => {
    const $set = {};
    for (const [k, v] of Object.entries(u.set)) if (k !== 'playniteId') $set[`copies.$[c].playnite.${k}`] = v;
    return {
      updateOne: {
        filter: { _id: u.gameId, householdId },
        update: { $set },
        arrayFilters: [{ 'c.playnite.playniteId': u.playniteId }],
      },
    };
  });
  await bulkInBatches(Game, copyOps, batchSize);

  // 4. The importing user's rows. Creation is $setOnInsert, so a row that
  //    appeared meanwhile keeps its shelf and favorite.
  const gameIdFor = (ref) => (ref.key ? idByKey.get(ref.key) : ref.gameId);
  const playerOps = [];
  for (const p of playerCreates) {
    const gameId = gameIdFor(p);
    playerOps.push({
      updateOne: {
        filter: { userId, householdId, gameId },
        update: { $setOnInsert: { userId, householdId, gameId, ...p.doc } },
        upsert: true,
      },
    });
  }
  for (const p of playerUpdates) {
    if (p.hoursPlayed !== undefined) {
      playerOps.push({
        updateOne: {
          // Guard repeated at write time: manual hours are never overwritten.
          filter: {
            userId,
            householdId,
            gameId: p.gameId,
            $or: [{ hoursSource: { $in: ['playnite', 'steam'] } }, { hoursPlayed: 0 }],
          },
          update: { $set: { hoursPlayed: p.hoursPlayed, hoursSource: 'playnite' } },
        },
      });
    }
    if (p.lastPlayedAt) {
      playerOps.push({
        updateOne: { filter: { userId, householdId, gameId: p.gameId }, update: { $max: { lastPlayedAt: p.lastPlayedAt } } },
      });
    }
  }
  // A duplicate here is two upserts racing on (userId, gameId): the row exists, which is the goal.
  await bulkInBatches(GamePlayer, playerOps, batchSize);

  return {
    gamesCreated: creates.length - dupCreates.length,
    gamesRematched: dupCreates.length,
    gamesUpdated: gameUpdates.length,
    copiesUpdated: copyUpdates.length,
    playersCreated: playerCreates.length,
    playersUpdated: playerUpdates.length,
  };
}

export default { commitPlayniteImport, BATCH_SIZE };
