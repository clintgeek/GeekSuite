import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// The field set, the compound index and the `formatted_date` virtual live in
// @geeksuite/schemas so that this model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/Weight.js) cannot drift. Both write the
// `weights` collection in the same database, and mongoose strict mode silently
// drops paths one side doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import weightSchemaModule from '@geeksuite/schemas/fitnessgeek/weight';

const { createWeightSchema } = weightSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const weightSchema = createWeightSchema(mongoose);

// No ownership statics on this model today — the resolvers scope their own
// queries. If that changes, the guards belong here, not in the shared module.

export default fitnessConn.model('Weight', weightSchema);
