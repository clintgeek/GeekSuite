/**
 * Source — a publisher / official body / aggregator query and its feeds. The ingest worker writes feed poll state with targeted $set on feeds.$[f] only; the gateway owns everything else.
 * Collection `sources` in the `newsgeek` database (DOCS/NEWSGEEK_PLAN.md "Data model").
 */
import mongoose from 'mongoose';
import sourceModule from '@geeksuite/schemas/newsgeek/source';
import constants from '@geeksuite/schemas/newsgeek/constants';

const { createSourceSchema } = sourceModule;
const { COLLECTIONS } = constants;

export default mongoose.models.NewsSource || mongoose.model('NewsSource', createSourceSchema(mongoose), COLLECTIONS.sources);
