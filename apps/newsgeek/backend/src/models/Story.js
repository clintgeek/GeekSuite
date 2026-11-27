/**
 * Story — one event as several outlets told it. Written by the story assigner only (jobs/storyAssigner.js).
 * Collection `stories` in the `newsgeek` database (apps/newsgeek/DOCS/CLUSTERING.md "Phase 2").
 */
import mongoose from 'mongoose';
import storyModule from '@geeksuite/schemas/newsgeek/story';
import constants from '@geeksuite/schemas/newsgeek/constants';

const { createStorySchema } = storyModule;
const { COLLECTIONS } = constants;

export default mongoose.models.NewsStory || mongoose.model('NewsStory', createStorySchema(mongoose), COLLECTIONS.stories);
