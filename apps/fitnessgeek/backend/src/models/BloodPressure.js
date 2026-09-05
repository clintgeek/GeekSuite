import mongoose from 'mongoose';
import { createBloodPressureSchema } from '@geeksuite/schemas/fitnessgeek/bloodPressure';

// The field set, the bounds, the compound index and both virtuals
// (`formatted_date`, `status`) live in @geeksuite/schemas so that this model
// and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/BloodPressure.js)
// cannot drift. Both write the `bloodpressures` collection in the same
// database, and mongoose strict mode silently drops paths one side doesn't
// know about — see the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here, and do NOT restate the numeric bounds anywhere else:
// src/validation/schemas/bloodPressure.js imports `bloodPressureBounds` from
// the same module so the zod request validator and the schema cannot disagree.
const bloodPressureSchema = createBloodPressureSchema(mongoose);

// No statics on either side. If this side ever needs one, it belongs here and
// not in the shared module.

export default mongoose.model('BloodPressure', bloodPressureSchema);
