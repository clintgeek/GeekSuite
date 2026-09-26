#!/usr/bin/env node
/**
 * Write apps/bookgeek/DOCS/TAGS_REVIEW.md: every Unsorted tag (neither mapped
 * nor dropped by packages/schemas/bookgeek/tags.js) with its book count, for
 * Chef to mark mine / map to X / drop (DOCS/TAGS.md §3). Read-only.
 *
 *   node scripts/tags-review.mjs                     # from the database
 *   node scripts/tags-review.mjs --from-json dump.json
 *   node scripts/tags-review.mjs --out /some/path.md
 *
 * Connects with the api's own env like tags-migration.mjs; prints no env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { tagVocabulary } from "../src/tags.js";

dotenv.config();

const { classifyRawTag } = tagVocabulary;
const args = process.argv.slice(2);
const opt = (name) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1]);
const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = opt("--out") ?? path.resolve(here, "../../DOCS/TAGS_REVIEW.md");

async function loadBooks() {
  const json = opt("--from-json");
  if (json) return JSON.parse(fs.readFileSync(json, "utf8")).books ?? [];
  const { mongoUri } = await import("../src/config.js");
  const uri = mongoUri();
  if (!uri) throw new Error("BASEGEEK_MONGODB_URI (or MONGODB_URI) is not set.");
  const { Book } = await import("../src/models/book.js");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    return await Book.find({}, { tags: 1 }).lean();
  } finally {
    await mongoose.disconnect();
  }
}

const cell = (s) => String(s).replace(/\|/g, "\\|");

const books = await loadBooks();
const counts = new Map();
for (const b of books) for (const t of new Set((b.tags ?? []).map((x) => String(x).trim()).filter(Boolean))) counts.set(t, (counts.get(t) ?? 0) + 1);
const tally = { mapped: 0, dropped: 0, unsorted: 0 };
const unsorted = [];
for (const [tag, n] of counts) {
  const k = classifyRawTag(tag).kind;
  tally[k] += 1;
  if (k === "unsorted") unsorted.push([tag, n]);
}
unsorted.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const today = new Date().toISOString().slice(0, 10);
const lines = [
  "# BookGeek — Unsorted tags to review",
  "",
  `*Generated ${today} by \`apps/bookgeek/api/scripts/tags-review.mjs\` from ${books.length} books.`,
  "Regenerate after changing the vocabulary; it overwrites this file.*",
  "",
  `Of ${counts.size} distinct raw tags, ${tally.mapped} map to the vocabulary, ${tally.dropped} are dropped, and`,
  `**${tally.unsorted} are Unsorted** (listed below, most books first). Unsorted tags are kept on every`,
  "book, show last in the Tags filter, and still filter.",
  "",
  "**How to answer:** fill the last column with one of",
  "- `mine`: it's your tag. It stays exactly as written and is never mapped or dropped.",
  "- `map to X`: it means canonical tag X (or `map to X + Y`). A new name is fine, e.g. `map to Nonfiction (new)`.",
  "- `drop`: noise. It goes on the drop list.",
  "",
  "Leave a row blank to keep it Unsorted for now.",
  "",
  "| Tag | Books | Chef: mine / map to X / drop |",
  "|---|---:|---|",
  ...unsorted.map(([tag, n]) => `| ${cell(tag)} | ${n} | |`),
  "",
];
fs.writeFileSync(outPath, lines.join("\n"));
console.log(`wrote ${outPath}: ${unsorted.length} Unsorted of ${counts.size} distinct (${tally.mapped} mapped, ${tally.dropped} dropped)`);
