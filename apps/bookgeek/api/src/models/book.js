import mongoose from "mongoose";

// The field set lives in @geeksuite/schemas/bookgeek/book, shared with
// basegeek's gateway model (graphql/bookgeek/models/book.js) — both write the
// same `books` collection, and strict mode silently drops any path one copy
// doesn't declare. Do NOT add fields here; add them to the shared module.
//
// Imported by relative path, not by package name: this api does not yet
// declare @geeksuite/schemas as a dependency (adding it needs a pnpm-lock.yaml
// update). The path resolves the same in the workspace and in the Docker
// image, which copies packages/ beside apps/bookgeek/api.
import bookSchemaModule from "../../../../../packages/schemas/bookgeek/book.js";

const { createBookSchema } = bookSchemaModule;

export const Book = mongoose.model("Book", createBookSchema(mongoose));
