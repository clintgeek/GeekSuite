#!/usr/bin/env node
/**
 * Run the tag migration (src/migrations/tags.js) on demand — the same code
 * the api runs at every boot. DRY BY DEFAULT: it reads every book, reports
 * what it would re-derive, and writes nothing unless given --apply.
 *
 *   node scripts/tags-migration.mjs            # dry run
 *   node scripts/tags-migration.mjs --apply    # write
 *   node scripts/tags-migration.mjs --from-json dump.json
 *                                              # dry run over a JSON dump
 *                                              # ({ books: [{_id, tags, ...}] })
 *
 * Connects with the api's own env (BASEGEEK_MONGODB_URI or MONGODB_URI,
 * read by src/config.js). Prints counts and example changes — book titles
 * and tags, never the connection string or any other env value.
 */
import fs from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { migrateTags, planTagMigration } from "../src/migrations/tags.js";

dotenv.config();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const jsonAt = args.indexOf("--from-json");
const SAMPLES = 8;

function report({ scanned, planned, changed, fresh, dryRun }, ops, byId) {
  console.log(`scanned ${scanned}, ${dryRun ? `would re-derive ${planned}` : `re-derived ${changed} (planned ${planned})`}, ${fresh} with no derived tags yet`);
  for (const op of ops.slice(0, SAMPLES)) {
    const row = byId.get(String(op.updateOne.filter._id)) ?? {};
    const { libraryTags, unsortedTags } = op.updateOne.update.$set;
    console.log(`  · ${row.title ?? op.updateOne.filter._id}: [${(row.tags ?? []).join(", ")}]`);
    console.log(`      → libraryTags [${libraryTags.join(", ")}]  unsorted [${unsortedTags.join(", ")}]`);
  }
  if (ops.length > SAMPLES) console.log(`  … and ${ops.length - SAMPLES} more`);
}

if (jsonAt !== -1) {
  const { books = [] } = JSON.parse(fs.readFileSync(args[jsonAt + 1], "utf8"));
  const { ops, fresh } = planTagMigration(books);
  report({ scanned: books.length, planned: ops.length, changed: 0, fresh, dryRun: true }, ops, new Map(books.map((b) => [String(b._id), b])));
} else {
  const { mongoUri } = await import("../src/config.js");
  const uri = mongoUri();
  if (!uri) {
    console.error("BASEGEEK_MONGODB_URI (or MONGODB_URI) is not set.");
    process.exit(2);
  }
  const { Book } = await import("../src/models/book.js");
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const titles = await Book.find({}, { title: 1, tags: 1 }).lean();
    const out = await migrateTags({ Book, dryRun: !apply });
    report(out, out.ops, new Map(titles.map((b) => [String(b._id), b])));
  } catch (err) {
    // A driver error can carry the URI; say what failed without it.
    console.error("tag migration failed:", String(err?.message ?? err).replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>"));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
