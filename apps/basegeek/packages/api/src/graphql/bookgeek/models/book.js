import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

// The field set lives in @geeksuite/schemas/bookgeek/book, shared with
// bookgeek's own API model (apps/bookgeek/api/src/models/book.js) — both write
// the same `books` collection, and strict mode silently drops any path one
// copy doesn't declare. Do NOT add fields here; add them to the shared module.
// Default import + destructure: the shared module is CommonJS.
import bookSchemaModule from '@geeksuite/schemas/bookgeek/book';

const { createBookSchema } = bookSchemaModule;

const bookConn = getAppConnection('bookgeek');

export const Book = bookConn.model("Book", createBookSchema(mongoose));
