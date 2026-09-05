import mongoose from 'mongoose';
import { createMedicationSchema } from '@geeksuite/schemas/fitnessgeek/medication';

// The field set, both enums, the numeric bounds and all four indexes live in
// @geeksuite/schemas so that this model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/Medication.js)
// cannot drift. Both write the `medications` collection in the same database,
// and mongoose strict mode silently drops paths one side doesn't know about —
// see the shared module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here, and do NOT restate the enums anywhere else:
// src/validation/schemas/medication.js imports `MED_TIME_OF_DAY`, `MED_TYPES`
// and `medicationBounds` from the same module so the zod request validator and
// the schema cannot disagree.
//
// The asymmetric `updatedAt` timestamp key and the virtuals-on-with-no-virtuals
// serialization settings are deliberate carry-overs; the shared module's header
// says why.
const medicationSchema = createMedicationSchema(mongoose);

// No statics on either side. If this side ever needs one, it belongs here and
// not in the shared module — statics don't affect `schema.paths`, so the two
// writers are free to disagree about them.

export default mongoose.model('Medication', medicationSchema);
