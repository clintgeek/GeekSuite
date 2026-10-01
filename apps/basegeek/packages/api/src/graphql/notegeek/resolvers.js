import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import Note from './models/Note.js';
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
  assertContentCeiling,
} from './validation.js';
import { sanitizeNoteArgs } from './sanitize.js';
import { suggestForNote } from './suggest.js';
import { composeNote } from './compose.js';
import { transcribeSketch } from './transcribe.js';
import {
  normalizeTag,
  escapeRegex,
  subtreeCondition,
  isInSubtree,
  swapPrefix,
} from './tags.js';
import {
  snapshotNote,
  isMeaningfulChange,
  listNoteVersions,
  getNoteVersion,
  deleteVersionsForNote,
} from './versions.js';
import NoteChunk from './models/NoteChunk.js';
import logger from '../../lib/logger.js';
import {
  vectorSearch,
  rrfFuse,
  whyExcerpt,
  relatedNotes as findRelatedNotes,
  indexStatus,
  invalidateUserVectors,
  KEYWORD_WEIGHT,
  VECTOR_WEIGHT,
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

/** How many search hits one `searchNotes` call may return. */
const SEARCH_RESULT_LIMIT = 100;

/** The stored tag ceiling — the same 100 `validation.js` enforces on input. */
const TAG_MAX = 100;

/** Code-point length, which is what Mongo's `$strLenCP` / `$substrCP` count. */
const cpLength = (str) => Array.from(str).length;

/** One search result row. The snippet rules are the original ones. */
function searchRow(note, { score, matchedBy = null, why = null }) {
  let snippet = '';
  if (note.content && !note.isLocked && note.type !== 'handwritten' && note.type !== 'mindmap') {
    const plain = note.content.replace(/<[^>]+>/g, '');
    snippet = plain.slice(0, 200);
  }
  return {
    _id: note._id,
    title: note.title,
    type: note.type,
    tags: note.tags || [],
    isLocked: note.isLocked || false,
    isEncrypted: note.isEncrypted || false,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    score,
    snippet,
    message: note.isLocked ? 'Note is locked. Content not available.' : null,
    matchedBy,
    why,
  };
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

    notes: async (_, { tag, prefix, under, type, limit, sort }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];

      const filter = { userId };

      // `tag` and `prefix` are separate arguments and a client may send both.
      // Two plain assignments meant the second silently REPLACED the first, so
      // `notes(tag: "flock", prefix: "chores/")` quietly dropped the tag half
      // and returned the wrong list. Both narrow now, which is what a caller
      // asking for both means.
      const tagConds = [];
      if (tag) tagConds.push({ $in: [tag] });
      if (prefix) tagConds.push({ $regex: `^${ escapeRegex(prefix) }` });
      // `under` is the nested-tag view: the tag itself AND everything beneath
      // it (`house` → `house`, `house/garage`, never `houseboat`). Normalized
      // the way stored tags are, so `house/` finds `house`. One that
      // normalizes to nothing narrows nothing, like an absent argument.
      const underTag = normalizeTag(under);
      if (underTag) tagConds.push(subtreeCondition(underTag));
      if (tagConds.length === 1) {
        filter.tags = tagConds[0];
      } else if (tagConds.length > 1) {
        filter.$and = tagConds.map((cond) => ({ tags: cond }));
      }
      if (type) {
        filter.type = type;
      }

      let sortObj = { updatedAt: -1 };
      switch (sort?.toLowerCase()) {
        case 'updatedat_asc':
          sortObj = { updatedAt: 1 };
          break;
        case 'updatedat_desc':
          sortObj = { updatedAt: -1 };
          break;
        case 'createdat_desc':
          sortObj = { createdAt: -1 };
          break;
        case 'title_asc':
          sortObj = { title: 1 };
          break;
      }

      // Pinned notes sort first, ahead of whatever order was requested —
      // server-side, matching how every other `notes` sort is decided here
      // rather than left to the client.
      const query = Note.find(filter).sort({ pinned: -1, ...sortObj });
      if (limit && limit > 0) query.limit(limit);
      return await query;
    },

    note: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      const note = await Note.findOne({ _id: id, userId });
      if (!note) throw new Error('Note not found or you do not have permission to view it');
      return note;
    },

    noteTags: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const tags = await Note.distinct('tags', { userId });
      return tags.sort((a, b) => a.localeCompare(b));
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
      if (!userId || !root) return { notes: 0, subTags: 0 };
      const filter = { userId, tags: subtreeCondition(root) };
      const [notes, tags] = await Promise.all([
        Note.countDocuments(filter),
        Note.distinct('tags', filter),
      ]);
      const subTags = tags.filter((t) => t !== root && isInSubtree(t, root)).length;
      return { notes, subTags };
    },

    /**
     * Search. `hybrid: false` (the default, and what bundles from before
     * 2026-09-30 send by omission) is the original keyword search, unchanged.
     * `hybrid: true` fuses it with meaning-based hits from the local
     * embeddings (`semantic.js`) by Reciprocal Rank Fusion; each row then says
     * how it matched (`matchedBy`) and, for a meaning hit, the passage that
     * matched (`why`). When the embeddings service is down or slow, hybrid is
     * silently keyword-only.
     */
    searchNotes: async (_, { q, under, hybrid }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!q || q.trim().length === 0) throw new Error('Search query cannot be empty');

      // Bounded. This had no limit at all while projecting every matching
      // row's full `content` — a field whose ceiling is 5 000 000 characters
      // for the mindmap/handwritten snapshot types — in order to build a
      // 200-character snippet it then discards for exactly those types. The
      // cap is on results rather than on the projection because an
      // aggregation-expression projection alongside `$meta: 'textScore'`
      // needs a server version this deployment does not assert.
      const scope = { userId };
      const underTag = normalizeTag(under);
      if (underTag) scope.tags = subtreeCondition(underTag);
      const projection = { title: 1, type: 1, tags: 1, isLocked: 1, isEncrypted: 1, createdAt: 1, updatedAt: 1, content: 1 };
      const keywordRows = await Note.find(
        { ...scope, $text: { $search: q.trim() } },
        { ...projection, score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } }).limit(SEARCH_RESULT_LIMIT).lean();

      if (!hybrid) return keywordRows.map((note) => searchRow(note, { score: note.score }));

      let vectorHits = [];
      try {
        vectorHits = await vectorSearch({ userId, q, log: logger });
      } catch (err) {
        // Anything unexpected in the vector half costs the meaning hits, never the search.
        logger.warn({ err: err?.message }, '[notegeek] vector search failed; keyword-only');
      }
      if (!vectorHits.length) {
        return keywordRows.map((note) => searchRow(note, { score: note.score, matchedBy: 'keyword' }));
      }

      const fused = rrfFuse([
        { ids: keywordRows.map((n) => String(n._id)), weight: KEYWORD_WEIGHT },
        { ids: vectorHits.map((h) => h.noteId), weight: VECTOR_WEIGHT },
      ]);
      const byId = new Map(keywordRows.map((n) => [String(n._id), n]));
      // Meaning-only hits are re-read through the same scope (owner + `under`),
      // which also drops a note deleted since its vectors were cached.
      const missing = vectorHits.map((h) => h.noteId).filter((id) => !byId.has(id));
      if (missing.length) {
        const extra = await Note.find({ ...scope, _id: { $in: missing } }, projection).lean();
        for (const n of extra) byId.set(String(n._id), n);
      }
      const hitById = new Map(vectorHits.map((h) => [h.noteId, h]));
      return fused
        .filter((f) => byId.has(f.id))
        .slice(0, SEARCH_RESULT_LIMIT)
        .map((f) => {
          const note = byId.get(f.id);
          const kw = f.ranks[0] !== null;
          const vec = f.ranks[1] !== null;
          const hit = hitById.get(f.id);
          return searchRow(note, {
            score: f.score,
            matchedBy: kw && vec ? 'both' : kw ? 'keyword' : 'meaning',
            why: vec ? whyExcerpt(hit.text, note.title) : null,
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
      const args = validateCreateNote(ownArgs);
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
      const note = new Note({ ...cleaned, userId });
      return await note.save();
    },

    updateNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      // `changeReason` is peeled off here: it labels the HISTORY entry, and
      // must never become part of the update payload written to the note.
      const { id, changeReason, ...args } = validateUpdateNote(rawArgs);
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

      const note = await Note.findOneAndUpdate(
        { _id: id, userId },
        payload,
        { new: true }
      );
      if (!note) throw new Error('Note not found or you do not have permission to edit it');

      if (isMeaningfulChange(previous, payload)) {
        // `reason` rides in from the caller so an AI rewrite is labelled as
        // one in the history; a plain edit is the default. Never awaited for
        // its failure — `snapshotNote` swallows its own errors, because
        // losing a history entry must not lose the edit.
        await snapshotNote(previous, changeReason || 'edit');
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

    deleteNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id } = validateDeleteNote(rawArgs);
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      const note = await Note.findOneAndDelete({ _id: id, userId });
      if (!note) throw new Error('Note not found or you do not have permission to delete it');
      // Keeping the history of a deleted note would mean delete did not
      // delete, which is not what the word promises.
      await deleteVersionsForNote(id, userId);
      // Its search passages go with it. A failure here is not the user's
      // problem: the indexer's sweep removes orphaned chunks later.
      try {
        await NoteChunk.deleteMany({ noteId: note._id, userId });
      } catch (err) {
        logger.warn({ err: err?.message }, '[notegeek] chunk cleanup failed; the sweep will retry');
      }
      invalidateUserVectors(userId);
      return true;
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

      const note = await Note.findOneAndUpdate(
        { _id: version.noteId, userId },
        { title: version.title, content: version.content, type: version.type },
        { new: true }
      );
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
      const { image, mediaType, source } = validateTranscribeSketch(rawArgs);
      return await transcribeSketch({ image, mediaType, source, userId });
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
      // Both names are trimmed and normalized by the schema, so a dialog that
      // compares the RAW strings lets `"work" -> "work "` through; a rewrite
      // that then ran anyway was once a deletion (BURN_REVIEW_2 #2). `false`
      // — "nothing changed" — rather than a thrown error, because the
      // client's cache update runs on the boolean. Case still matters:
      // `work -> Work` is a real rename.
      if (oldTag === newTag) return false;
      // A tag cannot be moved inside itself: `house` → `house/garage` would
      // rewrite `house/garage` to `house/garage/garage`, and so on down.
      if (isInSubtree(newTag, oldTag)) {
        throw badTagInput(`Can't move #${ oldTag } inside itself (#${ newTag }).`);
      }

      const filter = { userId, tags: subtreeCondition(oldTag) };
      // Swapping the prefix can make a deep child longer than a tag may be.
      // Checked up front against the distinct tags (one indexed read) so the
      // write is all-or-nothing rather than leaving an over-long tag behind.
      const affected = await Note.distinct('tags', filter);
      const tooLong = affected
        .filter((t) => isInSubtree(t, oldTag))
        .map((t) => swapPrefix(t, oldTag, newTag))
        .find((t) => t.length > TAG_MAX);
      if (tooLong) {
        throw badTagInput(`#${ tooLong.slice(0, 40) }… would be longer than ${ TAG_MAX } characters.`);
      }

      // Every user-supplied string enters the pipeline through `$literal`:
      // a tag that starts with `$` would otherwise be read as a field path.
      const oldLen = cpLength(oldTag);
      const isInOld = {
        $or: [
          { $eq: ['$$t', { $literal: oldTag }] },
          { $eq: [{ $substrCP: ['$$t', 0, oldLen + 1] }, { $literal: `${ oldTag }/` }] },
        ],
      };
      const renamed = {
        $map: {
          input: '$tags',
          as: 't',
          in: {
            $cond: [
              isInOld,
              {
                $concat: [
                  { $literal: newTag },
                  { $substrCP: ['$$t', oldLen, { $subtract: [{ $strLenCP: '$$t' }, oldLen] }] },
                ],
              },
              '$$t',
            ],
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
      const { modifiedCount } = await Note.updateMany(filter, [{ $set: { tags: deduped } }]);
      return modifiedCount > 0;
    },

    /**
     * Remove a tag AND everything beneath it from the caller's notes
     * (`house` takes `house/garage` with it). Notes are never deleted — a
     * note that loses its last tag is simply untagged.
     */
    deleteTag: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { tag } = validateDeleteTag(rawArgs);
      const condition = subtreeCondition(tag);
      await Note.updateMany(
        { userId, tags: condition },
        { $pull: { tags: condition } }
      );
      return true;
    },
  },

  Note: {
    id: (note) => note._id.toString(),
  },
};
