#!/usr/bin/env node
/**
 * rename-bujogeek-to-todogeek.js — one-time (idempotent) rename of the app id
 * `bujogeek` to `todogeek` everywhere the gateway has PERSISTED it.
 *
 * Background
 * ----------
 * BuJoGeek was renamed TodoGeek (2026-10). The string `bujogeek` was not only
 * code: it was an app id written into documents across four databases. The
 * code now says `todogeek` everywhere, so every stored copy of the old id is
 * a row nothing will ever read again — preferences that vanish, a registry
 * card that points at a dead domain, an AI routing row that silently falls
 * back to defaults.
 *
 * What this script does NOT do: copy the app's own database. The task data
 * lives in Mongo DB `bujogeek`; `getAppConnection('todogeek')` opens DB
 * `todogeek`. That copy is a mongodump/mongorestore (--nsFrom 'bujogeek.*'
 * --nsTo 'todogeek.*'), done first. `--apply` refuses to run until DB
 * `todogeek` has collections, because half the steps below are only right
 * once it does.
 *
 * What it does, per database
 * --------------------------
 *   userGeek.users
 *     appPreferences.bujogeek  → appPreferences.todogeek   ($rename; when the
 *                                new key already exists the two are merged,
 *                                the new key's values winning per field)
 *     preferences.defaultApp   'bujogeek' → 'todogeek'
 *   datageek.apps (app registry)
 *     the `bujogeek` row is renamed in place (name, displayName, url,
 *     description from DEFAULT_APPS; icon/color/sortOrder/enabled kept). If
 *     boot already seeded a `todogeek` row, the old row's sortOrder/enabled/
 *     icon/color/tag are copied onto it and the old row is deleted.
 *   aiGeek.aiappconfigs (AI routing rows)
 *     appName `bujogeek` / `bujogeek:<feature>` (any case) → `todogeek…`. If a
 *     `todogeek` row already exists and was auto-discovered (a call landed
 *     before this ran), that stub is deleted so the configured row wins; a
 *     hand-configured `todogeek` row is a CONFLICT and both are left alone.
 *   aiGeek.aispends (dollar ledger)  app → todogeek; a bucket that already
 *     exists under the new name absorbs the old one's calls/costUsd/refusals.
 *   aiGeek.aistickypicks  app + `key` prefix → todogeek; collisions dropped
 *     (a sticky pick is a cache with a TTL).
 *   aiGeek.apikeys        appName → todogeek
 *   aiGeek.conversations  appName → todogeek
 *   todogeek.pushsubscriptions
 *     A web-push subscription belongs to the ORIGIN that made it. Every row
 *     copied from DB `bujogeek` was made on bujogeek.clintgeek.com, which is
 *     gone: pushing to it wakes the old service worker, whose click target is
 *     a dead domain, alongside any new subscription. Rows whose endpoint also
 *     appears in DB `bujogeek` are deleted; each device re-enables reminders
 *     once on todogeek.clintgeek.com.
 *
 * Idempotency: every step selects only documents still carrying the old id
 * (or, for push, endpoints still present in the source DB that remain in the
 * target). A second run plans nothing.
 *
 * Usage
 * -----
 *   node scripts/rename-bujogeek-to-todogeek.js            dry run (default) — counts only
 *   node scripts/rename-bujogeek-to-todogeek.js --apply    write
 *
 * Required env (the gateway's own, same defaults as the code):
 *   MONGO_BASE_URI          host portion; DBs `todogeek` and `bujogeek`
 *   MONGODB_URI             datageek (app registry)
 *   USERGEEK_MONGODB_URI    userGeek (users)
 *   AIGEEK_MONGODB_URI      aiGeek (routing rows, ledger, keys, conversations)
 * Prints collection names and counts only — never a URI, an id, a key or a
 * preference value.
 */

import { MongoClient } from 'mongodb';
import { DEFAULT_APPS } from '../src/services/appRegistrySeed.js';

export const OLD_APP = 'bujogeek';
export const NEW_APP = 'todogeek';

/** Collections touched, by database role. Mongoose's pluralized model names. */
export const COLLECTIONS = Object.freeze({
  users: 'users',
  apps: 'apps',
  aiAppConfigs: 'aiappconfigs',
  aiSpends: 'aispends',
  aiStickyPicks: 'aistickypicks',
  apiKeys: 'apikeys',
  conversations: 'conversations',
  pushSubscriptions: 'pushsubscriptions',
});

/** `bujogeek` or `bujogeek:<suffix>`, any case. */
const OLD_ID_RE = new RegExp(`^${OLD_APP}(:.*)?$`, 'i');

/**
 * The new spelling of an app id, or null when it is not the old app.
 * Case-insensitive on the app half (legacy rows were written from request
 * bodies); a `:feature` suffix is kept as it was.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function renameAppId(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(OLD_ID_RE);
  return m ? `${NEW_APP}${m[1] || ''}` : null;
}

/**
 * What to do with one user's appPreferences.
 *
 * @param {object|null|undefined} prefs  the stored sub-document
 * @returns {{kind: 'none'} | {kind: 'rename'} | {kind: 'merge', merged: object}}
 */
export function planAppPreferences(prefs) {
  if (!prefs || typeof prefs !== 'object' || !(OLD_APP in prefs)) return { kind: 'none' };
  const oldVal = prefs[OLD_APP];
  const newVal = prefs[NEW_APP];
  if (newVal === undefined) return { kind: 'rename' };
  const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return { kind: 'merge', merged: { ...asObj(oldVal), ...asObj(newVal) } };
}

/** The DEFAULT_APPS row for the new id — the one source of its copy. */
export function newRegistryDefaults() {
  const row = DEFAULT_APPS.find((a) => a.name === NEW_APP);
  if (!row) throw new Error(`DEFAULT_APPS has no ${NEW_APP} row`);
  return row;
}

/**
 * What to do with the registry's old row.
 *
 * @param {object|null} oldRow   the `bujogeek` row
 * @param {object|null} newRow   an existing `todogeek` row, if boot seeded one
 * @returns {{kind: 'none'} | {kind: 'rename', set: object} | {kind: 'fold', set: object}}
 */
export function planRegistry(oldRow, newRow) {
  if (!oldRow) return { kind: 'none' };
  const d = newRegistryDefaults();
  if (!newRow) {
    return {
      kind: 'rename',
      set: { name: d.name, displayName: d.displayName, url: d.url, description: d.description },
    };
  }
  // Boot already seeded the new row from defaults; carry over what a person
  // may have customized on the old one, then the old row goes.
  const set = {};
  for (const k of ['icon', 'color', 'tag', 'sortOrder', 'enabled']) {
    if (oldRow[k] !== undefined) set[k] = oldRow[k];
  }
  return { kind: 'fold', set };
}

/**
 * What to do with one AI routing row whose appName is the old app.
 *
 * @param {object} oldRow
 * @param {object|null} existingTarget  a row already named the new id
 * @returns {{kind: 'rename', appName: string, displayName?: string, dropTarget: boolean} | {kind: 'conflict'}}
 */
export function planAppConfig(oldRow, existingTarget) {
  const appName = renameAppId(oldRow.appName);
  if (existingTarget && existingTarget.autoDiscovered !== true) return { kind: 'conflict' };
  const out = { kind: 'rename', appName, dropTarget: !!existingTarget };
  if (typeof oldRow.displayName === 'string' && /bujo/i.test(oldRow.displayName)) {
    out.displayName = 'TodoGeek';
  }
  return out;
}

/**
 * What to do with one spend-ledger row.
 *
 * @param {object} oldRow
 * @param {object|null} existingTarget  the same day/provider/feature bucket under the new app
 * @returns {{kind: 'rename'} | {kind: 'merge', inc: {calls: number, costUsd: number, refusals: number}}}
 */
export function planSpend(oldRow, existingTarget) {
  if (!existingTarget) return { kind: 'rename' };
  return {
    kind: 'merge',
    inc: {
      calls: Number(oldRow.calls) || 0,
      costUsd: Number(oldRow.costUsd) || 0,
      refusals: Number(oldRow.refusals) || 0,
    },
  };
}

/** `bujogeek:<conversation>` → `todogeek:<conversation>`; null when not the old app. */
export function renameStickyKey(key) {
  if (typeof key !== 'string') return null;
  const i = key.indexOf(':');
  const head = i === -1 ? key : key.slice(0, i);
  if (head.toLowerCase() !== OLD_APP) return null;
  return `${NEW_APP}${i === -1 ? '' : key.slice(i)}`;
}

/**
 * Run every step.
 *
 * @param {object} opts
 * @param {{userGeek: import('mongodb').Db, datageek: import('mongodb').Db,
 *          aiGeek: import('mongodb').Db, todogeek: import('mongodb').Db,
 *          bujogeek: import('mongodb').Db}} opts.dbs
 * @param {boolean} [opts.apply=false]
 * @param {Function} [opts.log]
 * @returns {Promise<object>} counts per step
 */
export async function run({ dbs, apply = false, log = console.log }) {
  const stats = {};

  const targetCollections = await dbs.todogeek.listCollections({}, { nameOnly: true }).toArray();
  stats.todogeekCollections = targetCollections.length;
  if (targetCollections.length === 0) {
    const msg = `DB ${NEW_APP} has no collections — copy DB ${OLD_APP} into it first ` +
      `(mongodump/mongorestore --nsFrom '${OLD_APP}.*' --nsTo '${NEW_APP}.*').`;
    if (apply) throw new Error(`Refusing to --apply: ${msg}`);
    log(`WARNING: ${msg} The counts below are what --apply would do after that copy.`);
  }

  // ── userGeek.users ────────────────────────────────────────────────────────
  {
    const users = dbs.userGeek.collection(COLLECTIONS.users);
    const s = { renamed: 0, merged: 0, defaultApp: 0 };
    const cursor = users.find(
      { [`appPreferences.${OLD_APP}`]: { $exists: true } },
      { projection: { appPreferences: 1 } }
    );
    for await (const u of cursor) {
      const plan = planAppPreferences(u.appPreferences);
      if (plan.kind === 'rename') {
        s.renamed++;
        if (apply) {
          await users.updateOne(
            { _id: u._id, [`appPreferences.${NEW_APP}`]: { $exists: false } },
            { $rename: { [`appPreferences.${OLD_APP}`]: `appPreferences.${NEW_APP}` } }
          );
        }
      } else if (plan.kind === 'merge') {
        s.merged++;
        if (apply) {
          await users.updateOne(
            { _id: u._id },
            { $set: { [`appPreferences.${NEW_APP}`]: plan.merged }, $unset: { [`appPreferences.${OLD_APP}`]: '' } }
          );
        }
      }
    }
    const defaultAppFilter = { 'preferences.defaultApp': { $regex: `^${OLD_APP}$`, $options: 'i' } };
    s.defaultApp = await users.countDocuments(defaultAppFilter);
    if (apply && s.defaultApp) {
      await users.updateMany(defaultAppFilter, { $set: { 'preferences.defaultApp': NEW_APP } });
    }
    stats.users = s;
    log(`userGeek.${COLLECTIONS.users}: appPreferences renamed=${s.renamed} merged=${s.merged}; preferences.defaultApp=${s.defaultApp}`);
  }

  // ── datageek.apps ─────────────────────────────────────────────────────────
  {
    const apps = dbs.datageek.collection(COLLECTIONS.apps);
    const oldRow = await apps.findOne({ name: OLD_APP });
    const newRow = await apps.findOne({ name: NEW_APP });
    const plan = planRegistry(oldRow, newRow);
    if (apply && plan.kind === 'rename') {
      await apps.updateOne({ _id: oldRow._id }, { $set: { ...plan.set, updatedAt: new Date() } });
    } else if (apply && plan.kind === 'fold') {
      await apps.updateOne({ _id: newRow._id }, { $set: { ...plan.set, updatedAt: new Date() } });
      await apps.deleteOne({ _id: oldRow._id });
    }
    stats.apps = plan.kind;
    log(`datageek.${COLLECTIONS.apps}: ${OLD_APP} row → ${plan.kind}`);
  }

  // ── aiGeek ────────────────────────────────────────────────────────────────
  const oldIdFilter = (field) => ({ [field]: { $regex: `^${OLD_APP}(:|$)`, $options: 'i' } });

  {
    const col = dbs.aiGeek.collection(COLLECTIONS.aiAppConfigs);
    const s = { renamed: 0, replacedStub: 0, conflict: 0 };
    for (const row of await col.find(oldIdFilter('appName')).toArray()) {
      const target = await col.findOne({ appName: renameAppId(row.appName) });
      const plan = planAppConfig(row, target);
      if (plan.kind === 'conflict') { s.conflict++; continue; }
      s.renamed++;
      if (plan.dropTarget) s.replacedStub++;
      if (apply) {
        if (plan.dropTarget) await col.deleteOne({ _id: target._id });
        const set = { appName: plan.appName, updatedAt: new Date() };
        if (plan.displayName) set.displayName = plan.displayName;
        await col.updateOne({ _id: row._id }, { $set: set });
      }
    }
    stats.aiAppConfigs = s;
    log(`aiGeek.${COLLECTIONS.aiAppConfigs}: renamed=${s.renamed} (replacing auto-discovered stub=${s.replacedStub}) conflict=${s.conflict}` +
      (s.conflict ? '  ← a hand-configured todogeek row exists; resolve by hand in the AI admin' : ''));
  }

  {
    const col = dbs.aiGeek.collection(COLLECTIONS.aiSpends);
    const s = { renamed: 0, merged: 0 };
    for (const row of await col.find(oldIdFilter('app')).toArray()) {
      const app = renameAppId(row.app);
      const target = await col.findOne({ day: row.day, provider: row.provider, app, feature: row.feature });
      const plan = planSpend(row, target);
      if (plan.kind === 'rename') {
        s.renamed++;
        if (apply) await col.updateOne({ _id: row._id }, { $set: { app } });
      } else {
        s.merged++;
        if (apply) {
          await col.updateOne({ _id: target._id }, { $inc: plan.inc });
          await col.deleteOne({ _id: row._id });
        }
      }
    }
    stats.aiSpends = s;
    log(`aiGeek.${COLLECTIONS.aiSpends}: renamed=${s.renamed} merged=${s.merged}`);
  }

  {
    const col = dbs.aiGeek.collection(COLLECTIONS.aiStickyPicks);
    const s = { renamed: 0, dropped: 0 };
    for (const row of await col.find(oldIdFilter('app')).toArray()) {
      const key = renameStickyKey(row.key) ?? row.key;
      const clash = key !== row.key && await col.findOne({ key });
      if (clash) {
        s.dropped++;
        if (apply) await col.deleteOne({ _id: row._id });
      } else {
        s.renamed++;
        if (apply) await col.updateOne({ _id: row._id }, { $set: { app: renameAppId(row.app), key } });
      }
    }
    stats.aiStickyPicks = s;
    log(`aiGeek.${COLLECTIONS.aiStickyPicks}: renamed=${s.renamed} dropped=${s.dropped}`);
  }

  for (const [name, field] of [[COLLECTIONS.apiKeys, 'appName'], [COLLECTIONS.conversations, 'appName']]) {
    const col = dbs.aiGeek.collection(name);
    const n = await col.countDocuments(oldIdFilter(field));
    if (apply && n) {
      // Plain id (no `:suffix` seen on these fields); one spelling for all.
      await col.updateMany(oldIdFilter(field), { $set: { [field]: NEW_APP } });
    }
    stats[name] = n;
    log(`aiGeek.${name}: ${field} renamed=${n}`);
  }

  // ── todogeek.pushsubscriptions ────────────────────────────────────────────
  {
    const src = dbs.bujogeek.collection(COLLECTIONS.pushSubscriptions);
    const dst = dbs.todogeek.collection(COLLECTIONS.pushSubscriptions);
    const endpoints = (await src.find({}, { projection: { endpoint: 1 } }).toArray())
      .map((r) => r.endpoint)
      .filter((e) => typeof e === 'string');
    let n = 0;
    if (endpoints.length) {
      n = await dst.countDocuments({ endpoint: { $in: endpoints } });
      if (apply && n) await dst.deleteMany({ endpoint: { $in: endpoints } });
    }
    stats.pushSubscriptions = n;
    log(`todogeek.${COLLECTIONS.pushSubscriptions}: old-origin subscriptions removed=${n}` +
      (endpoints.length ? '' : ` (DB ${OLD_APP} has none to match against)`));
  }

  return stats;
}

const isMain = process.argv[1] && import.meta.url === `file://${ process.argv[1] }`;

if (isMain) {
  await import('dotenv/config');
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('node scripts/rename-bujogeek-to-todogeek.js [--apply]\nDry run by default; see the header of this file.');
    process.exit(0);
  }
  const apply = args.includes('--apply');

  // Same env names and defaults the gateway itself uses.
  const base = process.env.MONGO_BASE_URI || 'mongodb://localhost:27017';
  const uris = {
    datageek: process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin',
    userGeek: process.env.USERGEEK_MONGODB_URI || 'mongodb://localhost:27017/userGeek?authSource=admin',
    aiGeek: process.env.AIGEEK_MONGODB_URI || 'mongodb://localhost:27017/aiGeek?authSource=admin',
    base: `${base}/?authSource=admin`,
  };
  const clients = Object.fromEntries(Object.entries(uris).map(([k, uri]) => [k, new MongoClient(uri)]));
  try {
    await Promise.all(Object.values(clients).map((c) => c.connect()));
    console.log(apply ? '[APPLY] writing changes' : '[DRY RUN] no writes will be performed');
    await run({
      apply,
      dbs: {
        datageek: clients.datageek.db(),
        userGeek: clients.userGeek.db(),
        aiGeek: clients.aiGeek.db(),
        todogeek: clients.base.db(NEW_APP),
        bujogeek: clients.base.db(OLD_APP),
      },
    });
    if (!apply) console.log('\n(dry run — re-run with --apply to write)');
    process.exitCode = 0;
  } catch (err) {
    // The message only: a driver error can carry the URI.
    console.error('Migration failed:', String(err?.message || err).replace(/mongodb(\+srv)?:\/\/\S+/g, 'mongodb://…'));
    process.exitCode = 1;
  } finally {
    await Promise.all(Object.values(clients).map((c) => c.close().catch(() => {})));
  }
}
