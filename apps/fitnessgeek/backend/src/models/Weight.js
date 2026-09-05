import mongoose from 'mongoose';
import { createWeightSchema } from '@geeksuite/schemas/fitnessgeek/weight';

// The field set, the compound index and the `formatted_date` virtual live in
// @geeksuite/schemas so that this model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/Weight.js) cannot
// drift. Both write the `weights` collection in the same database, and
// mongoose strict mode silently drops paths one side doesn't know about — see
// the shared module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
const weightSchema = createWeightSchema(mongoose);

// No statics on either side. If this side ever needs one, it belongs here and
// not in the shared module — statics don't affect `schema.paths`, so the two
// writers are free to disagree about them.

export default mongoose.model('Weight', weightSchema);
