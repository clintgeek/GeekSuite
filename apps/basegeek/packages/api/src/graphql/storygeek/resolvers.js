import mongoose from 'mongoose';
import Story from './models/Story.js';

export const resolvers = {
  Query: {
    stories: async (_, { status }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];

      const filter = { userId };
      if (status) filter.status = status;

      return await Story.find(filter).sort({ updatedAt: -1 });
    },

    story: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!id || !mongoose.isValidObjectId(id)) throw new Error(`Invalid Story ID: ${id}`);

      const story = await Story.findById(id);
      if (!story) return null;
      if (story.userId !== userId) throw new Error('Not authorized to view this story');

      return story;
    },
  },

  Mutation: {
    createStory: async (_, { title, genre, description }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');

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
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!mongoose.isValidObjectId(id)) throw new Error('Invalid Story ID');

      const story = await Story.findOneAndUpdate(
        { _id: id, userId },
        { status },
        { new: true }
      );

      if (!story) throw new Error('Story not found or unauthorized');
      return story;
    },

    deleteStory: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      if (!mongoose.isValidObjectId(id)) throw new Error('Invalid Story ID');

      const story = await Story.findOneAndDelete({ _id: id, userId });
      if (!story) throw new Error('Story not found or unauthorized');

      return true;
    },
  },

  Story: {
    id: (story) => story._id.toString(),
    currentLocation: (story) => story.storyState?.currentLocation || null,
  },
};
