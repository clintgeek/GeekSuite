import mongoose from "mongoose";

// The field set and the unique+sparse `deviceWord` index live in
// @geeksuite/schemas/bookgeek/profile, shared with basegeek's gateway model
// (graphql/bookgeek/models/profile.js) — both write the same `profiles`
// collection. Do NOT add fields here; add them to the shared module. Relative
// import for the same reason as ./book.js.
import profileSchemaModule from "../../../../../packages/schemas/bookgeek/profile.js";

const { createBookProfileSchema } = profileSchemaModule;

export const Profile = mongoose.model("Profile", createBookProfileSchema(mongoose));
