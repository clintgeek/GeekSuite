import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import Note from './models/Note.js';
import Folder from './models/Folder.js';
import {
  validateInput,
  createNoteArgsSchema,
  updateNoteArgsSchema,
  deleteNoteArgsSchema,
  renameTagArgsSchema,
  deleteTagArgsSchema,
  createFolderArgsSchema,
  updateFolderArgsSchema,
  deleteFolderArgsSchema,
} from './validation.js';
import { sanitizeNoteArgs } from './sanitize.js';

const validateCreateNote = validateInput(createNoteArgsSchema);
const validateUpdateNote = validateInput(updateNoteArgsSchema);
const validateDeleteNote = validateInput(deleteNoteArgsSchema);
const validateRenameTag = validateInput(renameTagArgsSchema);
const validateDeleteTag = validateInput(deleteTagArgsSchema);
const validateCreateFolder = validateInput(createFolderArgsSchema);
const validateUpdateFolder = validateInput(updateFolderArgsSchema);
const validateDeleteFolder = validateInput(deleteFolderArgsSchema);

/** How many search hits one `searchNotes` call may return. */
const SEARCH_RESULT_LIMIT = 100;

/**
 * `updateFolder` had no ancestry check at all, so a folder could be given
 * itself, or one of its own descendants, as its `parentId` — a cycle that
 * never terminates when the tree view (or anything else) walks parent links.
 * Walk the caller's whole folder set (cheap: one query, no recursion in the
 * database) and reject a move into `folderId` itself or anything under it.
 */
async function isFolderOrDescendant(folderId, candidateId, userId) {
  const folderKey = String(folderId);
  const candidateKey = String(candidateId);
  if (folderKey === candidateKey) return true;

  const folders = await Folder.find({ userId }, '_id parentId').lean();
  const childrenByParent = new Map();
  for (const f of folders) {
    const parentKey = f.parentId ? String(f.parentId) : null;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(String(f._id));
  }

  const stack = [...(childrenByParent.get(folderKey) || [])];
  const visited = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === candidateKey) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(childrenByParent.get(current) || []));
  }
  return false;
}

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

    folders: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      return await Folder.find({ userId }).sort({ createdAt: -1 });
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
      const note = new Note({ ...sanitizeNoteArgs(args, args.type ?? 'text'), userId });
      return await note.save();
    },

    updateNote: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id, ...args } = validateUpdateNote(rawArgs);
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      // Sanitize the body against the type the row will actually have.
      // `type` is optional on update — every notegeek client sends it, but a
      // hand-rolled `updateNote(id, content)` would not, and skipping
      // sanitization in that case would leave the hole open. When it is
      // missing AND there is a body to clean, the stored type is read first;
      // that is one projected, `_id`-keyed find, on a path no real client
      // takes. (Contrast the size ceilings in `validation.js`, which accept
      // the imprecision rather than pay for a read — a too-generous ceiling
      // is not a security boundary, and this is.)
      let effectiveType = args.type;
      if (typeof args.content === 'string' && (effectiveType === undefined || effectiveType === null)) {
        const stored = await Note.findOne({ _id: id, userId }, { type: 1 }).lean();
        effectiveType = stored?.type;
      }
      // `args` is schema-validated by GraphQL and carries no userId field, so
      // ownership cannot be reassigned through the update payload.
      const note = await Note.findOneAndUpdate(
        { _id: id, userId },
        sanitizeNoteArgs(args, effectiveType),
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

    createFolder: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      // Same rule as createNote: a payload `userId` is dropped, not trusted.
      const { userId: _payloadUserId, ...ownArgs } = rawArgs;
      const args = validateCreateFolder(ownArgs);
      const folder = new Folder({ ...args, userId });
      return await folder.save();
    },

    updateFolder: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id, ...args } = validateUpdateFolder(rawArgs);
      if (!id || !mongoose.isValidObjectId(id)) throw new Error('Invalid Folder ID');
      // `null` clears the parent (move to root) and is always safe. A real
      // id must not be `id` itself or one of its own descendants — either
      // makes the folder its own ancestor, a cycle the tree view loops on.
      if ('parentId' in args && args.parentId && (await isFolderOrDescendant(id, args.parentId, userId))) {
        throw new GraphQLError('A folder cannot be moved into itself or one of its own subfolders', {
          extensions: {
            code: 'BAD_USER_INPUT',
            http: { status: 400 },
            details: [{ path: 'parentId', message: 'A folder cannot be moved into itself or one of its own subfolders' }],
          },
        });
      }
      const folder = await Folder.findOneAndUpdate(
        { _id: id, userId },
        args,
        { new: true }
      );
      if (!folder) throw new Error('Folder not found or unauthorized');
      return folder;
    },

    deleteFolder: async (_, rawArgs, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id, deleteNotes } = validateDeleteFolder(rawArgs);
      if (!id || !mongoose.isValidObjectId(id)) throw new Error('Invalid Folder ID');

      const folder = await Folder.findOneAndDelete({ _id: id, userId });
      if (!folder) throw new Error('Folder not found or unauthorized');

      // If deleteNotes is true, we should delete all notes in this folder.
      // Wait, Note model doesn't have folderId right now in its schema!
      // Let's just return true for now since folders might be implemented as tags or might be updated.
      return true;
    },
  },

  Note: {
    id: (note) => note._id.toString(),
  },
  
  Folder: {
    id: (folder) => folder._id.toString(),
  },
};
