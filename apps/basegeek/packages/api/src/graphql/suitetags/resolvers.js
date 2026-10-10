/**
 * Tags across the suite — `suiteTags` and `taggedAcross` (typeDefs.js).
 *
 * NoteGeek, TodoGeek and ThingGeek spell tags one way (`@geeksuite/tags`), so
 * `#house/garage` in a note, a task and a thing is the same tag. These read
 * all three for the signed-in user:
 *
 *   - NoteGeek  — the caller's notes (`userId`).
 *   - TodoGeek  — the caller's tasks (`createdBy`). A PRIVATE task is
 *     "Private task" with no snippet, exactly like StartGeek's glance
 *     (`glance/resolvers.js` mapTask) — this list is a screen too.
 *   - ThingGeek — only for a household MEMBER (the gate in
 *     `@geeksuite/schemas/thinggeek/household`); anyone else simply gets no
 *     ThingGeek rows, never an error. Live things only (`deletedAt: null`),
 *     and a thing is its NAME only — no serial, plate, receipt, value or
 *     attribute ever leaves through here.
 *
 * Tags stored before the standard are folded in (`normalizeTag`) and matched
 * through their stored spellings (`shared/tagSpellings.js`), like every
 * other tag read, until the migration runs.
 */
import mongoose from 'mongoose';
import { normalizeTag, normalizeTags } from '@geeksuite/tags';
import householdModule from '@geeksuite/schemas/thinggeek/household';
import Note, { active as activeNote } from '../notegeek/models/Note.js';
import Task from '../todogeek/models/Task.js';
import { Thing } from '../thinggeek/models/thing.js';
import { spellingsOf, subtreeSpellings } from '../shared/tagSpellings.js';
import logger from '../../lib/logger.js';

const { isMember, DEFAULT_HOUSEHOLD_ID } = householdModule;

export const APPS = Object.freeze(['notegeek', 'todogeek', 'thinggeek']);
const PER_APP_LIMIT = 50;
const SNIPPET_MAX = 140;
export const PRIVATE_TASK_LABEL = 'Private task';

const URLS = {
  notegeek: (id) => `https://notegeek.clintgeek.com/notes/${id}`,
  // TodoGeek has no per-task page; its search reads `#tag` in a task's tags.
  todogeek: (_id, tag) => `https://todogeek.clintgeek.com/search?q=${encodeURIComponent(`#${tag}`)}`,
  thinggeek: (id) => `https://thinggeek.clintgeek.com/thing/${id}`,
};

const oidOf = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);

/** Who may see what: the owner filter per app, or null when that app is closed to the caller. */
function scopes(user) {
  const owner = oidOf(user?.id);
  if (!owner) return null;
  return {
    // Archived notes are neither counted nor listed (NoteGeek spec §3 A2).
    notegeek: { model: Note, scope: { userId: owner, ...activeNote() } },
    todogeek: { model: Task, scope: { createdBy: owner } },
    thinggeek: isMember(user) ? { model: Thing, scope: { householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null } } : null,
  };
}

/** Per stored spelling → count, folded into the standard spelling. */
async function tagCounts(model, scope) {
  const rows = await model.aggregate([
    { $match: { ...scope, 'tags.0': { $exists: true } } },
    { $project: { tags: 1 } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', n: { $sum: 1 } } },
  ]);
  const out = new Map();
  for (const { _id, n } of rows) {
    const tag = normalizeTag(typeof _id === 'string' ? _id : '');
    if (tag) out.set(tag, (out.get(tag) || 0) + n);
  }
  return out;
}

/** Plain text, no markup, bounded. */
function plainSnippet(text) {
  if (typeof text !== 'string' || !text) return null;
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  return plain.length > SNIPPET_MAX ? `${plain.slice(0, SNIPPET_MAX - 1)}…` : plain;
}

const SNAPSHOT_TYPES = new Set(['mindmap', 'handwritten']);

function noteRow(n, tag) {
  const hidden = n.isLocked || n.isEncrypted || SNAPSHOT_TYPES.has(n.type);
  return {
    app: 'notegeek',
    id: String(n._id),
    title: n.title || 'Untitled',
    snippet: hidden ? null : plainSnippet(n.content),
    url: URLS.notegeek(n._id, tag),
    tags: normalizeTags(n.tags),
    updatedAt: n.updatedAt || null,
  };
}

function taskRow(t, tag) {
  const base = { app: 'todogeek', id: String(t._id), url: URLS.todogeek(t._id, tag), updatedAt: t.updatedAt || null };
  if (t.private) return { ...base, title: PRIVATE_TASK_LABEL, snippet: null, tags: [] };
  return { ...base, title: t.content || 'Untitled task', snippet: plainSnippet(t.note), tags: normalizeTags(t.tags) };
}

function thingRow(t, tag) {
  return {
    app: 'thinggeek',
    id: String(t._id),
    title: t.name || 'Unnamed thing',
    snippet: null,
    url: URLS.thinggeek(t._id, tag),
    tags: normalizeTags(t.tags),
    updatedAt: t.updatedAt || null,
  };
}

const PROJECTIONS = {
  notegeek: { title: 1, content: 1, type: 1, tags: 1, isLocked: 1, isEncrypted: 1, updatedAt: 1 },
  todogeek: { content: 1, note: 1, tags: 1, private: 1, updatedAt: 1 },
  thinggeek: { name: 1, tags: 1, updatedAt: 1 },
};
const ROWS = { notegeek: noteRow, todogeek: taskRow, thinggeek: thingRow };

/** One app's failure costs that app's rows, never the whole answer. */
async function safely(app, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err: err?.message, app }, '[suitetags] app read failed');
    return fallback;
  }
}

export const resolvers = {
  Query: {
    suiteTags: async (_, __, context) => {
      const open = scopes(context.user);
      if (!open) return [];
      const perApp = await Promise.all(APPS.map((app) => (open[app]
        ? safely(app, () => tagCounts(open[app].model, open[app].scope), new Map())
        : new Map())));
      const byTag = new Map();
      perApp.forEach((counts, i) => {
        for (const [tag, n] of counts) {
          if (!byTag.has(tag)) byTag.set(tag, { tag, total: 0, apps: [] });
          const row = byTag.get(tag);
          row.total += n;
          row.apps.push({ app: APPS[i], count: n });
        }
      });
      return [...byTag.values()].sort((a, b) => b.total - a.total || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    },

    taggedAcross: async (_, { tag, under = false, apps = null }, context) => {
      const open = scopes(context.user);
      const want = normalizeTag(tag);
      if (!open || !want) return [];
      const asked = Array.isArray(apps) && apps.length ? APPS.filter((a) => apps.includes(a)) : APPS;
      const lists = await Promise.all(asked.map((app) => {
        if (!open[app]) return [];
        const { model, scope } = open[app];
        return safely(app, async () => {
          const spellings = under ? await subtreeSpellings(model, scope, want) : await spellingsOf(model, scope, want);
          const docs = await model.find({ ...scope, tags: { $in: spellings } }, PROJECTIONS[app])
            .sort({ updatedAt: -1 })
            .limit(PER_APP_LIMIT)
            .lean();
          return docs.map((d) => ROWS[app](d, want));
        }, []);
      }));
      return lists.flat();
    },
  },
};
