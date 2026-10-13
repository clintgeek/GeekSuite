import mongoose from "mongoose";

// One reader's shelf/rating/dates/progress/my-tags for one book
// (apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md). The field set lives in
// @geeksuite/schemas/bookgeek/bookReading, shared with basegeek's gateway —
// both write `bookreadings`. Relative import for the same reason as ./book.js.
import bookReadingModule from "../../../../../packages/schemas/bookgeek/bookReading.js";

const { createBookReadingSchema } = bookReadingModule;

export const BookReading = mongoose.model("BookReading", createBookReadingSchema(mongoose));

export const { splitReaderFields, upsertReading, mergeReadings, READER_FIELDS } = bookReadingModule;

/** The signed-in reader's id, as the gateway stores it. */
export const readerId = (req) => String(req.user?.id ?? req.user?._id ?? "");
