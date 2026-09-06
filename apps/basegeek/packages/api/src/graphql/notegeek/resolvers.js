import mongoose from 'mongoose';
import Note from './models/Note.js';
import {
  validateInput,
  createNoteArgsSchema,
  updateNoteArgsSchema,
  deleteNoteArgsSchema,
  renameTagArgsSchema,
  deleteTagArgsSchema,
  suggestForNoteArgsSchema,
  assertContentCeiling,
} from './validation.js';
import { sanitizeNoteArgs } from './sanitize.js';
import { suggestForNote } from './suggest.js';

const validateCreateNote = validateInput(createNoteArgsSchema);
const validateUpdateNote = validateInput(updateNoteArgsSchema);
const validateDeleteNote = validateInput(deleteNoteArgsSchema);
const validateRenameTag = validateInput(renameTagArgsSchema);
const validateDeleteTag = validateInput(deleteTagArgsSchema);
const validateSuggestForNote = validateInput(suggestForNoteArgsSchema);

/** How many search hits one `searchNotes` call may return. */
const SEARCH_RESULT_LIMIT = 100;

export const resolvers = {
  Query: {
    notes: async (_, { tag, prefix, type, limit, sort }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];

      const filter = { userId };

      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // `tag` and `prefix` are separate arguments and a client may send both.
      // Two plain assignments meant the second silently REPLACED the first, so
      // `notes(tag: "flock", prefix: "chores/")` quietly dropped the tag half
      // and returned the wrong list. Both narrow now, which is what a caller
      // asking for both means.
      const tagConds = [];
      if (tag) tagConds.push({ $in: [tag] });
      if (prefix) tagConds.push({ $regex: `^${ escapeRegex(prefix) }` });
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

      const query = Note.find(filter).sort(sortObj);
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

    searchNotes: async (_, { q }, context) => {
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
      const notes = await Note.find(
        { userId, $text: { $search: q.trim() } },
        { score: { $meta: 'textScore' }, title: 1, type: 1, tags: 1, isLocked: 1, isEncrypted: 1, createdAt: 1, updatedAt: 1, content: 1 }
      ).sort({ score: { $meta: 'textScore' } }).limit(SEARCH_RESULT_LIMIT).lean();

      return notes.map(note => {
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
          score: note.score,
          snippet,
          message: note.isLocked ? 'Note is locked. Content not available.' : null,
        };
      });
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
      const { id, ...args } = validateUpdateNote(rawArgs);
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
      const note = await Note.findOneAndUpdate(
        { _id: id, userId },
        payload,
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
      return true;
    },

    renameTag: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { oldTag, newTag } = validateRenameTag(rawArgs);
      // Renaming a tag to itself is a no-op, and it has to be an EXPLICIT one.
      // Both names are trimmed by the schema, so the dialog's own guard
      // (`TagContextMenu.jsx`, which compares the raw strings) lets
      // `"work" -> "work "` through: `$addToSet` then does nothing and `$pull`
      // deletes the tag from every note that had it (BURN_REVIEW_2 #2).
      // `false` — "nothing changed" — rather than a thrown error, because the
      // client's cache update (`onTagsRewritten`) runs on the successful
      // boolean and refetches the tag index, while a rejection would leave the
      // rename dialog open on an unhandled promise. Case still matters:
      // `work -> Work` is a real rename.
      if (oldTag === newTag) return false;
      // A positional `$set: { 'tags.$': newTag }` renames in place, so a note
      // that already carries `newTag` ends up with it twice — `[a, b]` renamed
      // a -> b becomes `[b, b]`. $addToSet the new tag first (a no-op if it's
      // already there), then $pull the old one, so the result is deduped
      // regardless of whether the two tags collided.
      await Note.updateMany({ userId, tags: oldTag }, { $addToSet: { tags: newTag } });
      const { modifiedCount } = await Note.updateMany(
        { userId, tags: oldTag },
        { $pull: { tags: oldTag } }
      );
      return modifiedCount > 0;
    },

    deleteTag: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { tag } = validateDeleteTag(rawArgs);
      await Note.updateMany(
        { userId, tags: tag },
        { $pull: { tags: tag } }
      );
      return true;
    },
  },

  Note: {
    id: (note) => note._id.toString(),
  },
};
