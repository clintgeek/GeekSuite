#!/usr/bin/env node
/**
 * One-off: remove `bookreadings` rows whose book no longer exists
 * (SUITE_REVIEW_2026-11 BookGeek #4 — the old REST delete left them).
 * DRY BY DEFAULT: it counts and writes nothing unless given --apply.
 *
 *   node scripts/sweep-orphan-readings.mjs            # dry run: counts only
 *   node scripts/sweep-orphan-readings.mjs --apply    # delete the orphans
 *
 * Readings of a book in Recently deleted are kept (the book row still
 * exists; the purge removes them). Connects with the api's own env
 * (BASEGEEK_MONGODB_URI or MONGODB_URI, read by src/config.js). Prints counts
 * only — never the connection string, a user id, or any other env value.
 * Take a dump of `bookgeek.bookreadings` before --apply.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { mongoUri } from "../src/config.js";
import { BookReading } from "../src/models/bookReading.js";
import { sweepOrphanReadings } from "../src/migrations/orphanReadings.js";

dotenv.config();

const apply = process.argv.slice(2).includes("--apply");
const uri = mongoUri();
if (!uri) {
  console.error("No BASEGEEK_MONGODB_URI / MONGODB_URI in the environment.");
  process.exit(1);
}

try {
  await mongoose.connect(uri);
  const r = await sweepOrphanReadings(BookReading, { apply });
  console.log(
    r.dryRun
      ? `dry run: ${ r.orphans } orphan reading(s) across ${ r.books } missing book(s), ${ r.readers } reader(s). Re-run with --apply to delete them.`
      : `deleted ${ r.deleted } of ${ r.orphans } orphan reading(s) across ${ r.books } missing book(s).`,
  );
} catch (err) {
  console.error("sweep failed:", err?.message || err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
