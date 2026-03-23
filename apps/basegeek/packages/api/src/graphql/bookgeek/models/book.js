import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const bookConn = getAppConnection('bookgeek');

const fileSchema = new mongoose.Schema(
  {
    format: { type: String },
    path: { type: String },
    size: { type: Number },
    addedAt: { type: Date },
  },
  { _id: false }
);

const seriesSchema = new mongoose.Schema(
  {
    name: { type: String },
    index: { type: Number },
  },
  { _id: false }
);

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    authors: [{ type: String }],
    series: seriesSchema,
    isbn: { type: String },
    isbn13: { type: String },

    goodreadsId: { type: String },
    openLibraryId: { type: String },
    asin: { type: String },
    googleBooksId: { type: String },

    publisher: { type: String },
    publishedDate: { type: Date },
    pageCount: { type: Number },
    description: { type: String },
    language: { type: String },
    tags: [{ type: String }],

    files: [fileSchema],
    coverPath: { type: String },

    owned: { type: Boolean, default: false },
    shelf: { type: String },

    rating: { type: Number, min: 0, max: 5 },
    review: { type: String },
    dateAdded: { type: Date },
    dateStarted: { type: Date },
    dateFinished: { type: Date },
    readCount: { type: Number, default: 0 },
    readingProgress: { type: Number, min: 0, max: 100 },

    source: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Book = bookConn.model("Book", bookSchema);
