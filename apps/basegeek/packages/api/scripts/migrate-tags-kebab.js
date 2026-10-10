#!/usr/bin/env node
/**
 * migrate-tags-kebab.js — one-time (idempotent) migration of every stored
 * free-form tag to the suite standard (`@geeksuite/tags`, DOCS/TAG_STANDARD.md):
 * lowercase kebab-case segments, `/` for nesting.
 *
 * What it touches
 * ---------------
 *   noteGeek.notes            tags   owner userId
 *   todogeek.tasks            tags   owner createdBy
 *   todogeek.journalentries   tags   owner createdBy
 *   todogeek.templates        tags   owner createdBy
 *   thinggeek.things          tags   owner householdId   (ThingGeek's 60-char cap)
 *
 * NOT touched: BookGeek / GameGeek genres (curated vocabularies), NoteGeek's
 * version history (`noteversions` — history is what it was), TodoGeek's
 * pinned tags in userGeek (the app normalizes them on read and on the next
 * pin).
 *
 * Per owner (user, or ThingGeek household) it computes old → new for every
 * distinct tag spelling. Two spellings that normalize to the same tag
 * COLLAPSE into one (`Work`, `work`, `WORK` → `work`), and no item is left
 * carrying a duplicate — the first position wins. A spelling that normalizes
 * to nothing (`🎉`, `&&`) is removed from its items. One that grows past the
 * app's cap (camelCase splitting adds hyphens) is truncated at the cap.
 *
 * Writes only `tags`, never `updatedAt` (a tag respelling is not an edit; the
 * native driver skips mongoose timestamps and NoteGeek's version hooks), and
 * each write is guarded on the item still carrying exactly the tags it was
 * planned from — an item edited in between is skipped and counted.
 *
 * Idempotent: once applied, every tag is already normalized and deduped, so a
 * second run plans nothing.
 *
 * Usage
 * -----
 *   node scripts/migrate-tags-kebab.js                         dry run (default) — prints the mapping table, writes NOTHING
 *   node scripts/migrate-tags-kebab.js --apply                 save a rollback file, then write
 *   node scripts/migrate-tags-kebab.js --apply --rollback-dir /some/mounted/dir
 *   node scripts/migrate-tags-kebab.js --rollback <file>       put every item back (only items still as migrated)
 *   node scripts/migrate-tags-kebab.js --app notegeek          limit to one app (repeatable)
 *
 * The rollback file (item ids + their previous tags, EJSON) is written BEFORE
 * the first write, mode 600, to ~/geeksuite-migrations/tags-kebab-<stamp>.json
 * unless --rollback-dir says otherwise. Inside a container `~` does not
 * survive a recreate: copy it out (`docker cp`) straight after an --apply.
 *
 * Required env (the gateway's own): MONGO_BASE_URI. Prints tags and counts
 * only — never the connection string, ids, owners, or item content.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoClient, BSON } from 'mongodb';
import { normalizeTag, TAG_MAX_LENGTH } from '@geeksuite/tags';

const { EJSON } = BSON;

export const TARGETS = Object.freeze([
  { app: 'notegeek', db: 'noteGeek', collection: 'notes', owner: 'userId', maxLength: TAG_MAX_LENGTH },
  { app: 'todogeek', db: 'todogeek', collection: 'tasks', owner: 'createdBy', maxLength: TAG_MAX_LENGTH },
  { app: 'todogeek', db: 'todogeek', collection: 'journalentries', owner: 'createdBy', maxLength: TAG_MAX_LENGTH },
  { app: 'todogeek', db: 'todogeek', collection: 'templates', owner: 'createdBy', maxLength: TAG_MAX_LENGTH },
  { app: 'thinggeek', db: 'thinggeek', collection: 'things', owner: 'householdId', maxLength: 60 },
]);

/**
 * One stored spelling → the standard one, capped.
 * @returns {{ to: string, truncated: boolean }} `to` is '' when nothing is left
 */
export function migrateTag(raw, maxLength = TAG_MAX_LENGTH) {
  const to = normalizeTag(raw);
  if (to.length <= maxLength) return { to, truncated: false };
  return { to: to.slice(0, maxLength).replace(/[-/]+$/, ''), truncated: true };
}

/** An item's tags → its new tags: migrated, empties dropped, deduped, first position wins. */
export function migrateTagList(tags, maxLength = TAG_MAX_LENGTH) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const { to } = migrateTag(raw, maxLength);
    if (!to || seen.has(to)) continue;
    seen.add(to);
    out.push(to);
  }
  return out;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Plan one collection. Pure — no I/O, so the tests drive it with plain objects.
 *
 * @param {Array<{ _id: any, tags: any[] }>} docs   every doc with a tags array
 * @param {{ ownerField: string, maxLength?: number }} opts
 * @returns {{
 *   changes: Array<{ _id: any, owner: any, before: any[], after: string[] }>,
 *   rows: Array<{ old: string, new: string, items: number, owners: number, mergesWith: string[], truncated: boolean }>,
 *   stats: { docs: number, changedDocs: number, spellings: number, changedSpellings: number, removedSpellings: number, truncated: number, collapsedOnItems: number }
 * }}
 */
export function planCollection(docs, { ownerField, maxLength = TAG_MAX_LENGTH }) {
  const changes = [];
  // per owner: new → Set(old spellings that map to it)
  const groups = new Map();
  // old spelling → row accumulator (aggregated across owners)
  const rowsByOld = new Map();
  const stats = { docs: 0, changedDocs: 0, spellings: 0, changedSpellings: 0, removedSpellings: 0, truncated: 0, collapsedOnItems: 0 };

  for (const doc of docs) {
    if (!Array.isArray(doc.tags)) continue;
    stats.docs += 1;
    const ownerKey = String(doc[ownerField] ?? '');
    if (!groups.has(ownerKey)) groups.set(ownerKey, new Map());
    const byNew = groups.get(ownerKey);

    const seenOnItem = new Set();
    for (const raw of doc.tags) {
      const old = typeof raw === 'string' ? raw : String(raw);
      if (seenOnItem.has(old)) continue; // count an item once per spelling
      seenOnItem.add(old);
      const { to, truncated } = typeof raw === 'string' ? migrateTag(raw, maxLength) : { to: '', truncated: false };
      if (!byNew.has(to)) byNew.set(to, new Set());
      byNew.get(to).add(old);
      let row = rowsByOld.get(old);
      if (!row) {
        row = { old, new: to, items: 0, owners: new Set(), mergesWith: new Set(), truncated };
        rowsByOld.set(old, row);
      }
      row.items += 1;
      row.owners.add(ownerKey);
    }

    const after = migrateTagList(doc.tags, maxLength);
    if (!sameList(doc.tags, after)) {
      stats.changedDocs += 1;
      const distinctBefore = new Set(doc.tags.map((t) => (typeof t === 'string' ? migrateTag(t, maxLength).to : ''))
        .filter(Boolean)).size;
      const nonEmptyBefore = doc.tags.filter((t) => typeof t === 'string' && migrateTag(t, maxLength).to).length;
      stats.collapsedOnItems += nonEmptyBefore - distinctBefore;
      changes.push({ _id: doc._id, owner: doc[ownerField], before: doc.tags, after });
    }
  }

  for (const byNew of groups.values()) {
    for (const [to, olds] of byNew) {
      if (!to || olds.size < 2) continue;
      for (const old of olds) {
        const row = rowsByOld.get(old);
        for (const other of olds) if (other !== old) row.mergesWith.add(other);
      }
    }
  }

  const rows = [...rowsByOld.values()]
    .map((r) => ({ ...r, owners: r.owners.size, mergesWith: [...r.mergesWith].sort() }))
    .sort((a, b) => a.new.localeCompare(b.new) || a.old.localeCompare(b.old));
  stats.spellings = rows.length;
  for (const r of rows) {
    if (r.old !== r.new) stats.changedSpellings += 1;
    if (!r.new) stats.removedSpellings += 1;
    if (r.truncated) stats.truncated += 1;
  }
  return { changes, rows, stats };
}

// ── Printing ──────────────────────────────────────────────────────────────

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The mapping table: only spellings that change, plus the ones they merge into. */
export function formatTable(app, collection, rows) {
  const shown = rows.filter((r) => r.old !== r.new);
  if (shown.length === 0) return `${app}.${collection}: nothing to change\n`;
  const head = ['app', 'old', 'new', 'items', 'merges with'];
  const lines = shown.map((r) => [
    `${app}.${collection}`,
    JSON.stringify(r.old),
    r.new ? JSON.stringify(r.new) : '(removed)',
    String(r.items),
    [r.truncated ? '(truncated)' : '', r.mergesWith.map((m) => JSON.stringify(m)).join(', ')].filter(Boolean).join(' '),
  ].map((c, i) => (i === 1 || i === 2 ? clip(c, 48) : c)));
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ').trimEnd();
  return [fmt(head), widths.map((w) => '-'.repeat(w)).join('-|-'), ...lines.map(fmt)].join('\n') + '\n';
}

// ── I/O ───────────────────────────────────────────────────────────────────

async function readDocs(coll) {
  return coll.find({ tags: { $exists: true, $type: 'array', $ne: [] } }, { projection: { _id: 1, tags: 1, userId: 1, createdBy: 1, householdId: 1 } }).toArray();
}

/**
 * Plan every target; with `apply`, write the rollback file then the changes.
 * @returns {Promise<{ results: object[], rollbackFile: string|null }>}
 */
export async function run({ client, apps = null, apply = false, rollbackDir = path.join(os.homedir(), 'geeksuite-migrations'), log = console.log, targets: allTargets = TARGETS }) {
  const targets = allTargets.filter((t) => !apps || apps.includes(t.app));
  const results = [];
  for (const t of targets) {
    const coll = client.db(t.db).collection(t.collection);
    const docs = await readDocs(coll);
    const plan = planCollection(docs, { ownerField: t.owner, maxLength: t.maxLength });
    results.push({ target: t, ...plan });
    log(formatTable(t.app, t.collection, plan.rows));
  }

  log('Totals');
  for (const { target: t, stats } of results) {
    log(`  ${`${t.app}.${t.collection}`.padEnd(25)} items with tags ${String(stats.docs).padStart(5)} · to change ${String(stats.changedDocs).padStart(5)}`
      + ` · spellings ${stats.spellings} (${stats.changedSpellings} change, ${stats.removedSpellings} removed, ${stats.truncated} truncated)`
      + ` · duplicates collapsed on items ${stats.collapsedOnItems}`);
  }
  const total = results.reduce((n, r) => n + r.changes.length, 0);
  log(`  ALL: ${total} item(s) to change`);

  if (!apply || total === 0) return { results, rollbackFile: null };

  // The rollback file first — nothing is written until it is on disk.
  fs.mkdirSync(rollbackDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackFile = path.join(rollbackDir, `tags-kebab-${stamp}.json`);
  const payload = {
    kind: 'tags-kebab',
    createdAt: new Date().toISOString(),
    targets: results.map(({ target: t, changes }) => ({
      db: t.db,
      collection: t.collection,
      items: changes.map((c) => ({ _id: c._id, before: c.before, after: c.after })),
    })),
  };
  fs.writeFileSync(rollbackFile, EJSON.stringify(payload, { relaxed: false }), { mode: 0o600 });
  fs.chmodSync(rollbackFile, 0o600);
  log(`Rollback file: ${rollbackFile}`);

  for (const r of results) {
    const t = r.target;
    const coll = client.db(t.db).collection(t.collection);
    let modified = 0;
    let skipped = 0;
    for (const c of r.changes) {
      const res = await coll.updateOne({ _id: c._id, [t.owner]: c.owner, tags: c.before }, { $set: { tags: c.after } });
      if (res.modifiedCount === 1) modified += 1;
      else skipped += 1;
    }
    r.applied = { modified, skipped };
    log(`  applied ${t.app}.${t.collection}: ${modified} written, ${skipped} skipped (changed since planned)`);
  }
  return { results, rollbackFile };
}

/** Put items back from a rollback file — only those still carrying exactly what the migration wrote. */
export async function rollback({ client, file, log = console.log }) {
  const payload = EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });
  if (payload?.kind !== 'tags-kebab') throw new Error('Not a tags-kebab rollback file');
  const out = [];
  for (const t of payload.targets) {
    const coll = client.db(t.db).collection(t.collection);
    let restored = 0;
    let skipped = 0;
    for (const item of t.items) {
      const res = await coll.updateOne({ _id: item._id, tags: item.after }, { $set: { tags: item.before } });
      if (res.modifiedCount === 1) restored += 1;
      else skipped += 1;
    }
    out.push({ db: t.db, collection: t.collection, restored, skipped });
    log(`  rolled back ${t.db}.${t.collection}: ${restored} restored, ${skipped} skipped (edited since)`);
  }
  return out;
}

/* ─────────────────────────── CLI entrypoint ─────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1] ?? null;
  };
  if (args.includes('--help') || args.includes('-h')) {
    console.log('node scripts/migrate-tags-kebab.js [--apply [--rollback-dir DIR]] [--rollback FILE] [--app notegeek|todogeek|thinggeek ...]\nDry run by default; see the header of this file.');
    process.exit(0);
  }
  const base = process.env.MONGO_BASE_URI;
  if (!base) {
    console.error('MONGO_BASE_URI is not set');
    process.exit(1);
  }
  const apps = args.flatMap((a, i) => (args[i - 1] === '--app' ? [a] : []));
  const apply = args.includes('--apply');
  const rollbackFile = valueOf('--rollback');
  const client = new MongoClient(`${base}/?authSource=admin`);
  try {
    await client.connect();
    if (rollbackFile) {
      console.log('[ROLLBACK]');
      await rollback({ client, file: rollbackFile });
    } else {
      console.log(apply ? '[APPLY] writing changes' : '[DRY RUN] no writes will be performed');
      await run({
        client,
        apps: apps.length ? apps : null,
        apply,
        ...(valueOf('--rollback-dir') ? { rollbackDir: valueOf('--rollback-dir') } : {}),
      });
      if (!apply) console.log('\n(dry run — re-run with --apply to write)');
    }
    process.exitCode = 0;
  } catch (err) {
    // The message only: a driver error can carry the URI.
    console.error('Migration failed:', String(err?.message || err).replace(/mongodb(\+srv)?:\/\/\S+/g, 'mongodb://…'));
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
}
