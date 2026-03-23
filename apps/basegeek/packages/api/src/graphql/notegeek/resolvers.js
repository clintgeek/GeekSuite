import mongoose from 'mongoose';
import Note from './models/Note.js';

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
  },

  Note: {
    id: (note) => note._id.toString(),
  },
};
