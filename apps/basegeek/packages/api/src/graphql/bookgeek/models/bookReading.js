import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

// One reader's shelf/rating/progress for one book (PER_READER_SHELVES_PLAN.md).
// The field set lives in @geeksuite/schemas/bookgeek/bookReading, shared with
// bookgeek's own API. Default import + destructure: the module is CommonJS.
import bookReadingModule from '@geeksuite/schemas/bookgeek/bookReading';

const { createBookReadingSchema } = bookReadingModule;

const bookConn = getAppConnection('bookgeek');

export const BookReading = bookConn.model("BookReading", createBookReadingSchema(mongoose));
