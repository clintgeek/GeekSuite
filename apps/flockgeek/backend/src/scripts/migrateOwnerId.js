import mongoose from "mongoose";
import { env } from "../config/env.js";

const COLLECTIONS = [
  "birds",
  "birdtraits",
  "birdnotes",
  "groups",
  "groupmemberships",
  "locations",
  "pairings",
  "eggproductions",
  "hatchevents",
  "healthrecords",
  "events",
  "lineagecaches",
  "meatruns"
];

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function run() {
  const fromOwnerId = readArg("--from");
  const toOwnerId = readArg("--to");
  const apply = hasFlag("--apply");
  const force = hasFlag("--force");

  if (!fromOwnerId || !toOwnerId) {
    console.error("Missing required args. Usage: node src/scripts/migrateOwnerId.js --from <oldOwnerId> --to <newOwnerId> [--apply] [--force]");
    process.exit(1);
  }

  if (fromOwnerId === toOwnerId) {
    console.error("--from and --to must be different");
    process.exit(1);
  }

  await mongoose.connect(env.mongodbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  try {
    const db = mongoose.connection.db;

    const summary = [];

    for (const name of COLLECTIONS) {
      const collection = db.collection(name);
      const fromCount = await collection.countDocuments({ ownerId: fromOwnerId });
      const toCount = await collection.countDocuments({ ownerId: toOwnerId });
      summary.push({ name, fromCount, toCount });
    }

    const totalFrom = summary.reduce((acc, row) => acc + row.fromCount, 0);
    const totalTo = summary.reduce((acc, row) => acc + row.toCount, 0);

    console.log(JSON.stringify({ fromOwnerId, toOwnerId, totalFrom, totalTo, collections: summary }, null, 2));

    if (!apply) {
      console.log("Dry-run only. Re-run with --apply to execute.");
      return;
    }

    if (totalFrom === 0) {
      console.log("No documents found for --from ownerId. Nothing to do.");
      return;
    }

    if (totalTo > 0 && !force) {
      console.error("Target ownerId already has data. Re-run with --force if you really want to merge/move ownership.");
      process.exit(1);
    }

    const results = [];

    for (const name of COLLECTIONS) {
      const collection = db.collection(name);
      const res = await collection.updateMany(
        { ownerId: fromOwnerId },
        { $set: { ownerId: toOwnerId } }
      );
      results.push({ name, matchedCount: res.matchedCount, modifiedCount: res.modifiedCount });
    }

    console.log(JSON.stringify({ applied: true, fromOwnerId, toOwnerId, results }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
