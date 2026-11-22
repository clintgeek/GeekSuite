import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import Note, { active, notDeleted, staleIndexFields } from './models/Note.js';
import {
  validateInput,
  createNoteArgsSchema,
  updateNoteArgsSchema,
  deleteNoteArgsSchema,
  setNotePinnedArgsSchema,
  renameTagArgsSchema,
  deleteTagArgsSchema,
  suggestForNoteArgsSchema,
  composeNoteArgsSchema,
  transcribeSketchArgsSchema,
  autoTranscribeSketchArgsSchema,
  saveSketchTranscriptEditArgsSchema,
  recordSketchTasksSentArgsSchema,
  foldInPreviewArgsSchema,
  foldInApplyArgsSchema,
  archiveNotesArgsSchema,
  archivedNotesArgsSchema,
  composeNotesArgsSchema,
  notesPageArgsSchema,
  NOTES_PAGE_DEFAULT,
  clampSearchQuery,
  assertContentCeiling,
} from './validation.js';
import { snippetAround, derivedFields, previewFor } from './noteDerived.js';
import {
  noteProjection, sortSpec, pageQuery, encodeCursor, decodeCursor, TITLE_COLLATION, fillMissingPreviews,
} from './noteLists.js';
import { sanitizeNoteArgs } from './sanitize.js';
import { suggestForNote } from './suggest.js';
import { composeNote, composeNotes } from './compose.js';
import { transcribeSketch } from './transcribe.js';
import {
  autoTranscribeSketch, getSketchTranscript, rememberConvertReading, saveSketchTranscriptEdit,
  recordSketchTasksSent, transcriptForCreate, sketchesToTranscribe,
} from './sketchTranscript.js';
import { foldInPreview, planOperations, applyPlan, refusalFor } from './foldin.js';
import NoteVersion from './models/NoteVersion.js';
import {
  normalizeTag,
  normalizeTags,
  escapeRegex,
  isInSubtree,
  swapPrefix,
} from './tags.js';
import { spellingsOf, subtreeSpellings, storedSpellingsWhere, anyOf } from '../shared/tagSpellings.js';
import {
  snapshotNote,
  shouldSnapshotEdit,
  isMeaningfulChange,
  listNoteVersions,
  getNoteVersion,
  deleteVersionsForNote,
} from './versions.js';
import NoteChunk from './models/NoteChunk.js';
import {
  resolveLinks,
  resolvePendingLinks,
  detachLinksTo,
  backlinks as findBacklinks,
  linkKey,
} from './links.js';
import logger from '../../lib/logger.js';
import {
  vectorSearchRanked,
  rankHybrid,
  whyExcerpt,
  relatedNotes as findRelatedNotes,
  indexStatus,
  dropNoteVectors,
} from './semantic.js';

const validateCreateNote = validateInput(createNoteArgsSchema);
const validateUpdateNote = validateInput(updateNoteArgsSchema);
const validateDeleteNote = validateInput(deleteNoteArgsSchema);
const validateSetNotePinned = validateInput(setNotePinnedArgsSchema);
const validateRenameTag = validateInput(renameTagArgsSchema);
const validateDeleteTag = validateInput(deleteTagArgsSchema);
const validateSuggestForNote = validateInput(suggestForNoteArgsSchema);
const validateComposeNote = validateInput(composeNoteArgsSchema);
const validateTranscribeSketch = validateInput(transcribeSketchArgsSchema);
const validateAutoTranscribeSketch = validateInput(autoTranscribeSketchArgsSchema);
const validateSaveSketchTranscriptEdit = validateInput(saveSketchTranscriptEditArgsSchema);
const validateRecordSketchTasksSent = validateInput(recordSketchTasksSentArgsSchema);
const validateFoldInPreview = validateInput(foldInPreviewArgsSchema);
const validateFoldInApply = validateInput(foldInApplyArgsSchema);
const validateArchiveNotes = validateInput(archiveNotesArgsSchema);
const validateArchivedNotes = validateInput(archivedNotesArgsSchema);
const validateComposeNotes = validateInput(composeNotesArgsSchema);
const validateNotesPage = validateInput(notesPageArgsSchema);

/** Default page of the Archived view. */
const ARCHIVED_DEFAULT_LIMIT = 50;

/**
 * Archive or restore the caller's notes (spec §3 A5). One shape for both.
 *
 * - Owner-scoped, and an id that is malformed, someone else's, missing or
 *   already in the wanted state is simply not in the answer — never an error,
 *   so a stale selection cannot fail the whole batch.
 * - NOT an edit: `timestamps: false` keeps `updatedAt`, no version snapshot,
 *   no re-embed (title/content untouched), and `pinned` is left alone so a
 *   restored pinned note is pinned again.
 *
 * @returns {{ ids: string[], count: number }} the notes actually changed
 */
async function setArchived(rawArgs, context, archive) {
  const userId = context.user?.id;
  if (!userId) throw new Error('Unauthorized');
  const { ids } = validateArchiveNotes(rawArgs);
  const valid = [...new Set(ids.filter((id) => mongoose.isValidObjectId(id)).map(String))];
  if (!valid.length) return { ids: [], count: 0 };
  const scope = {
    userId,
    _id: { $in: valid },
    archived: archive ? { $ne: true } : true,
  };
  const targets = await Note.find(scope, { _id: 1 }).lean();
  if (!targets.length) return { ids: [], count: 0 };
  const changed = targets.map((n) => n._id);
  await Note.updateMany(
    { ...scope, _id: { $in: changed } },
    { $set: archive ? { archived: true, archivedAt: new Date() } : { archived: false, archivedAt: null } },
    { timestamps: false },
  );
  logger.info({ userId: String(userId), count: changed.length }, archive ? '[notegeek] notes archived' : '[notegeek] notes restored');
  return { ids: changed.map(String), count: changed.length };
}

/** A refusal the person can act on, in the same shape as every other input error. */
const foldInRefusal = (message, code = 'BAD_USER_INPUT', details = []) =>
  new GraphQLError(message, {
    extensions: { code, http: { status: code === 'CONFLICT' ? 409 : 400 }, details },
  });

/** The note fold-in is aimed at, owner-scoped, or a refusal saying why not. */
async function foldableNote(noteId, userId) {
  if (!mongoose.isValidObjectId(noteId)) throw new Error(`Invalid Note ID format: ${ noteId }`);
  const note = await Note.findOne({ _id: noteId, userId }).lean();
  if (!note) throw new Error('Note not found or you do not have permission to edit it');
  const refusal = refusalFor(note);
  if (refusal) throw foldInRefusal(refusal);
  return note;
}

/** How many search hits one `searchNotes` call may return. */
const SEARCH_RESULT_LIMIT = 100;

/** The stored tag ceiling — the same 100 `validation.js` enforces on input. */
const TAG_MAX = 100;

/**
 * One search result row. The snippet is plain text around the first word that
 * starts with a query term (plan 5.5): from `wordText`, so a rich-text note
 * shows words, not tags; a code note its code, not its JSON; a mind map its
 * labels; and a sketch its transcript. Locked and encrypted notes: none.
 */
function searchRow(note, { score, matchedBy = null, why = null, bestMatch = false, q = '' }) {
  const hidden = note.isLocked || note.isEncrypted;
  const snippet = hidden ? '' : snippetAround(note.wordText || '', q);
  return {
    _id: note._id,
    title: note.title,
    type: note.type || 'text',
    tags: normalizeTags(note.tags || []),
    isLocked: note.isLocked || false,
    isEncrypted: note.isEncrypted || false,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    score,
    snippet,
    message: note.isLocked ? 'Note is locked. Content not available.' : null,
    matchedBy,
    why,
    bestMatch,
  };
}

/** How long a note stays in Recently deleted before it is purged. */
export const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DELETED_DEFAULT_LIMIT = 50;

/** Hard-delete one note and everything hanging off it. Best effort past the note itself. */
async function hardDelete(note, userId) {
  const res = await Note.deleteOne({ _id: note._id, userId, deletedAt: { $ne: null } });
  if (!res.deletedCount) return false;
  await deleteVersionsForNote(note._id, userId);
  try {
    await NoteChunk.deleteMany({ noteId: note._id, userId });
  } catch (err) {
    logger.warn({ err: err?.message }, '[notegeek] chunk cleanup failed; the sweep will retry');
  }
  dropNoteVectors(userId, note._id);
  return true;
}

/**
 * Purge the caller's notes deleted over 30 days ago. Lazy — run when
 * Recently deleted is read and on every delete — so there is no job to keep
 * alive. Never fails the caller's request.
 */
export async function purgeExpiredNotes(userId, now = Date.now()) {
  try {
    const expired = await Note.find(
      { userId, deletedAt: { $ne: null, $lt: new Date(now - DELETED_RETENTION_MS) } },
      { _id: 1 },
    ).limit(200).lean();
    let purged = 0;
    for (const n of expired) {
      // eslint-disable-next-line no-await-in-loop
      if (await hardDelete(n, userId)) purged += 1;
    }
    if (purged) logger.info({ userId: String(userId), purged }, '[notegeek] expired deleted notes purged');
    return purged;
  } catch (err) {
    logger.warn({ err: err?.message }, '[notegeek] purge of expired deleted notes failed');
    return 0;
  }
}

/** C3: the write lost to a newer save. Carries the server's copy. Status 200, like any resolver error. */
function noteConflict(note) {
  return new GraphQLError('This note was changed on another device since you started editing.', {
    extensions: {
      code: 'CONFLICT',
      serverNote: {
        id: String(note._id),
        title: note.title ?? null,
        content: note.content ?? '',
        tags: normalizeTags(note.tags || []),
        type: note.type || 'text',
        updatedAt: new Date(note.updatedAt).toISOString(),
      },
    },
  });
}

/** Titles with a word starting with `q` (plan 5.4): the hybrid search's third list. */
async function titlePrefixIds(scope, q) {
  const needle = String(q || '').trim();
  if (needle.length < 2 || needle.length > 100) return [];
  const re = new RegExp(`(^|[\\s\\-_/([{"'])${ escapeRegex(needle) }`, 'i');
  const rows = await Note.find({ ...scope, title: re }, { title: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 }).limit(50).lean();
  const low = needle.toLowerCase();
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (String(a.r.title).toLowerCase().startsWith(low) ? 0 : 1) - (String(b.r.title).toLowerCase().startsWith(low) ? 0 : 1) || a.i - b.i)
    .slice(0, 20)
    .map(({ r }) => String(r._id));
}

/** Mongo's "no text index" (the moment the index is being swapped at start-up). */
const isMissingTextIndex = (err) => err?.code === 27 || /text index required/i.test(String(err?.message));

/**
 * The list's filter: the owner's active notes, narrowed by tag / prefix /
 * under / type (shared by notes and notesPage).
 */
async function listFilter(userId, { tag, prefix, under, type }) {
  // Archived notes leave the list (spec §3 A2). The tag-spelling lookups
  // below stay owner-wide: a superset of spellings narrows nothing wrongly.
  const filter = { userId, ...active() };

  // `tag` and `prefix` are separate arguments and a client may send both.
  // Two plain assignments meant the second silently REPLACED the first, so
  // `notes(tag: "flock", prefix: "chores/")` quietly dropped the tag half
  // and returned the wrong list. Both narrow now, which is what a caller
  // asking for both means.
  //
  // Every tag argument is read through the suite standard AND matched
  // against the owner's stored spellings (`shared/tagSpellings.js`), so a
  // note tagged before the standard (`geekSuite`) is still found by
  // `geek-suite` until the migration rewrites it.
  const owner = { userId };
  const tagConds = [];
  if (tag) tagConds.push(anyOf(await spellingsOf(Note, owner, tag)));
  if (prefix) {
    // A raw prefix (old bundles), also tried in the standard spelling.
    const normPrefix = normalizeTag(prefix) + (/\/\s*$/.test(prefix) ? '/' : '');
    const hits = await storedSpellingsWhere(Note, owner,
      (n, stored) => stored.startsWith(prefix) || (normPrefix !== '' && n.startsWith(normPrefix)));
    tagConds.push(anyOf(hits));
  }
  // `under` is the nested-tag view: the tag itself AND everything beneath
  // it (`house` → `house`, `house/garage`, never `houseboat`). Normalized
  // the way stored tags are, so `house/` finds `house`. One that
  // normalizes to nothing narrows nothing, like an absent argument.
  const underTag = normalizeTag(under);
  if (underTag) tagConds.push(anyOf(await subtreeSpellings(Note, owner, underTag)));
  if (tagConds.length === 1) {
    filter.tags = tagConds[0];
  } else if (tagConds.length > 1) {
    filter.$and = tagConds.map((cond) => ({ tags: cond }));
  }
  if (type) {
    filter.type = type;
  }

  return filter;
}

const badTagInput = (message, path = 'newTag') =>
  new GraphQLError(message, {
    extensions: {
      code: 'BAD_USER_INPUT',
      http: { status: 400 },
      details: [{ path, message }],
    },
  });

export const resolvers = {
  Query: {
    /** A sketch's automatic transcript state (sketchTranscript.js). */
    sketchTranscript: async (_, { noteId }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      return await getSketchTranscript({ noteId, userId });
    },
    /** Sketches waiting to be read that nobody is writing on (sketchTranscript.js). */
    sketchesToTranscribe: async (_, { limit }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return await sketchesToTranscribe({ userId, limit: limit ?? undefined });
    },
    /** A note's history, newest first. Content omitted — see versions.js. */
    noteVersions: async (_, { noteId }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      if (!noteId || !mongoose.isValidObjectId(noteId)) return [];
      return listNoteVersions({ noteId, userId });
    },

    /** One version, with its content. Null for anyone else's. */
    noteVersion: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) return null;
      if (!id || !mongoose.isValidObjectId(id)) return null;
      return getNoteVersion({ versionId: id, userId });
    },

    notes: async (_, { tag, prefix, under, type, limit, sort }, context, info) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const filter = await listFilter(userId, { tag, prefix, under, type });
      const { key, dir } = sortSpec(sort);
      // Pinned notes sort first, ahead of whatever order was requested —
      // server-side, matching how every other `notes` sort is decided here
      // rather than left to the client. Lean, and without `content` unless
      // it was selected (plan 5.1).
      const query = Note.find(filter, noteProjection(info)).sort({ pinned: -1, [key]: dir }).lean();
      if (key === 'title') query.collation(TITLE_COLLATION);
      if (limit && limit > 0) query.limit(limit);
      return await fillMissingPreviews(await query);
    },

    /** The list a page at a time (plan 5.2). See noteLists.js for the cursor. */
    notesPage: async (_, rawArgs, context, info) => {
      const userId = context.user?.id;
      if (!userId) return { notes: [], nextCursor: null, hasMore: false };
      const args = validateNotesPage(rawArgs || {});
      const spec = sortSpec(args.sort);
      const first = args.first ?? NOTES_PAGE_DEFAULT;
      const filter = await listFilter(userId, args);
      const cursor = decodeCursor(args.after, spec);
      const { sort, after, skip } = pageQuery(spec, cursor);
      const query = Note.find(after ? { $and: [filter, after] } : filter, noteProjection(info, ['notes']))
        .sort(sort).skip(skip).limit(first + 1).lean();
      if (spec.key === 'title') query.collation(TITLE_COLLATION);
      const rows = await fillMissingPreviews(await query);
      const hasMore = rows.length > first;
      const notes = hasMore ? rows.slice(0, first) : rows;
      return {
        notes,
        hasMore,
        nextCursor: hasMore ? encodeCursor(notes[notes.length - 1], spec, skip + notes.length) : null,
      };
    },

    /** Recently deleted, newest first. Reading it purges what is past 30 days. */
    deletedNotes: async (_, { limit }, context, info) => {
      const userId = context.user?.id;
      if (!userId) return [];
      await purgeExpiredNotes(userId);
      const n = Math.max(1, Math.min(Number(limit) || DELETED_DEFAULT_LIMIT, 200));
      return await fillMissingPreviews(await Note.find({ userId, deletedAt: { $ne: null } }, noteProjection(info))
        .sort({ deletedAt: -1, _id: -1 }).limit(n).lean());
    },

    note: async (_, { id }, context, info) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      // By id, deleted ones too: a link or a stale tab opens it, and the
      // client shows "In Recently deleted · Restore" from `deletedAt`.
      const note = await Note.findOne({ _id: id, userId }, noteProjection(info)).lean();
      if (!note) throw new Error('Note not found or you do not have permission to view it');
      return note;
    },

    noteTags: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      // In the standard spelling, deduped — a legacy `Work` and `work` are
      // one tag, the one every write now stores.
      const tags = await Note.distinct('tags', { userId, ...active() });
      return normalizeTags(tags).sort((a, b) => a.localeCompare(b));
    },

    /**
     * How much a tag subtree covers: the notes carrying the tag or any tag
     * beneath it, and how many distinct sub-tags there are. The delete dialog
     * reads it before asking — "Removes #house and its 2 sub-tags from 7
     * notes" — so the user sees the blast radius first.
     */
    noteTagUsage: async (_, { tag }, context) => {
      const userId = context.user?.id;
      const root = normalizeTag(tag);
      if (!userId || !root) return { notes: 0, subTags: 0, archived: 0 };
      // Active notes only (spec §3 A2): the counts describe what you can see.
      const spellings = await subtreeSpellings(Note, { userId, ...active() }, root);
      const notes = await Note.countDocuments({ userId, ...active(), tags: anyOf(spellings) });
      const subTags = new Set(
        spellings.map(normalizeTag).filter((t) => t !== root && isInSubtree(t, root))
      ).size;
      // renameTag/deleteTag reach archived notes too (spec §3 A4), so the
      // dialogs need this to say what an action will actually touch.
      const archivedSpellings = await subtreeSpellings(Note, { userId, archived: true, ...notDeleted() }, root);
      const archived = archivedSpellings.length
        ? await Note.countDocuments({ userId, archived: true, ...notDeleted(), tags: anyOf(archivedSpellings) })
        : 0;
      return { notes, subTags, archived };
    },

    /**
     * Search. `hybrid: false` (the default, and what bundles from before
     * 2026-09-30 send by omission) is the original keyword search, unchanged.
     * `hybrid: true` fuses it with meaning-based hits from the local
     * embeddings (`semantic.js`) by Reciprocal Rank Fusion; each row then says
     * how it matched (`matchedBy`) and, for a meaning hit, the passage that
     * matched (`why`). Weak keyword hits are cut, and a clear winner comes
     * first with `bestMatch: true` (semantic.js). When the embeddings service
     * is down or slow, hybrid is silently keyword-only (still cut, never a
     * best match).
     */
    searchNotes: async (_, { q: rawQ, under, hybrid }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!rawQ || rawQ.trim().length === 0) throw new Error('Search query cannot be empty');
      // Bounded (plan 5.10): cut at a word, never refused — Fold-in's picker
      // searches with the start of a 12 000-character paste.
      const q = clampSearchQuery(rawQ);

      // Bounded. This had no limit at all while projecting every matching
      // row's full `content` — a field whose ceiling is 5 000 000 characters
      // for the mindmap/handwritten snapshot types — in order to build a
      // 200-character snippet it then discards for exactly those types. The
      // cap is on results rather than on the projection because an
      // aggregation-expression projection alongside `$meta: 'textScore'`
      // needs a server version this deployment does not assert.
      // Active notes only (spec §3 A2) — the keyword rows AND the meaning-only
      // `extra` re-read below share this scope.
      const scope = { userId, ...active() };
      const underTag = normalizeTag(under);
      if (underTag) scope.tags = anyOf(await subtreeSpellings(Note, { userId }, underTag));
      // `wordText`, not `content`: the snippet's words without a sketch's
      // megabytes of JSON (plan 5.1/5.5).
      const projection = { title: 1, type: 1, tags: 1, isLocked: 1, isEncrypted: 1, createdAt: 1, updatedAt: 1, wordText: 1 };
      let keywordRows = [];
      try {
        keywordRows = await Note.find(
          { ...scope, $text: { $search: q } },
          { ...projection, score: { $meta: 'textScore' } }
        ).sort({ score: { $meta: 'textScore' } }).limit(SEARCH_RESULT_LIMIT).lean();
      } catch (err) {
        // The moment the text index is being rebuilt at start-up
        // (wordIndex.js): no keyword hits, not an error.
        if (!isMissingTextIndex(err)) throw err;
        logger.warn('[notegeek] text index missing (rebuilding?); keyword search empty');
      }

      if (!hybrid) return keywordRows.map((note) => searchRow(note, { score: note.score, q }));

      let vector = { hits: [], runnerUpScore: null, backfilling: false };
      try {
        vector = await vectorSearchRanked({ userId, q, log: logger });
      } catch (err) {
        // Anything unexpected in the vector half costs the meaning hits, never the search.
        logger.warn({ err: err?.message }, '[notegeek] vector search failed; keyword-only');
      }
      const vectorHits = vector.hits;
      const prefixIds = await titlePrefixIds(scope, q).catch(() => []);

      // The weak-hit cuts, RRF, and the best match: semantic.js `rankHybrid`.
      const ranked = rankHybrid({
        keywordRows, vectorHits, runnerUpScore: vector.runnerUpScore, backfilling: vector.backfilling, prefixIds,
      });
      const byId = new Map(keywordRows.map((n) => [String(n._id), n]));
      // Meaning-only (and title-prefix) hits are re-read through the same
      // scope (owner + `under`), which also drops a note deleted since its
      // vectors were cached.
      const missing = [...new Set([...vectorHits.map((h) => h.noteId), ...prefixIds])].filter((id) => !byId.has(id));
      if (missing.length) {
        const extra = await Note.find({ ...scope, _id: { $in: missing } }, projection).lean();
        for (const n of extra) byId.set(String(n._id), n);
      }
      const hitById = new Map(vectorHits.map((h) => [h.noteId, h]));
      return ranked
        .filter((r) => byId.has(r.id))
        .slice(0, SEARCH_RESULT_LIMIT)
        .map((r) => {
          const note = byId.get(r.id);
          const hit = hitById.get(r.id);
          return searchRow(note, {
            // Keyword-only (no vectors at all): the textScore, as before.
            score: vectorHits.length ? r.score : note.score,
            matchedBy: r.matchedBy,
            why: hit ? whyExcerpt(hit.text, note.title) : null,
            bestMatch: r.best,
            q,
          });
        });
    },

    /** Notes that read like this one, by meaning. Empty until it is indexed. */
    relatedNotes: async (_, { noteId, limit }, context) => {
      const userId = context.user?.id;
      if (!userId || !noteId || !mongoose.isValidObjectId(noteId)) return [];
      try {
        return await findRelatedNotes({ userId, noteId, limit });
      } catch (err) {
        logger.warn({ err: err?.message }, '[notegeek] relatedNotes failed');
        return [];
      }
    },

    /** Notes that link to this one with [[its title]] (or an in-app link), with context. */
    backlinks: async (_, { noteId }, context) => {
      const userId = context.user?.id;
      if (!userId || !noteId || !mongoose.isValidObjectId(noteId)) return [];
      return findBacklinks({ userId, noteId });
    },

    /**
     * Titles for the [[ picker: the owner's notes whose title contains `q`
     * (case-insensitive), titles that start with it first, then the most
     * recently edited. A light projection — no bodies.
     */
    noteTitles: async (_, { q, limit }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const n = Math.max(1, Math.min(Number(limit) || 20, 50));
      const needle = String(q ?? '').trim().slice(0, 200);
      const filter = { userId, ...active(), title: { $nin: [null, ''] } };
      if (needle) filter.title = { $regex: escapeRegex(needle), $options: 'i' };
      const rows = await Note.find(filter, { title: 1, type: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 }).limit(needle ? 200 : n).lean();
      const low = needle.toLowerCase();
      const starts = (t) => (low && String(t).toLowerCase().startsWith(low) ? 0 : 1);
      return rows
        .map((r, i) => ({ r, i }))
        .sort((a, b) => starts(a.r.title) - starts(b.r.title) || a.i - b.i)
        .slice(0, n)
        .map(({ r }) => ({ id: String(r._id), title: r.title, type: r.type, updatedAt: r.updatedAt }));
    },

    /**
     * The Archived view (spec §3 A6): the caller's archived notes, most
     * recently archived first. Paged; an anonymous caller gets nothing.
     */
    archivedNotes: async (_, rawArgs, context, info) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const { limit, offset } = validateArchivedNotes(rawArgs || {});
      return await Note.find({ userId, archived: true, ...notDeleted() }, noteProjection(info))
        .sort({ archivedAt: -1, _id: -1 })
        .skip(offset ?? 0)
        .limit(limit ?? ARCHIVED_DEFAULT_LIMIT)
        .lean()
        .then(fillMissingPreviews);
    },

    /** How much of the caller's library is searchable by meaning. */
    noteIndexStatus: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      return indexStatus({ userId });
    },

    /**
     * Tag and related-note suggestions for the note being written — AI_IDEAS
     * #3. See `suggest.js` for the ranking, the opt-in and what (if anything)
     * leaves the box.
     *
     * Anonymous callers get an empty answer rather than an error: GraphQL sits
     * behind `optionalUser()`, and a suggestion strip is not worth a thrown
     * error on a session that has merely expired mid-edit. It is a read that
     * writes nothing, so there is no ownership decision to get wrong — the
     * corpora are built from `userId` and nothing else.
     */
    suggestForNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      const { noteId, title, excerpt, tags } = validateSuggestForNote(rawArgs);
      if (!userId) {
        return {
          tags: [],
          related: [],
          provenance: {
            source: 'fallback',
            reason: 'unauthenticated',
            model: null,
            provider: null,
            cached: false,
            callsToday: 0,
            cap: null,
          },
        };
      }
      return await suggestForNote({ userId, noteId: noteId ?? null, title, excerpt, tags });
    },
  },

  Mutation: {
    createNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      // `userId` is not part of the GraphQL argument list, so no real client
      // can send one; a direct resolver call can, and it is dropped here —
      // before validation, so the strict schema never sees it — leaving the
      // session as the only source of ownership.
      const { userId: _payloadUserId, ...ownArgs } = rawArgs;
      const { transcriptText, ...args } = validateCreateNote(ownArgs);
      // `text` notes store TipTap HTML and notegeek renders it as markup, so
      // the body is sanitized before it is stored — see `sanitize.js` for the
      // profile and for why the other four types are passed through untouched
      // (their `content` is markdown or a JSON snapshot, and running an HTML
      // sanitizer over either would corrupt it). A create that omits `type`
      // gets `text` here because that is `Note.type`'s schema default — the
      // row really will be a rich-text note, so it must be sanitized like one.
      const effectiveType = args.type ?? 'text';
      const cleaned = sanitizeNoteArgs(args, effectiveType);
      // Sanitizing can make a body LONGER (see `assertContentCeiling`), so the
      // string that is actually stored is measured, not the one that arrived.
      // Otherwise a note is created above the ceiling and can never be saved
      // again.
      assertContentCeiling(cleaned.content, effectiveType, { sanitized: true });
      const links = await resolveLinks({ userId, content: cleaned.content, type: effectiveType });
      // C6: a photo note's reviewed reading rides in the same write, so the
      // note is searchable even if the follow-up save never lands.
      const transcript = typeof transcriptText === 'string' && effectiveType === 'handwritten'
        ? { sketchTranscript: transcriptForCreate({ content: cleaned.content, text: transcriptText }) }
        : {};
      const note = new Note({ ...cleaned, ...transcript, userId, links });
      const saved = await note.save();
      // Anyone's [[This title]] that was waiting for this note now finds it.
      if (saved.title) await resolvePendingLinks({ userId, noteId: saved._id, title: saved.title });
      return saved;
    },

    updateNote: async (_, rawArgs, context, info) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      // `changeReason` is peeled off here: it labels the HISTORY entry, and
      // must never become part of the update payload written to the note.
      // `baseUpdatedAt` and `transcriptText` are not note fields either.
      const { id, changeReason, baseUpdatedAt, transcriptText, ...args } = validateUpdateNote(rawArgs);
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      // The order of the next four steps is the fix for BURN_REVIEW_2 #4/#6,
      // and it is the whole point of this block:
      //
      //   1. resolve the EFFECTIVE type,
      //   2. apply that type's ceiling to the INPUT,
      //   3. sanitize (only `text` bodies are touched at all),
      //   4. apply the ceiling again to the OUTPUT.
      //
      // Step 1 exists because `type` is optional on update — every notegeek
      // client sends it, but a hand-rolled `updateNote(id, content)` would
      // not, and skipping sanitization in that case would leave the stored-XSS
      // hole open. When it is missing AND there is a body to clean, the stored
      // type is read: one projected, `_id`-keyed find, on a path no real
      // client takes.
      //
      // Step 2 is what keeps that read from being a liability. `validation.js`
      // has to give a typeless update the 5 000 000 snapshot ceiling, so
      // before this ordering a single `updateNote(id, content)` with a 5 MB
      // body on a `text` row handed 5 MB to jsdom + DOMPurify — 16 365 ms of
      // synchronous, gateway-wide event-loop block, for all eight apps.
      // Now the sanitizer never sees more than 100 000 characters.
      let effectiveType = args.type;
      if (typeof args.content === 'string' && effectiveType === undefined) {
        const stored = await Note.findOne({ _id: id, userId }, { type: 1 }).lean();
        effectiveType = stored?.type;
      }
      let payload = args;
      if (typeof args.content === 'string') {
        assertContentCeiling(args.content, effectiveType);
        payload = sanitizeNoteArgs(args, effectiveType);
        assertContentCeiling(payload.content, effectiveType, { sanitized: true });
      }
      // `args` is schema-validated by GraphQL and carries no userId field, so
      // ownership cannot be reassigned through the update payload.
      // The note as it stands, kept so the update can be undone. Read BEFORE
      // the write and stored AFTER it succeeds: a rejected write must not
      // leave a version behind, or the history fills with states that never
      // existed. This is the ONLY site that updates a note's content, which
      // is what makes one snapshot call sufficient.
      const previous = await Note.findOne({ _id: id, userId }).lean();
      if (!previous) throw new Error('Note not found or you do not have permission to edit it');

      // C3: an edit made against an older copy of the note is refused, with
      // the server's copy, instead of silently replacing a newer save from
      // another device. Checked here for a quick answer, and again in the
      // write itself (the filter on updatedAt), which is what makes it safe:
      // a save landing between this read and the write still loses nothing.
      const base = baseUpdatedAt ? new Date(baseUpdatedAt) : null;
      if (base && new Date(previous.updatedAt).getTime() !== base.getTime()) throw noteConflict(previous);

      // C6 (update side): the reviewed reading of the sketch being saved.
      if (typeof transcriptText === 'string' && (payload.type || previous.type) === 'handwritten') {
        const body = typeof payload.content === 'string' ? payload.content : previous.content;
        const edited = transcriptForCreate({ content: body, text: transcriptText }).edited;
        const transcript = { ...(previous.sketchTranscript || {}), edited };
        payload = {
          ...payload,
          'sketchTranscript.edited': edited,
          'sketchTranscript.editedSearchable': true,
          ...derivedFields({ type: 'handwritten', sketchTranscript: transcript, isLocked: previous.isLocked, isEncrypted: previous.isEncrypted }),
          ...staleIndexFields(),
        };
      }

      // [[Links]]: re-read from the body whenever the body (or the type) is
      // written. Cheap: nothing at all unless the text has `[[` or `/notes/`.
      if (typeof payload.content === 'string' || typeof payload.type === 'string') {
        payload = {
          ...payload,
          links: await resolveLinks({
            userId,
            content: typeof payload.content === 'string' ? payload.content : previous.content,
            type: payload.type || previous.type,
            previous: previous.links,
          }),
        };
      }

      // Coalesced history (plan 1.5): decided before the write, from the note
      // as it was. The snapshot itself is stored after the write succeeds.
      const reason = changeReason || 'edit';
      const plan = reason === 'edit'
        ? await shouldSnapshotEdit(previous, payload)
        : { snapshot: isMeaningfulChange(previous, payload), keep: false };

      // The answer carries only what the caller selected: an autosave that
      // asks for id + updatedAt doesn't get a multi-MB sketch sent back
      // (plan 5.7).
      const note = await Note.findOneAndUpdate(
        base ? { _id: id, userId, updatedAt: previous.updatedAt } : { _id: id, userId },
        payload,
        { new: true, projection: noteProjection(info), lean: true }
      );
      if (!note) {
        const now = base ? await Note.findOne({ _id: id, userId }).lean() : null;
        if (now) throw noteConflict(now);
        throw new Error('Note not found or you do not have permission to edit it');
      }

      if (typeof payload.title === 'string' && linkKey(payload.title) !== linkKey(previous?.title)) {
        await resolvePendingLinks({ userId, noteId: note._id, title: note.title });
      }

      if (plan.snapshot) {
        // `reason` rides in from the caller so an AI rewrite is labelled as
        // one in the history; a plain edit is the default. Never awaited for
        // its failure — `snapshotNote` swallows its own errors, because
        // losing a history entry must not lose the edit.
        await snapshotNote(previous, reason, { keep: plan.keep });
      }

      return note;
    },

    /**
     * Pin or unpin a note. Scoped to the owner exactly like updateNote —
     * `findOneAndUpdate({ _id, userId }, ...)` is the same "not found" shape
     * for someone else's note as every other write here. Not routed through
     * `updateNote`'s content/sanitize/version pipeline: pinning is not an
     * edit, and must not create a history entry or touch `updatedAt`.
     */
    setNotePinned: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id, pinned } = validateSetNotePinned(rawArgs);
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      const note = await Note.findOneAndUpdate(
        { _id: id, userId },
        { pinned, pinnedAt: pinned ? new Date() : null },
        { new: true }
      );
      if (!note) throw new Error('Note not found or you do not have permission to edit it');
      return note;
    },

    /** Archive notes (spec §3 A5). See `setArchived`. */
    archiveNotes: (_, rawArgs, context) => setArchived(rawArgs, context, true),

    /** Restore archived notes; clears `archivedAt` (spec §3 A5). */
    restoreNotes: (_, rawArgs, context) => setArchived(rawArgs, context, false),

    /**
     * Move a note to Recently deleted (soft delete, decision D1). Not an
     * edit: `timestamps: false`, no version. History is kept for a restore;
     * search passages go now (restoreNote re-queues them); links to it fall
     * back to waiting for its title. Deleting a deleted note is a no-op.
     */
    deleteNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id } = validateDeleteNote(rawArgs);
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      const note = await Note.findOneAndUpdate(
        { _id: id, userId, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true, timestamps: false, projection: { _id: 1, title: 1 } },
      );
      if (!note) {
        if (await Note.exists({ _id: id, userId })) return true; // already deleted
        throw new Error('Note not found or you do not have permission to delete it');
      }
      // Its search passages go now. A failure here is not the user's
      // problem: the indexer's sweep removes a deleted note's chunks later.
      try {
        await NoteChunk.deleteMany({ noteId: note._id, userId });
      } catch (err) {
        logger.warn({ err: err?.message }, '[notegeek] chunk cleanup failed; the sweep will retry');
      }
      dropNoteVectors(userId, note._id);
      // Links to it fall back to waiting for its title (or another note
      // with that title). Never fails the delete.
      try {
        await detachLinksTo({ userId, noteId: note._id, title: note.title });
      } catch (err) {
        logger.warn({ err: err?.message }, '[notegeek] link cleanup after delete failed');
      }
      await purgeExpiredNotes(userId);
      return true;
    },

    /** Back from Recently deleted, as it was. Re-queued for meaning search; links re-resolve. */
    restoreNote: async (_, { id }, context, info) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!id || !mongoose.isValidObjectId(id)) throw new Error(`Invalid Note ID format: ${ id }`);
      const note = await Note.findOneAndUpdate(
        { _id: id, userId, deletedAt: { $ne: null } },
        { $set: { deletedAt: null, ...staleIndexFields() } },
        { new: true, timestamps: false, projection: noteProjection(info), lean: true },
      );
      if (!note) {
        const live = await Note.findOne({ _id: id, userId }, noteProjection(info)).lean();
        if (live) return live; // not deleted: nothing to do
        throw new Error('Note not found or you do not have permission to restore it');
      }
      if (note.title) {
        try {
          await resolvePendingLinks({ userId, noteId: note._id, title: note.title });
        } catch (err) {
          logger.warn({ err: err?.message }, '[notegeek] link re-resolve after restore failed');
        }
      }
      return note;
    },

    /** Delete for good — only a note already in Recently deleted. */
    purgeNote: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!id || !mongoose.isValidObjectId(id)) throw new Error(`Invalid Note ID format: ${ id }`);
      const purged = await hardDelete({ _id: new mongoose.Types.ObjectId(String(id)) }, userId);
      if (purged) logger.info({ userId: String(userId), noteId: String(id) }, '[notegeek] note purged');
      return purged;
    },
    /**
     * Put a note back to an earlier version.
     *
     * Snapshots the CURRENT state first, so restoring is itself undoable —
     * a restore to the wrong version must not be the thing that finally
     * loses the work.
     */
    restoreNoteVersion: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { versionId } = rawArgs || {};
      if (!versionId || !mongoose.isValidObjectId(versionId)) {
        throw new Error(`Invalid version ID format: ${ versionId }`);
      }

      const version = await getNoteVersion({ versionId, userId });
      if (!version) throw new Error('Version not found or you do not have permission to use it');

      const current = await Note.findOne({ _id: version.noteId, userId }).lean();
      if (!current) throw new Error('Note not found or you do not have permission to edit it');

      const links = await resolveLinks({
        userId, content: version.content, type: version.type, previous: current.links,
      });
      const note = await Note.findOneAndUpdate(
        { _id: version.noteId, userId },
        { title: version.title, content: version.content, type: version.type, links },
        { new: true }
      );
      if (note && linkKey(version.title) !== linkKey(current.title)) {
        await resolvePendingLinks({ userId, noteId: note._id, title: note.title });
      }
      await snapshotNote(current, 'restore');
      return note;
    },

    /**
     * Build a document from a pile of scraps.
     *
     * Returns the document and changes NOTHING. Saving it as a new note, or
     * deliberately replacing the source, is the caller's separate act — a
     * compose is lossy by design, so it must never be the thing that writes
     * over the only copy of the raw material.
     */
    composeNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { content } = validateComposeNote(rawArgs);
      return await composeNote({ content, userId });
    },

    /**
     * Compose 2–20 of the caller's notes into one new document (spec §4).
     *
     * Writes NOTHING, like composeNote. The load is owner-scoped and by id —
     * so an archived note selected in the Archived view is composable — and
     * everything after it is compose.js `composeNotes`: skips with reasons,
     * oldest first, the one compose pipeline. Logged as counts only.
     */
    composeNotes: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { noteIds } = validateComposeNotes(rawArgs);
      const valid = [...new Set(noteIds.filter((id) => mongoose.isValidObjectId(id)).map(String))];
      const notes = valid.length
        ? await Note.find(
          { _id: { $in: valid }, userId },
          { title: 1, content: 1, type: 1, isLocked: 1, isEncrypted: 1, createdAt: 1 },
        ).lean()
        : [];
      return await composeNotes({
        noteIds,
        notes,
        userId,
        timeZone: context.user?.profile?.timezone || undefined,
        log: logger,
      });
    },

    /**
     * Read the handwriting in a sketch's page image (DOCS/HANDWRITING.md §2).
     *
     * Validated before anything else, so a bad image never reaches a model
     * or counts against the cap. Writes nothing: the writer corrects the
     * transcript, and the client saves it as a NEW note that links back to
     * the sketch — the sketch itself is never replaced.
     */
    transcribeSketch: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { image, mediaType, source, noteId } = validateTranscribeSketch(rawArgs);
      const result = await transcribeSketch({ image, mediaType, source, userId });
      // A sketch's page (not a photo): keep the reading so the automatic run
      // and the next Convert don't pay for it again. Best effort.
      if (noteId && source !== 'photo') {
        await rememberConvertReading({ noteId, userId, text: result.text, provenance: result.provenance });
      }
      return result;
    },

    /** Automatic transcription (sketchTranscript.js). Failures come back as status. */
    autoTranscribeSketch: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { noteId } = validateAutoTranscribeSketch(rawArgs);
      // The image is checked only once the note is known to want reading:
      // a photo, locked or already-read sketch is answered from its state
      // without scanning megabytes of base64. (The upload itself can only be
      // saved by the client: check sketchTranscript(noteId).status first —
      // off / searchable / failed / retry / transcribing mean "don't send".)
      return await autoTranscribeSketch({
        noteId,
        userId,
        image: rawArgs.image,
        mediaType: rawArgs.mediaType,
        background: rawArgs.background === true,
        validate: ({ image, mediaType }) => validateTranscribeSketch({ image, mediaType }),
      });
    },

    recordSketchTasksSent: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { noteId, keys, texts } = validateRecordSketchTasksSent(rawArgs);
      return await recordSketchTasksSent({ noteId, userId, keys, texts: texts || [] });
    },

    saveSketchTranscriptEdit: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { noteId, text, forHash } = validateSaveSketchTranscriptEdit(rawArgs);
      return await saveSketchTranscriptEdit({ noteId, userId, text, forHash });
    },

    /**
     * Propose how to fold new information into a note (foldin.js). Writes
     * nothing — not the note, not a version. A mutation rather than a query
     * only because it spends a model call, like composeNote.
     */
    foldInPreview: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { noteId, input } = validateFoldInPreview(rawArgs);
      const note = await foldableNote(noteId, userId);
      return await foldInPreview({ note, input, userId, log: logger });
    },

    /**
     * Apply the operations the person accepted.
     *
     * 1. Re-validate EVERY operation against the note as it is now. All or
     *    nothing: the person reviewed a set, and half of it is not what they
     *    agreed to. If the note changed since the preview (`baseUpdatedAt`)
     *    and an anchor broke, that is a CONFLICT; if every anchor still
     *    holds, the edit is still exactly what was reviewed, so it applies.
     * 2. Snapshot the note FIRST, and refuse if the snapshot fails — Undo is
     *    this feature's promise, so it is not best-effort here.
     * 3. Write through the same helpers `updateNote` uses (ceiling, sanitizer,
     *    links; the Note middleware marks it for re-indexing), conditional on
     *    `updatedAt` so an edit landing between the read and the write is a
     *    CONFLICT too — and the snapshot is removed again, so no version
     *    describes a state that was never replaced.
     */
    foldInApply: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { noteId, baseUpdatedAt, operations } = validateFoldInApply(rawArgs);
      const current = await foldableNote(noteId, userId);

      const base = new Date(baseUpdatedAt);
      const stale = Number.isNaN(base.getTime())
        || base.getTime() !== new Date(current.updatedAt).getTime();
      const plan = planOperations(current.content || '', operations);
      if (plan.dropped.length) {
        const details = plan.dropped.map((d) => ({ path: `operations.${ d.index }`, message: `${ d.reason }${ d.detail ? `: ${ d.detail }` : '' }` }));
        if (stale) {
          throw foldInRefusal('The note changed since these changes were proposed, and some no longer fit. Propose again.', 'CONFLICT', details);
        }
        throw foldInRefusal('Some of these changes do not match the note.', 'BAD_USER_INPUT', details);
      }

      const content = applyPlan(current.content || '', plan);
      assertContentCeiling(content, current.type);
      let payload = sanitizeNoteArgs({ content }, current.type);
      assertContentCeiling(payload.content, current.type, { sanitized: true });
      payload = {
        ...payload,
        links: await resolveLinks({ userId, content: payload.content, type: current.type, previous: current.links }),
      };

      const version = await snapshotNote(current, 'fold_in');
      if (!version) throw new Error('Could not save a version to undo to, so nothing was changed. Try again.');

      const note = await Note.findOneAndUpdate(
        { _id: current._id, userId, updatedAt: current.updatedAt },
        payload,
        { new: true }
      );
      if (!note) {
        await NoteVersion.deleteOne({ _id: version._id }).catch(() => {});
        throw foldInRefusal('The note changed while the changes were being applied. Propose again.', 'CONFLICT');
      }
      logger.info({ noteId: String(note._id), applied: plan.accepted.length, stale }, '[notegeek] fold-in applied');
      return { note, versionId: String(version._id), applied: plan.accepted.length };
    },

    /**
     * Rename or MOVE a tag, children and all.
     *
     * Tags are paths (`tags.js`), so renaming `house` → `home` rewrites
     * `house` AND every `house/...` to `home/...`; moving is the same call
     * with a path (`garage` → `house/garage`, and `garage/door` follows to
     * `house/garage/door`). Merging is allowed: if the target already exists
     * on a note, the note keeps one copy, at the position of the first.
     *
     * One aggregation-pipeline `updateMany`, not N round trips: the rewrite
     * (`$map`) and the dedupe (`$reduce`) run inside Mongo, so it costs the
     * same shape for 30 notes or 30 000. `Boolean!` is kept for the clients
     * already deployed: true when any note changed.
     */
    renameTag: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { oldTag, newTag } = validateRenameTag(rawArgs);
      // Renaming a tag to itself is a no-op, and it has to be an EXPLICIT one.
      // Both names are normalized by the schema (the suite standard), so a
      // dialog that compares the RAW strings lets `"work" -> "work "` through;
      // a rewrite that then ran anyway was once a deletion (BURN_REVIEW_2 #2).
      // `false` — "nothing changed" — rather than a thrown error, because the
      // client's cache update runs on the boolean. Since 2026-10-01 case does
      // NOT matter: `work -> Work` normalizes to `work -> work`, a no-op.
      if (oldTag === newTag) return false;
      // A tag cannot be moved inside itself: `house` → `house/garage` would
      // rewrite `house/garage` to `house/garage/garage`, and so on down.
      if (isInSubtree(newTag, oldTag)) {
        throw badTagInput(`Can't move #${ oldTag } inside itself (#${ newTag }).`);
      }

      // Every stored spelling in the subtree — including ones written before
      // the standard (`House/Garage`), which land on the standard spelling of
      // their new path. One indexed `distinct`.
      const from = await subtreeSpellings(Note, { userId }, oldTag);
      const to = from.map((t) => swapPrefix(normalizeTag(t), oldTag, newTag));
      // Swapping the prefix can make a deep child longer than a tag may be.
      // Checked up front so the write is all-or-nothing rather than leaving an
      // over-long tag behind.
      const tooLong = to.find((t) => t.length > TAG_MAX);
      if (tooLong) {
        throw badTagInput(`#${ tooLong.slice(0, 40) }… would be longer than ${ TAG_MAX } characters.`);
      }

      // old spelling → new tag, as two parallel literal arrays. Every
      // user-supplied string enters the pipeline through `$literal`: a legacy
      // tag that starts with `$` would otherwise be read as a field path.
      const renamed = {
        $map: {
          input: '$tags',
          as: 't',
          in: {
            $let: {
              vars: { i: { $indexOfArray: [{ $literal: from }, '$$t'] } },
              in: { $cond: [{ $gte: ['$$i', 0] }, { $arrayElemAt: [{ $literal: to }, '$$i'] }, '$$t'] },
            },
          },
        },
      };
      const deduped = {
        $reduce: {
          input: renamed,
          initialValue: [],
          in: {
            $cond: [
              { $in: ['$$this', '$$value'] },
              '$$value',
              { $concatArrays: ['$$value', ['$$this']] },
            ],
          },
        },
      };
      const { modifiedCount } = await Note.updateMany(
        { userId, tags: anyOf(from) },
        [{ $set: { tags: deduped } }]
      );
      return modifiedCount > 0;
    },

    /**
     * Remove a tag AND everything beneath it from the caller's notes
     * (`house` takes `house/garage` with it). Notes are never deleted — a
     * note that loses its last tag is simply untagged. Legacy spellings of
     * the subtree go too.
     */
    deleteTag: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { tag } = validateDeleteTag(rawArgs);
      const condition = anyOf(await subtreeSpellings(Note, { userId }, tag));
      await Note.updateMany(
        { userId, tags: condition },
        { $pull: { tags: condition } }
      );
      return true;
    },
  },

  Note: {
    id: (note) => note._id.toString(),
    // Lists are read lean (plan 5.1), so a field an old note never had is
    // absent, not defaulted: these give the schema's non-null fields the
    // mongoose defaults back.
    type: (note) => note.type || 'text',
    isLocked: (note) => note.isLocked === true,
    isEncrypted: (note) => note.isEncrypted === true,
    pinned: (note) => note.pinned === true,
    content: (note) => note.content ?? '',
    preview: (note) => {
      if (note.isLocked || note.isEncrypted) return null;
      if (typeof note.preview === 'string' && (note.preview || note.derivedV)) return note.preview;
      // Not derived yet (a note from before `preview`, before the start-up backfill).
      return typeof note.content === 'string' ? previewFor(note) : (note.preview ?? null);
    },
    deletedAt: (note) => (note.deletedAt ? new Date(note.deletedAt).toISOString() : null),
    // Read in the suite standard, so a note tagged before it (`geekSuite`)
    // shows — and is next saved as — `geek-suite` even before the migration.
    tags: (note) => normalizeTags(note.tags || []),
    // A note from before Archive has no field at all; it is active.
    archived: (note) => note.archived === true,
    archivedAt: (note) => (note.archivedAt ? new Date(note.archivedAt).toISOString() : null),
    links: (note) => (note.links || []).map((l) => ({
      key: l.key,
      title: l.title || '',
      noteId: l.noteId ? String(l.noteId) : null,
    })),
  },
};
