import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

/**
 * The bookgeek Profile — per-user data in an otherwise shared library.
 *
 * The field set and the unique+sparse `deviceWord` index live in
 * @geeksuite/schemas/bookgeek/profile, shared with bookgeek's own API model
 * (`apps/bookgeek/api/src/models/profile.js`): both are built against the same
 * `profiles` collection, and Mongoose strict mode silently DROPS unknown fields
 * on `$set`/`$push` rather than erroring. That is exactly how fitnessgeek's
 * keto config vanished in April 2026. Do NOT add fields here; add them to the
 * shared module.
 */
import profileSchemaModule from '@geeksuite/schemas/bookgeek/profile';

const { createBookProfileSchema } = profileSchemaModule;

const bookConn = getAppConnection('bookgeek');

export const Profile = bookConn.model("Profile", createBookProfileSchema(mongoose));
