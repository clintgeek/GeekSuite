import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// The field set, the bounds, the compound index and both virtuals
// (`formatted_date`, `status`) live in @geeksuite/schemas so that this model
// and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/BloodPressure.js) cannot drift. Both
// write the `bloodpressures` collection in the same database, and mongoose
// strict mode silently drops paths one side doesn't know about. See the shared
// module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS, and this is the
// interop form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import bloodPressureSchemaModule from '@geeksuite/schemas/fitnessgeek/bloodPressure';

const { createBloodPressureSchema } = bloodPressureSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const bloodPressureSchema = createBloodPressureSchema(mongoose);

// No ownership statics on this model today — the resolvers scope their own
// queries. If that changes, the guards belong here, not in the shared module.

export default fitnessConn.model('BloodPressure', bloodPressureSchema);
