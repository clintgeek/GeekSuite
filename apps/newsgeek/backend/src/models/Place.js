/**
 * Place — the gazetteer (towns, counties, state, country). Seeded on boot (src/seed); admins may add more through the gateway.
 * Collection `places` in the `newsgeek` database (DOCS/NEWSGEEK_PLAN.md "Data model").
 */
import mongoose from 'mongoose';
import placeModule from '@geeksuite/schemas/newsgeek/place';
import constants from '@geeksuite/schemas/newsgeek/constants';

const { createPlaceSchema } = placeModule;
const { COLLECTIONS } = constants;

export default mongoose.models.NewsPlace || mongoose.model('NewsPlace', createPlaceSchema(mongoose), COLLECTIONS.places);
