import Note from '../models/Note.js';
import mongoose from 'mongoose';

export const resolvers = {
    Query: {
        notes: async (_, { tag, prefix }, context) => {
            // Hardcoded dummy ID for simplicity unless context.user is properly populated by gateway
            const userId = context.user?.id || '000000000000000000000000';
            const filter = { userId };

            // Escape special regex characters
            const escapeRegex = (str) => {
                return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            };

            // Filter by exact tag match
            if (tag) {
                filter.tags = { $in: [tag] };
            }

            // Filter by tag prefix (for hierarchical tags)
            if (prefix) {
                filter.tags = { $regex: `^${ escapeRegex(prefix) }` };
            }

            // Return notes matching filter, sorted by updatedAt
            return await Note.find(filter).sort({ updatedAt: -1 });
        },
        note: async (_, { id }) => {
            if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
                throw new Error(`Invalid Note ID format: ${ id }`);
            }
            return await Note.findById(id);
        },
        tags: async (_, __, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const tags = await Note.distinct('tags', { userId });
            return tags.sort((a, b) => a.localeCompare(b));
        },
    },
    Mutation: {
        createNote: async (_, args, context) => {
            // Hardcoded dummy ID for simplicity unless context.user is properly populated by gateway
            const userId = context.user?.id || '000000000000000000000000';
            const note = new Note({ ...args, userId });
            return await note.save();
        },
        updateNote: async (_, { id, ...args }, context) => {
            if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
                throw new Error(`Invalid Note ID format: ${ id }`);
            }
            const userId = context.user?.id || '000000000000000000000000';
            const note = await Note.findOneAndUpdate(
                { _id: id, userId },
                args,
                { new: true }
            );
            if (!note) {
                throw new Error('Note not found or you do not have permission to edit it');
            }
            return note;
        },
        deleteNote: async (_, { id }) => {
            if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
                throw new Error(`Invalid Note ID format: ${ id }`);
            }
            await Note.findByIdAndDelete(id);
            return true;
        }
    },
    Note: {
        id: (note) => note._id.toString(),
    }
};
