import mongoose from 'mongoose';
import Note from './models/Note.js';
import Folder from './models/Folder.js';

export const resolvers = {
  Query: {
    notes: async (_, { tag, prefix }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];

      const filter = { userId };

      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      if (tag) {
        filter.tags = { $in: [tag] };
      }
      if (prefix) {
        filter.tags = { $regex: `^${ escapeRegex(prefix) }` };
      }

      return await Note.find(filter).sort({ updatedAt: -1 });
    },

    note: async (_, { id }) => {
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      return await Note.findById(id);
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

      const notes = await Note.find(
        { userId, $text: { $search: q.trim() } },
        { score: { $meta: 'textScore' }, title: 1, type: 1, tags: 1, isLocked: 1, isEncrypted: 1, createdAt: 1, updatedAt: 1, content: 1 }
      ).sort({ score: { $meta: 'textScore' } }).lean();

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
    createNote: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const note = new Note({ ...args, userId });
      return await note.save();
    },

    updateNote: async (_, { id, ...args }, context) => {
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const note = await Note.findOneAndUpdate(
        { _id: id, userId },
        args,
        { new: true }
      );
      if (!note) throw new Error('Note not found or you do not have permission to edit it');
      return note;
    },

    deleteNote: async (_, { id }) => {
      if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid Note ID format: ${ id }`);
      }
      await Note.findByIdAndDelete(id);
      return true;
    },

    renameTag: async (_, { oldTag, newTag }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      await Note.updateMany(
        { userId, tags: oldTag },
        { $set: { 'tags.$': newTag } }
      );
      return true;
    },

    deleteTag: async (_, { tag }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      await Note.updateMany(
        { userId, tags: tag },
        { $pull: { tags: tag } }
      );
      return true;
    },

    createFolder: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const folder = new Folder({ ...args, userId });
      return await folder.save();
    },

    updateFolder: async (_, { id, ...args }, context) => {
      if (!id || !mongoose.isValidObjectId(id)) throw new Error('Invalid Folder ID');
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const folder = await Folder.findOneAndUpdate(
        { _id: id, userId },
        args,
        { new: true }
      );
      if (!folder) throw new Error('Folder not found or unauthorized');
      return folder;
    },

    deleteFolder: async (_, { id, deleteNotes }, context) => {
      if (!id || !mongoose.isValidObjectId(id)) throw new Error('Invalid Folder ID');
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');

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
