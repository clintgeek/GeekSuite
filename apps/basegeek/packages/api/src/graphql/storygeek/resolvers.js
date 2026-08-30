import mongoose from 'mongoose';
import Story from './models/Story.js';

/**
 * Stories are personal creative work: every read and write is scoped by
 * `userId`, and a story belonging to someone else is indistinguishable from a
 * story that does not exist (no "not authorized" oracle that would confirm the
 * id is real). Malformed ids are treated as not-found rather than surfacing a
 * CastError.
 */
function requireUser(context) {
  const userId = context?.user?.id;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return String(userId);
}

function validObjectId(id) {
  return Boolean(id) && mongoose.isValidObjectId(id);
}

export const resolvers = {
  Query: {
    stories: async (_, { status }, context) => {
      const userId = context?.user?.id;
      if (!userId) return [];

      const filter = { userId: String(userId) };
      if (status) filter.status = status;

      return await Story.find(filter).sort({ updatedAt: -1 });
    },

    story: async (_, { id }, context) => {
      const userId = requireUser(context);
      if (!validObjectId(id)) return null;

      // Owner-scoped read: another user's id simply resolves to null.
      return await Story.findOne({ _id: id, userId });
    },
  },

  Mutation: {
    createStory: async (_, { title, genre, description }, context) => {
      const userId = requireUser(context);

      const story = new Story({
        userId,
        title,
        genre,
        description: description || '',
        worldState: {
          setting: 'To be determined',
          currentSituation: 'Story setup in progress',
          mood: 'neutral',
          weather: 'clear',
          timeOfDay: 'morning'
        },
        status: 'setup',
        stats: { totalInteractions: 0, totalDiceRolls: 0, lastActive: new Date() }
      });

      return await story.save();
    },

    updateStoryStatus: async (_, { id, status }, context) => {
      const userId = requireUser(context);
      if (!validObjectId(id)) throw new Error('Story not found');

      const story = await Story.findOneAndUpdate(
        { _id: id, userId },
        { status, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      if (!story) throw new Error('Story not found');
      return story;
    },

    deleteStory: async (_, { id }, context) => {
      const userId = requireUser(context);
      if (!validObjectId(id)) throw new Error('Story not found');

      const story = await Story.findOneAndDelete({ _id: id, userId });
      if (!story) throw new Error('Story not found');

      return true;
    },
  },

  Story: {
    id: (story) => story._id.toString(),
    currentLocation: (story) => story.storyState?.currentLocation || null,
  },
};
